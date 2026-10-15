/* GRITTY FLEET — fleet-scenes.js : the two scenes (harbour fleet, ship cutaway) and their lighting.

   640×360 logical pixels. Everything static is baked once into canvases (sea floor and island, sky and far stacks,
   each ship's hull, rooms and props); a frame only composites those, animates water, clouds, crew, smoke and
   effects, then runs a light pass: an ambient darkness layer with holes cut by every real light source, drawn at
   half resolution so the light falls in chunky pixel steps. Light is also a status signal: a laid-up ship is dark,
   a crewed ship's lanterns burn, and the stack smokes only while someone on board is actually running. */
'use strict';
const GrittyFleetScenes = (() => {
  const W = 640, H = 360, WL = 262, HORIZON = 206;
  const X = () => window.GrittyPixel, A = () => window.GrittyFleetArt;
  const HL = y => 86 + Math.max(0, y - 250) * 0.9;           // hull, stern side
  const HR = y => 566 - Math.max(0, y - 118) * 0.62;         // hull, raked bow side
  const KEEL = 318;
  const FLEET_POS = { operations: [138, 202], etsy: [336, 60], lab: [546, 96], services: [330, 306], youtube: [548, 282] };
  const ISLAND = { cx: 338, cy: 188, rx: 92, ry: 56 };
  const THEME = {
    etsy: [{ wall: ['printLine', 'wallMap'], floor: ['easel', 'workbench', 'paintShelf', 'crate'] }],
    operations: [{ wall: ['wallMap'], floor: ['chartTable', 'globe'] }, { wall: [], floor: ['ledgerDesk', 'coinPile'] }, { wall: [], floor: ['radio', 'bookshelf'] }],
    services: [{ wall: ['wallMap', 'printLine'], floor: ['workbench', 'crate', 'barrel'] }],
    youtube: [{ wall: ['printLine', 'chalkboard'], floor: ['camera', 'stageLight', 'crate'] }],
    lab: [{ wall: ['chalkboard', 'wallMap'], floor: ['instrumentRack', 'bookshelf', 'globe'] }]
  };

  /* ================= layouts (shared by drawing and by the click layer) ================= */
  // the ship's entry in the layout document (fleet-doc.js), if the host passed one
  const docShip = (input, id) => input && input.fleetDoc && input.fleetDoc.ships && input.fleetDoc.ships[id];
  function fleetLayout(fleet, input, drag) {
    return fleet.map((s, i) => {
      const ds = docShip(input, s.id), def = FLEET_POS[s.id] || [80 + (i % 5) * 120, 40 + Math.floor(i / 5) * 300];
      let cx = ds ? ds.pos.x : def[0], cy = ds ? ds.pos.y : def[1];
      if (drag && drag.id === s.id) { cx = drag.x; cy = drag.y; }
      const big = ds ? ds.hull === 'flagship' : s.flagship, w = big ? 156 : 120, h = big ? 52 : 40;
      return { ship: s, cx, cy, x: cx - w / 2, y: cy - h / 2, w, h, big, name: (ds && ds.name) || s.name };
    });
  }
  function cutawayLayout(ship, input) {
    const conv = (input.conveyors && input.conveyors[ship.id]) || [];
    const meta = (input.departments || []).find(d => d.id === ship.id) || {}, ds = docShip(input, ship.id);
    const rooms = ship.rooms.length ? ship.rooms : ['deck'];
    const top = 124, bottom = 250, dh = Math.floor((bottom - top) / rooms.length);
    const decks = rooms.map((roomId, i) => ({ roomId, name: (ds && ds.decks[i] && ds.decks[i].name !== 'Deck' && ds.decks[i].name) || (meta.deckNames && meta.deckNames[i]) || 'Deck',
      props: ds && ds.decks[i] ? ds.decks[i].props : null, y0: top + i * dh, y1: top + (i + 1) * dh - 5 }));
    const stations = (ds && ds.stations) || {};
    const leader = ship.crew.find(c => c.rank === 'admiral') || ship.crew.find(c => c.id === ship.captainId) || null;
    const rest = ship.crew.filter(c => c !== leader).sort((a, b) => {
      const ia = conv.indexOf(a.id), ib = conv.indexOf(b.id); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    // crew with a saved station stand there; everyone else is spread evenly over the decks
    const pinned = rest.filter(c => stations[c.id] && decks[stations[c.id].deck]), free = rest.filter(c => !pinned.includes(c));
    const per = Math.ceil(free.length / decks.length) || 1, place = [];
    pinned.forEach(c => { const st = stations[c.id], d = decks[st.deck]; place.push({ crew: c, deck: st.deck, x: Math.round(Math.min(st.x, HR(d.y1) - 48)), y: d.y1 - 30, w: 18, h: 30, slot: 60 }); });
    decks.forEach((d, di) => {
      const here = free.slice(di * per, di * per + per), x0 = 266, x1 = Math.min(548, HR(d.y1) - 30), sw = (x1 - x0) / Math.max(1, here.length);
      here.forEach((c, i) => place.push({ crew: c, deck: di, x: Math.round(x0 + sw * (i + 0.5) - 14), y: d.y1 - 30, w: 18, h: 30, slot: sw }));
    });
    if (leader) {
      const big = leader.rank === 'admiral';
      place.push({ crew: leader, deck: -1, leader: true, x: big ? 116 : 122, y: 75 - (big ? 40 : 30), w: big ? 26 : 18, h: big ? 40 : 30 });
    }
    const items = [
      { kind: 'ship', x: 96, y: 80, w: 118, h: 36, plate: 'Captain\'s cabin', sub: 'Ship overview' },
      { kind: 'hold', x: 214, y: 256, w: Math.round(HR(282) - 228), h: 48, plate: 'Treasure hold', sub: 'Output vault' }
    ];
    const cp = conv.map(id => place.find(p => p.crew.id === id)).filter(Boolean);
    if (cp.length > 1 && cp.every(p => p.deck === cp[0].deck)) {
      const fy = decks[cp[0].deck].y1, xa = cp[0].x - 4, xb = cp[cp.length - 1].x + 22;
      items.push({ kind: 'conveyor', x: xa, y: fy - 6, w: xb - xa, h: 7, plate: 'Conveyor', sub: 'Workflow map', belt: { y: fy, xa, xb, order: cp } });
    } else items.push({ kind: 'conveyor', x: 252, y: decks[0].y0 + 4, w: 30, h: 20, plate: 'Route board', sub: 'Workflow map', board: true });
    if (ship.sea.level !== 'calm') items.push({ kind: 'alert', x: 320, y: 0, w: 24, h: 18, plate: 'Signal flag', sub: '', ref: ship.sea.reasons[0] && ship.sea.reasons[0].ref });
    return { decks, place, items, conv };
  }

  /* ================= renderer ================= */
  function createRenderer(canvas) {
    const g = canvas.getContext('2d'); g.imageSmoothingEnabled = false;
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.imageSmoothingEnabled = false; return [c, x]; };
    const [lightCv, lg] = mk(W / 2, H / 2);
    const cache = new Map(), C = (k, f) => { if (!cache.has(k)) cache.set(k, f()); return cache.get(k); };
    const px = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); };

    /* ---------- light pass ---------- */
    function lightPass(top, bottom, lights) {
      lg.globalCompositeOperation = 'source-over'; lg.clearRect(0, 0, W / 2, H / 2);
      const grad = lg.createLinearGradient(0, 0, 0, H / 2); grad.addColorStop(0, top); grad.addColorStop(1, bottom);
      lg.fillStyle = grad; lg.fillRect(0, 0, W / 2, H / 2);
      lg.globalCompositeOperation = 'destination-out';
      for (const l of lights) {
        const x = l.x / 2, y = l.y / 2, r = l.r / 2, gr = lg.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, `rgba(0,0,0,${l.i})`); gr.addColorStop(0.55, `rgba(0,0,0,${l.i * 0.45})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
        lg.fillStyle = gr; lg.fillRect(x - r, y - r, r * 2, r * 2);
      }
      g.drawImage(lightCv, 0, 0, W, H);
      // warm bloom where the light is strongest
      g.globalCompositeOperation = 'lighter';
      for (const l of lights) {
        if (!l.warm) continue;
        const gr = g.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r * 0.5);
        gr.addColorStop(0, l.warm); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(l.x - l.r, l.y - l.r, l.r * 2, l.r * 2);
      }
      g.globalCompositeOperation = 'source-over';
    }
    const LAMP = (x, y, r, i) => ({ x, y, r: r || 60, i: i == null ? 0.95 : i, warm: 'rgba(255,170,70,0.20)' });

    /* ---------- particles ---------- */
    function drawParticles(list, t) {
      const R = X().RAMP;
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i], a = (t - p.born) / p.dur;
        if (a >= 1) { list.splice(i, 1); continue; }
        if (p.kind === 'smoke') {
          const r = 2 + Math.round(a * 7), x = p.x + a * 26 + Math.sin(a * 6 + p.seed) * 3, y = p.y - a * 46;
          g.globalAlpha = 0.55 * (1 - a);
          for (let yy = -r; yy <= r; yy++) { const ww = Math.round(Math.sqrt(r * r - yy * yy)); px(x - ww, y + yy, ww * 2 + 1, 1, yy < 0 ? '#6b6660' : '#4a4642'); }
        } else if (p.kind === 'puff') {
          if (a < 0.12) { g.globalAlpha = 1; px(p.x - 2, p.y - 2, 5, 5, R.lamp[5]); }
          const r = 1 + Math.round(a * 6); g.globalAlpha = 0.85 * (1 - a);
          for (let yy = -r; yy <= r; yy++) { const ww = Math.round(Math.sqrt(r * r - yy * yy)); px(p.x - ww, p.y + yy - a * 7, ww * 2 + 1, 1, yy < 0 ? '#c9c2b2' : '#8f897d'); }
        } else if (p.kind === 'splash') {
          g.globalAlpha = 1 - a; const hgt = Math.round(Math.sin(a * Math.PI) * 10);
          px(p.x - 1, p.y - hgt, 3, hgt, '#9fb7b0'); px(p.x - 3, p.y - hgt / 2, 1, hgt / 2, '#6c8f87'); px(p.x + 3, p.y - hgt / 2, 1, hgt / 2, '#6c8f87');
        }
        g.globalAlpha = 1;
      }
    }

    /* ---------- pennant + markers ---------- */
    const GL = { '!': ['.k.', '.k.', '.k.', '...', '.k.'], 'x': ['k.k', 'k.k', '.k.', 'k.k', 'k.k'], '?': ['kk.', '..k', '.k.', '...', '.k.'],
      '*': ['k.k', '.k.', 'kkk', '.k.', 'k.k'], '=': ['k.k', 'k.k', 'k.k', 'k.k', 'k.k'], '-': ['...', '...', 'kkk', '...', '...'] };
    function marker(ch, col) {
      return C('mk' + ch + col, () => {
        const p = new (X().Px)(12, 15);
        p.rect(1, 1, 10, 11, '#17110e'); p.rect(1, 1, 10, 1, col);
        GL[ch].forEach((row, y) => [...row].forEach((k, x) => { if (k === 'k') { p.rect(3 + x * 2, 3 + y * 2 - 1, 2, 2, col); } }));
        p.set(5, 12, '#17110e'); p.set(6, 12, '#17110e'); p.set(6, 13, '#17110e'); p.outline(); return p.toCanvas();
      });
    }
    function pennant(x, y, level, t, reduced) {
      const col = level === 'trouble' ? '#d0503a' : level === 'attention' ? '#e0a33e' : '#9aa3a0', ch = level === 'trouble' ? 'x' : level === 'attention' ? '!' : '?';
      px(x, y, 2, 20, '#1d1611');
      const wave = reduced ? 0 : Math.round(Math.sin(t / 220) * 1.5);
      for (let i = 0; i < 14; i++) { const dy = Math.round(Math.sin(i / 3 + t / 200) * (reduced ? 0 : 1)); px(x + 2 + i, y + 1 + dy, 1, 10 - Math.floor(i / 3), col); }
      g.drawImage(marker(ch, '#17110e'), x + 3, y - 1 + wave, 9, 11);
    }

    /* ================================================================ FLEET ================================================================ */
    function fleetBase() {
      return C('fleetBase', () => {
        const P = X(), R = P.RAMP, p = new P.Px(W, H), I = ISLAND;
        const elev = (x, y) => {
          const a = 1 - ((x - I.cx) / I.rx) ** 2 - ((y - I.cy) / I.ry) ** 2 + (P.fbm(x / 38, y / 38, 11) - 0.5) * 0.9;
          const b = 1 - ((x - 214) / 22) ** 2 - ((y - 300) / 13) ** 2 + (P.fbm(x / 20, y / 20, 3) - 0.5) * 0.8;
          const c = 1 - ((x - 470) / 26) ** 2 - ((y - 30) / 14) ** 2 + (P.fbm(x / 20, y / 20, 5) - 0.5) * 0.8;
          return Math.max(a, b - 0.2, c - 0.2);
        };
        const lights = [];
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const e = elev(x, y), n = P.fbm(x / 70, y / 70, 3);
          let c;
          if (e > 0.2) c = P.rampAt(R.leaf.slice(1, 7), 0.42 + (P.fbm(x / 14, y / 14, 5) - 0.5) * 0.9 - (y - I.cy) / 260 + (e - 0.2) * 0.25, x, y);
          else if (e > 0.1) c = P.rampAt(R.sand.slice(2, 7), 0.4 + (e - 0.1) * 4 - (y - I.cy) / 300 + (P.noise(x / 3, y / 3, 2) - 0.5) * 0.3, x, y);
          else if (e > 0.07) c = R.sand[2];
          else if (e > -0.06) c = P.rampAt(R.sea.slice(4, 9), 0.25 + (e + 0.06) * 5, x, y);
          else c = P.rampAt(R.sea.slice(1, 6), 0.35 + (n - 0.5) * 0.7 + e * 0.25, x, y);
          if (e > -0.075 && e < -0.06 && P.dither(x, y, 0.5)) c = R.sea[8];
          p.set(x, y, c);
        }
        // dock on the west shore: planks, posts, two lanterns
        for (let x = 226; x < 262; x++) for (let y = 194; y < 202; y++) p.set(x, y, (x % 4 === 0) ? R.plank[1] : y === 194 ? R.plank[5] : R.plank[3 + (x % 8 < 4 ? 1 : 0)]);
        for (const x of [226, 238, 250]) { p.rect(x, 202, 2, 3, R.wood[1]); p.rect(x, 192, 2, 2, R.wood[2]); }
        lights.push(LAMP(228, 193, 46, 0.85), LAMP(258, 193, 40, 0.7));
        const cv = p.toCanvas(), cx = cv.getContext('2d'); cx.imageSmoothingEnabled = false;
        // trees and rocks, scattered deterministically, drawn back to front
        const rnd = P.rng(42), spots = [];
        for (let k = 0; k < 900 && spots.length < 46; k++) {
          const x = I.cx + (rnd() - 0.5) * I.rx * 1.9, y = I.cy + (rnd() - 0.5) * I.ry * 1.8;
          if (elev(x, y) < 0.32 || Math.abs(y - 198) < 10 && x < 300) continue;
          if (spots.some(s => Math.hypot(s[0] - x, s[1] - y) < 9)) continue;
          spots.push([x, y]);
        }
        spots.sort((a, b) => a[1] - b[1]).forEach(([x, y], i) => {
          const t = A().tree(i * 7 + 3, 5 + (i % 3) * 2); cx.globalAlpha = 0.35; cx.fillStyle = '#060a08'; cx.beginPath(); cx.ellipse(x + 3, y + 6, t.width / 2.3, 3, 0, 0, 7); cx.fill(); cx.globalAlpha = 1;
          cx.drawImage(t, Math.round(x - t.width / 2), Math.round(y - t.height + 6));
        });
        for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2, x = I.cx + Math.cos(a) * I.rx * 0.86, y = I.cy + Math.sin(a) * I.ry * 0.86; if (elev(x, y) > 0.05 && elev(x, y) < 0.3) cx.drawImage(A().rock(i + 1), Math.round(x - 7), Math.round(y - 5)); }
        // lighthouse on the east point
        const lx = I.cx + I.rx - 18, ly = I.cy - 18, lp = new (X().Px)(14, 34);
        for (let y = 6; y < 34; y++) { const half = 3 + Math.floor((y - 6) / 9); for (let x = 7 - half; x <= 7 + half; x++) lp.set(x, y, Math.floor((y - 6) / 5) % 2 ? (x < 7 ? R.canvas[6] : R.canvas[4]) : (x < 7 ? R.rust[4] : R.rust[2])); }
        lp.rect(3, 0, 9, 6, R.iron[2]); lp.rect(4, 1, 7, 4, R.lamp[4]); lp.rect(5, 2, 3, 2, R.lamp[5]); lp.outline();
        cx.drawImage(lp.toCanvas(), lx - 7, ly - 30);
        lights.push({ x: lx, y: ly - 27, r: 70, i: 1, warm: 'rgba(255,190,90,0.30)' });
        return { canvas: cv, lights, lighthouse: [lx, ly - 27] };
      });
    }
    function cloudShadow(seed) {
      return C('cs' + seed, () => {
        const [c, x] = mk(150, 80), P = X();
        for (let y = 0; y < 80; y++) for (let xx = 0; xx < 150; xx++) { const d = ((xx - 75) / 75) ** 2 + ((y - 40) / 40) ** 2 - (P.fbm(xx / 25, y / 25, seed) - 0.5) * 0.9; if (d < 0.7 && P.dither(xx, y, 0.55)) { x.fillStyle = '#04070a'; x.fillRect(xx, y, 1, 1); } }
        return c;
      });
    }
    function rope(a, b, age, ttl, t, reduced, lights) {
      const fade = Math.max(0.3, 1 - age / ttl), dx = b[0] - a[0], dy = b[1] - a[1], n = Math.max(Math.abs(dx), Math.abs(dy));
      g.globalAlpha = fade;
      for (let i = 0; i <= n; i++) { const sag = Math.sin(i / n * Math.PI) * 14; px(a[0] + dx * i / n, a[1] + dy * i / n + sag, 1, 1, i % 3 ? '#c49c42' : '#7d5a20'); }
      g.globalAlpha = 1;
      const k = reduced ? 0.5 : (t % 4000) / 4000, sag = Math.sin(k * Math.PI) * 14, lx = a[0] + dx * k, ly = a[1] + dy * k + sag;
      px(lx - 1, ly - 2, 3, 4, '#ffdc86'); lights.push({ x: lx, y: ly, r: 34, i: 0.9, warm: 'rgba(255,200,110,0.35)' });
    }
    function drawFleet(fleet, input, t, fx) {
      const P = X(), R = P.RAMP, mt = fx.reduced ? 0 : t, base = fleetBase(), lights = base.lights.slice();
      g.drawImage(base.canvas, 0, 0);
      // drifting cloud shadows and water glints
      g.globalAlpha = 0.18;
      for (let i = 0; i < 3; i++) { const cs = cloudShadow(i + 3); g.drawImage(cs, Math.round(((mt / 1000 * (6 + i * 2) + i * 260) % (W + 160)) - 160), 30 + i * 110); }
      g.globalAlpha = 1;
      for (let i = 0; i < 220; i++) {
        const x = Math.floor(P.hash(i, 1) * W), y = Math.floor(P.hash(i, 2) * H), tw = Math.sin(mt / 700 + i * 2.1);
        if (tw < 0.55) continue;
        const e = base.canvas; // glints only over open water: cheap test against the island ellipse
        if (((x - ISLAND.cx) / (ISLAND.rx + 8)) ** 2 + ((y - ISLAND.cy) / (ISLAND.ry + 8)) ** 2 < 1) continue;
        px(x + Math.round(mt / 1500 % 3), y, tw > 0.85 ? 3 : 2, 1, tw > 0.85 ? R.sea[8] : R.sea[6]);
      }
      const lay = fleetLayout(fleet, input, fx.drag), at = Object.fromEntries(lay.map(L => [L.ship.id, [L.cx, L.cy]]));
      // lighthouse beam sweeping the water
      if (!fx.reduced) {
        const [bx, by] = base.lighthouse, ang = t / 2600;
        g.globalCompositeOperation = 'lighter'; g.fillStyle = 'rgba(255,200,120,0.045)';
        g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + Math.cos(ang - 0.12) * 260, by + Math.sin(ang - 0.12) * 260); g.lineTo(bx + Math.cos(ang + 0.12) * 260, by + Math.sin(ang + 0.12) * 260); g.fill();
        g.globalCompositeOperation = 'source-over';
      }
      lay.forEach((L, i) => {
        const s = L.ship, laid = s.laidUp, bob = fx.reduced ? 0 : Math.round(Math.sin(mt / (laid ? 1500 : 950) + i * 1.3) * 1);
        const spr = C('top' + s.id + laid + L.big, () => A().shipTop(s.id, { flagship: L.big, laidUp: laid }));
        // wake rings and hull shadow
        if (!fx.reduced) { const ph = (mt / 2200 + i * 0.3) % 1; g.globalAlpha = 0.35 * (1 - ph); g.strokeStyle = R.sea[8]; g.beginPath(); g.ellipse(L.cx, L.cy, L.w / 2 + ph * 14, L.h / 2 + ph * 8, 0, 0, 7); g.stroke(); g.globalAlpha = 1; }
        g.globalAlpha = 0.45; g.fillStyle = '#030608'; g.beginPath(); g.ellipse(L.cx + 4, L.cy + 6, L.w / 2, L.h / 2.2, 0, 0, 7); g.fill(); g.globalAlpha = 1;
        if (laid) { g.strokeStyle = R.iron[4]; g.beginPath(); g.moveTo(L.x + L.w - 8, L.cy + bob); g.lineTo(L.x + L.w + 8, L.cy + 10); g.stroke(); px(L.x + L.w + 7, L.cy + 9, 3, 3, R.iron[3]); }
        g.drawImage(spr.canvas, Math.round(L.x), Math.round(L.y + bob));
        if (fx.drag && fx.drag.id === s.id) { g.strokeStyle = fx.drag.ok ? '#9fd18a' : '#d0503a'; g.setLineDash([4, 3]); g.strokeRect(L.x - 4.5, L.y - 4.5, L.w + 9, L.h + 9); g.setLineDash([]); }
        if (!laid) for (const [lx, ly] of spr.lights) lights.push(LAMP(L.x + lx, L.y + ly + bob, L.big ? 90 : 72, 0.95));
        else lights.push({ x: L.x + 6, y: L.cy + bob, r: 22, i: 0.35 });
        deckCrew(L, s, bob, mt, fx.reduced);
        // trouble: black-sailed raiders circling and trading fire
        for (let k = 0; k < s.sea.attackers; k++) {
          const ang = mt / 3200 + k * (Math.PI * 2 / s.sea.attackers), rx = L.w * 0.72 + 18, ex = L.cx + Math.cos(ang) * rx, ey = L.cy + Math.sin(ang) * (L.h + 18);
          const e = C('enemyTop', () => A().enemyTop());
          g.save(); g.translate(Math.round(ex), Math.round(ey)); g.rotate(ang + Math.PI / 2); g.globalAlpha = 0.4; g.fillStyle = '#030608'; g.fillRect(-21, 2, 44, 10); g.globalAlpha = 1; g.drawImage(e, -23, -9); g.restore();
          if (!fx.reduced && fx.pacer.allow(s.id + ':atk' + k, t)) {
            fx.particles.push({ kind: 'puff', x: Math.round(ex), y: Math.round(ey), born: t, dur: 1300 }, { kind: 'splash', x: Math.round(L.cx + (ex - L.cx) * 0.4), y: Math.round(L.cy + (ey - L.cy) * 0.4), born: t + 200, dur: 700 });
            fx.flashes.push({ x: ex, y: ey, born: t });
          }
        }
        if (s.sea.level === 'attention' && !fx.reduced && fx.pacer.allow(s.id + ':gun', t)) {
          fx.particles.push({ kind: 'puff', x: Math.round(L.x + L.w * 0.45), y: Math.round(L.y + bob - 2), born: t, dur: 1400 }); fx.flashes.push({ x: L.x + L.w * 0.45, y: L.y, born: t });
        }
      });
      for (const h of M().activeHandoffs(input.evidence, fx.now(), fx.ttl)) if (at[h.from] && at[h.to]) rope(at[h.from], at[h.to], h.age, fx.ttl, mt, fx.reduced, lights);
      drawParticles(fx.particles, t);
      flashLights(fx, t, lights);
      lightPass('rgba(4,8,16,0.30)', 'rgba(4,8,16,0.44)', lights);
      lay.forEach((L, i) => {
        const s = L.ship;
        if (s.sea.level === 'unknown') fogBank(L.cx, L.cy, L.w * 0.8, 32, mt, i);
        if (s.sea.level !== 'calm') pennant(Math.round(L.x + 6), Math.round(L.y - 24), s.sea.level, t, fx.reduced);
      });
    }
    const M = () => window.GrittyFleetModel;
    function flashLights(fx, t, lights) {
      for (let i = fx.flashes.length - 1; i >= 0; i--) { const f = fx.flashes[i], a = (t - f.born) / 260; if (a < 0) continue; if (a > 1) { fx.flashes.splice(i, 1); continue; } lights.push({ x: f.x, y: f.y, r: 90, i: 1 - a, warm: `rgba(255,190,90,${0.5 * (1 - a)})` }); }
    }
    // tiny crew on the open deck: one figure per crew member who is not offline; running crew walk
    function deckCrew(L, s, bob, t, reduced) {
      const P = X(), R = P.RAMP, d = A().deptOf(s.id), active = s.crew.filter(c => c.status !== 'offline');
      active.forEach((c, k) => {
        const u = (k + 1) / (active.length + 1), base = L.x + L.w * (0.18 + u * 0.55), lane = (k % 2 ? 1 : -1) * L.h * 0.16;
        const walk = c.status === 'running' && !reduced ? Math.sin(t / 700 + k) * 8 : 0, x = Math.round(base + walk), y = Math.round(L.cy + lane + bob);
        px(x - 1, y, 4, 3, d.coat[2]); px(x - 1, y, 4, 1, d.coat[3]); px(x, y - 2, 2, 2, R.skin[k % 3][3]); px(x, y - 3, 2, 1, c.rank === 'crew' ? d.coat[1] : R.brass[4]);
      });
    }
    function fogBank(cx, cy, rx, ry, t, seed) {
      const P = X(), shift = (t / 90) % 40;
      g.globalAlpha = 0.45;
      for (let y = -ry; y <= ry; y += 2) for (let x = -rx; x <= rx; x += 2) {
        const d = (x / rx) ** 2 + (y / ry) ** 2 - (P.fbm((x + shift) / 18, y / 10, seed + 4) - 0.5) * 1.1;
        if (d > 0.8) continue;
        px(cx + x, cy + y, 2, 2, d < 0.3 ? '#a7aea9' : '#7f8784');
      }
      g.globalAlpha = 1;
    }

    /* ================================================================ CUTAWAY ================================================================ */
    function sky() {
      return C('sky', () => {
        const P = X(), R = P.RAMP, p = new P.Px(W, HORIZON + 4);
        for (let y = 0; y < HORIZON + 4; y++) for (let x = 0; x < W; x++) p.set(x, y, P.rampAt(R.sky.slice(0, 10), Math.pow(y / HORIZON, 1.5) * 0.98, x, y));
        const r = P.rng(9); for (let i = 0; i < 90; i++) { const x = r() * W | 0, y = r() * 110 | 0; p.set(x, y, r() > 0.8 ? '#e9e1cf' : '#8f8aa0'); }
        for (let y = -11; y <= 11; y++) for (let x = -11; x <= 11; x++) { const d = x * x + y * y; if (d > 121) continue; const sh = ((x + 4) ** 2 + (y - 3) ** 2) < 90; p.set(560 + x, 46 + y, sh ? (d > 90 ? '#c9bfa8' : '#e3dbc5') : '#8c826c'); }
        // far sea stacks, FAR-style silhouettes, fading into the haze
        const stack = (cx, w, top, tone) => { for (let y = top; y < HORIZON + 4; y++) { const half = w / 2 + (y - top) * 0.12 + (P.fbm(y / 9, cx, 7) - 0.5) * 6; for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) p.set(x, y, P.rampAt(tone, 0.55 - (x - cx) / (half * 3) + (y < top + 5 ? 0.3 : 0), x, y)); } };
        stack(70, 26, 120, ['#2a2433', '#3a3043', '#4a3b4f']); stack(130, 16, 150, ['#33293a', '#45364a', '#574455']);
        stack(600, 30, 110, ['#2a2433', '#3a3043', '#4a3b4f']); stack(520, 14, 160, ['#3a2e3e', '#4d3c4e', '#61495a']);
        return p.toCanvas();
      });
    }
    function seaBand() {
      return C('sea', () => {
        const P = X(), R = P.RAMP, p = new P.Px(W, H - HORIZON);
        for (let y = 0; y < H - HORIZON; y++) for (let x = 0; x < W; x++) p.set(x, y, P.rampAt(R.sea.slice(1, 8), 0.9 - y / (H - HORIZON) * 0.85 + (P.noise(x / 30, y / 2, 4) - 0.5) * 0.12, x, y));
        for (let x = 0; x < W; x++) p.set(x, 0, '#b5694d');
        return p.toCanvas();
      });
    }
    function shipCanvas(ship, L) {
      const lit = !ship.laidUp;
      return C('ship:' + ship.id + ':' + lit + ':' + JSON.stringify(L.decks.map(d => [d.name, d.props])) + ':' + L.place.map(q => q.crew.id + q.x + q.deck).join(), () => buildShip(ship, L, lit));
    }
    function buildShip(ship, L, lit) {
      const P = X(), R = P.RAMP, p = new P.Px(W, H), d = A().deptOf(ship.id), lights = [];
      const inMain = (x, y) => y >= 118 && y <= KEEL && x >= HL(y) && x <= HR(y);
      const inCastle = (x, y) => y >= 74 && y < 118 && x >= 86 && x <= 224;
      const inFore = (x, y) => y >= 106 && y < 118 && x >= 500 && x <= HR(118);
      // exterior: wooden strakes above, riveted iron plating below, red anti-fouling under the waterline
      for (let y = 74; y <= KEEL; y++) for (let x = 80; x < 590; x++) {
        if (!(inMain(x, y) || inCastle(x, y) || inFore(x, y))) continue;
        const xl = y < 118 ? 86 : HL(y), xr = y < 118 ? 566 : HR(y), lx = 0.62 - (x - xl) / Math.max(1, xr - xl) * 0.25;
        let c;
        if (y > WL + 3) c = P.rampAt(['#2a0c0a', '#3e1310', '#561c14', '#6e2618'], lx + (P.noise(x / 6, y / 3, 8) - 0.5) * 0.3, x, y);
        else if (y > 236) {
          const plate = (x - 80) % 18 === 0 || (y - 236) % 10 === 0, rivet = ((x - 80) % 18 === 2 || (x - 80) % 18 === 16) && (y - 236) % 3 === 1;
          c = plate ? R.iron[1] : rivet ? R.iron[6] : P.rampAt(R.iron.slice(2, 6), lx + (P.fbm(x / 9, y / 7, 6) - 0.5) * 0.35, x, y);
          if (!plate && P.fbm(x / 5, y / 14, 12) > 0.64) c = P.rampAt(R.rust.slice(1, 5), lx, x, y);
        } else {
          const strake = Math.floor((y - 74) / 5), seam = (y - 74) % 5 === 4, butt = (x + strake * 23) % 41 === 0;
          c = (seam || butt) ? R.wood[1] : P.rampAt(R.wood.slice(2, 7), lx + P.hash(strake, 1) * 0.1 - 0.05, x, y);
        }
        p.set(x, y, c);
      }
      // rust streaks running down from the rivet line
      for (let x = 90; x < 560; x += 3) if (P.hash(x, 3) > 0.8) { const y0 = 237 + (P.hash(x, 4) * 4 | 0), len = 6 + (P.hash(x, 5) * 16 | 0); for (let y = y0; y < Math.min(WL, y0 + len); y++) if (inMain(x, y)) p.set(x, y, P.dither(x, y, 1 - (y - y0) / len) ? R.rust[3] : R.rust[2]); }
      // interior cut: castle cabin, working decks, hold
      for (let y = 80; y < 116; y++) for (let x = 96; x < 214; x++) p.set(x, y, (x % 10 === 0) ? R.plank[0] : P.rampAt(R.plank.slice(1, 4), 0.6 - (y - 80) / 60, x, y));
      for (let y = 124; y < 308; y++) {
        const xl = Math.round(HL(y)) + 10, xr = Math.round(HR(y)) - 10;
        for (let x = xl; x < xr; x++) {
          let c;
          if (y >= 252) c = ((x - 4) % 26 < 3) ? R.iron[2] : P.rampAt(R.iron.slice(0, 3), 0.5 + (P.fbm(x / 10, y / 8, 21) - 0.5) * 0.7, x, y);
          else { const deck = L.decks.find(dd => y >= dd.y0 - 1 && y <= dd.y1 + 4) || L.decks[0], local = (y - deck.y0) / Math.max(1, deck.y1 - deck.y0);
            c = (x % 11 === 0) ? R.plank[0] : P.rampAt(R.plank.slice(1, 5), 0.55 - Math.abs(local - 0.45) * 0.7 + P.hash(x / 11 | 0, 2) * 0.12, x, y); }
          p.set(x, y, c);
        }
      }
      // decks: floors with beams beneath, a hatch where the ladder passes
      const floor = (y, x0, x1) => { for (let x = x0; x < x1; x++) { if (x >= 232 && x < 248) continue; p.set(x, y, R.plank[5]); p.set(x, y + 1, R.plank[4]); p.set(x, y + 2, R.plank[2]); p.set(x, y + 3, R.wood[0]); if ((x - x0) % 32 < 4) { p.set(x, y + 4, R.wood[2]); p.set(x, y + 5, R.wood[1]); } } };
      L.decks.forEach(dd => floor(dd.y1, Math.round(HL(dd.y1)) + 10, Math.round(HR(dd.y1)) - 10));
      floor(250, Math.round(HL(250)) + 10, Math.round(HR(250)) - 10);
      for (let x = 86; x < 224; x++) { p.set(x, 116, R.plank[5]); p.set(x, 117, R.plank[3]); }
      // weather deck, bulwark rail, quarterdeck rail
      for (let x = 224; x < Math.round(HR(118)); x++) { p.set(x, 118, R.plank[5]); p.set(x, 119, R.plank[4]); p.set(x, 120, R.wood[1]); }
      for (let x = 224; x < 500; x += 8) p.vline(x, 111, 117, R.wood[3]); p.hline(224, 500, 111, R.wood[5]);
      for (let x = 88; x < 224; x += 7) p.vline(x, 67, 73, R.wood[3]); p.hline(86, 224, 67, R.wood[5]); p.hline(86, 224, 74, R.plank[5]);
      // masts, yards, sails or furled canvas, crow's nest, rigging, bowsprit and jib
      const mast = (x, top) => { for (let y = top; y < 250; y++) { if (y > 118 && y < 252 && !(y >= 118 && y <= 121)) { /* mast runs through the decks */ } p.set(x - 1, y, R.wood[5]); p.set(x, y, R.wood[4]); p.set(x + 1, y, R.wood[2]); } };
      mast(318, 12); mast(448, 32);
      const sail = (cx, y0, y1, wTop, wBot) => {
        for (let y = y0; y < y1; y++) {
          const t = (y - y0) / (y1 - y0), half = (wTop + (wBot - wTop) * t) / 2, belly = Math.sin(t * Math.PI) * 5;
          for (let x = Math.round(cx - half - belly); x <= Math.round(cx + half + belly * 0.4); x++) {
            const u = (x - (cx - half)) / (2 * half), fold = Math.sin(u * Math.PI * 3) * 0.12;
            let c = P.rampAt(R.canvas.slice(2, 8), 0.75 - t * 0.35 + fold - u * 0.15, x, y);
            if (Math.abs(t - 0.62) < 0.05) c = d.stripe;
            if (P.fbm(x / 7, y / 7, cx) > 0.7) c = P.rampAt(['#7d6a55', '#94806a', '#a8927a'], 0.6 - t * 0.3, x, y);   // patches
            p.set(x, y, c);
          }
        }
        p.hline(Math.round(cx - wTop / 2 - 4), Math.round(cx + wTop / 2 + 4), y0 - 1, R.wood[3]);
      };
      const furled = (cx, y, wd) => { for (let x = cx - wd / 2; x < cx + wd / 2; x++) { p.set(x, y - 1, R.canvas[4]); p.set(x, y, R.canvas[3]); p.set(x, y + 1, R.canvas[2]); if (x % 9 === 0) p.vline(x, y - 1, y + 2, R.wood[1]); } p.hline(cx - wd / 2 - 4, cx + wd / 2 + 4, y - 2, R.wood[3]); };
      if (lit) { sail(318, 22, 60, 84, 96); sail(318, 66, 108, 100, 112); sail(448, 42, 74, 68, 78); sail(448, 80, 110, 80, 90); }
      else { furled(318, 22, 92); furled(318, 66, 106); furled(448, 42, 76); furled(448, 80, 86); }
      for (let y = 32; y < 40; y++) for (let x = 307; x < 330; x++) p.set(x, y, y === 32 ? R.wood[5] : (x % 4 === 0 ? R.wood[1] : R.wood[3]));
      const rig = (x0, y0, x1, y1) => p.line(x0, y0, x1, y1, '#20160fdd');
      rig(318, 14, 96, 67); rig(318, 14, 448, 34); rig(448, 34, 622, 82); rig(318, 22, 272, 111); rig(318, 22, 366, 111); rig(448, 44, 420, 111); rig(448, 44, 478, 111); rig(318, 40, 290, 111); rig(448, 60, 440, 111);
      for (let i = 0; i < 58; i++) { p.set(566 + i, 104 - Math.round(i * 0.42), R.wood[4]); p.set(566 + i, 105 - Math.round(i * 0.42), R.wood[2]); }
      if (lit) p.poly([[452, 36], [620, 84], [470, 108]], (x, y) => P.rampAt(R.canvas.slice(3, 7), 0.7 - (x - 452) / 400, x, y));
      // smokestack, forecastle cannon
      for (let y = 64; y < 118; y++) for (let x = 250; x < 262; x++) p.set(x, y, y < 68 ? R.iron[5] : P.rampAt(R.iron.slice(1, 5), 0.8 - (x - 250) / 14, x, y) );
      for (let y = 70; y < 118; y += 9) p.hline(250, 261, y, R.rust[2]);
      const cv = p.toCanvas(), cx = cv.getContext('2d'); cx.imageSmoothingEnabled = false;
      const put = (img, x, y) => { cx.drawImage(img, Math.round(x), Math.round(y)); return img; };
      const WALLSET = new Set(['printLine', 'wallMap', 'chalkboard']);
      const propImg = (type, on) => ({ easel: A().easel, workbench: A().workbench, paintShelf: A().paintShelf, crate: () => A().crate(16, 13, 5), barrel: A().barrel, sack: A().sack,
        chartTable: A().chartTable, globe: A().globe, ledgerDesk: () => A().ledgerDesk(on), coinPile: A().coinPile, radio: () => A().radio(on), bookshelf: () => A().bookshelf(4),
        camera: A().camera, stageLight: () => A().stageLight(on), instrumentRack: () => A().instrumentRack(on), wallMap: A().wallMap, chalkboard: A().chalkboard,
        printLine: () => A().printLine(120, 4), chest: () => A().chest(on) }[type] || (() => null))();
      put(A().cannon(), 512, 96);
      // flag at the main truck
      for (let i = 0; i < 16; i++) { cx.fillStyle = i % 4 < 2 ? d.stripe : '#1d1611'; cx.fillRect(320 + i, 6 + Math.round(Math.sin(i / 3) * 1), 1, 8 - (i >> 2)); }
      // cabin: stern windows, chart table, lantern
      put(A().porthole(lit), 100, 84); put(A().porthole(lit), 116, 84); if (lit) { lights.push(LAMP(106, 90, 50, 0.8), LAMP(122, 90, 40, 0.6)); }
      put(A().chartTable(), 170, 100); put(A().lantern(lit), 146, 80); if (lit) lights.push(LAMP(150, 88, 54));
      put(A().wheel(), 182, 52);
      // ladder through all decks to the hold
      put(A().ladder(250 - 112 + 6), 235, 112);
      // per-deck dressing from the department theme
      const theme = THEME[ship.id] || [{ wall: ['wallMap'], floor: ['crate', 'barrel'] }], WALL = ['printLine', 'wallMap', 'chalkboard'];
      L.decks.forEach((dd, di) => {
        // the layout document's dressing wins; the department theme is the default
        const th = dd.props ? { wall: dd.props.filter(p => WALL.includes(p.type)).map(p => p.type), floor: dd.props.filter(p => !WALL.includes(p.type)).map(p => p.type),
          placed: dd.props.filter(p => p.x != null) } : theme[di % theme.length], tall = dd.y1 - dd.y0 > 60, crew = L.place.filter(q => q.deck === di).sort((a, b) => a.x - b.x);
        // lanterns along the ceiling
        for (let x = 300; x < HR(dd.y1) - 30; x += 96) { put(A().lantern(lit), x, dd.y0 + 1); if (lit) lights.push(LAMP(x + 4, dd.y0 + 9, tall ? 80 : 56)); }
        // pipes along the ceiling, with joints and a valve now and then
        for (let x = Math.round(HL(dd.y0)) + 12; x < HR(dd.y0) - 14; x++) { cx.fillStyle = (x % 40 === 0) ? R.brass[3] : R.iron[3]; cx.fillRect(x, dd.y0 + 1, 1, 1); cx.fillStyle = R.iron[1]; cx.fillRect(x, dd.y0 + 2, 1, 1); }
        // a single tall hold gets a gallery: stock above, the work floor below
        if (tall && L.decks.length === 1) {
          const gy = dd.y0 + 56, gx0 = 290, gx1 = Math.round(HR(gy)) - 70;
          for (let x = gx0; x < gx1; x++) { cx.fillStyle = R.plank[5]; cx.fillRect(x, gy, 1, 1); cx.fillStyle = R.plank[3]; cx.fillRect(x, gy + 1, 1, 2); cx.fillStyle = R.wood[0]; cx.fillRect(x, gy + 3, 1, 1); }
          for (let x = gx0; x < gx1; x += 24) { cx.fillStyle = R.wood[2]; cx.fillRect(x, gy + 4, 2, dd.y1 - gy - 4); }
          for (let x = gx0; x < gx1; x += 6) { cx.fillStyle = R.wood[3]; cx.fillRect(x, gy - 7, 1, 7); } cx.fillStyle = R.wood[5]; cx.fillRect(gx0, gy - 8, gx1 - gx0, 1);
          let sx = gx0 + 6, k = 0;
          while (sx < gx1 - 24) { const pick = k % 4, img = pick === 0 ? A().crate(16, 13, k + 30) : pick === 1 ? A().barrel() : pick === 2 ? A().sack() : A().paintShelf(); if (img.height < 30) put(img, sx, gy - img.height); sx += img.width + 10 + (k % 3) * 6; k++; }
          if (lit) { put(A().lantern(true), (gx0 + gx1) / 2, gy + 4); lights.push(LAMP((gx0 + gx1) / 2 + 4, gy + 12, 70)); }
        }
        // wall pieces
        let wx = 256;
        if (L.items.some(it => it.board) && di === 0) { put(di === 0 && ship.id !== 'operations' ? A().chalkboard() : A().wallMap(), 252, dd.y0 + 6); wx = 292; }
        for (const k of th.wall) {
          if (!tall && k !== 'wallMap') continue;
          if (k === 'printLine') { put(A().printLine(Math.min(220, HR(dd.y1) - 60 - wx), 4), wx + 8, dd.y0 + 8); wx += 230; continue; }
          const img = k === 'wallMap' ? A().wallMap() : k === 'chalkboard' ? A().chalkboard() : A().bookshelf(di + 3);
          if (wx + img.width > HR(dd.y1) - 30) continue;
          put(img, tall ? Math.min(wx + 10, HR(dd.y1) - 40 - img.width) : wx, tall ? dd.y0 + 28 : dd.y0 + 6); wx += img.width + 20;
        }
        // floor pieces beside each crew member (and filling empty room)
        const placedTypes = (th.placed || []).map(p => p.type);
        (th.placed || []).forEach(pp => { const img = propImg(pp.type, lit); if (img && img.height <= dd.y1 - dd.y0 + 2) put(img, Math.min(pp.x, HR(dd.y1) - 24 - img.width), WALLSET.has(pp.type) ? dd.y0 + 8 : dd.y1 - img.height + 1); });
        const props = th.floor.filter(t => !placedTypes.includes(t) || (th.placed || []).filter(p => p.type === t).length < th.floor.filter(x => x === t).length), slots = crew.length ? crew.map(q => q.x + 21) : [300, 380, 460];
        slots.forEach((sx, k) => {
          const key = props[k % props.length]; let img;
          switch (key) {
            case 'easel': img = A().easel(); break; case 'workbench': img = A().workbench(); break; case 'paintShelf': img = A().paintShelf(); break;
            case 'chartTable': img = A().chartTable(); break; case 'globe': img = A().globe(); break; case 'ledgerDesk': img = A().ledgerDesk(lit); if (lit) lights.push({ x: sx + 25, y: dd.y1 - 16, r: 34, i: 0.7, warm: 'rgba(255,170,80,0.25)' }); break;
            case 'coinPile': img = A().coinPile(); break; case 'radio': img = A().radio(lit); if (lit) lights.push({ x: sx + 16, y: dd.y1 - 10, r: 30, i: 0.6, warm: 'rgba(255,190,90,0.25)' }); break;
            case 'bookshelf': img = A().bookshelf(k + 7); break; case 'camera': img = A().camera(); break;
            case 'stageLight': img = A().stageLight(lit); if (lit) lights.push({ x: sx + 10, y: dd.y1 - 21, r: 70, i: 0.8, warm: 'rgba(255,220,150,0.25)' }); break;
            case 'instrumentRack': img = A().instrumentRack(lit); if (lit) lights.push({ x: sx + 9, y: dd.y1 - 16, r: 30, i: 0.6, warm: 'rgba(120,220,180,0.20)' }); break;
            case 'barrel': img = A().barrel(); break; default: img = A().crate(16, 13, k + 1);
          }
          const slot = crew[k] ? crew[k].slot : 80;
          if (img.height > dd.y1 - dd.y0 + 2) return;
          if (crew.length && slot < img.width + 24) return;
          put(img, Math.min(sx, HR(dd.y1) - 24 - img.width), dd.y1 - img.height + 1);
        });
      });
      // hold: engine room aft, treasure forward
      put(A().boiler(lit), 122, 262); if (lit) lights.push({ x: 142, y: 296, r: 70, i: 0.95, warm: 'rgba(255,120,40,0.35)' });
      put(A().gear(5), 168, 284); put(A().gear(3), 174, 272);
      const holdX = 222, holdR = HR(300) - 18;
      for (let x = holdX, k = 0; x < holdR - 18; k++) {
        const pick = k % 5, img = pick === 0 || pick === 3 ? A().chest(lit) : pick === 1 ? A().barrel() : pick === 2 ? A().crate(16, 13, k) : A().sack();
        put(img, x, 306 - img.height); if (pick === 1 && k % 2) put(A().crate(14, 11, k + 9), x + 1, 306 - img.height - 11);
        x += img.width + 3;
      }
      put(A().coinPile(), holdX + 30, 301); put(A().lantern(lit), 300, 253); if (lit) lights.push(LAMP(304, 262, 70));
      return { canvas: cv, lights, stack: [256, 62] };
    }
    function enemySide() {
      return C('enemySide', () => {
        const P = X(), p = new P.Px(56, 40);
        p.poly([[2, 28], [52, 26], [46, 37], [8, 37]], '#15110f'); p.hline(2, 52, 27, '#2c2420');
        p.vline(24, 2, 27, '#0e0c0b'); p.poly([[25, 4], [44, 8], [42, 22], [25, 24]], '#1d1918'); p.poly([[23, 6], [8, 10], [10, 22], [23, 24]], '#191514');
        p.rect(24, 0, 6, 3, '#a83324'); p.outline('#060505'); return p.toCanvas();
      });
    }
    function drawCutaway(ship, input, t, fx) {
      const P = X(), R = P.RAMP, mt = fx.reduced ? 0 : t, L = cutawayLayout(ship, input), built = shipCanvas(ship, L), lights = built.lights.slice();
      g.drawImage(sky(), 0, 0);
      // drifting clouds at two depths
      const clouds = [[1, 150, 44, 0.004, 60], [2, 110, 34, 0.007, 100], [3, 190, 52, 0.003, 26], [4, 90, 28, 0.009, 140]];
      for (const [seed, cw, ch, sp, y] of clouds) { const cl = C('cl' + seed, () => A().cloud(seed * 13, cw, ch)); g.drawImage(cl, Math.round(((mt * sp + seed * 211) % (W + cw)) - cw), y); }
      if (ship.sea.attackers) {
        const ex = 600 - (fx.reduced ? 0 : Math.round(Math.sin(mt / 4000) * 10));
        g.drawImage(enemySide(), ex - 28, HORIZON - 30);
        if (!fx.reduced && fx.pacer.allow(ship.id + ':hz', t)) {
          fx.particles.push({ kind: 'puff', x: ex - 26, y: HORIZON - 10, born: t, dur: 1400 }, { kind: 'splash', x: 560 + Math.round(P.hash(t | 0, 1) * 40), y: WL + 6, born: t + 450, dur: 800 });
          fx.flashes.push({ x: ex - 26, y: HORIZON - 10, born: t });
        }
      }
      const sea = seaBand(); g.drawImage(sea, 0, HORIZON);
      // reflection of everything above the waterline, rippled row by row
      g.globalAlpha = 0.28;
      for (let r = 0; r < H - WL; r += 1) { const sy = WL - 1 - r * 1.15; if (sy < 0) break; const off = fx.reduced ? 0 : Math.round(Math.sin(r * 0.35 + mt / 380) * (1 + r / 40)); g.drawImage(built.canvas, 0, Math.round(sy), W, 1, off, WL + r, W, 1); }
      g.globalAlpha = 1;
      g.drawImage(built.canvas, 0, 0);
      // crew
      for (const q of L.place) {
        const dim = q.crew.status === 'offline' || ship.laidUp, working = q.crew.status === 'running';
        const pose = working ? (fx.reduced ? 2 : 2) : (!fx.reduced && Math.floor(mt / 900 + q.x) % 4 === 0 ? 1 : 0);
        const spr = q.crew.rank === 'admiral' ? C('adm' + pose, () => A().admiral({ pose })) : C('p' + q.crew.id + pose + dim, () => A().person(q.crew.id, q.crew.name, ship.id, { pose, dim }));
        g.drawImage(spr, q.x, q.y);
        // each station has its own lamp: lit while that crew member is active, brighter while running
        if (!dim && !q.leader) lights.push({ x: q.x + q.w / 2 + 6, y: q.y + 8, r: working ? 64 : 50, i: working ? 1 : 0.85, warm: working ? 'rgba(255,190,100,0.28)' : 'rgba(255,170,80,0.16)' });
        const ch = { running: '*', 'waiting-approval': '!', blocked: 'x', failed: 'x', paused: '=', offline: '-', unknown: '?' }[q.crew.status];
        if (ch) { const col = { '!': '#e0a33e', x: '#d0503a', '*': '#c9b26a', '=': '#c6bca0', '-': '#7a7f7c', '?': '#9aa3a0' }[ch]; g.drawImage(marker(ch, col), q.x + q.w / 2 - 6, q.y - 15); }
      }
      // the conveyor belt runs on the floor between its stations
      for (const it of L.items) if (it.belt) {
        const { y, xa, xb } = it.belt, off = fx.reduced ? 0 : Math.floor(mt / 200) % 6;
        px(xa, y - 5, xb - xa, 5, R.iron[2]); px(xa, y - 5, xb - xa, 1, R.iron[4]);
        for (let x = xa + off; x < xb - 2; x += 6) { px(x, y - 3, 2, 2, R.iron[5]); }
        it.belt.order.forEach((q, k) => { if (k) { const ax = q.x - 8; px(ax, y - 9, 6, 1, R.brass[5]); px(ax + 4, y - 10, 1, 3, R.brass[5]); px(ax + 5, y - 9, 1, 1, R.brass[5]); } });
      }
      // smoke only while someone aboard is actually running
      if (!fx.reduced && ship.crew.some(c => c.status === 'running') && fx.pacer.allow(ship.id + ':smoke', t)) fx.particles.push({ kind: 'smoke', x: built.stack[0], y: built.stack[1], born: t, dur: 3200, seed: t % 7 });
      // the sea in front: tint the hull below the waterline, then the surface line
      g.globalAlpha = 0.16; g.fillStyle = R.sea[4]; g.fillRect(0, WL + 2, W, H - WL); g.globalAlpha = 1;
      for (let x = 0; x < W; x += 1) { const y = WL + Math.round(Math.sin(x / 9 + mt / 500) * (fx.reduced ? 0 : 1.2)); px(x, y, 1, 1, '#9fb7b0'); if (x % 5 === 0) px(x, y + 1, 1, 1, R.sea[6]); }
      for (let i = 0; i < 70; i++) { const x = (P.hash(i, 6) * W + mt / 60 * (i % 3 + 1)) % W, y = WL + 6 + P.hash(i, 7) * 90, tw = Math.sin(mt / 600 + i); if (tw > 0.4) px(x, y, 3 + (i % 3), 1, tw > 0.8 ? R.sea[7] : R.sea[5]); }
      drawParticles(fx.particles, t);
      flashLights(fx, t, lights);
      lights.push({ x: 560, y: 46, r: 120, i: 0.35 });                     // moonlight
      lightPass(ship.laidUp ? 'rgba(6,10,20,0.40)' : 'rgba(6,10,20,0.24)', ship.laidUp ? 'rgba(4,8,16,0.70)' : 'rgba(4,8,16,0.50)', lights);
      if (ship.sea.level === 'unknown') fogBank(330 + (fx.reduced ? 0 : Math.round(Math.sin(mt / 3000) * 40)), 70, 260, 44, mt, 2);
      if (ship.sea.level !== 'calm') pennant(322, 0, ship.sea.level, t, fx.reduced);
      return L;
    }

    return { drawFleet, drawCutaway };
  }

  return { W, H, WL, HL, HR, FLEET_POS, fleetLayout, cutawayLayout, createRenderer };
})();
if (typeof window !== 'undefined') window.GrittyFleetScenes = GrittyFleetScenes;
