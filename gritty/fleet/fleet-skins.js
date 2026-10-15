/* GRITTY FLEET — fleet-skins.js : load crew avatars in StarNet's own skin format.

   The ship uses the SAME avatars as the StarNet station. A skin is a folder of frames named the StarNet way:
     rot_<dir>.png · walk_<dir>_1..6.png · sit_<east|north|south|west>_4.png · type_north_1..4.png
   (dirs: south, south-east, east, north-east, north, north-west, west, south-west). Frames may be padded StarNet
   144×144 canvases or tight crops (like a sliced ChatGPT sheet): each one is cropped to its visible pixels at
   load, and the whole skin is scaled by its standing height so every avatar stands the same size aboard.

   Use: const skins = GrittyFleetSkins.create({ base: 'assets/sprites/' });
        skins.get('approved_voidwizard')  → null while loading, then { frame(track, dir, i, height) → canvas }
   In the PC app, `base` is StarNet's sprite folder and the set comes from the agent's own skin (DATA.SKINS). */
'use strict';
const GrittyFleetSkins = (() => {
  const DIRS = ['south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west'];
  const NAMES = [...DIRS.map(d => 'rot_' + d), ...DIRS.flatMap(d => [1, 2, 3, 4, 5, 6].map(i => 'walk_' + d + '_' + i)),
    ...['east', 'north', 'south', 'west'].map(d => 'sit_' + d + '_4'), ...[1, 2, 3, 4].map(i => 'type_north_' + i)];

  function crop(img) {
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) return null;
    const o = document.createElement('canvas'); o.width = x1 - x0 + 1; o.height = y1 - y0 + 1;
    o.getContext('2d').drawImage(c, x0, y0, o.width, o.height, 0, 0, o.width, o.height);
    return o;
  }
  // downscale once per size with good filtering; the scene then draws it 1:1 (no per-frame resampling)
  function scaled(src, k) {
    const w = Math.max(1, Math.round(src.width * k)), h = Math.max(1, Math.round(src.height * k));
    let cur = src;
    while (cur.width / 2 >= w && cur.height / 2 >= h) { const n = document.createElement('canvas'); n.width = Math.round(cur.width / 2); n.height = Math.round(cur.height / 2); const g = n.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(cur, 0, 0, n.width, n.height); cur = n; }
    const o = document.createElement('canvas'); o.width = w; o.height = h; const g = o.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(cur, 0, 0, w, h);
    return o;
  }

  function create(opts) {
    const base = (opts && opts.base) || 'assets/sprites/', sets = new Map();
    function load(set) {
      const entry = { ready: false, frames: {}, stand: 0, sized: new Map() }; sets.set(set, entry);
      let left = NAMES.length;
      for (const n of NAMES) {
        const img = new Image();
        img.onload = () => { entry.frames[n] = crop(img); done(); };
        img.onerror = () => done();
        img.src = base + set + '/' + n + '.png';
      }
      function done() { if (--left) return; entry.stand = (entry.frames.rot_south || Object.values(entry.frames).find(Boolean) || { height: 0 }).height; entry.ready = entry.stand > 0; if (opts && opts.onReady) opts.onReady(set); }
      return entry;
    }
    function get(set) {
      if (!set) return null;
      const e = sets.get(set) || load(set);
      if (!e.ready) return null;
      return {
        // the frame for a track/direction/index at a standing height in scene pixels (falls back sensibly)
        frame(track, dir, i, height) {
          let name = track === 'walk' ? 'walk_' + dir + '_' + (i + 1) : track === 'type' ? 'type_north_' + (i + 1) : track === 'sit' ? 'sit_' + dir + '_4' : 'rot_' + dir;
          if (!e.frames[name]) name = track === 'sit' ? 'sit_south_4' : 'rot_' + dir;
          if (!e.frames[name]) name = 'rot_south';
          const src = e.frames[name]; if (!src) return null;
          const key = name + '@' + height;
          if (!e.sized.has(key)) e.sized.set(key, scaled(src, height / e.stand));
          return e.sized.get(key);
        }
      };
    }
    return { get, NAMES };
  }
  return { create, NAMES, DIRS };
})();
if (typeof window !== 'undefined') window.GrittyFleetSkins = GrittyFleetSkins;
