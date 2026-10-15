/* GRITTY FLEET — fleet-art.js : placeholder pixel art, drawn in code.

   Direction (Dan's brainstorm): pixel art throughout, FAR: Lone Sails / Changing Tides mood — rusty, desaturated,
   weathered, never candy-bright. GRITTY is drawn a step up in size and detail from everyone else.
   Everything here is original and generated at runtime from the small maps below, so final hand-made sprite
   sheets can replace any builder without touching the renderer: each builder returns a canvas. */
'use strict';
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GrittyFleetArt = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const P = {
    seaDeep: '#2c4446', seaMid: '#38575a', seaLight: '#557570', foam: '#a7b4a1',
    skyTop: '#4a5552', skyMid: '#6f746a', skyLow: '#837f70',
    hullDark: '#33261f', hull: '#553a2a', hullLight: '#734f35', rust: '#8b4b31', rustLight: '#a8653f',
    deck: '#80654a', deckLight: '#9c7f5a', wall: '#3e3029', wallLight: '#4d3b31',
    sail: '#c9bea2', sailShade: '#a69a80', sailPatch: '#b2896c',
    iron: '#45443f', ironLight: '#6a6862', brass: '#b38d4c', brassLight: '#d2ae68',
    lantern: '#e0ac56', ink: '#1d1a17', skin: '#c49a78', skinDark: '#977157', beard: '#8c8a83', shirt: '#cfc6b0',
    smoke: '#c6c1b3', fog: '#a1a8a2', danger: '#a6463a', amber: '#d89a3e', grey: '#8a8f8b', enemy: '#1f1d1c'
  };
  // department accents: sails, pennants, bandanas. Muted on purpose.
  const ACCENT = { operations: '#b38d4c', etsy: '#a8653f', services: '#6e866a', youtube: '#9a4436', lab: '#687890' };
  const accentOf = id => ACCENT[id] || P.grey;

  function canvas(w, h) {
    if (typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
    return { width: w, height: h, getContext: () => null };   // node: geometry only
  }
  // tiny deterministic hash for wear marks; no Math.random anywhere in the art
  const hash = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };

  function fromMap(rows, colors) {
    const h = rows.length, w = rows[0].length, c = canvas(w, h), g = c.getContext('2d');
    if (!g) return c;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const k = rows[y][x]; if (k === '.' || !colors[k]) continue;
      g.fillStyle = colors[k]; g.fillRect(x, y, 1, 1);
    }
    return c;
  }

  /* ---------- crew (8×12) and the Admiral (12×18) ---------- */
  const CREW_A = ['..hhhh..', '.hhhhhh.', '..ssss..', '..skks..', '..ssss..', '.cwwwwc.', 'scwwwwcs', 's.cccc.s', '..cccc..', '..l..l..', '..l..l..', '.kk..kk.'];
  const CREW_B = ['..hhhh..', '.hhhhhh.', '..ssss..', '..skks..', '..ssss..', 'scwwwwcs', '.cwwwwc.', '..cccc..', '..cccc..', '..l..l..', '.l....l.', 'kk....kk'];
  const ADMIRAL = [
    '....kkkk....', '..kkhhhhkk..', '.khhbbbbhhk.', 'kkkkkkkkkkkk', '...ssssss...', '...skssks...', '...ssssss...',
    '...gggggg...', '....gggg....', '.ecccccccce.', 'eccwbwwbwcce', '.ccwwbbwwcc.', '.sccbccbccs.', '.s.cccccc.s.',
    '...cccccc...', '...cc..cc...', '...ll..ll...', '..kkk..kkk..'];
  function crewSprite(deptId, opts) {
    const dim = opts && opts.dim, frame = opts && opts.frame;
    const col = {
      h: dim ? P.grey : accentOf(deptId), s: dim ? '#8f877c' : P.skin, k: P.ink, w: dim ? '#9b978c' : P.shirt,
      c: dim ? '#4f4b45' : P.hull, l: P.hullDark
    };
    return fromMap(frame ? CREW_B : CREW_A, col);
  }
  function admiralSprite(opts) {
    const dim = opts && opts.dim;
    return fromMap(ADMIRAL, { k: P.ink, h: '#2b2724', b: P.brassLight, s: P.skin, g: P.beard, e: P.brass,
      c: dim ? '#3d3a37' : '#2f3a40', w: P.shirt, l: P.hullDark });
  }

  /* ---------- status glyphs (3×5) for markers that must read without colour ---------- */
  const GLYPH = {
    '!': ['.k.', '.k.', '.k.', '...', '.k.'], 'x': ['k.k', 'k.k', '.k.', 'k.k', 'k.k'], '?': ['kk.', '..k', '.k.', '...', '.k.'],
    '=': ['k.k', 'k.k', 'k.k', 'k.k', 'k.k'], '*': ['...', 'k.k', '.k.', 'k.k', '...'], '-': ['...', '...', 'kkk', '...', '...'], 'z': ['kkk', '..k', '.k.', 'k..', 'kkk']
  };
  function glyph(ch, color) { return fromMap(GLYPH[ch] || GLYPH['?'], { k: color }); }

  /* ---------- fleet: overhead ship, bow to the right ---------- */
  function shipTop(deptId, o) {
    const flagship = o && o.flagship, laidUp = o && o.laidUp;
    const w = flagship ? 78 : 58, h = flagship ? 28 : 22, c = canvas(w, h), g = c.getContext('2d');
    if (!g) return c;
    const half = h / 2 - 1, mid = h / 2;
    const hw = x => { const t = x / (w - 1); return t > 0.68 ? half * Math.pow(Math.max(0, 1 - (t - 0.68) / 0.32), 0.75) : half * (0.78 + 0.22 * Math.sin(t / 0.68 * Math.PI / 2)); };
    for (let x = 0; x < w; x++) {
      const r = hw(x);
      for (let y = 0; y < h; y++) {
        const d = Math.abs(y + 0.5 - mid);
        if (d > r) continue;
        let col = d > r - 1.2 ? P.hullDark : d > r - 2.4 ? P.hull : ((Math.floor(y / 2) % 2) ? P.deck : P.deckLight);
        if (col !== P.hullDark && hash(x, y + w) > 0.93) col = P.rust;
        g.fillStyle = col; g.fillRect(x, y, 1, 1);
      }
    }
    // stern castle and hatches
    g.fillStyle = P.hullLight; g.fillRect(2, Math.round(mid - half * 0.6), flagship ? 12 : 9, Math.round(half * 1.2));
    g.fillStyle = P.hullDark; g.fillRect(Math.round(w * 0.45), Math.round(mid - 2), 4, 4);
    // masts and sails seen from above: sails are bars across the beam, furled to a thin roll when laid up
    const masts = flagship ? [0.3, 0.5, 0.68] : [0.38, 0.62];
    for (const m of masts) {
      const x = Math.round(w * m), span = Math.round(hw(x) + (laidUp ? 0 : 3));
      g.fillStyle = laidUp ? P.sailShade : P.sail; g.fillRect(x - (laidUp ? 0 : 2), Math.round(mid - span), laidUp ? 2 : 5, span * 2);
      if (!laidUp) { g.fillStyle = P.sailShade; g.fillRect(x + 2, Math.round(mid - span), 1, span * 2); g.fillStyle = accentOf(deptId); g.fillRect(x - 2, Math.round(mid - 1), 5, 2); }
      g.fillStyle = P.ink; g.fillRect(x, Math.round(mid), 1, 1);
    }
    if (flagship) { // gun ports along both sides, brass bow ornament
      g.fillStyle = P.iron;
      for (let x = 16; x < w * 0.66; x += 6) { g.fillRect(x, Math.round(mid - hw(x)), 2, 1); g.fillRect(x, Math.round(mid + hw(x)) - 1, 2, 1); }
      g.fillStyle = P.brassLight; g.fillRect(w - 3, Math.round(mid) - 1, 2, 2);
    }
    return c;
  }
  function enemySloop() {
    return fromMap(['......kk..........', '....kkkkkk........', '.hhhhhhhhhhhhhh...', 'hhhhkhhhhkhhhhhhh.', 'hhhhhhhhhhhhhhhhhh', '.hhhhhhhhhhhhhhh..', '..r...............'],
      { k: '#141312', h: P.enemy, r: P.danger });
  }

  /* ---------- cutaway props ---------- */
  function desk(lit) { return fromMap(['.......l..', 'kkkkkkkkkk', 'k.wwwwww.k', 'kkkkkkkkkk', 'k........k', 'k........k'], { k: P.hullDark, w: P.wallLight, l: lit ? P.lantern : P.ironLight }); }
  function crate() { return fromMap(['kkkkkkk', 'kbbkbbk', 'kbkbkbk', 'kkbbbkk', 'kbkbkbk', 'kbbkbbk', 'kkkkkkk'], { k: P.hullDark, b: P.deckLight }); }
  function barrel() { return fromMap(['.kkkk.', 'kbbbbk', 'kiiiik', 'kbbbbk', 'kbbbbk', 'kiiiik', 'kbbbbk', '.kkkk.'], { k: P.hullDark, b: P.hullLight, i: P.ironLight }); }
  function chartBoard() { return fromMap(['kkkkkkkkkkkk', 'kppppppppppk', 'kpaapppbbppk', 'kppaappbpppk', 'kpppaaabpppk', 'kppppppbbppk', 'kppppppppppk', 'kkkkkkkkkkkk'],
    { k: P.hullDark, p: P.sail, a: P.rust, b: P.iron }); }

  return { P, ACCENT, accentOf, hash, fromMap, crewSprite, admiralSprite, glyph, shipTop, enemySloop, desk, crate, barrel, chartBoard };
});
