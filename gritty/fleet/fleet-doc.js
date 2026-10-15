/* GRITTY FLEET — fleet-doc.js : the fleet layout document and its edit API (pure: no DOM, no clock, no RNG).

   Modelled on StarNet's own station document (frontend/app/worldmodel.js + BUILDER.md), without copying its code:
     · one versioned, serializable document is the single source of truth for what the fleet looks like;
     · migrate() is total: any partial, older or hand-edited document loads into a valid one instead of crashing;
     · every edit goes through a mutation that validates fully first and returns { ok, error?, msg? };
       a refused edit never half-applies;
     · snapshot-based undo/redo, and transact() for one undo step over a compound edit.

   What the document is NOT: it holds no permissions, tools, models or budgets. Props are cosmetic. Unlike a StarNet
   station, placing a prop here never grants an agent anything; real changes go through GRITTY OS's existing
   permission screens. Unknown keys are dropped on load so nothing else can ride along in the file.

   Shape (schema 'gritty.fleet', version 1):
     { schema, version, meta:{ name },
       ships: { [shipId]: { id, deptId, name, hull:'flagship'|'brig', pos:{x,y},
                            decks:[{ roomId, name, props:[{ type, x }] }],
                            stations:{ [agentId]: { deck, x } } } },
       order: [shipId] }
   Coordinates are scene pixels: pos in the 640×360 harbour, prop/station x along a cutaway deck. */
'use strict';
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GrittyFleetDoc = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const SCHEMA = 'gritty.fleet', VERSION = 1;
  const BOUNDS = { W: 640, H: 360, deckX0: 250, deckX1: 556 };
  // cosmetic props the cutaway knows how to draw (fleet-art.js builders)
  const PROPS = ['easel', 'workbench', 'paintShelf', 'crate', 'barrel', 'sack', 'chartTable', 'globe', 'ledgerDesk', 'coinPile', 'radio',
    'bookshelf', 'camera', 'stageLight', 'instrumentRack', 'wallMap', 'chalkboard', 'printLine', 'chest'];
  const HULLS = { flagship: { w: 156, h: 52 }, brig: { w: 120, h: 40 } };
  // default harbour berths and deck dressing, used when a document does not say otherwise
  const BERTHS = { operations: [138, 202], etsy: [336, 60], lab: [546, 96], services: [330, 306], youtube: [548, 282] };
  const ISLAND = { cx: 338, cy: 188, rx: 92, ry: 56 };
  const THEME = {
    etsy: [['printLine', 'wallMap', 'easel', 'workbench', 'paintShelf', 'crate']],
    operations: [['wallMap', 'chartTable', 'globe'], ['ledgerDesk', 'coinPile'], ['radio', 'bookshelf']],
    services: [['wallMap', 'printLine', 'workbench', 'crate', 'barrel']],
    youtube: [['printLine', 'chalkboard', 'camera', 'stageLight', 'crate']],
    lab: [['chalkboard', 'wallMap', 'instrumentRack', 'bookshelf', 'globe']]
  };

  const clone = o => JSON.parse(JSON.stringify(o));
  const num = (v, d) => (typeof v === 'number' && isFinite(v)) ? v : d;
  const str = (v, d) => (typeof v === 'string' && v.trim()) ? v.trim().slice(0, 60) : d;
  const ok = extra => Object.assign({ ok: true }, extra || {});
  const no = (error, msg) => ({ ok: false, error, msg });

  /* ---------- a default document from the department list ---------- */
  function defaultDoc(departments) {
    const doc = { schema: SCHEMA, version: VERSION, meta: { name: 'GRITTY fleet' }, ships: {}, order: [] };
    (departments || []).forEach((d, i) => {
      const id = d.id, rooms = (d.rooms && d.rooms.length) ? d.rooms : ['deck'], theme = THEME[id] || [['crate', 'barrel']];
      const [x, y] = BERTHS[id] || [90 + (i % 5) * 120, 40 + Math.floor(i / 5) * 300];
      doc.ships[id] = {
        id, deptId: id, name: d.name || id, hull: d.id === 'operations' ? 'flagship' : 'brig', pos: { x, y },
        decks: rooms.map((roomId, k) => ({ roomId, name: (d.deckNames && d.deckNames[k]) || 'Deck', props: (theme[k % theme.length] || []).map(type => ({ type, x: null })) })),
        stations: {}
      };
      doc.order.push(id);
    });
    return doc;
  }

  /* ---------- migrate: total over anything ---------- */
  function migrate(raw) {
    const src = (raw && typeof raw === 'object') ? raw : {};
    const doc = { schema: SCHEMA, version: VERSION, meta: { name: str(src.meta && src.meta.name, 'GRITTY fleet') }, ships: {}, order: [] };
    const ships = (src.ships && typeof src.ships === 'object') ? src.ships : {};
    const order = Array.isArray(src.order) ? src.order : Object.keys(ships);
    for (const id of order) {
      const s = ships[id]; if (!s || typeof s !== 'object' || doc.ships[id]) continue;
      const hull = HULLS[s.hull] ? s.hull : 'brig';
      const decks = (Array.isArray(s.decks) ? s.decks : []).filter(d => d && typeof d === 'object').map(d => ({
        roomId: str(d.roomId, 'deck'), name: str(d.name, 'Deck'),
        props: (Array.isArray(d.props) ? d.props : []).filter(p => p && PROPS.includes(p.type)).map(p => ({ type: p.type, x: p.x == null ? null : clampX(num(p.x, null)) }))
      }));
      if (!decks.length) decks.push({ roomId: 'deck', name: 'Deck', props: [] });
      const stations = {};
      if (s.stations && typeof s.stations === 'object') for (const [aid, st] of Object.entries(s.stations)) {
        if (!st || typeof st !== 'object') continue;
        const deck = Math.max(0, Math.min(decks.length - 1, Math.round(num(st.deck, 0))));
        stations[String(aid).slice(0, 80)] = { deck, x: clampX(num(st.x, BOUNDS.deckX0)) };
      }
      const pos = s.pos && typeof s.pos === 'object' ? s.pos : {};
      doc.ships[id] = { id: String(id), deptId: str(s.deptId, String(id)), name: str(s.name, String(id)), hull,
        pos: { x: clampPos(num(pos.x, 320), HULLS[hull].w, BOUNDS.W), y: clampPos(num(pos.y, 180), HULLS[hull].h, BOUNDS.H) }, decks, stations };
      doc.order.push(String(id));
    }
    return doc;
  }
  function clampX(x) { return x == null ? null : Math.round(Math.max(BOUNDS.deckX0, Math.min(BOUNDS.deckX1, x))); }
  function clampPos(v, size, max) { return Math.round(Math.max(size / 2, Math.min(max - size / 2, v))); }

  /* ---------- geometry checks used by the editor's ghost preview and by every move ---------- */
  function shipRect(s, at) { const h = HULLS[s.hull], p = at || s.pos; return { x1: p.x - h.w / 2, y1: p.y - h.h / 2, x2: p.x + h.w / 2, y2: p.y + h.h / 2 }; }
  const overlaps = (a, b, pad) => a.x1 - pad < b.x2 && b.x1 - pad < a.x2 && a.y1 - pad < b.y2 && b.y1 - pad < a.y2;
  function canPlaceShip(doc, id, x, y) {
    const s = doc.ships[id]; if (!s) return no('no-ship', 'That ship is not in the fleet.');
    const r = shipRect(s, { x, y });
    if (r.x1 < 0 || r.y1 < 0 || r.x2 > BOUNDS.W || r.y2 > BOUNDS.H) return no('out-of-bounds', 'Keep the ship inside the harbour.');
    // the island: test the hull's corners and centre against the island ellipse
    const pts = [[x, y], [r.x1, r.y1], [r.x2, r.y1], [r.x1, r.y2], [r.x2, r.y2], [x, r.y1], [x, r.y2]];
    if (pts.some(([px, py]) => ((px - ISLAND.cx) / (ISLAND.rx + 6)) ** 2 + ((py - ISLAND.cy) / (ISLAND.ry + 6)) ** 2 < 1)) return no('aground', 'That would run the ship aground on the island.');
    for (const oid of doc.order) if (oid !== id && overlaps(r, shipRect(doc.ships[oid]), 6)) return no('collision', 'That berth is taken by ' + doc.ships[oid].name + '.');
    return ok();
  }

  /* ---------- the editable document ---------- */
  function create(raw) {
    let doc = migrate(raw);
    const undoStack = [], redoStack = [], subs = [];
    let batch = 0;
    const snapshot = () => { if (batch) return; undoStack.push(clone(doc)); if (undoStack.length > 120) undoStack.shift(); redoStack.length = 0; };
    const emit = patch => { for (const f of subs) try { f(patch, doc); } catch (_) {} };
    const ship = id => doc.ships[id];
    const deckOf = (id, k) => { const s = ship(id); return s && s.decks[k]; };

    const api = {
      get: () => doc,
      serialize: () => JSON.stringify(doc),
      onChange(f) { subs.push(f); return () => subs.splice(subs.indexOf(f), 1); },
      canPlaceShip: (id, x, y) => canPlaceShip(doc, id, Math.round(x), Math.round(y)),
      moveShip(id, x, y) {
        x = Math.round(x); y = Math.round(y);
        const r = canPlaceShip(doc, id, x, y); if (!r.ok) return r;
        snapshot(); ship(id).pos = { x, y }; emit({ op: 'moveShip', id }); return ok();
      },
      renameShip(id, name) {
        const s = ship(id); if (!s) return no('no-ship', 'That ship is not in the fleet.');
        const n = str(name, null); if (!n) return no('empty-name', 'Give the ship a name.');
        snapshot(); s.name = n; emit({ op: 'renameShip', id }); return ok();
      },
      renameDeck(id, k, name) {
        const d = deckOf(id, k); if (!d) return no('no-deck', 'That deck does not exist.');
        const n = str(name, null); if (!n) return no('empty-name', 'Give the deck a name.');
        snapshot(); d.name = n; emit({ op: 'renameDeck', id, deck: k }); return ok();
      },
      addProp(id, k, type, x) {
        const d = deckOf(id, k); if (!d) return no('no-deck', 'That deck does not exist.');
        if (!PROPS.includes(type)) return no('unknown-prop', 'That prop is not in the catalogue.');
        if (d.props.length >= 12) return no('deck-full', 'That deck is full. Remove something first.');
        snapshot(); d.props.push({ type, x: x == null ? null : clampX(x) }); emit({ op: 'addProp', id, deck: k }); return ok({ index: d.props.length - 1 });
      },
      moveProp(id, k, i, x) {
        const d = deckOf(id, k); if (!d || !d.props[i]) return no('no-prop', 'That prop does not exist.');
        snapshot(); d.props[i].x = clampX(x); emit({ op: 'moveProp', id, deck: k }); return ok();
      },
      removeProp(id, k, i) {
        const d = deckOf(id, k); if (!d || !d.props[i]) return no('no-prop', 'That prop does not exist.');
        snapshot(); d.props.splice(i, 1); emit({ op: 'removeProp', id, deck: k }); return ok();
      },
      setStation(id, agentId, k, x) {
        const s = ship(id); if (!s) return no('no-ship', 'That ship is not in the fleet.');
        if (!s.decks[k]) return no('no-deck', 'That deck does not exist.');
        snapshot(); s.stations[agentId] = { deck: k, x: clampX(x) }; emit({ op: 'setStation', id, agentId }); return ok();
      },
      clearStation(id, agentId) {
        const s = ship(id); if (!s || !s.stations[agentId]) return no('no-station', 'No saved station for that crew member.');
        snapshot(); delete s.stations[agentId]; emit({ op: 'clearStation', id, agentId }); return ok();
      },
      // one undo step for a compound edit; all-or-nothing if fn returns a refusal
      transact(fn) {
        const before = clone(doc); batch++;
        let res; try { res = fn(api); } catch (e) { res = no('threw', String(e && e.message || e)); } finally { batch--; }
        if (res && res.ok === false) { doc = before; return res; }
        undoStack.push(before); if (undoStack.length > 120) undoStack.shift(); redoStack.length = 0;
        emit({ op: 'transact' }); return ok();
      },
      undo() { if (!undoStack.length) return no('nothing', 'Nothing to undo.'); redoStack.push(clone(doc)); doc = undoStack.pop(); emit({ op: 'undo' }); return ok(); },
      redo() { if (!redoStack.length) return no('nothing', 'Nothing to redo.'); undoStack.push(clone(doc)); doc = redoStack.pop(); emit({ op: 'redo' }); return ok(); },
      canUndo: () => undoStack.length > 0, canRedo: () => redoStack.length > 0,
      reset(departments) { snapshot(); doc = defaultDoc(departments); emit({ op: 'reset' }); return ok(); }
    };
    return api;
  }

  return { SCHEMA, VERSION, BOUNDS, PROPS, HULLS, BERTHS, ISLAND, THEME, defaultDoc, migrate, canPlaceShip, shipRect, create };
});
