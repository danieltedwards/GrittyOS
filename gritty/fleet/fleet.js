/* GRITTY FLEET — fleet.js : the fleet and cutaway renderer, plus its click layer.

   Draws the overhead fleet (one ship per department) and, when a ship is clicked, a side-on cutaway of that ship.
   The art is drawn by fleet-scenes.js at 640×360 logical pixels and scaled up crisply. Every clickable thing is a real
   <button> laid over the canvas, so it works with a keyboard and a screen reader, and every one of them resolves
   through GrittyFleetModel.targetFor → an EXISTING GRITTY OS entry point on the host window.

   Needs (in order): fleet-model.js, fleet-pixel.js, fleet-art.js, fleet-scenes.js, fleet.js, plus fleet.css.
   Use:   const fleet = GrittyFleet.mount(el, { getInput, host: window, crewChoice: 'ask', onCall });
          fleet.refresh()  — call when runtime state changes (the PC app would call it from its U.bus listeners). */
'use strict';
const GrittyFleet = (() => {
  const S = () => window.GrittyFleetScenes, W = 640, H = 360, HANDOFF_TTL = 60000, PUFF_GAP = 7000;
  const M = () => window.GrittyFleetModel;
  const STATUS_TEXT = {
    running: 'Working', 'waiting-approval': 'Waiting for your approval', blocked: 'Blocked', failed: 'Failed', paused: 'Paused',
    idle: 'Idle', offline: 'Not active', unknown: 'Status unknown'
  };
  const STATUS_GLYPH = { running: '*', 'waiting-approval': '!', blocked: 'x', failed: 'x', paused: '=', offline: '-', unknown: '?' };
  const CHOICES = [
    ['workboard', 'Workboard', 'GRITTY OS agent workboard'], ['dossier', 'Dossier', 'Crew dossier, Overview'],
    ['character', 'Character', 'Crew dossier, Character'], ['operations', 'Operations', 'Crew dossier, Operations lane']
  ];
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pct = (v, of) => (v / of * 100).toFixed(3) + '%';

  // "ETSY COPYWRITER" aboard the Etsy ship reads as "COPYWRITER"; the full name stays in the accessible label
  function shortName(name, ship) {
    const n = String(name), lead = { etsy: 'ETSY ', services: 'SERVICE ', youtube: 'VIDEO ' }[ship.id];
    return lead && n.startsWith(lead) ? n.slice(lead.length) : n;
  }
  function seaWords(ship) {
    const s = ship.sea;
    if (s.level === 'trouble') return 'Under attack: ' + s.attackers + ' blocking issue' + (s.attackers > 1 ? 's' : '');
    if (s.level === 'attention') return 'Needs attention';
    if (s.level === 'unknown') return 'Status unknown';
    return ship.laidUp ? 'Laid up · ' + ship.posture : 'Calm · ' + ship.posture;
  }

  function mount(root, opts) {
    opts = opts || {};
    const host = opts.host || window;
    const reduced = opts.reducedMotion != null ? !!opts.reducedMotion
      : !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    let crewChoice = opts.crewChoice || 'ask';
    let input = {}, fleet = [], view = { kind: 'fleet' }, lastShipButton = null, raf = 0, destroyed = false;
    const particles = [], flashes = [], pacer = M().createPacer(PUFF_GAP);
    const now = opts.now || (() => Date.now());

    root.classList.add('gf');
    root.innerHTML = `
      <div class="gf-bar">
        <button type="button" class="gf-back" hidden>‹ Fleet</button>
        <div class="gf-title"><h2>The Fleet</h2><span class="gf-sub"></span></div>
        <button type="button" class="gf-names-btn" aria-pressed="false">Names</button>
        <label class="gf-choice">Crew click opens
          <select>${['ask', ...CHOICES.map(c => c[0])].map(v => `<option value="${v}">${v === 'ask' ? 'Ask each time' : CHOICES.find(c => c[0] === v)[1]}</option>`).join('')}</select>
        </label>
      </div>
      <div class="gf-stage" tabindex="0" aria-label="Drag to look around. Scroll, pinch or use the plus and minus buttons to zoom.">
        <div class="gf-cam"><canvas width="${W}" height="${H}" aria-hidden="true"></canvas><div class="gf-hot"></div></div>
        <div class="gf-zoom"><button type="button" data-zoom="out" aria-label="Zoom out">−</button><button type="button" data-zoom="in" aria-label="Zoom in">+</button><button type="button" data-zoom="fit">Fit</button></div>
        <p class="gf-status" role="status" aria-live="polite"></p>
        <div class="gf-pop" role="dialog" aria-label="Open crew member" hidden></div></div>
      <div class="gf-list"></div>`;
    const $ = s => root.querySelector(s);
    const cv = $('canvas'), g = cv.getContext('2d'), hot = $('.gf-hot'), list = $('.gf-list'), pop = $('.gf-pop'), statusEl = $('.gf-status');
    const select = $('.gf-choice select');
    const renderer = S().createRenderer(cv);
    const fx = { reduced, particles, flashes, pacer, now, ttl: HANDOFF_TTL, skinFor: opts.skinFor || null };
    select.value = crewChoice;
    select.addEventListener('change', () => { crewChoice = select.value; say('Crew clicks now open: ' + select.selectedOptions[0].textContent + '.'); });
    $('.gf-back').addEventListener('click', showFleet);
    root.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      if (!pop.hidden) { closePop(); e.stopPropagation(); return; }
      if (view.kind === 'ship') { showFleet(); e.stopPropagation(); }
    });

    let sayTimer = 0;
    function say(text) { statusEl.textContent = text; statusEl.classList.remove('gf-faded'); clearTimeout(sayTimer); sayTimer = setTimeout(() => statusEl.classList.add('gf-faded'), 6000); }

    /* ---------------- camera: pan and zoom, remembered per view ----------------
       The canvas and its button layer sit in one .gf-cam box that is translated and scaled together, so clicks stay
       exactly on the art at any zoom. Offsets are stored as fractions of the stage, so a resize keeps the view. */
    const stage = $('.gf-stage'), camEl = $('.gf-cam'), cams = new Map(), ZMAX = 4;
    const camKey = () => view.kind === 'fleet' ? 'fleet' : 'ship:' + view.id;
    function defaultCam() {
      if (view.kind === 'fleet') return { z: 1, x: 0, y: 0 };
      const z = 1.55, fx = 330 / W, fy = 182 / H;           // open on the decks, the crew big enough to read
      return clampCam({ z, x: 0.5 - fx * z, y: 0.5 - fy * z });
    }
    function clampCam(c) { c.z = Math.max(1, Math.min(ZMAX, c.z)); c.x = Math.max(1 - c.z, Math.min(0, c.x)); c.y = Math.max(1 - c.z, Math.min(0, c.y)); return c; }
    function cam() { const k = camKey(); if (!cams.has(k)) cams.set(k, defaultCam()); return cams.get(k); }
    function applyCam() {
      const c = cam(), r = stage.getBoundingClientRect();
      camEl.style.transform = 'translate(' + (c.x * r.width).toFixed(2) + 'px,' + (c.y * r.height).toFixed(2) + 'px) scale(' + c.z.toFixed(4) + ')';
      camEl.style.setProperty('--z', c.z.toFixed(4));
      stage.classList.toggle('gf-zoomed', c.z > 1.01);
    }
    function zoomAt(f, px, py) {   // px, py: point in the stage, 0..1
      const c = cam(), z = Math.max(1, Math.min(ZMAX, c.z * f)), k = z / c.z;
      c.x = px - (px - c.x) * k; c.y = py - (py - c.y) * k; c.z = z; clampCam(c); applyCam();
    }
    function panBy(dx, dy) { const c = cam(); c.x += dx; c.y += dy; clampCam(c); applyCam(); }
    stage.addEventListener('wheel', e => {
      e.preventDefault(); const r = stage.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * 0.0016), (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
    }, { passive: false });
    const ptrs = new Map(); let drag = null, dragged = false, pinch = null;
    stage.addEventListener('pointerdown', e => {
      if (e.target.closest('.gf-zoom, .gf-pop')) return;
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptrs.size === 1) { drag = { x: e.clientX, y: e.clientY, id: e.pointerId }; dragged = false; }
      if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) }; }
    });
    stage.addEventListener('pointermove', e => {
      if (!ptrs.has(e.pointerId)) return;
      const r = stage.getBoundingClientRect(), prev = ptrs.get(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptrs.size === 2 && pinch) {
        const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
        zoomAt(d / pinch.d, ((a.x + b.x) / 2 - r.left) / r.width, ((a.y + b.y) / 2 - r.top) / r.height); pinch.d = d; dragged = true; return;
      }
      if (!drag) return;
      if (!dragged && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 5) return;
      if (!dragged) { dragged = true; stage.setPointerCapture(e.pointerId); stage.classList.add('gf-dragging'); }
      panBy((e.clientX - prev.x) / r.width, (e.clientY - prev.y) / r.height);
    });
    const endPtr = e => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; if (!ptrs.size) { drag = null; stage.classList.remove('gf-dragging'); } };
    stage.addEventListener('pointerup', endPtr); stage.addEventListener('pointercancel', endPtr);
    // a drag must not also click whatever it started on
    stage.addEventListener('click', e => { if (dragged) { e.stopPropagation(); e.preventDefault(); dragged = false; } }, true);
    $('.gf-zoom').addEventListener('click', e => {
      const b = e.target.closest('[data-zoom]'); if (!b) return;
      if (b.dataset.zoom === 'fit') { cams.set(camKey(), view.kind === 'fleet' ? { z: 1, x: 0, y: 0 } : { z: 1, x: 0, y: 0 }); applyCam(); }
      else zoomAt(b.dataset.zoom === 'in' ? 1.35 : 1 / 1.35, 0.5, 0.5);
    });
    stage.addEventListener('keydown', e => {
      if (e.target !== stage) return;
      const k = e.key, step = 0.06;
      if (k === '+' || k === '=') zoomAt(1.25, 0.5, 0.5); else if (k === '-' || k === '_') zoomAt(0.8, 0.5, 0.5);
      else if (k === '0') { cams.set(camKey(), { z: 1, x: 0, y: 0 }); applyCam(); }
      else if (k === 'ArrowLeft') panBy(step, 0); else if (k === 'ArrowRight') panBy(-step, 0); else if (k === 'ArrowUp') panBy(0, step); else if (k === 'ArrowDown') panBy(0, -step);
      else return;
      e.preventDefault();
    });
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => applyCam()).observe(stage);
    // names: off by default (they crowd the art); hover, focus or the Names button shows them
    const namesBtn = $('.gf-names-btn');
    namesBtn.addEventListener('click', () => { const on = !root.classList.contains('gf-names'); root.classList.toggle('gf-names', on); namesBtn.setAttribute('aria-pressed', String(on)); });

    /* ---------------- data ---------------- */
    function refresh() {
      input = (opts.getInput && opts.getInput()) || {};
      fleet = M().buildFleet(input);
      if (view.kind === 'ship' && !fleet.find(s => s.id === view.id)) view = { kind: 'fleet' };
      buildHotspots();
      if (reduced) draw();
    }
    const shipById = id => fleet.find(s => s.id === id);

    /* ---------------- clicks ---------------- */
    function activate(hit, label, btn) {
      const target = M().targetFor(hit, crewChoice);
      if (!target) return;
      if (target.fn === 'choose') return openPop(hit, label, btn);
      const result = M().invoke(host, target);
      if (result.ok) say('Opened ' + label + '.');
      else if (result.reason === 'missing') say(label + ' cannot open here: ' + target.fn + ' is not loaded in this window.');
      else say(label + ' did not open: ' + (result.message || result.reason) + '.');
      if (opts.onCall) opts.onCall(target, result, label);
    }
    function openPop(hit, label, btn) {
      pop.innerHTML = `<p><b>${esc(label)}</b> · open</p><div class="gf-pop-row">${CHOICES.map(c =>
        `<button type="button" data-c="${c[0]}" title="${esc(c[2])}">${c[1]}</button>`).join('')}</div>
        <label class="gf-remember"><input type="checkbox"> Always open this</label>`;
      const r = btn.getBoundingClientRect(), s = $('.gf-stage').getBoundingClientRect();
      pop.style.left = Math.max(4, Math.min(s.width - 250, r.left - s.left - 90)) + 'px';
      pop.style.top = Math.max(4, r.top - s.top - 92) + 'px';
      pop.hidden = false;
      pop.querySelector('button').focus();
      pop.onclick = e => {
        const b = e.target.closest('button[data-c]'); if (!b) return;
        if (pop.querySelector('input').checked) { crewChoice = b.dataset.c; select.value = crewChoice; }
        closePop(btn);
        const target = M().targetFor(hit, b.dataset.c), result = M().invoke(host, target);
        say(result.ok ? 'Opened ' + label + ' (' + b.textContent + ').' : label + ' cannot open here: ' + target.fn + ' is not loaded in this window.');
        if (opts.onCall) opts.onCall(target, result, label);
      };
    }
    function closePop(returnTo) { pop.hidden = true; pop.innerHTML = ''; if (returnTo && returnTo.focus) returnTo.focus(); }

    /* ---------------- views ---------------- */
    function showFleet() {
      view = { kind: 'fleet' }; closePop(); buildHotspots(); applyCam();
      if (lastShipButton) { const b = [...root.querySelectorAll(`[data-ship="${lastShipButton}"]`)].find(x => x.offsetParent); if (b) b.focus(); }
      if (reduced) draw();
    }
    function showShip(id) {
      if (!shipById(id)) return;
      view = { kind: 'ship', id }; lastShipButton = id; closePop(); buildHotspots(); applyCam();
      const first = [...root.querySelectorAll('.gf-hot button, .gf-list button')].find(x => x.offsetParent); if (first) first.focus({ preventScroll: true });
      if (reduced) draw();
    }

    /* ---------------- layout: one source (fleet-scenes.js) for drawing AND for the buttons ---------------- */
    const fleetLayout = () => S().fleetLayout(fleet);
    function cutawayLayout(ship) {
      const L = S().cutawayLayout(ship, input);
      L.items.forEach(it => { it.label = ship.name + ' ' + it.plate.toLowerCase(); if (it.kind === 'alert') it.sub = seaWords(ship); });
      return L;
    }

    /* ---------------- buttons over the canvas ---------------- */
    function buildHotspots() {
      const bar = $('.gf-bar');
      if (view.kind === 'fleet') {
        bar.querySelector('h2').textContent = 'The Fleet';
        $('.gf-sub').textContent = fleet.length + ' ships · ' + fleet.reduce((n, s) => n + s.crew.length, 0) + ' crew';
        $('.gf-back').hidden = true;
        hot.innerHTML = fleetLayout().map(L => {
          const s = L.ship, why = s.sea.reasons.map(r => r.label).filter(Boolean).join('. ');
          return `<button type="button" class="gf-spot gf-ship sea-${s.sea.level}" data-ship="${s.id}"
              style="left:${pct(L.x - 2, W)};top:${pct(L.y - 4, H)};width:${pct(L.w + 4, W)};height:${pct(L.h + 8, H)}"
              aria-label="${esc(s.name)} ship. ${esc(seaWords(s))}. ${s.crew.length} crew. ${esc(why)} Open cutaway.">
              <span class="gf-plate"><b>${esc(s.name)}</b><span>${esc(seaWords(s))}</span></span></button>`;
        }).join('');
        list.innerHTML = fleet.map(s => `<button type="button" class="sea-${s.sea.level}" data-ship="${s.id}"><b>${esc(s.name)}</b><span>${esc(seaWords(s))}</span></button>`).join('');
        root.querySelectorAll('[data-ship]').forEach(b => b.addEventListener('click', () => showShip(b.dataset.ship)));
        return;
      }
      const ship = shipById(view.id), L = cutawayLayout(ship);
      bar.querySelector('h2').textContent = ship.name;
      $('.gf-sub').textContent = seaWords(ship) + ' · ' + ship.crew.length + ' crew' + (ship.sea.history.length ? ' · ' + ship.sea.history.length + ' past issue in the log' : '');
      $('.gf-back').hidden = false;
      let html = L.decks.map(d => `<span class="gf-deck" style="left:${pct(Math.round(S().HL(d.y1)) + 14, W)};top:${pct(d.y0 + 2, H)}">${esc(d.name)} · ${esc(d.roomId)}</span>`).join('');
      html += L.items.map((it, i) => `<button type="button" class="gf-spot gf-prop k-${it.kind}" data-item="${i}"
          style="left:${pct(it.x, W)};top:${pct(it.y, H)};width:${pct(it.w, W)};height:${pct(Math.max(it.h, 8), H)}"
          aria-label="${esc(it.label)}: ${esc(it.sub)}"><span class="gf-plate small"><b>${esc(it.plate)}</b><span>${esc(it.sub)}</span></span></button>`).join('');
      html += L.place.map((p, i) => `<button type="button" class="gf-spot gf-crew st-${p.crew.status}${p.leader ? ' leader' : ''}" data-crew="${i}" data-agent="${esc(p.crew.id)}"
          style="left:${pct(p.x - 2, W)};top:${pct(p.y - 16, H)};width:${pct(p.w + 4, W)};height:${pct(p.h + 8, H)}"
          aria-label="${esc(p.crew.name)}${p.crew.rank !== 'crew' ? ', ' + p.crew.rank : ''}. ${esc(STATUS_TEXT[p.crew.status])}.">
          <span class="gf-name">${p.crew.rank === 'admiral' ? 'Admiral ' : p.crew.rank === 'captain' ? 'Capt. ' : ''}${esc(shortName(p.crew.name, ship))}</span></button>`).join('');
      hot.innerHTML = html;
      // Narrow screens: the same targets as a plain list, because sprites are too small to tap there.
      list.innerHTML = L.place.map((p, i) => `<button type="button" class="st-${p.crew.status}" data-crew="${i}"><b>${p.crew.rank === 'admiral' ? 'Admiral ' : p.crew.rank === 'captain' ? 'Capt. ' : ''}${esc(p.crew.name)}</b><span>${esc(STATUS_TEXT[p.crew.status])}</span></button>`).join('')
        + L.items.map((it, i) => `<button type="button" data-item="${i}"><b>${esc(it.plate)}</b><span>${esc(it.sub)}</span></button>`).join('');
      root.querySelectorAll('[data-item]').forEach(b => b.addEventListener('click', () => {
        const it = L.items[+b.dataset.item]; activate({ kind: it.kind, deptId: ship.id, ref: it.ref }, it.plate + ' (' + it.sub + ')', b);
      }));
      root.querySelectorAll('[data-crew]').forEach(b => b.addEventListener('click', () => {
        const p = L.place[+b.dataset.crew]; hot.querySelectorAll('.gf-crew.sel').forEach(x => x.classList.remove('sel'));
        const onShip = hot.querySelector('[data-agent="' + p.crew.id + '"]'); if (onShip) onShip.classList.add('sel');
        activate({ kind: 'crew', agentId: p.crew.id, deptId: ship.id }, p.crew.name, b);
      }));
    }

    /* ---------------- drawing (all art lives in fleet-scenes.js) ---------------- */
    function draw() {
      if (destroyed) return;
      const t = now();
      if (view.kind === 'fleet') { renderer.drawFleet(fleet, input, t, fx); return; }
      const L = renderer.drawCutaway(shipById(view.id), input, t, fx);
      // crew buttons follow their avatars around the ship
      if (L && L.crewRects) for (const r of L.crewRects) {
        const b = hot.querySelector('[data-agent="' + r.id + '"]'); if (!b) continue;
        const left = pct(r.x - 2, W), top = pct(r.y - 16, H);
        if (b.style.left !== left || b.style.top !== top) { b.style.left = left; b.style.top = top; b.style.width = pct(r.w + 4, W); b.style.height = pct(r.h + 14, H); }
      }
    }
    let last = 0;
    function loop(ts) {
      if (destroyed) return;
      if (ts - last > 33) { last = ts; draw(); }
      raf = requestAnimationFrame(loop);
    }

    refresh(); applyCam();
    if (reduced) draw(); else raf = requestAnimationFrame(loop);
    const poll = opts.pollMs ? setInterval(() => { if (!destroyed) refresh(); }, opts.pollMs) : 0;
    say('Select a ship to look inside. Drag to look around, scroll or pinch to zoom.');

    return {
      refresh, showFleet, showShip,
      setCrewChoice(c) { crewChoice = c; select.value = c; },
      get view() { return { ...view }; },
      destroy() { destroyed = true; cancelAnimationFrame(raf); clearInterval(poll); root.innerHTML = ''; root.classList.remove('gf'); }
    };
  }
  return { mount, W, H };
})();
if (typeof window !== 'undefined') window.GrittyFleet = GrittyFleet;
