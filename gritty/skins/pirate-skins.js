/* GRITTY skins — pirate-skins.js : original pirate characters in StarNet's own skin format.

   StarNet draws every crew member from a "skin": a folder of 144×144 PNG frames (a 76px-tall figure, feet on row
   111) listed in assets/sprites/manifest.json and named in DATA.SKINS (frontend/app/data-shim.js). This module
   draws those frames in code for a pack of pirate characters, so they drop into StarNet's existing character picker
   and renderer unchanged: the station floor, crew cards, chat portraits and remote view all pick them up.

   Frames per skin (the same set StarNet's approved skins ship):
     rot_<dir>            8 standing directions
     walk_<dir>_1..6      a 6-step walk in each of the 8 directions
     sit_<dir>_4          seated, 4 directions
     type_north_1..4      seated at a console, seen from behind
   Directions: south, south-east, east, north-east, north, north-west, west, south-west.

   The figure is a small puppet (hips, knees, feet, shoulders, elbows, hands, head) posed per direction and frame,
   then painted with rounded, lit shapes, hue-shifted ramps and a dark outline, like the hand-made StarNet sets. */
'use strict';
(function (root, factory) {
  const api = factory(root.GrittyPixel || (typeof require !== 'undefined' ? require('../fleet/fleet-pixel.js') : null));
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GrittyPirateSkins = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (X) {
  'use strict';
  const { RAMP: R, Px } = X;
  const rampAt = (ramp, l) => ramp[Math.max(0, Math.min(ramp.length - 1, Math.round(l * (ramp.length - 1))))];
  const C = R.cloth;
  const SIZE = 144, CX = 72, GROUND = 111;
  const DIRS = ['south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west'];
  const YAW = { south: 0, 'south-east': 45, east: 90, 'north-east': 135, north: 180 };   // west side = mirror
  const OUT = '#120c0a';

  /* ---------- the pack ---------- */
  const HAIR = { grey: ['#3a3633', '#5a554f', '#7c766d', '#a29b90', '#c8c1b4'], black: ['#0e0c0b', '#1b1715', '#2b2522', '#3d3530', '#524840'],
    brown: ['#1e1410', '#33211a', '#4d3324', '#6a4830', '#86603f'], auburn: ['#2a110c', '#4a1d12', '#702d19', '#954222', '#b55c33'], none: null };
  const CHARACTERS = [
    { id: 'gritty_admiral', name: 'GRITTY · Admiral', role: 'GRITTY, the Admiral', skin: 0, hair: 'grey', beard: 'full', coat: C.navy, coatLen: 'long', trim: R.brass, shirt: C.bone,
      vest: C.wine, pants: C.bone, boots: C.coal, hat: 'tricorn', hatCol: C.coal, plume: '#a83324', epaulettes: true, sword: true, sash: null, build: 1.05 },
    { id: 'gritty_captain', name: 'Pirate Captain', role: 'department captains', skin: 1, hair: 'black', beard: 'goatee', coat: C.wine, coatLen: 'long', trim: R.brass, shirt: C.bone,
      vest: C.coal, pants: C.coal, boots: C.coal, hat: 'tricorn', hatCol: C.coal, sash: C.rust, sword: true, earring: true },
    { id: 'gritty_quartermaster', name: 'Quartermaster', role: 'treasurers and managers', skin: 2, hair: 'brown', beard: 'stubble', coat: null, vest: ['#24160f', '#3a2418', '#553522', '#714830', '#8c5c3c'],
      shirt: C.bone, pants: C.slate, boots: C.coal, hat: 'bandana', hatCol: C.rust, eyepatch: true, earring: true, belt: true },
    { id: 'gritty_deckhand', name: 'Deckhand', role: 'producers and builders', skin: 0, hair: 'brown', beard: null, coat: null, stripes: [C.bone[3], C.navy[2]], shirt: C.bone, rolled: true,
      pants: C.navy, boots: C.coal, hat: 'bandana', hatCol: C.navy, belt: true },
    { id: 'gritty_navigator', name: 'Navigator', role: 'researchers and analysts', skin: 2, hair: 'auburn', beard: null, ponytail: true, coat: C.moss, coatLen: 'mid', trim: R.brass,
      shirt: C.bone, vest: C.bone, pants: C.coal, boots: C.coal, hat: 'none', spectacles: true },
    { id: 'gritty_gunner', name: 'Gunner', role: 'QA and risk', skin: 1, hair: 'none', beard: 'big', coat: null, vest: C.rust, sleeveless: true, shirt: null, pants: C.coal,
      boots: C.coal, hat: 'none', bandolier: true, build: 1.15 },
    { id: 'gritty_corsair', name: 'Corsair', role: 'writers and designers', skin: 2, hair: 'auburn', longHair: true, beard: null, coat: C.slate, coatLen: 'long', trim: R.brass,
      shirt: C.bone, vest: C.wine, pants: C.coal, boots: C.wine, hat: 'tricorn', hatCol: C.wine, earring: true, sash: C.moss, build: 0.94 }
  ];

  /* ---------- painting primitives ---------- */
  // a rounded limb from a to b (radius r0 → r1), lit from the upper left
  function capsule(p, ax, ay, bx, by, r0, r1, ramp, opt) {
    opt = opt || {};
    const minX = Math.floor(Math.min(ax, bx) - Math.max(r0, r1) - 1), maxX = Math.ceil(Math.max(ax, bx) + Math.max(r0, r1) + 1);
    const minY = Math.floor(Math.min(ay, by) - Math.max(r0, r1) - 1), maxY = Math.ceil(Math.max(ay, by) + Math.max(r0, r1) + 1);
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      const t = Math.max(0, Math.min(1, ((x + 0.5 - ax) * dx + (y + 0.5 - ay) * dy) / L2));
      const qx = ax + dx * t, qy = ay + dy * t, r = r0 + (r1 - r0) * t;
      const ex = x + 0.5 - qx, ey = y + 0.5 - qy, d = Math.sqrt(ex * ex + ey * ey);
      if (d > r) continue;
      const nx = ex / r, ny = ey / r, l = 0.66 - nx * 0.34 - ny * 0.16 + (opt.lift || 0) - (opt.dark || 0);
      p.set(x, y, opt.color ? opt.color(x, y, l, t) : rampAt(ramp, l, x, y));
    }
  }
  function blob(p, cx, cy, rx, ry, ramp, opt) {
    opt = opt || {};
    for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
      const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry, d = nx * nx + ny * ny;
      if (d > 1) continue;
      const l = 0.7 - nx * 0.3 - ny * 0.22 - d * 0.12 + (opt.lift || 0) - (opt.dark || 0);
      p.set(x, y, opt.color ? opt.color(x, y, l) : rampAt(ramp, l, x, y));
    }
  }
  // a quad (torso, coat panel): shaded across its width, darker toward the bottom
  function quad(p, pts, ramp, opt) {
    opt = opt || {};
    const xs = pts.map(q => q[0]), cxm = (Math.min(...xs) + Math.max(...xs)) / 2, hw = (Math.max(...xs) - Math.min(...xs)) / 2 || 1;
    const ys = pts.map(q => q[1]), y0 = Math.min(...ys), hh = Math.max(...ys) - y0 || 1;
    p.poly(pts, (x, y) => { const u = (x + 0.5 - cxm) / hw, v = (y - y0) / hh; const l = 0.64 - u * 0.3 - v * 0.14 + (opt.lift || 0) - (opt.dark || 0) - Math.max(0, Math.abs(u) - 0.8) * 0.5; return opt.color ? opt.color(x, y, l) : rampAt(ramp, l, x, y); });
  }
  const darker = (ramp, k) => ramp.map((_, i) => ramp[Math.max(0, i - (k || 1))]);

  /* ---------- the puppet: joint positions for a direction and pose ---------- */
  function pose(yawDeg, opt) {
    const th = yawDeg * Math.PI / 180, f = Math.cos(th), s = Math.sin(th), b = opt.build || 1;
    const sitting = !!opt.sit, phase = opt.phase;                      // phase undefined = standing
    const bob = phase == null ? 0 : -Math.round(Math.abs(Math.sin(phase)) * 1.4);
    const drop = sitting ? 15 : 0;
    const hipY = 80 + drop + bob, shY = 57 + drop + bob, headY = 45.5 + drop + bob;
    const lat = (k) => k * Math.abs(f) + k * 0.35 * Math.abs(s);         // lateral spread seen from this angle
    // each side: +1 is the character's right. Its screen x moves with the facing; depth decides draw order.
    const side = sgn => {
      const sx = -sgn * f, depth = sgn * s;                              // depth > 0: nearer the viewer
      const hip = [CX + sx * lat(4.6) * b, hipY], sh = [CX + sx * lat(11.6) * b, shY];
      let foot, knee, elbow, hand;
      if (sitting) {
        const fwd = 10, kx = hip[0] + s * fwd, ky = hip[1] + f * fwd * 0.35;
        knee = [kx, ky]; foot = [kx + s * 2, GROUND - 2];
        elbow = [sh[0] + s * 3 + sx * 1.5, sh[1] + 10];
        hand = opt.type ? [CX + sx * 13 * b, sh[1] + 9 + (opt.typeUp === sgn ? -2 : 0)] : [knee[0] - s * 2, knee[1] - 2];
        if (opt.type) elbow = [CX + sx * 13 * b, sh[1] + 5];
      } else {
        const q = phase == null ? 0 : phase + (sgn > 0 ? 0 : Math.PI);
        const fw = phase == null ? 0 : Math.sin(q) * 7, lift = phase == null ? 0 : Math.max(0, Math.cos(q)) * 3;
        foot = [hip[0] + s * fw, GROUND - 3 + f * fw * 0.3 - lift];
        knee = [(hip[0] + foot[0]) / 2 + s * 1.5, (hip[1] + foot[1]) / 2 - lift * 0.5];
        const aw = phase == null ? 0 : -Math.sin(q) * 5;
        elbow = [sh[0] + sx * 1.5 + s * aw * 0.4, sh[1] + 11];
        hand = [sh[0] + sx * 1 + s * aw, sh[1] + 21 + f * aw * 0.2];
      }
      return { sgn, sx, depth, hip, sh, knee, foot, elbow, hand };
    };
    return { f, s, th, b, sitting, hipY, shY, headY, R: side(1), L: side(-1), front: f > -0.25, back: f < -0.25 };
  }

  /* ---------- draw one frame ---------- */
  function frame(ch, yawDeg, opt) {
    const p = new Px(SIZE, SIZE), P = pose(yawDeg, Object.assign({ build: ch.build }, opt)), b = P.b;
    const skin = R.skin[ch.skin], hair = HAIR[ch.hair], pants = ch.pants, boots = ch.boots;
    const coat = ch.coat, vest = ch.vest || ch.coat || ch.shirt, shirt = ch.shirt || C.bone;
    const sides = [P.L, P.R].sort((a, c) => a.depth - c.depth);         // far side first
    const far = sides[0], near = sides[1];
    const legW = 3.9 * b, armW = 3.3 * b;

    const drawLeg = (sd, isFar) => {
      const dk = isFar ? 0.12 : 0;
      capsule(p, sd.hip[0], sd.hip[1], sd.knee[0], sd.knee[1], legW, legW * 0.92, pants, { dark: dk });
      capsule(p, sd.knee[0], sd.knee[1], sd.foot[0], sd.foot[1] - 3, legW * 0.92, legW * 0.8, ch.rolled ? skin : pants, { dark: dk });
      // boot: shaft and a toe that points the way the character faces
      const toe = P.s * 3.2, by = sd.foot[1];
      capsule(p, sd.foot[0], by - 5, sd.foot[0], by - 1, legW * 1.05, legW * 1.1, boots, { dark: dk });
      capsule(p, sd.foot[0] - 1 + Math.min(0, toe), by + 0.5, sd.foot[0] + 1 + Math.max(0, toe), by + 0.5 + P.f * 0.6, 1.9, 1.9, boots, { dark: dk + 0.05 });
      if (!ch.rolled) p.set(Math.round(sd.foot[0] - 2), Math.round(by - 6), boots[3]);
    };
    const drawArm = (sd, isFar) => {
      const dk = isFar ? 0.14 : 0, sleeve = ch.sleeveless ? skin : (coat || vest === ch.vest && ch.shirt ? shirt : vest);
      capsule(p, sd.sh[0], sd.sh[1], sd.elbow[0], sd.elbow[1], armW * 1.05, armW, sleeve, { dark: dk });
      capsule(p, sd.elbow[0], sd.elbow[1], sd.hand[0], sd.hand[1] - 1.5, armW, armW * 0.85, ch.rolled || ch.sleeveless ? skin : sleeve, { dark: dk });
      if (coat && !ch.sleeveless) capsule(p, sd.hand[0], sd.hand[1] - 3, sd.hand[0], sd.hand[1] - 2, armW * 1.15, armW * 1.15, ch.trim ? ch.trim : coat, { dark: dk });   // cuff
      blob(p, sd.hand[0], sd.hand[1], 2.3, 2.4, skin, { dark: dk });
      if (ch.epaulettes) { blob(p, sd.sh[0], sd.sh[1] - 1, 3.6 * b, 2.2, R.brass, { dark: dk }); for (let i = -3; i <= 3; i += 2) p.set(Math.round(sd.sh[0] + i), Math.round(sd.sh[1] + 1.5), R.brass[3]); }
    };

    // --- far limbs, then the coat tail behind the legs ---
    const hw = (11 * Math.abs(P.f) + 6.8 * Math.abs(P.s)) * b;   // half width of the torso on screen
    const fwd = P.s * 2.2;                                                  // chest pushes the way they face
    if (coat && ch.coatLen) {
      const len = (ch.coatLen === 'long' ? 18 : 11) - (P.sitting ? 6 : 0);
      const tailX = -P.s * 3;
      quad(p, [[CX - hw - 0.5 + tailX * 0.4, P.hipY - 6], [CX + hw + 0.5 + tailX * 0.4, P.hipY - 6], [CX + hw + 2.5 + tailX, P.hipY + len], [CX - hw - 2.5 + tailX, P.hipY + len]], coat, { dark: P.back ? 0 : 0.18 });
    }
    drawArm(far, true);
    drawLeg(far, true);
    drawLeg(near, false);

    // --- torso: waistcoat/shirt, then the open coat panels ---
    const top = P.shY - 1, waist = P.hipY - 3;
    quad(p, [[CX - hw + fwd, top], [CX + hw + fwd, top], [CX + hw * 0.88 + fwd * 0.6, waist], [CX + hw * 0.92, P.hipY + 2], [CX - hw * 0.92, P.hipY + 2], [CX - hw * 0.88 + fwd * 0.6, waist]],
      ch.stripes ? null : vest, { color: ch.stripes ? (x, y, l) => ((y - top) % 4 < 2 ? rampAt(C.bone, l, x, y) : rampAt(C.navy, l + 0.1, x, y)) : null });
    if (P.front && (ch.shirt || ch.vest)) { // shirt front / cravat between the lapels
      const sw = 2.6 * Math.abs(P.f) + 0.6, sx0 = CX + fwd + P.s * 4;
      quad(p, [[sx0 - sw, top], [sx0 + sw, top], [sx0 + sw * 0.6, top + 9], [sx0 - sw * 0.6, top + 9]], shirt, { lift: 0.1 });
      if (ch.vest && ch.coat) for (let y = top + 10; y < waist; y += 3) p.set(Math.round(sx0), y, R.brass[5]);
    }
    if (coat && !ch.sleeveless) {
      const cw = hw + 1.2, open = P.front ? 3.2 * Math.abs(P.f) : 0, cx0 = CX + fwd * 0.8;
      const panel = (a, c) => quad(p, [[a, top - 0.5], [c, top - 0.5], [c + (c > cx0 ? 0.5 : -0.5), P.hipY + 3], [a + (a < cx0 ? -0.8 : 0.8), P.hipY + 3]], coat);
      if (P.front && open > 0.6) { panel(cx0 - cw, cx0 - open); panel(cx0 + open, cx0 + cw); }
      else panel(cx0 - cw, cx0 + cw);
      if (ch.trim && P.front && open > 0.6) for (let y = top; y < P.hipY + 3; y++) { p.set(Math.round(cx0 - open), y, ch.trim[4]); p.set(Math.round(cx0 + open), y, ch.trim[3]); }
      if (ch.coatLen && P.front) { // front skirt panels hang beside the legs
        const len = (ch.coatLen === 'long' ? 16 : 9) - (P.sitting ? 7 : 0);
        quad(p, [[cx0 - cw - 0.5, P.hipY + 2], [cx0 - open - 0.5, P.hipY + 2], [cx0 - open - 2.5 - P.s * 2, P.hipY + 2 + len], [cx0 - cw - 2.5, P.hipY + 2 + len]], coat, { dark: 0.04 });
        quad(p, [[cx0 + open + 0.5, P.hipY + 2], [cx0 + cw + 0.5, P.hipY + 2], [cx0 + cw + 2.5, P.hipY + 2 + len], [cx0 + open + 2.5 - P.s * 2, P.hipY + 2 + len]], coat, { dark: 0.1 });
      }
    }
    // belt, sash, bandolier, sword
    const beltY = P.hipY - 2;
    if (ch.sash) quad(p, [[CX - hw + fwd * 0.5, beltY - 2], [CX + hw + fwd * 0.5, beltY - 2], [CX + hw, beltY + 2], [CX - hw, beltY + 2]], ch.sash);
    else if (ch.belt || !coat) { for (let x = Math.round(CX - hw); x <= Math.round(CX + hw); x++) { p.set(x, beltY, R.wood[2]); p.set(x, beltY + 1, R.wood[1]); } if (P.front) { p.rect(Math.round(CX + fwd - 1 + P.s * 3), beltY - 1, 3, 3, R.brass[5]); p.set(Math.round(CX + fwd + P.s * 3), beltY, R.brass[3]); } }
    if (ch.bandolier && !P.back) for (let i = 0; i < 20; i++) { const x = Math.round(CX - hw + 1 + i * (2 * hw - 2) / 20 + fwd), y = Math.round(top + 1 + i * 0.95); p.set(x, y, R.wood[1]); p.set(x, y + 1, i % 3 ? R.wood[2] : R.brass[4]); }
    if (ch.sword && !P.sitting) { const sx = CX + (P.s >= 0 ? -hw - 1 : hw + 1) * (P.back ? -1 : 1); capsule(p, sx, beltY + 1, sx - P.s * 2, beltY + 16, 0.9, 0.7, R.iron.slice(2)); blob(p, sx + P.s, beltY, 1.6, 1.3, R.brass); }

    // --- head ---
    const hx = CX + fwd * 0.9 + P.s * 1.2, hy = P.headY, hrx = 7 - Math.abs(P.s) * 0.6, hry = 7.6;
    capsule(p, hx - P.s * 1.5, hy + 6, hx - P.s * 1.5, hy + 9, 2.4, 2.4, skin, { dark: 0.12 });       // neck
    if (ch.longHair && hair) capsule(p, hx - P.s * 3, hy - 2, hx - P.s * 5, hy + 12, 5.2, 4, hair, { dark: 0.05 });
    blob(p, hx, hy, hrx, hry, skin);
    if (hair) { // hair around the back and sides; the whole back of the head when seen from behind
      if (P.back) blob(p, hx, hy - 0.5, hrx + 0.4, hry, hair);
      else { const bx = hx - P.s * 4.6; blob(p, bx, hy - 2.5, hrx * (0.42 + Math.abs(P.s) * 0.4), hry * 0.62, hair, { dark: 0.05 }); }
      if (ch.ponytail) capsule(p, hx - P.s * 6, hy - 1, hx - P.s * 9, hy + 7 + (P.back ? 2 : 0), 1.8, 1.2, hair);
    }
    if (P.front) {
      const fx = hx + P.s * 3.4, eyeY = Math.round(hy + 0.5);
      const eyes = Math.abs(P.s) > 0.9 ? [fx + 1.2] : [fx - 2.6 * P.f, fx + 2.6 * P.f].map(v => v + P.s * 0.6);
      eyes.forEach((ex, i) => {
        const patched = ch.eyepatch && (eyes.length === 1 ? P.s < 0 : i === 0);
        if (patched) { p.rect(Math.round(ex) - 1, eyeY - 1, 3, 3, '#141010'); p.line(Math.round(ex) - 1, eyeY - 1, Math.round(hx + hrx), eyeY - 4, '#141010'); }
        else { p.set(Math.round(ex), eyeY, '#1a120e'); p.set(Math.round(ex), eyeY + 1, '#1a120e'); p.set(Math.round(ex), eyeY - 2, hair ? hair[1] : skin[0]); p.set(Math.round(ex) + (i ? 1 : -1), eyeY - 2, hair ? hair[1] : skin[0]); }
        if (ch.spectacles && !patched) { p.set(Math.round(ex) - 1, eyeY - 1, R.brass[5]); p.set(Math.round(ex) + 1, eyeY - 1, R.brass[5]); p.set(Math.round(ex) - 1, eyeY + 2, R.brass[4]); p.set(Math.round(ex) + 1, eyeY + 2, R.brass[4]); }
      });
      const nx = Math.round(hx + P.s * 6.4), ny = Math.round(hy + 2.2);
      p.set(nx, ny, skin[1]); if (Math.abs(P.s) > 0.5) p.set(nx + Math.sign(P.s), ny, skin[2]);
      if (!ch.beard || ch.beard === 'stubble') p.hline(Math.round(fx - 1.5), Math.round(fx + 1.5), Math.round(hy + 4.6), skin[0]);
      if (ch.earring) p.set(Math.round(hx - P.s * 3 - (Math.abs(P.s) < 0.5 ? hrx - 0.5 : 0)), Math.round(hy + 3), R.brass[6]);
      // beards
      const bcol = hair || HAIR.black;
      if (ch.beard === 'full' || ch.beard === 'big') blob(p, fx - P.s * 1.2, hy + 6.4 + (ch.beard === 'big' ? 0.8 : 0), 4.4 * Math.max(0.6, Math.abs(P.f)) + (ch.beard === 'big' ? 1.2 : 0) + Math.abs(P.s) * 1.2, ch.beard === 'big' ? 3.8 : 2.8, bcol, { lift: 0.1 });
      if (ch.beard === 'full' || ch.beard === 'big') { p.hline(Math.round(fx - 2), Math.round(fx + 2), Math.round(hy + 3.6), bcol[2]); p.set(Math.round(fx), Math.round(hy + 5.4), '#5a2a22'); }
      if (ch.beard === 'goatee') { blob(p, fx, hy + 6, 1.8, 2.6, bcol); p.hline(Math.round(fx - 2.5), Math.round(fx + 2.5), Math.round(hy + 3.4), bcol[2]); }
      if (ch.beard === 'stubble') for (let y = Math.round(hy + 3); y < hy + 7; y++) for (let x = Math.round(fx - 4); x < fx + 4; x++) if ((x + y) % 2 === 0 && ((x + 0.5 - hx) / hrx) ** 2 + ((y + 0.5 - hy) / hry) ** 2 < 0.9) p.set(x, y, skin[1]);
    }
    // --- hats ---
    if (ch.hat === 'tricorn') {
      const hc = ch.hatCol, brimY = hy - 5.2;
      blob(p, hx, brimY - 3.4, 5.6, 4, hc, { lift: 0.06 });                                   // crown
      const span = 10 * Math.max(0.55, Math.abs(P.f)) + 3 * Math.abs(P.s);
      capsule(p, hx - span, brimY - 2.6, hx + span, brimY - 2.6, 1.7, 1.7, hc, { color: (x, y, l) => rampAt(hc, l + (y > brimY - 2 ? -0.2 : 0.1), x, y) });
      if (P.front || P.back) { capsule(p, hx - span + 0.5, brimY - 2.6, hx - span - 1, brimY - 6, 1.6, 1.3, hc); capsule(p, hx + span - 0.5, brimY - 2.6, hx + span + 1, brimY - 6, 1.6, 1.3, hc); }
      if (P.front) capsule(p, hx + P.s * 3 - 3, brimY - 1, hx + P.s * 3 + 3, brimY - 1, 1.4, 1.4, hc, { dark: 0.1 });   // front point dips
      if (ch.trim || ch.id === 'gritty_admiral') for (let x = Math.round(hx - span); x <= Math.round(hx + span); x++) p.set(x, Math.round(brimY - 1.2), (x % 2) ? R.brass[4] : R.brass[5]);
      if (ch.plume) capsule(p, hx - 2 - P.s * 2, brimY - 6, hx - 7 - P.s * 3, brimY - 11, 1.8, 1, null, { color: (x, y, l) => l > 0.6 ? '#c45a3e' : l > 0.4 ? ch.plume : '#6e2018' });
    } else if (ch.hat === 'bandana') {
      const hc = ch.hatCol;
      for (let y = Math.floor(hy - hry - 0.5); y <= hy - 1.5; y++) for (let x = Math.floor(hx - hrx - 1); x <= Math.ceil(hx + hrx + 1); x++) {
        const nx = (x + 0.5 - hx) / (hrx + 0.6), ny = (y + 0.5 - hy) / (hry + 0.4); if (nx * nx + ny * ny > 1) continue;
        p.set(x, y, rampAt(hc, 0.72 - nx * 0.3 - ny * 0.2, x, y));
      }
      for (let x = Math.round(hx - hrx); x <= Math.round(hx + hrx); x += 3) p.set(x, Math.round(hy - 4), hc[4]);       // dots
      if (!P.front || Math.abs(P.s) > 0.3) { const kx = hx - P.s * (hrx + 1.2) - (P.back ? 0 : 0); capsule(p, kx, hy - 2, kx - P.s * 3 - (P.back ? 2 : 0), hy + 4, 1.4, 1, hc); capsule(p, kx, hy - 2, kx - P.s * 1 + (P.back ? 2 : 0), hy + 5, 1.2, 0.8, hc, { dark: 0.1 }); }
    }

    // --- near limbs last ---
    drawArm(near, false);
    if (opt.type) { /* both hands are on the console in front; nothing else */ }
    p.outline(OUT);
    return p;
  }

  /* ---------- all 64 frames for one character ---------- */
  const mirror = px => { const q = new Px(px.w, px.h); q.blit(px, 0, 0, true); return q; };
  function frames(ch) {
    const out = {};
    const yawOf = dir => YAW[dir] != null ? [YAW[dir], false] : [YAW[{ west: 'east', 'north-west': 'north-east', 'south-west': 'south-east' }[dir]], true];
    for (const dir of DIRS) {
      const [yaw, flip] = yawOf(dir), make = o => { const f = frame(ch, yaw, o); return flip ? mirror(f) : f; };
      out['rot_' + dir] = make({});
      for (let k = 1; k <= 6; k++) out['walk_' + dir + '_' + k] = make({ phase: (k - 1) / 6 * Math.PI * 2 });
    }
    for (const dir of ['south', 'east', 'north', 'west']) { const [yaw, flip] = yawOf(dir); const f = frame(ch, yaw, { sit: true }); out['sit_' + dir + '_4'] = flip ? mirror(f) : f; }
    for (let k = 1; k <= 4; k++) out['type_north_' + k] = frame(ch, 180, { sit: true, type: true, typeUp: k % 2 ? 1 : -1 });
    return out;
  }
  // StarNet's manifest uses one track key per state+direction
  function manifestEntries(set, names) {
    const tracks = {};
    for (const n of names) {
      const m = /^(rot|walk|sit|type)_(.+?)(?:_(\d))?$/.exec(n); if (!m) continue;
      const key = set + '.' + m[1] + '.' + m[2]; (tracks[key] = tracks[key] || []).push(set + '/' + n + '.png');
    }
    for (const k of Object.keys(tracks)) tracks[k].sort();
    return tracks;
  }

  return { SIZE, DIRS, CHARACTERS, frame, frames, manifestEntries };
});
