/* GRITTY FLEET — fleet-pixel.js : a small pixel-art toolkit (no dependencies, deterministic).

   Px is an RGBA pixel buffer with the primitives pixel artists use by hand: hue-shifted colour ramps, ordered
   (Bayer) dithering, value noise for organic shapes, and an automatic outline pass. Everything the fleet draws
   at rest is built once into canvases from these, so the per-frame work is only compositing and light. */
'use strict';
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GrittyPixel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ---------- colour ramps, dark → light, hue-shifted (shadows cool, highlights warm) ---------- */
  const RAMP = {
    wood:   ['#160e0c', '#24160f', '#352015', '#4a2d1c', '#633d25', '#7f5232', '#9c6b42', '#b98957'],
    plank:  ['#2a1a12', '#3b2618', '#50341f', '#684628', '#825a33', '#9d7142'],
    iron:   ['#121417', '#1d2024', '#2a2d30', '#3b3d3e', '#51524f', '#6b6a63', '#8a877b'],
    rust:   ['#2e140d', '#4a1f12', '#6a2e18', '#8c4220', '#ad5a2b', '#c8773c', '#dd9a58'],
    brass:  ['#3a2810', '#5a3f17', '#7d5a20', '#a17a2c', '#c49c42', '#e0bf66', '#f2dc93'],
    canvas: ['#3b3530', '#544c41', '#6f6655', '#8c826c', '#aa9f86', '#c6bca0', '#ddd4b8', '#eee7cf'],
    sea:    ['#070d12', '#0b151d', '#0f1f2a', '#152b37', '#1c3946', '#264a56', '#345d66', '#4b7476', '#6c8f87'],
    sky:    ['#0c111c', '#151b2b', '#21253a', '#32304a', '#4a3a52', '#6a4552', '#8f5550', '#b5694d', '#d48a57', '#e8b072'],
    leaf:   ['#0f1a14', '#16261b', '#1f3523', '#2b462b', '#3a5a32', '#4e703b', '#668845', '#82a052'],
    sand:   ['#3d3226', '#574632', '#75603f', '#937c50', '#ae9764', '#c7b17c', '#dccb98'],
    rock:   ['#1b1a1e', '#28272c', '#37363a', '#4a4849', '#605c59', '#79736b'],
    skin:   [['#3c241c', '#5e392a', '#82533c', '#a8704f', '#c58e69'], ['#2a1812', '#45281c', '#64392a', '#83503a', '#a0694c'], ['#4a2f24', '#704833', '#996647', '#bf8761', '#d9a882']],
    cloth:  { brass: ['#2c2214', '#4a3a1f', '#6b552d', '#8f733c', '#b0914f'], rust: ['#2c120c', '#4e2015', '#73311e', '#97452a', '#b85e3a'],
              moss: ['#141b14', '#223024', '#344636', '#4b604a', '#667a5f'], wine: ['#1e0e10', '#3a1619', '#5a2224', '#7c3330', '#9a4a40'],
              slate: ['#11151c', '#1e2530', '#2f3946', '#45505e', '#606c78'], navy: ['#0d121c', '#172033', '#22304a', '#33445f', '#4b5d78'],
              bone: ['#3a352c', '#5a5242', '#7d735c', '#a29677', '#c5b996'], coal: ['#0e0d0d', '#1a1918', '#2a2826', '#3d3a36', '#55514b'] },
    lamp:   ['#7a3d16', '#b5621f', '#e0902f', '#f5b94c', '#ffdc86', '#fff2c4'],
    fire:   ['#5a1a0c', '#9a2e10', '#d2531a', '#f08a2a', '#ffc04a', '#fff0a0'],
    danger: ['#2a0c0a', '#4e1512', '#7a2019', '#a83324', '#d0503a'],
    fog:    ['#3f4a4f', '#5b676a', '#7a8585', '#9aa3a0']
  };
  const OUTLINE = '#0b0807';

  /* ---------- deterministic randomness ---------- */
  function hash(a, b, c) {
    let h = (a * 374761393 + b * 668265263 + (c || 0) * 2147483647) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    return (h >>> 0) / 4294967295;
  }
  function rng(seed) { let s = seed >>> 0 || 1; return () => { s = Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9 | 0; s ^= s >>> 13; return ((s >>> 0) % 100000) / 100000; }; }
  const smooth = t => t * t * (3 - 2 * t);
  function noise(x, y, seed) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, s = seed || 0;
    const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
    const u = smooth(xf), v = smooth(yf);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, seed, oct) { let t = 0, amp = 0.5, f = 1, n = 0; for (let i = 0; i < (oct || 4); i++) { t += noise(x * f, y * f, (seed || 0) + i * 17) * amp; n += amp; amp *= 0.5; f *= 2; } return t / n; }
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const dither = (x, y, t) => t * 16 > BAYER[(y & 3) * 4 + (x & 3)] + 0.5;
  // pick a ramp index for a value 0..1 with dithered transitions between steps
  function rampAt(ramp, v, x, y) {
    const f = Math.max(0, Math.min(0.9999, v)) * (ramp.length - 1), i = Math.floor(f);
    return ramp[Math.min(ramp.length - 1, i + (dither(x, y, f - i) ? 1 : 0))];
  }

  /* ---------- the pixel buffer ---------- */
  const colorCache = new Map();
  function rgba(c) {
    if (colorCache.has(c)) return colorCache.get(c);
    let r = 0, g = 0, b = 0, a = 255;
    if (c[0] === '#') { r = parseInt(c.slice(1, 3), 16); g = parseInt(c.slice(3, 5), 16); b = parseInt(c.slice(5, 7), 16); if (c.length === 9) a = parseInt(c.slice(7, 9), 16); }
    const v = [r, g, b, a]; colorCache.set(c, v); return v;
  }
  class Px {
    constructor(w, h) { this.w = Math.max(1, Math.round(w)); this.h = Math.max(1, Math.round(h)); this.d = new Uint8ClampedArray(this.w * this.h * 4); }
    inside(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
    set(x, y, c) {
      x |= 0; y |= 0; if (!c || !this.inside(x, y)) return;
      const [r, g, b, a] = rgba(c), i = (y * this.w + x) * 4;
      if (a === 255) { this.d[i] = r; this.d[i + 1] = g; this.d[i + 2] = b; this.d[i + 3] = 255; return; }
      const k = a / 255, ia = 1 - k; // simple over
      this.d[i] = r * k + this.d[i] * ia; this.d[i + 1] = g * k + this.d[i + 1] * ia; this.d[i + 2] = b * k + this.d[i + 2] * ia; this.d[i + 3] = Math.max(this.d[i + 3], a);
    }
    alpha(x, y) { return this.inside(x, y) ? this.d[(y * this.w + x) * 4 + 3] : 0; }
    rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c); }
    hline(x0, x1, y, c) { for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) this.set(x, y, c); }
    vline(x, y0, y1, c) { for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) this.set(x, y, c); }
    line(x0, y0, x1, y1, c) {
      x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
      const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1, dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
      let e = dx + dy;
      for (;;) { this.set(x0, y0, c); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } }
    }
    disc(cx, cy, r, c) { for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.6) this.set(cx + x, cy + y, c); }
    ellipse(cx, cy, rx, ry, c) { for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) if ((x * x) / (rx * rx + 0.01) + (y * y) / (ry * ry + 0.01) <= 1) this.set(cx + x, cy + y, c); }
    // shaded sphere-ish blob: light from the upper left
    shadedDisc(cx, cy, r, ramp) {
      for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
        const d = x * x + y * y; if (d > r * r + r * 0.6) continue;
        const l = 0.75 - (x + y) / (2.6 * r) - d / (r * r) * 0.35;
        this.set(cx + x, cy + y, rampAt(ramp, l, cx + x, cy + y));
      }
    }
    poly(pts, c) { // even-odd scanline fill
      let y0 = Infinity, y1 = -Infinity; for (const p of pts) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
      for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
        const xs = [];
        for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) xs.push(a[0] + (y - a[1]) / (b[1] - a[1]) * (b[0] - a[0])); }
        xs.sort((p, q) => p - q);
        for (let i = 0; i + 1 < xs.length; i += 2) for (let x = Math.round(xs[i]); x < Math.round(xs[i + 1]); x++) (typeof c === 'function') ? this.set(x, y, c(x, y)) : this.set(x, y, c);
      }
    }
    // 1px outline around everything drawn (outside edge), the single biggest readability win in pixel art
    outline(c) {
      const o = c || OUTLINE, add = [];
      for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
        if (this.alpha(x, y) > 0) continue;
        if (this.alpha(x + 1, y) > 200 || this.alpha(x - 1, y) > 200 || this.alpha(x, y + 1) > 200 || this.alpha(x, y - 1) > 200) add.push([x, y]);
      }
      for (const [x, y] of add) this.set(x, y, o);
      return this;
    }
    blit(src, dx, dy, flip) {
      for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
        const i = (y * src.w + (flip ? src.w - 1 - x : x)) * 4; if (!src.d[i + 3]) continue;
        const a = src.d[i + 3], hex = '#' + [src.d[i], src.d[i + 1], src.d[i + 2]].map(v => v.toString(16).padStart(2, '0')).join('') + (a < 255 ? a.toString(16).padStart(2, '0') : '');
        this.set(dx + x, dy + y, hex);
      }
    }
    toCanvas() {
      if (typeof document === 'undefined') return { width: this.w, height: this.h };
      const c = document.createElement('canvas'); c.width = this.w; c.height = this.h;
      c.getContext('2d').putImageData(new ImageData(this.d, this.w, this.h), 0, 0); return c;
    }
  }

  return { RAMP, OUTLINE, hash, rng, noise, fbm, dither, rampAt, rgba, Px };
});
