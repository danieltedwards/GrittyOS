/* GRITTY FLEET — fleet.js : the fleet and cutaway renderer, plus its click layer.

   Draws the overhead fleet (one ship per department) and, when a ship is clicked, a side-on cutaway of that ship.
   The art is a low-resolution canvas (480×270 logical pixels, scaled up crisply). Every clickable thing is a real
   <button> laid over the canvas, so it works with a keyboard and a screen reader, and every one of them resolves
   through GrittyFleetModel.targetFor → an EXISTING GRITTY OS entry point on the host window.

   Needs: fleet-model.js, fleet-art.js, fleet.css.
   Use:   const fleet = GrittyFleet.mount(el, { getInput, host: window, crewChoice: 'ask', onCall });
          fleet.refresh()  — call when runtime state changes (the PC app would call it from its U.bus listeners). */
'use strict';
const GrittyFleet = (() => {
  const W = 480, H = 270, HANDOFF_TTL = 60000, PUFF_GAP = 7000;
  const M = () => window.GrittyFleetModel, A = () => window.GrittyFleetArt;
  const FLEET_POS = { operations: [118, 138], etsy: [282, 78], lab: [410, 98], services: [262, 198], youtube: [408, 208] };
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
    const particles = [], pacer = M().createPacer(PUFF_GAP), sprites = new Map();
    const now = opts.now || (() => Date.now());

    root.classList.add('gf');
    root.innerHTML = `
      <div class="gf-bar">
        <button type="button" class="gf-back" hidden>‹ Fleet</button>
        <div class="gf-title"><h2>The Fleet</h2><span class="gf-sub"></span></div>
        <label class="gf-choice">Crew click opens
          <select>${['ask', ...CHOICES.map(c => c[0])].map(v => `<option value="${v}">${v === 'ask' ? 'Ask each time' : CHOICES.find(c => c[0] === v)[1]}</option>`).join('')}</select>
        </label>
      </div>
      <div class="gf-stage"><canvas width="${W}" height="${H}" aria-hidden="true"></canvas><div class="gf-hot"></div>
        <div class="gf-pop" role="dialog" aria-label="Open crew member" hidden></div></div>
      <div class="gf-list"></div>
      <p class="gf-status" role="status" aria-live="polite"></p>`;
    const $ = s => root.querySelector(s);
    const cv = $('canvas'), g = cv.getContext('2d'), hot = $('.gf-hot'), list = $('.gf-list'), pop = $('.gf-pop'), statusEl = $('.gf-status');
    const select = $('.gf-choice select');
    g.imageSmoothingEnabled = false;
    select.value = crewChoice;
    select.addEventListener('change', () => { crewChoice = select.value; say('Crew clicks now open: ' + select.selectedOptions[0].textContent + '.'); });
    $('.gf-back').addEventListener('click', showFleet);
    root.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      if (!pop.hidden) { closePop(); e.stopPropagation(); return; }
      if (view.kind === 'ship') { showFleet(); e.stopPropagation(); }
    });

    function say(text) { statusEl.textContent = text; }
    function sprite(key, make) { if (!sprites.has(key)) sprites.set(key, make()); return sprites.get(key); }

    /* ---------------- data ---------------- */
    function refresh() {
      input = (opts.getInput && opts.getInput()) || {};
      fleet = M().buildFleet(input);
      if (view.kind === 'ship' && !fleet.find(s => s.id === view.id)) view = { kind: 'fleet' };
      buildHotspots();
      if (reduced) draw();
    }
    const shipById = id => fleet.find(s => s.id === id);
    const posOf = (s, i) => FLEET_POS[s.id] || [90 + (i % 4) * 100, 60 + Math.floor(i / 4) * 90];

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
      view = { kind: 'fleet' }; closePop(); buildHotspots();
      if (lastShipButton) { const b = [...root.querySelectorAll(`[data-ship="${lastShipButton}"]`)].find(x => x.offsetParent); if (b) b.focus(); }
      if (reduced) draw();
    }
    function showShip(id) {
      if (!shipById(id)) return;
      view = { kind: 'ship', id }; lastShipButton = id; closePop(); buildHotspots();
      const first = [...root.querySelectorAll('.gf-hot button, .gf-list button')].find(x => x.offsetParent); if (first) first.focus({ preventScroll: true });
      if (reduced) draw();
    }

    /* ---------------- layout: one source for drawing AND for the buttons ---------------- */
    function fleetLayout() {
      return fleet.map((s, i) => {
        const [cx, cy] = posOf(s, i), w = s.flagship ? 78 : 58, h = s.flagship ? 28 : 22;
        return { ship: s, cx, cy, x: cx - w / 2, y: cy - h / 2, w, h };
      });
    }
    const HULL_L = y => 60 + Math.max(0, y - 170) * 1.1;
    const HULL_R = y => 436 - Math.max(0, y - 72) * 0.55;
    function cutawayLayout(ship) {
      const conv = (input.conveyors && input.conveyors[ship.id]) || [];
      const deptMeta = (input.departments || []).find(d => d.id === ship.id) || {};
      const rooms = ship.rooms.length ? ship.rooms : ['deck'];
      const top = 78, bottom = 186, dh = Math.floor((bottom - top) / rooms.length);
      const decks = rooms.map((roomId, i) => ({ roomId, name: (deptMeta.deckNames && deptMeta.deckNames[i]) || 'Deck', y0: top + i * dh, y1: top + (i + 1) * dh - 1 }));
      const leader = ship.crew.find(c => c.rank === 'admiral') || ship.crew.find(c => c.id === ship.captainId) || null;
      const rest = ship.crew.filter(c => c !== leader).sort((a, b) => {
        const ia = conv.indexOf(a.id), ib = conv.indexOf(b.id);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
      });
      const per = Math.ceil(rest.length / decks.length) || 1, place = [];
      decks.forEach((d, di) => {
        const here = rest.slice(di * per, di * per + per), x0 = 104, x1 = Math.min(392, HULL_R(d.y1) - 22), step = (x1 - x0) / Math.max(1, here.length);
        here.forEach((c, i) => place.push({ crew: c, deck: di, x: Math.round(x0 + step * (i + 0.5) - 14), y: d.y1 - 24, w: 16, h: 24 }));
      });
      if (leader) {
        const big = leader.rank === 'admiral';
        place.push({ crew: leader, deck: -1, x: big ? 84 : 88, y: 43 - (big ? 36 : 24), w: big ? 24 : 16, h: big ? 36 : 24, leader: true });
      }
      const items = [
        { kind: 'ship', x: 58, y: 46, w: 80, h: 26, label: ship.name + ' captain\'s cabin', plate: 'Captain\'s cabin', sub: 'Ship overview' },
        { kind: 'hold', x: 84, y: 190, w: 300, h: 34, label: ship.name + ' cargo hold', plate: 'Cargo hold', sub: 'Output vault' }
      ];
      const convPlace = conv.map(id => place.find(p => p.crew.id === id)).filter(Boolean);
      if (convPlace.length > 1) {
        const fy = decks[convPlace[0].deck].y1, xa = convPlace[0].x, xb = convPlace[convPlace.length - 1].x + 16;
        items.push({ kind: 'conveyor', x: xa - 2, y: fy - 4, w: xb - xa + 4, h: 7, label: ship.name + ' conveyor', plate: 'Conveyor', sub: 'Workflow map', belt: { y: fy, xa, xb, order: convPlace } });
      } else {
        items.push({ kind: 'conveyor', x: 74, y: decks[0].y0 + 4, w: 12, h: 8, label: ship.name + ' route board', plate: 'Route board', sub: 'Workflow map', board: true });
      }
      if (ship.sea.level !== 'calm') items.push({ kind: 'alert', x: 312, y: 2, w: 18, h: 12, label: ship.name + ' signal flag', plate: 'Signal flag', sub: seaWords(ship), ref: ship.sea.reasons[0] && ship.sea.reasons[0].ref });
      return { decks, place, items, conv };
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
              style="left:${pct(L.x - 4, W)};top:${pct(L.y - 6, H)};width:${pct(L.w + 8, W)};height:${pct(L.h + 12, H)}"
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
      let html = L.decks.map(d => `<span class="gf-deck" style="left:${pct(74, W)};top:${pct(d.y1 - 9, H)}">${esc(d.name)} · ${esc(d.roomId)}</span>`).join('');
      html += L.items.map((it, i) => `<button type="button" class="gf-spot gf-prop k-${it.kind}" data-item="${i}"
          style="left:${pct(it.x, W)};top:${pct(it.y, H)};width:${pct(it.w, W)};height:${pct(Math.max(it.h, 8), H)}"
          aria-label="${esc(it.label)}: ${esc(it.sub)}"><span class="gf-plate small"><b>${esc(it.plate)}</b><span>${esc(it.sub)}</span></span></button>`).join('');
      html += L.place.map((p, i) => `<button type="button" class="gf-spot gf-crew st-${p.crew.status}${p.leader ? ' leader' : ''}" data-crew="${i}"
          style="left:${pct(p.x - 2, W)};top:${pct(p.y - 15, H)};width:${pct(p.w + 4, W)};height:${pct(p.h + 11, H)}"
          aria-label="${esc(p.crew.name)}${p.crew.rank !== 'crew' ? ', ' + p.crew.rank : ''}. ${esc(STATUS_TEXT[p.crew.status])}.">
          <span class="gf-name">${p.crew.rank === 'admiral' ? 'Admiral ' : p.crew.rank === 'captain' ? 'Capt. ' : ''}${esc(p.crew.name)}</span></button>`).join('');
      hot.innerHTML = html;
      // Narrow screens: the same targets as a plain list, because sprites are too small to tap there.
      list.innerHTML = L.place.map((p, i) => `<button type="button" class="st-${p.crew.status}" data-crew="${i}"><b>${p.crew.rank === 'admiral' ? 'Admiral ' : p.crew.rank === 'captain' ? 'Capt. ' : ''}${esc(p.crew.name)}</b><span>${esc(STATUS_TEXT[p.crew.status])}</span></button>`).join('')
        + L.items.map((it, i) => `<button type="button" data-item="${i}"><b>${esc(it.plate)}</b><span>${esc(it.sub)}</span></button>`).join('');
      root.querySelectorAll('[data-item]').forEach(b => b.addEventListener('click', () => {
        const it = L.items[+b.dataset.item]; activate({ kind: it.kind, deptId: ship.id, ref: it.ref }, it.plate + ' (' + it.sub + ')', b);
      }));
      root.querySelectorAll('[data-crew]').forEach(b => b.addEventListener('click', () => {
        const p = L.place[+b.dataset.crew]; activate({ kind: 'crew', agentId: p.crew.id, deptId: ship.id }, p.crew.name, b);
      }));
    }

    /* ---------------- drawing ---------------- */
    const px = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); };
    function seaGlints(t, y0, rows) {
      const P = A().P;
      for (let i = 0; i < rows; i++) {
        const layer = i % 2, sp = layer ? 9 : 4, y = y0 + Math.floor(A().hash(i, 7) * (H - y0 - 2));
        const x = ((A().hash(i, 3) * W + t / 1000 * sp) % (W + 12)) - 6;
        const tw = Math.sin(t / 900 + i * 1.7);
        if (tw < -0.2) continue;
        px(x, y, layer ? 5 : 3, 1, tw > 0.6 ? P.foam : P.seaLight);
      }
    }
    function fog(cx, cy, rx, ry, t) {
      const P = A().P, shift = Math.floor(t / 400) % 2;
      g.globalAlpha = 0.5;
      for (let y = -ry; y <= ry; y += 2) for (let x = -rx; x <= rx; x += 2) {
        if ((x * x) / (rx * rx) + (y * y) / (ry * ry) > 1) continue;
        if (((x + y) / 2 + shift) % 2 === 0 && A().hash(x + 99, y + 7) > 0.25) px(cx + x, cy + y, 2, 2, P.fog);
      }
      g.globalAlpha = 1;
    }
    function puff(x, y, t) { particles.push({ x, y, born: t, dur: 1300, flash: true }); }
    function drawParticles(t) {
      const P = A().P;
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i], a = (t - p.born) / p.dur;
        if (a >= 1) { particles.splice(i, 1); continue; }
        if (p.flash && a < 0.1) px(p.x - 1, p.y - 1, 3, 3, P.lantern);
        const r = 1 + Math.round(a * 5);
        g.globalAlpha = 1 - a;
        for (let yy = -r; yy <= r; yy++) { const ww = Math.round(Math.sqrt(r * r - yy * yy)); px(p.x - ww, p.y + yy - a * 6, ww * 2 + 1, 1, yy < 0 ? P.smoke : '#a9a497'); }
        g.globalAlpha = 1;
      }
    }
    function pennant(x, y, level) {
      const P = A().P, col = level === 'trouble' ? P.danger : level === 'attention' ? P.amber : P.fog;
      const ch = level === 'trouble' ? 'x' : level === 'attention' ? '!' : '?';
      px(x, y, 1, 11, P.ink);
      px(x + 1, y, 7, 7, col);
      g.drawImage(sprite('g' + ch, () => A().glyph(ch, P.ink)), x + 3, y + 1);
    }
    function rope(a, b, age, t) {
      const P = A().P, fade = Math.max(0.25, 1 - age / HANDOFF_TTL);
      const dx = b[0] - a[0], dy = b[1] - a[1], n = Math.max(Math.abs(dx), Math.abs(dy));
      g.globalAlpha = fade;
      for (let i = 0; i <= n; i += 2) {
        const sag = Math.sin(i / n * Math.PI) * 8;
        px(a[0] + dx * i / n, a[1] + dy * i / n + sag, 1, 1, P.brassLight);
      }
      const k = reduced ? 0.5 : ((t % 3000) / 3000), sag = Math.sin(k * Math.PI) * 8;
      px(a[0] + dx * k - 1, a[1] + dy * k + sag - 1, 3, 3, P.lantern);
      g.globalAlpha = 1;
    }

    function drawFleet(t) {
      const P = A().P, mt = reduced ? 0 : t;
      px(0, 0, W, H, P.seaDeep);
      for (let y = 0; y < H; y += 6) if (A().hash(y, 1) > 0.5) px(0, y, W, 1, P.seaMid);
      seaGlints(mt, 0, 170);
      const lay = fleetLayout(), at = Object.fromEntries(lay.map(L => [L.ship.id, [L.cx, L.cy]]));
      for (const h of M().activeHandoffs(input.evidence, now(), HANDOFF_TTL)) if (at[h.from] && at[h.to]) rope(at[h.from], at[h.to], h.age, mt);
      lay.forEach((L, i) => {
        const s = L.ship, bob = reduced ? 0 : Math.round(Math.sin(mt / (s.laidUp ? 1400 : 900) + i * 1.3) * 1.2);
        // foam ring and anchor chain
        g.globalAlpha = 0.5; px(L.x - 2, L.cy + L.h / 2 + bob, L.w + 2, 1, P.foam); g.globalAlpha = 1;
        if (s.laidUp) { px(L.x + L.w - 4, L.cy + bob, 1, 1, P.iron); for (let k = 0; k < 6; k++) px(L.x + L.w - 2 + k, L.cy + 2 + k + bob, 1, 1, P.ironLight); }
        g.drawImage(sprite('top-' + s.id + s.laidUp + s.flagship, () => A().shipTop(s.id, { flagship: s.flagship, laidUp: s.laidUp })), Math.round(L.x), Math.round(L.y + bob));
        // trouble: enemy sloops circling at a distance; more blocking issues, more attackers
        for (let k = 0; k < s.sea.attackers; k++) {
          const ang = mt / 2600 + k * (Math.PI * 2 / s.sea.attackers), ex = L.cx + Math.cos(ang) * (L.w * 0.75 + 8), ey = L.cy + Math.sin(ang) * 26;
          const spr = sprite('enemy', () => A().enemySloop());
          g.save(); if (-Math.sin(ang) < 0) { g.translate(Math.round(ex) * 2, 0); g.scale(-1, 1); }
          g.drawImage(spr, Math.round(ex - 9), Math.round(ey - 3)); g.restore();
          if (!reduced && pacer.allow(s.id + ':atk' + k, t)) puff(Math.round(ex), Math.round(ey - 4), t);
        }
        if (s.sea.level === 'attention' && !reduced && pacer.allow(s.id + ':gun', t)) puff(Math.round(L.x + L.w * 0.4), Math.round(L.y + bob - 2), t);
        if (s.sea.level === 'unknown') fog(L.cx, L.cy, L.w * 0.75, 20, mt);
        if (s.sea.level !== 'calm') pennant(Math.round(L.x + 4), Math.round(L.y - 16 + bob), s.sea.level);
      });
      drawParticles(t);
    }

    function drawCutaway(ship, t) {
      const P = A().P, mt = reduced ? 0 : t, L = cutawayLayout(ship), lit = !ship.laidUp;
      // sky in muted bands, a low horizon, then the sea
      const bands = [P.skyTop, P.skyMid, P.skyLow];
      for (let y = 0; y < 200; y++) { const b = Math.min(2, Math.floor(y / 67)), next = Math.min(2, b + 1), edge = y % 67 > 60 && ((y + Math.floor(y / 2)) % 2); px(0, y, W, 1, edge ? bands[next] : bands[b]); }
      if (ship.sea.attackers) { // enemy on the horizon, firing now and then
        const ex = 452 - (reduced ? 0 : Math.round(Math.sin(mt / 3000) * 6));
        g.drawImage(sprite('enemy', () => A().enemySloop()), ex - 9, 192);
        if (!reduced && pacer.allow(ship.id + ':hz', t)) puff(ex - 8, 192, t);
      }
      // hull: scanlines between the stern and the raked bow
      for (let y = 72; y <= 234; y++) {
        const xl = Math.round(HULL_L(y)), xr = Math.round(HULL_R(y));
        px(xl, y, xr - xl, 1, y % 6 === 0 ? P.hullDark : P.hull);
      }
      px(56, 44, 84, 28, P.hull); for (let y = 44; y < 72; y += 6) px(56, y, 84, 1, P.hullDark);
      px(380, 64, 56, 8, P.hull);
      for (let i = 0; i < 90; i++) { const x = 60 + Math.floor(A().hash(i, 5) * 370), y = 74 + Math.floor(A().hash(i, 9) * 150); if (x > HULL_L(y) && x < HULL_R(y)) px(x, y, 2, 1, P.rust); }
      // cut-away interior
      for (let y = 76; y <= 226; y++) { const xl = Math.round(HULL_L(y)) + 8, xr = Math.round(HULL_R(y)) - 8; if (xr > xl) px(xl, y, xr - xl, 1, y >= 188 ? P.hullDark : ((y >> 2) % 2 ? P.wall : P.wallLight)); }
      for (let x = 80; x < 400; x += 24) for (let y = 76; y < 186; y++) if (x < HULL_R(y) - 8) px(x, y, 1, 1, P.hullDark);
      L.decks.forEach((d, di) => {
        px(68, d.y1, Math.round(HULL_R(d.y1)) - 76, 2, P.deck);
        px(68, d.y1 + 2, Math.round(HULL_R(d.y1)) - 76, 1, P.hullDark);
        const lx = 300 - di * 70; px(lx, d.y0 + 3, 2, 3, lit ? P.lantern : P.ironLight);
      });
      px(68, 186, Math.round(HULL_R(186)) - 76, 2, P.deck);
      // cabin window and chart table, weather deck, quarterdeck rail, bowsprit
      px(64, 52, 10, 8, lit ? P.lantern : P.iron); px(66, 54, 6, 4, lit ? '#f0cf8a' : P.ironLight);
      px(112, 62, 18, 3, P.deckLight); px(116, 65, 2, 6, P.hullDark); px(126, 65, 2, 6, P.hullDark);
      px(140, 71, 296, 2, P.deck); px(56, 43, 84, 2, P.deck);
      for (let x = 58; x < 140; x += 6) px(x, 38, 1, 5, P.hullDark); px(56, 38, 84, 1, P.hullDark);
      for (let i = 0; i < 40; i++) px(436 + i, 66 - Math.round(i * 0.35), 1, 2, P.hullDark);
      // masts and sails (furled when the ship is laid up)
      for (const mx of [206, 320]) {
        px(mx, 8, 3, 64, P.hullDark);
        if (ship.laidUp) { px(mx - 22, 18, 47, 3, P.sailShade); px(mx - 18, 44, 39, 3, P.sailShade); }
        else for (const [yy, hh, ww] of [[14, 26, 50], [42, 24, 42]]) {
          for (let y = 0; y < hh; y++) { const bulge = Math.round(Math.sin(y / hh * Math.PI) * 3); px(mx - ww / 2 + 1 - bulge, yy + y, ww + bulge, 1, y % 5 === 4 ? P.sailShade : P.sail); }
          px(mx - ww / 2 + 6, yy + 8, 7, 5, P.sailPatch); px(mx - ww / 2, yy + hh / 2, ww, 2, A().accentOf(ship.id));
        }
      }
      // cargo hold: crates and barrels stand for the output vault
      for (let i = 0; i < 9; i++) g.drawImage(sprite(i % 3 ? 'crate' : 'barrel', () => i % 3 ? A().crate() : A().barrel()), 96 + i * 30 + (i % 2) * 4, i % 3 ? 211 : 210);
      // conveyor or route board
      for (const it of L.items) {
        if (it.board) g.drawImage(sprite('board', () => A().chartBoard()), it.x, it.y);
        if (it.belt) {
          const { y, xa, xb } = it.belt, off = reduced ? 0 : Math.floor(mt / 250) % 4;
          px(xa, y - 4, xb - xa, 4, P.iron); px(xa, y - 4, xb - xa, 1, P.ironLight);
          for (let x = xa + off; x < xb; x += 4) px(x, y - 2, 2, 1, P.ironLight);
          it.belt.order.forEach((p, k) => { if (k) { const ax = p.x - 9; px(ax, y - 8, 5, 1, P.brassLight); px(ax + 3, y - 9, 1, 3, P.brassLight); px(ax + 4, y - 8, 1, 1, P.brassLight); } });
        }
      }
      // crew at their stations
      L.place.forEach((p, i) => {
        const dim = p.crew.status === 'offline' || ship.laidUp;
        if (!p.leader) g.drawImage(sprite('desk' + lit, () => A().desk(lit)), p.x + 17, p.y + 12, 20, 12);
        const working = p.crew.status === 'running', frame = working && !reduced ? Math.floor(mt / 400 + i) % 2 : 0;
        const spr = p.crew.rank === 'admiral' ? sprite('adm' + dim, () => A().admiralSprite({ dim }))
          : sprite('crew' + ship.id + dim + frame, () => A().crewSprite(ship.id, { dim, frame }));
        g.drawImage(spr, p.x, p.y, p.w, p.h);
        const ch = STATUS_GLYPH[p.crew.status];
        if (ch) {
          const col = { '!': P.amber, x: P.danger, '*': P.brassLight, '=': P.sail, '-': P.grey, '?': P.fog }[ch];
          px(p.x + p.w / 2 - 5, p.y - 15, 11, 13, P.ink); g.drawImage(sprite('g' + ch + col, () => A().glyph(ch, col)), p.x + p.w / 2 - 3, p.y - 13, 6, 10);
        }
      });
      // waterline: the sea in front of the lower hull
      px(0, 200, W, H - 200, P.seaMid); g.globalAlpha = 0.55;
      for (let y = 200; y <= 234; y++) { const xl = Math.round(HULL_L(y)), xr = Math.round(HULL_R(y)); px(xl, y, xr - xl, 1, P.seaMid); }
      g.globalAlpha = 1; seaGlints(mt, 202, 60); px(0, 200, W, 1, P.foam);
      if (ship.sea.level !== 'calm') pennant(318, 2, ship.sea.level);
      if (ship.sea.level === 'unknown') fog(270 + (reduced ? 0 : Math.round(Math.sin(mt / 2000) * 30)), 40, 170, 30, mt);
      drawParticles(t);
    }

    function draw() {
      if (destroyed) return;
      const t = now();
      if (view.kind === 'fleet') drawFleet(t); else drawCutaway(shipById(view.id), t);
    }
    let last = 0;
    function loop(ts) {
      if (destroyed) return;
      if (ts - last > 33) { last = ts; draw(); }
      raf = requestAnimationFrame(loop);
    }

    refresh();
    if (reduced) draw(); else raf = requestAnimationFrame(loop);
    const poll = opts.pollMs ? setInterval(() => { if (!destroyed) refresh(); }, opts.pollMs) : 0;
    say('Select a ship to see its cutaway. Clicks inside a ship open the matching GRITTY OS view.');

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
