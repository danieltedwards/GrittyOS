/* GRITTY FLEET — fleet-art.js : the sprite and prop library, drawn in code with GrittyPixel.

   Direction: FAR: Lone Sails rust and weathering, rendered with the craft of the references Dan supplied
   (Owlboy, Barotrauma): hue-shifted ramps, light from the upper left, 1px outlines, dithered transitions, and props
   dense enough that every room reads as a working place. Every builder returns a canvas (or {canvas, lights}),
   so a hand-made sprite sheet can replace any one of them without touching the renderer. */
'use strict';
(function (root, factory) {
  const api = factory(root.GrittyPixel || (typeof require !== 'undefined' ? require('./fleet-pixel.js') : null));
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GrittyFleetArt = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (X) {
  'use strict';
  const { RAMP: R, Px, hash, rampAt, fbm } = X;
  const C = R.cloth;

  // department identity: coat cloth, accent cloth, sail stripe
  const DEPT = {
    operations: { coat: C.navy, accent: R.brass, stripe: '#b0914f' },
    etsy: { coat: C.rust, accent: C.bone, stripe: '#b85e3a' },
    services: { coat: C.moss, accent: C.bone, stripe: '#667a5f' },
    youtube: { coat: C.wine, accent: C.bone, stripe: '#9a4a40' },
    lab: { coat: C.slate, accent: C.bone, stripe: '#606c78' }
  };
  const deptOf = id => DEPT[id] || { coat: C.coal, accent: C.bone, stripe: '#8a877b' };
  const strHash = s => { let h = 7; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };

  // the tool each crew member holds, from the words in their role name
  function toolFor(name) {
    const n = String(name || '').toUpperCase();
    const pairs = [['DESIGN', 'brush'], ['COPY', 'quill'], ['WRITER', 'quill'], ['TREASUR', 'coin'], ['RESEARCH', 'book'], ['TELEMETRY', 'spyglass'],
      ['ARCHIV', 'scroll'], ['MANAGER', 'map'], ['LEAD', 'map'], ['CHIEF', 'map'], ['QA', 'lens'], ['RISK', 'lens'], ['PRODUCER', 'hammer'],
      ['CONTENT', 'scroll'], ['INTAKE', 'scroll'], ['DELIVERY', 'scroll'], ['PACKAGE', 'brush'], ['PERF', 'spyglass'], ['QUANT', 'book'], ['STRATEG', 'map']];
    for (const [k, t] of pairs) if (n.includes(k)) return t;
    return 'none';
  }

  /* ================= crew (16×28), facing right ================= */
  function person(agentId, name, deptId, o) {
    o = o || {};
    const h = strHash(agentId), d = deptOf(deptId), p = new Px(18, 30);
    const skin = R.skin[h % 3], coat = d.coat, pants = [C.coal, C.slate, C.bone, C.wine][(h >>> 3) % 4];
    const hats = ['tricorn', 'bandana', 'cap', 'bandana', 'hood', 'none'], hat = o.hat || hats[(h >>> 5) % hats.length];
    const hair = [C.coal, ['#1e1410', '#3b2416', '#5a3820', '#7a5030', '#98683e'], ['#2a2420', '#4a4038', '#6e6458', '#948a7c', '#b8ae9e'], ['#2e140d', '#5a2414', '#8a3a1c', '#b4562a', '#d07a40']][(h >>> 8) % 4];
    const beard = ((h >>> 11) % 3) === 0, pose = o.pose || 0, dim = !!o.dim;
    const lift = pose === 1 ? 1 : 0;            // breathing frame: upper body sinks one pixel
    const ox = 1, oy = 1;
    const S = (x, y, c) => p.set(ox + x, oy + y, c);
    const box = (x, y, w, hh, c) => { for (let j = 0; j < hh; j++) for (let i = 0; i < w; i++) S(x + i, y + j, typeof c === 'function' ? c(i, j) : c); };
    // legs + boots
    box(6, 20, 2, 5, pants[1]); box(8, 20, 2, 5, (i) => i ? pants[2] : pants[3]);
    box(5, 25, 3, 3, (i, j) => j ? R.wood[1] : R.wood[3]); box(8, 25, 3, 3, (i, j) => j ? R.wood[1] : R.wood[3]); S(10, 25, R.wood[4]);
    // back arm
    const U = lift;
    box(4, 13 + U, 1, 6, coat[1]); S(4, 19 + U, skin[1]);
    // torso + coat skirt
    box(5, 12 + U, 6, 7, (i) => i === 0 ? coat[3] : i === 5 ? coat[1] : coat[2]);
    box(4, 18 + U, 8, 3 - U, (i) => i < 2 ? coat[2] : i > 6 ? coat[0] : coat[1]);
    box(7, 12 + U, 2, 4, (i, j) => j === 0 ? C.bone[3] : (i ? C.bone[2] : C.bone[3])); // shirt
    box(5, 17 + U, 6, 1, R.wood[2]); S(8, 17 + U, R.brass[5]);                          // belt + buckle
    // head
    box(6, 5 + U, 6, 7, (i, j) => (i === 0 || j === 6) ? skin[1] : (i < 3 && j < 3) ? skin[3] : skin[2]);
    S(12, 8 + U, skin[2]); S(12, 9 + U, skin[1]);           // nose
    S(10, 7 + U, R.iron[0]); S(10, 6 + U, skin[1]);          // eye + brow
    S(7, 8 + U, skin[0]);                                     // ear
    box(6, 5 + U, 2, 4, hair[1]); S(8, 5 + U, hair[2]);       // hair at the back
    box(8, 11 + U, 2, 1, skin[1]);                            // neck
    if (beard) { box(8, 10 + U, 4, 2, (i) => i === 3 ? hair[1] : hair[2]); S(9, 12 + U, hair[1]); }
    // hat
    const hr = deptId === 'operations' ? C.coal : d.accent;
    if (hat === 'tricorn') { box(4, 4 + U, 10, 1, R.brass[3]); box(5, 3 + U, 8, 1, C.coal[1]); box(6, 1 + U, 6, 2, (i, j) => (i < 2 && !j) ? C.coal[3] : C.coal[2]); S(13, 3 + U, C.coal[1]); }
    if (hat === 'bandana') { box(6, 3 + U, 6, 3, (i, j) => j === 0 ? d.coat[3] : d.coat[2]); S(5, 5 + U, d.coat[2]); S(4, 6 + U, d.coat[1]); S(4, 7 + U, d.coat[2]); }
    if (hat === 'cap') { box(6, 3 + U, 6, 2, (i, j) => j ? hr[2] : hr[3]); box(11, 5 + U, 3, 1, hr[1]); }
    if (hat === 'hood') { box(5, 3 + U, 6, 9, (i, j) => (i === 0 ? coat[3] : coat[2])); box(9, 6 + U, 3, 5, (i, j) => j < 4 ? skin[2] : skin[1]); S(10, 7 + U, R.iron[0]); S(12, 8 + U, skin[2]); }
    // front arm: idle at the side, working reaches forward with the tool
    const tool = o.tool || toolFor(name);
    if (pose === 2) {
      box(10, 14 + U, 4, 2, (i, j) => j ? coat[1] : coat[3]); S(14, 14 + U, skin[2]); S(14, 15 + U, skin[1]);
      drawTool(S, tool, 15, 13 + U);
    } else {
      box(10, 13 + U, 2, 6, (i) => i ? coat[1] : coat[3]); S(10, 19 + U, skin[2]); S(11, 19 + U, skin[1]);
      drawTool(S, tool, 12, 17 + U);
    }
    p.outline();
    if (dim) desaturate(p, 0.55);
    return p.toCanvas();
  }
  function drawTool(S, tool, x, y) {
    switch (tool) {
      case 'brush': S(x, y - 3, R.wood[5]); S(x, y - 2, R.wood[4]); S(x, y - 1, R.iron[5]); S(x, y, '#b85e3a'); break;
      case 'quill': S(x, y - 3, C.bone[4]); S(x + 1, y - 4, C.bone[4]); S(x, y - 2, C.bone[3]); S(x, y - 1, R.iron[1]); break;
      case 'coin': S(x, y, R.brass[5]); S(x + 1, y, R.brass[4]); S(x, y + 1, R.brass[3]); break;
      case 'book': S(x, y - 1, C.wine[3]); S(x + 1, y - 1, C.wine[2]); S(x, y, C.wine[2]); S(x + 1, y, C.bone[4]); S(x, y + 1, C.wine[1]); break;
      case 'spyglass': S(x, y, R.brass[4]); S(x + 1, y - 1, R.brass[5]); S(x + 2, y - 2, R.brass[3]); break;
      case 'scroll': S(x, y, C.bone[4]); S(x + 1, y, C.bone[3]); S(x, y + 1, C.bone[2]); break;
      case 'map': S(x, y - 1, C.bone[4]); S(x + 1, y - 1, C.bone[3]); S(x, y, C.bone[3]); S(x + 1, y, '#a83324'); break;
      case 'lens': S(x, y - 1, R.brass[4]); S(x + 1, y - 2, R.brass[4]); S(x + 2, y - 1, R.brass[4]); S(x + 1, y, R.brass[4]); S(x + 1, y - 1, '#9fb7b0'); break;
      case 'hammer': S(x, y, R.wood[5]); S(x, y - 1, R.wood[4]); S(x - 1, y - 2, R.iron[4]); S(x, y - 2, R.iron[5]); S(x + 1, y - 2, R.iron[4]); break;
      default: break;
    }
  }
  function desaturate(p, k) {
    for (let i = 0; i < p.d.length; i += 4) { const g = p.d[i] * 0.3 + p.d[i + 1] * 0.55 + p.d[i + 2] * 0.15; p.d[i] = p.d[i] * (1 - k) + g * k * 0.8; p.d[i + 1] = p.d[i + 1] * (1 - k) + g * k * 0.82; p.d[i + 2] = p.d[i + 2] * (1 - k) + g * k * 0.9; }
  }

  /* ================= the Admiral (24×38): GRITTY, a step up in size and detail ================= */
  function admiral(o) {
    o = o || {};
    const p = new Px(26, 40), pose = o.pose || 0, U = pose === 1 ? 1 : 0, skin = R.skin[0], coat = C.navy, gold = R.brass;
    const S = (x, y, c) => p.set(x + 1, y + 1, c);
    const box = (x, y, w, hh, c) => { for (let j = 0; j < hh; j++) for (let i = 0; i < w; i++) S(x + i, y + j, typeof c === 'function' ? c(i, j) : c); };
    // boots
    box(7, 31, 4, 6, (i, j) => j === 0 ? R.wood[4] : i === 0 ? R.wood[3] : R.wood[2]); box(12, 31, 4, 6, (i, j) => j === 0 ? R.wood[4] : i === 0 ? R.wood[3] : R.wood[1]);
    box(6, 36, 5, 1, R.wood[1]); box(12, 36, 6, 1, R.wood[1]);
    // long coat
    box(6, 14 + U, 11, 12, (i) => i < 2 ? coat[3] : i > 8 ? coat[1] : coat[2]);
    box(5, 24 + U, 13, 7 - U, (i, j) => i < 2 ? coat[2] : i > 10 ? coat[0] : (j > 4 ? coat[1] : coat[2]));
    box(10, 14 + U, 3, 11, (i) => i === 1 ? coat[4] : coat[3]);                 // lapel facing
    for (let j = 0; j < 4; j++) { S(10, 16 + U + j * 3, gold[5]); S(13, 16 + U + j * 3, gold[4]); }  // two rows of buttons
    box(11, 13 + U, 2, 4, (i, j) => C.bone[4 - (j > 1 ? 1 : 0)]);               // cravat
    box(6, 23 + U, 11, 1, R.wood[1]); box(14, 22 + U, 2, 3, gold[4]); S(15, 25 + U, gold[3]); // sash + sword hilt
    box(16, 25 + U, 1, 6, R.iron[5]);                                              // scabbard tip
    // epaulettes with fringe
    box(4, 13 + U, 4, 2, gold[4]); box(4, 15 + U, 4, 1, (i) => i % 2 ? gold[3] : gold[2]); box(15, 13 + U, 4, 2, gold[5]); box(15, 15 + U, 4, 1, (i) => i % 2 ? gold[4] : gold[3]);
    // arms
    box(4, 16 + U, 2, 8, coat[1]); box(4, 24 + U, 2, 2, skin[1]);
    if (pose === 2) { box(17, 17 + U, 5, 2, (i, j) => j ? coat[1] : coat[3]); box(22, 17 + U, 2, 2, skin[2]); S(24, 15 + U, gold[5]); S(24, 16 + U, gold[4]); }
    else { box(17, 16 + U, 2, 8, (i) => i ? coat[1] : coat[3]); box(17, 24 + U, 2, 2, skin[2]); box(18, 26 + U, 1, 1, gold[4]); }
    // head, grey beard
    box(8, 4 + U, 8, 9, (i, j) => (i === 0 || j === 8) ? skin[1] : (i < 3 && j < 3) ? skin[3] : skin[2]);
    S(16, 7 + U, skin[2]); S(16, 8 + U, skin[1]); S(13, 6 + U, R.iron[0]); S(13, 5 + U, R.iron[2]); S(10, 7 + U, skin[0]);
    box(10, 9 + U, 7, 4, (i, j) => (j === 3 || i === 6) ? '#6e6458' : (i + j) % 3 ? '#948a7c' : '#b8ae9e');
    box(8, 4 + U, 2, 5, '#6e6458');
    // tricorn with brass trim and a plume
    box(4, 2 + U, 16, 2, (i, j) => j ? gold[3] : C.coal[1]);
    box(6, 0 + U, 12, 2, (i, j) => (i < 3 && !j) ? C.coal[3] : C.coal[2]);
    S(19, 1 + U, C.coal[1]); S(4, 1 + U, C.coal[1]);
    box(5, -2 + U + 1, 3, 2, (i, j) => j ? '#9a4a40' : '#b85e3a'); S(4, -1 + U + 1, '#7c3330');
    p.outline();
    return p.toCanvas();
  }

  /* ================= props (side view) ================= */
  function lantern(lit) {
    const p = new Px(9, 13);
    p.vline(4, 0, 2, R.iron[3]); p.rect(2, 3, 5, 1, R.iron[2]); p.rect(3, 2, 3, 1, R.iron[3]);
    for (let y = 4; y < 10; y++) for (let x = 2; x < 7; x++) p.set(x, y, (x === 2 || x === 6) ? R.iron[2] : lit ? R.lamp[x === 3 && y < 7 ? 5 : y < 7 ? 4 : 3] : R.iron[4 - (y > 6 ? 1 : 0)]);
    p.rect(2, 10, 5, 1, R.iron[2]); p.outline(); return p.toCanvas();
  }
  function crate(w, h, seed) {
    w = w || 16; h = h || 13; const p = new Px(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1, slat = y % 4 === 0;
      p.set(x, y, edge ? R.plank[1] : slat ? R.plank[2] : (x < 3 ? R.plank[4] : x > w - 4 ? R.plank[2] : R.plank[3 + (hash(x, y, seed || 1) > 0.85 ? 1 : 0)]));
    }
    p.line(1, 1, w - 2, h - 2, R.plank[2]); p.set(2, 2, R.iron[5]); p.set(w - 3, 2, R.iron[5]); p.set(2, h - 3, R.iron[5]); p.set(w - 3, h - 3, R.iron[5]);
    p.outline(); return p.toCanvas();
  }
  function barrel() {
    const p = new Px(12, 15);
    for (let y = 0; y < 15; y++) { const bulge = y > 2 && y < 12 ? 1 : 0; for (let x = 1 - bulge; x < 11 + bulge; x++) {
      const hoop = y === 2 || y === 12 || y === 7, l = 0.85 - x / 12;
      p.set(x, y, hoop ? (x < 4 ? R.iron[5] : R.iron[3]) : rampAt(R.wood.slice(2, 8), l, x, y));
    } }
    for (let x = 2; x < 10; x += 3) p.vline(x, 0, 14, R.wood[2]);
    p.outline(); return p.toCanvas();
  }
  function sack() {
    const p = new Px(12, 10); p.ellipse(6, 6, 5, 4, C.bone[2]); p.ellipse(5, 5, 3, 2, C.bone[3]); p.set(4, 4, C.bone[4]);
    p.rect(5, 0, 2, 3, C.bone[1]); p.set(5, 1, R.wood[3]); p.outline(); return p.toCanvas();
  }
  function chest(lit) {
    const p = new Px(18, 13);
    p.rect(1, 4, 16, 9, R.wood[4]); p.rect(1, 4, 16, 1, R.wood[6]); p.rect(1, 1, 16, 4, R.wood[5]); p.rect(2, 0, 14, 1, R.wood[6]);
    p.rect(1, 4, 16, 1, R.brass[3]); p.vline(4, 0, 12, R.brass[3]); p.vline(13, 0, 12, R.brass[3]); p.rect(8, 5, 2, 3, R.brass[5]); p.set(8, 6, R.iron[0]);
    p.rect(1, 12, 16, 1, R.wood[2]);
    if (lit) { p.rect(5, 0, 8, 1, R.brass[6]); p.set(7, -0, R.lamp[5]); }
    p.outline(); return p.toCanvas();
  }
  function coinPile() { const p = new Px(10, 5); for (let i = 0; i < 8; i++) p.set(1 + i, 4 - Math.abs(4 - i) * 0.6 | 0, R.brass[3 + (i % 3)]); p.rect(1, 4, 8, 1, R.brass[2]); p.outline(); return p.toCanvas(); }
  function chartTable() {
    const p = new Px(34, 16);
    p.rect(0, 4, 34, 3, R.wood[4]); p.rect(0, 4, 34, 1, R.wood[6]);
    for (let y = 0; y < 4; y++) for (let x = 3; x < 31; x++) p.set(x, y + 1, rampAt(R.canvas.slice(4), 0.6 + fbm(x / 6, y / 3, 3) * 0.3 - y * 0.05, x, y));
    p.line(6, 3, 14, 2, '#7a2019'); p.line(14, 2, 22, 3, '#7a2019'); p.set(22, 3, '#a83324'); p.set(10, 2, R.sea[5]); p.set(26, 2, R.sea[5]); p.set(27, 3, R.sea[4]);
    p.rect(2, 7, 2, 9, R.wood[3]); p.rect(30, 7, 2, 9, R.wood[2]); p.rect(2, 12, 30, 1, R.wood[2]);
    p.outline(); return p.toCanvas();
  }
  function wallMap() {
    const p = new Px(28, 18);
    p.rect(0, 0, 28, 18, R.wood[3]);
    for (let y = 2; y < 16; y++) for (let x = 2; x < 26; x++) { const land = fbm(x / 7, y / 5, 9) > 0.55; p.set(x, y, land ? rampAt(R.canvas.slice(3, 6), 0.5, x, y) : rampAt(R.canvas.slice(5), 0.6, x, y)); }
    p.line(5, 12, 20, 5, '#7a2019'); p.set(20, 5, '#d0503a'); p.rect(0, 0, 28, 1, R.wood[5]);
    p.outline(); return p.toCanvas();
  }
  function bookshelf(seed) {
    const p = new Px(20, 30), r = X.rng(seed || 5);
    p.rect(0, 0, 20, 30, R.wood[2]); p.rect(0, 0, 2, 30, R.wood[4]); p.rect(18, 0, 2, 30, R.wood[1]); p.rect(0, 0, 20, 2, R.wood[5]);
    for (let s = 0; s < 3; s++) {
      const base = 9 + s * 9; p.rect(1, base, 18, 1, R.wood[5]);
      let x = 2; while (x < 17) { const bw = 1 + (r() * 2 | 0), bh = 5 + (r() * 3 | 0), col = [C.wine, C.navy, C.moss, C.bone, C.rust][r() * 5 | 0];
        for (let i = 0; i < bw && x + i < 18; i++) p.vline(x + i, base - bh, base - 1, col[i ? 2 : 3]); p.set(x, base - bh, col[4]); x += bw + (r() < 0.2 ? 1 : 0); }
    }
    p.outline(); return p.toCanvas();
  }
  function globe() {
    const p = new Px(14, 20);
    for (let y = -5; y <= 5; y++) for (let x = -5; x <= 5; x++) if (x * x + y * y <= 27) {
      const land = fbm((x + 9) / 3, (y + 9) / 3, 4) > 0.55, l = 0.7 - (x + y) / 12;
      p.set(7 + x, 7 + y, land ? rampAt(R.leaf.slice(2, 7), l, x, y) : rampAt(R.sea.slice(3, 9), l, x, y));
    }
    for (let a = 0; a < 20; a++) { const t = a / 20 * Math.PI * 1.4 - 0.9; p.set(7 + Math.round(Math.cos(t) * 7), 7 + Math.round(Math.sin(t) * 7), R.brass[4]); }
    p.vline(7, 13, 17, R.wood[4]); p.rect(4, 18, 7, 2, R.wood[3]); p.outline(); return p.toCanvas();
  }
  function ledgerDesk(lit) {
    const p = new Px(30, 18);
    p.rect(0, 8, 30, 3, R.wood[4]); p.rect(0, 8, 30, 1, R.wood[6]); p.rect(1, 11, 3, 7, R.wood[3]); p.rect(26, 11, 3, 7, R.wood[2]); p.rect(19, 11, 7, 6, R.wood[3]); p.set(22, 14, R.brass[5]);
    p.rect(4, 5, 10, 3, C.bone[4]); p.vline(9, 5, 7, C.bone[2]); for (let i = 0; i < 4; i++) { p.hline(5, 8, 6 + (i % 2), C.bone[2]); }
    p.rect(17, 4, 2, 4, R.brass[4]); p.rect(20, 5, 2, 3, R.brass[3]); p.rect(16, 7, 6, 1, R.brass[5]);
    p.rect(25, 3, 2, 5, C.bone[4]); if (lit) { p.set(25, 1, R.fire[4]); p.set(25, 2, R.fire[5]); p.set(26, 2, R.fire[3]); }
    p.outline(); return p.toCanvas();
  }
  function radio(lit) {
    const p = new Px(22, 18);
    p.rect(0, 4, 22, 14, R.iron[3]); p.rect(0, 4, 22, 1, R.iron[5]); p.rect(0, 4, 1, 14, R.iron[4]); p.rect(21, 4, 1, 14, R.iron[1]);
    for (const [x, y] of [[4, 9], [10, 9]]) { p.disc(x, y, 2, R.brass[3]); p.set(x, y - 1, R.iron[0]); p.set(x - 1, y - 1, R.brass[5]); }
    p.rect(14, 7, 5, 4, lit ? R.lamp[3] : R.iron[2]); if (lit) { p.rect(15, 8, 3, 2, R.lamp[5]); }
    for (let x = 2; x < 20; x += 2) p.set(x, 14, R.iron[1]); for (let x = 2; x < 20; x += 2) p.set(x + 1, 15, R.iron[1]);
    p.line(18, 4, 21, 0, R.iron[5]); p.set(21, 0, R.danger[4]);
    p.outline(); return p.toCanvas();
  }
  function easel() {
    const p = new Px(20, 30);
    p.line(4, 29, 10, 0, R.wood[4]); p.line(16, 29, 10, 0, R.wood[3]); p.line(10, 4, 12, 29, R.wood[2]);
    for (let y = 4; y < 18; y++) for (let x = 3; x < 17; x++) p.set(x, y, C.bone[4]);
    p.rect(5, 6, 10, 5, '#b85e3a'); p.rect(5, 6, 10, 1, '#d0804a'); p.ellipse(9, 13, 3, 2, R.sea[6]); p.hline(5, 14, 16, C.bone[2]);
    p.rect(2, 18, 16, 1, R.wood[4]); p.outline(); return p.toCanvas();
  }
  function printLine(len, seed) {
    const p = new Px(len, 14), r = X.rng(seed || 3);
    for (let x = 0; x < len; x++) p.set(x, 1 + Math.round(Math.sin(x / len * Math.PI) * 2), C.bone[1]);
    for (let x = 4; x < len - 8; x += 10 + (r() * 3 | 0)) {
      const y = 2 + Math.round(Math.sin(x / len * Math.PI) * 2), col = [C.rust, C.moss, C.navy, C.wine, R.brass][r() * 5 | 0];
      p.rect(x, y, 7, 9, C.bone[4]); p.rect(x + 1, y + 1, 5, 4, col[3]); p.rect(x + 1, y + 1, 5, 1, col[4]); p.hline(x + 1, x + 5, y + 7, C.bone[2]);
      p.set(x + 1, y, R.wood[5]); p.set(x + 5, y, R.wood[5]);
    }
    return p.toCanvas();
  }
  function paintShelf() {
    const p = new Px(20, 22);
    p.rect(0, 0, 2, 22, R.wood[3]); p.rect(18, 0, 2, 22, R.wood[2]);
    for (let s = 0; s < 2; s++) { const base = 10 + s * 10; p.rect(0, base, 20, 2, R.wood[4]);
      for (let i = 0; i < 4; i++) { const col = [C.rust, C.moss, R.brass, C.navy, C.wine][(i + s * 2) % 5]; p.rect(3 + i * 4, base - 5, 3, 5, R.iron[4]); p.rect(3 + i * 4, base - 4, 3, 2, col[3]); p.set(3 + i * 4, base - 5, R.iron[6]); } }
    p.outline(); return p.toCanvas();
  }
  function workbench() {
    const p = new Px(34, 16);
    p.rect(0, 6, 34, 3, R.wood[4]); p.rect(0, 6, 34, 1, R.wood[6]); p.rect(2, 9, 2, 7, R.wood[3]); p.rect(30, 9, 2, 7, R.wood[2]); p.rect(2, 13, 30, 1, R.wood[2]);
    p.rect(4, 4, 12, 2, C.moss[3]); p.hline(5, 15, 4, C.moss[4]); p.rect(19, 2, 2, 4, R.iron[5]); p.rect(18, 1, 4, 1, R.iron[4]); p.rect(24, 4, 6, 2, C.bone[4]); p.set(25, 3, C.bone[3]);
    p.outline(); return p.toCanvas();
  }
  function camera() {
    const p = new Px(18, 26);
    p.line(8, 10, 2, 25, R.wood[3]); p.line(9, 10, 15, 25, R.wood[2]); p.vline(9, 10, 25, R.wood[4]);
    p.rect(3, 3, 12, 8, R.iron[2]); p.rect(3, 3, 12, 1, R.iron[4]); p.disc(15, 7, 2, R.iron[4]); p.set(15, 7, '#9fb7b0'); p.disc(6, 1, 2, R.iron[3]); p.disc(11, 1, 2, R.iron[3]);
    p.outline(); return p.toCanvas();
  }
  function stageLight(lit) {
    const p = new Px(12, 24); p.vline(6, 6, 23, R.iron[4]); p.rect(3, 23, 7, 1, R.iron[3]);
    p.rect(2, 0, 8, 6, R.iron[3]); p.rect(9, 1, 2, 4, lit ? R.lamp[5] : R.iron[5]); p.outline(); return p.toCanvas();
  }
  function instrumentRack(lit) {
    const p = new Px(18, 30);
    p.rect(0, 0, 18, 30, R.iron[2]); p.rect(0, 0, 18, 1, R.iron[4]); p.rect(0, 0, 1, 30, R.iron[3]);
    for (const [x, y] of [[5, 5], [12, 5]]) { p.disc(x, y, 3, C.bone[3]); p.line(x, y, x + 2, y - 2, R.iron[0]); }
    p.rect(3, 11, 12, 7, lit ? '#1c3a34' : R.iron[1]); if (lit) { for (let x = 3; x < 15; x++) p.set(x, 14 + Math.round(Math.sin(x * 0.9) * 2), '#7fc6a8'); }
    for (let y = 21; y < 28; y += 3) for (let x = 3; x < 15; x += 3) p.set(x, y, [R.danger[4], R.lamp[3], R.iron[5]][(x + y) % 3]);
    p.outline(); return p.toCanvas();
  }
  function chalkboard() {
    const p = new Px(28, 18); p.rect(0, 0, 28, 18, R.wood[3]); p.rect(2, 2, 24, 14, '#1f2a26');
    p.line(4, 13, 10, 9, '#c9c2ad'); p.line(10, 9, 15, 11, '#c9c2ad'); p.line(15, 11, 23, 4, '#c9c2ad'); p.hline(4, 23, 14, '#8a877b'); p.vline(4, 4, 14, '#8a877b');
    p.outline(); return p.toCanvas();
  }
  function boiler(lit) {
    const p = new Px(40, 46);
    for (let y = 6; y < 44; y++) for (let x = 4; x < 36; x++) { const l = 0.8 - (x - 4) / 34 * 0.7, rust = fbm(x / 4, y / 6, 2) > 0.6; p.set(x, y, rust ? rampAt(R.rust.slice(1, 6), l, x, y) : rampAt(R.iron.slice(1, 7), l, x, y)); }
    for (let x = 4; x < 36; x++) { p.set(x, 6, R.iron[5]); p.set(x, 43, R.iron[1]); }
    for (let y = 10; y < 42; y += 8) for (let x = 6; x < 35; x += 4) p.set(x, y, R.iron[6]);
    p.rect(12, 26, 16, 12, R.iron[0]); p.rect(13, 27, 14, 10, lit ? R.fire[2] : R.iron[1]);
    if (lit) { for (let x = 14; x < 26; x++) for (let y = 30; y < 37; y++) if (hash(x, y, 2) > 0.35) p.set(x, y, R.fire[3 + (y > 33 ? 0 : 1) + (hash(x, y, 9) > 0.8 ? 1 : 0)]); }
    for (let x = 13; x < 27; x += 3) p.vline(x, 27, 36, R.iron[2]);
    p.rect(16, 0, 6, 7, R.iron[3]); p.rect(16, 0, 6, 1, R.iron[5]); p.disc(31, 14, 3, C.bone[3]); p.line(31, 14, 33, 12, R.danger[3]); p.set(31, 14, R.iron[0]);
    p.rect(0, 20, 4, 3, R.brass[3]); p.rect(36, 30, 4, 3, R.brass[3]);
    p.outline(); return p.toCanvas();
  }
  function gear(r) { const p = new Px(r * 2 + 5, r * 2 + 5), c = r + 2; for (let a = 0; a < 12; a++) { const t = a / 12 * Math.PI * 2; p.disc(c + Math.round(Math.cos(t) * (r + 1)), c + Math.round(Math.sin(t) * (r + 1)), 1, R.iron[3]); } p.shadedDisc(c, c, r, R.iron.slice(2)); p.disc(c, c, 1, R.iron[0]); p.outline(); return p.toCanvas(); }
  function ladder(h) { const p = new Px(10, h); p.vline(1, 0, h - 1, R.wood[4]); p.vline(8, 0, h - 1, R.wood[2]); for (let y = 2; y < h; y += 5) p.hline(1, 8, y, R.wood[5]); return p.toCanvas(); }
  function wheel() { const p = new Px(16, 22); for (let a = 0; a < 8; a++) { const t = a / 8 * Math.PI * 2; p.line(8, 8, 8 + Math.round(Math.cos(t) * 8), 8 + Math.round(Math.sin(t) * 8), R.wood[5]); } for (let a = 0; a < 40; a++) { const t = a / 40 * Math.PI * 2; p.set(8 + Math.round(Math.cos(t) * 5), 8 + Math.round(Math.sin(t) * 5), R.wood[4]); } p.disc(8, 8, 1, R.brass[5]); p.rect(7, 13, 3, 9, R.wood[3]); p.outline(); return p.toCanvas(); }
  function cannon() { const p = new Px(20, 10); p.rect(2, 1, 16, 5, R.iron[3]); p.rect(2, 1, 16, 1, R.iron[5]); p.rect(16, 0, 3, 7, R.iron[2]); p.disc(6, 7, 2, R.wood[3]); p.disc(14, 7, 2, R.wood[3]); p.outline(); return p.toCanvas(); }
  function porthole(lit) { const p = new Px(12, 12); for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) { const d = (x - 5.5) ** 2 + (y - 5.5) ** 2; if (d < 36) p.set(x, y, d > 20 ? R.brass[d > 28 ? 2 : 4] : lit ? R.lamp[d < 6 ? 5 : 4] : R.sea[3]); } return p.toCanvas(); }

  /* ================= top-down: ships, enemies, trees, rocks ================= */
  function shipTop(deptId, o) {
    o = o || {};
    const flag = !!o.flagship, laid = !!o.laidUp, w = flag ? 156 : 120, h = flag ? 52 : 40, p = new Px(w, h), d = deptOf(deptId);
    const half = h / 2 - 2, mid = h / 2;
    const hw = x => { const t = x / (w - 1); return t > 0.66 ? half * Math.pow(Math.max(0, 1 - (t - 0.66) / 0.34), 0.72) : half * (0.8 + 0.2 * Math.sin(t / 0.66 * Math.PI / 2)); };
    for (let x = 1; x < w - 1; x++) { const r = hw(x); for (let y = 0; y < h; y++) {
      const dy = y + 0.5 - mid, ad = Math.abs(dy); if (ad > r) continue;
      let c;
      if (ad > r - 1.5) c = dy < 0 ? R.wood[3] : R.wood[1];                // rail, lit on the near side
      else if (ad > r - 3) c = dy < 0 ? R.wood[5] : R.wood[3];
      else { const plank = Math.floor((y + 1) / 3), seam = (x + plank * 7) % 23 === 0; c = seam ? R.plank[1] : (y % 3 === 0 ? R.plank[2] : R.plank[(plank % 2) ? 3 : 4]); if (hash(x, y, 77) > 0.96) c = R.rust[3]; }
      p.set(x, y, c);
    } }
    // stern cabin roof
    const cw = flag ? 20 : 14; for (let y = Math.round(mid - half * 0.7); y < Math.round(mid + half * 0.7); y++) for (let x = 3; x < 3 + cw; x++) p.set(x, y, x === 3 + cw - 1 ? R.wood[2] : y === Math.round(mid - half * 0.7) ? R.wood[6] : R.wood[5]);
    const lights = [[6, Math.round(mid)], [w - 10, Math.round(mid)]];
    // deck furniture: hatches, crates, cannons along the sides
    const hatch = (x) => { for (let y = mid - 3; y < mid + 3; y++) for (let i = 0; i < 6; i++) p.set(x + i, y, (i + y) % 2 ? R.wood[1] : R.wood[2]); };
    hatch(Math.round(w * 0.42)); if (flag) hatch(Math.round(w * 0.6));
    for (let x = cw + 8; x < w * 0.7; x += flag ? 9 : 11) { p.rect(x, Math.round(mid - hw(x) + 2), 3, 2, R.iron[2]); p.rect(x, Math.round(mid + hw(x) - 4), 3, 2, R.iron[1]); }
    p.rect(Math.round(w * 0.5), Math.round(mid + 3), 4, 4, R.plank[4]); p.set(Math.round(w * 0.5), Math.round(mid + 3), R.plank[5]);
    p.disc(Math.round(w * 0.47), Math.round(mid - 5), 2, R.wood[4]);
    // masts and sails: canvas bellied across the beam, furled to a roll when laid up
    const masts = flag ? [0.3, 0.5, 0.7] : [0.36, 0.62];
    for (const m of masts) {
      const x = Math.round(w * m), span = Math.round(hw(x) + (laid ? 1 : 5));
      if (laid) { for (let y = mid - span; y < mid + span; y++) { p.set(x, y, R.canvas[3]); p.set(x + 1, y, R.canvas[2]); } }
      else for (let y = Math.round(mid - span); y < Math.round(mid + span); y++) {
        const t = (y - (mid - span)) / (2 * span), belly = Math.round(Math.sin(t * Math.PI) * 4);
        for (let i = 0; i < 4 + belly; i++) p.set(x - 2 + i, y, i === 0 ? R.canvas[3] : i > 2 + belly ? R.canvas[3] : (y < mid ? R.canvas[6] : R.canvas[5]));
        if (Math.abs(y - mid) < 2) for (let i = 0; i < 3 + belly; i++) p.set(x - 1 + i, y, d.stripe);
      }
      p.disc(x, Math.round(mid), 1, R.wood[1]);
    }
    if (flag) { p.rect(w - 6, Math.round(mid) - 1, 4, 2, R.brass[5]); }
    p.outline();
    return { canvas: p.toCanvas(), lights, w, h };
  }
  function enemyTop() {
    const p = new Px(46, 18), mid = 9;
    for (let x = 1; x < 45; x++) { const t = x / 44, r = t > 0.7 ? 7 * (1 - (t - 0.7) / 0.3) : 7; for (let y = 0; y < 18; y++) if (Math.abs(y + 0.5 - mid) <= r) p.set(x, y, Math.abs(y + 0.5 - mid) > r - 1.5 ? '#2a2420' : (y % 3 ? '#1f1b18' : '#26211d')); }
    for (const x of [16, 30]) for (let y = 1; y < 17; y++) { p.set(x, y, '#0e0d0d'); p.set(x + 1, y, '#191716'); p.set(x + 2, y, '#232020'); }
    p.rect(2, 7, 3, 4, R.danger[3]); p.outline(); return p.toCanvas();
  }
  function tree(seed, r) {
    r = r || 7; const p = new Px(r * 2 + 6, r * 2 + 9), cx = r + 3, cy = r + 2, g = X.rng(seed);
    p.rect(cx - 1, cy + r - 2, 3, 6, R.wood[3]); p.set(cx - 1, cy + r - 2, R.wood[5]);
    const blobs = [[0, 0, r], [-r / 2, r / 3, r * 0.65], [r / 2, r / 4, r * 0.7], [0, -r / 2, r * 0.6]];
    for (const [bx, by, br] of blobs) for (let y = -br; y <= br; y++) for (let x = -br; x <= br; x++) {
      if (x * x + y * y > br * br + br * 0.5) continue;
      const l = 0.78 - (x + y) / (2.4 * br) - (by > 0 ? 0.15 : 0) + (g() - 0.5) * 0.12;
      p.set(cx + bx + x, cy + by + y, rampAt(R.leaf.slice(1), l, cx + x, cy + y));
    }
    if (seed % 3 === 0) for (let i = 0; i < 4; i++) p.set(cx - r / 2 + (g() * r | 0), cy - r / 2 + (g() * r | 0), R.danger[4]);
    p.outline(); return p.toCanvas();
  }
  function rock(seed) { const p = new Px(14, 10), g = X.rng(seed); for (let y = 0; y < 10; y++) for (let x = 0; x < 14; x++) { const dx = (x - 7) / 6.5, dy = (y - 6) / 4.5; if (dx * dx + dy * dy > 1 + (g() - 0.5) * 0.2) continue; p.set(x, y, rampAt(R.rock.slice(1), 0.8 - (x + y) / 22, x, y)); } p.outline(); return p.toCanvas(); }

  /* ================= clouds and far-off rock stacks (side view) ================= */
  function cloud(seed, w, hh, tone) {
    const p = new Px(w, hh), g = X.rng(seed), puffs = [];
    for (let i = 0; i < 11; i++) { const u = 0.08 + g() * 0.84; puffs.push([w * u, hh * (0.5 + g() * 0.18 - Math.sin(u * Math.PI) * 0.18), hh * (0.16 + g() * 0.2 + Math.sin(u * Math.PI) * 0.16)]); }
    const ramp = tone || ['#1f1b2a', '#2a2436', '#372e43', '#4a3c52', '#5f4c5f', '#7a6170'];
    for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
      let best = -1; for (const [px, py, pr] of puffs) { const dd = ((x - px) ** 2) / (pr * pr * 1.6) + ((y - py) ** 2) / (pr * pr); if (dd < 1) best = Math.max(best, 1 - dd); }
      if (best < 0 || y > hh * 0.74) continue;
      // lit from above by the moon: tops bright, undersides dark, a crisp flat base
      p.set(x, y, rampAt(ramp, Math.min(1, 0.15 + best * 0.35 + (1 - y / (hh * 0.74)) * 0.55 - (y > hh * 0.66 ? 0.2 : 0)), x, y));
    }
    return p.toCanvas();
  }

  return { DEPT, deptOf, toolFor, person, admiral, lantern, crate, barrel, sack, chest, coinPile, chartTable, wallMap, bookshelf, globe, ledgerDesk, radio,
    easel, printLine, paintShelf, workbench, camera, stageLight, instrumentRack, chalkboard, boiler, gear, ladder, wheel, cannon, porthole,
    shipTop, enemyTop, tree, rock, cloud };
});
