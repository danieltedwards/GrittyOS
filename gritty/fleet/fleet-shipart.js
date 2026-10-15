/* GRITTY FLEET — fleet-shipart.js : painted ship cutaways (ChatGPT art) and where the crew can walk on them.

   A painted cutaway replaces the drawn hull in the ship view. The painting is only a picture, so each ship also
   carries a floor plan, measured by hand in the painting's own pixels:
     decks    the floor lines the crew stand on ({ y, x0, x1 }), with a name; open:true marks the weather deck
     ladders  stairs and ladders between two decks ({ a, b, xa, xb }); a diagonal staircase has xa ≠ xb
     quarter  where the captain stands; cabin and hold are the click targets for the ship overview and output vault
     th       how tall a crew member stands, so StarNet avatars match the painted scale
   Re-measure if the painting changes. A ship without art keeps the drawn cutaway from fleet-scenes.js.

   GrittyShipArt.create({ base, ships: { deptId: artKey } }) → { get(deptId) → null while loading, then { img, geom } } */
'use strict';
const GrittyShipArt = (() => {
  const GEOM = {
    sovereign: {
      file: 'sovereign.webp', w: 1536, h: 621, th: 62, sky: '#0c1720',
      quarter: { y: 205, x0: 240, x1: 500 },
      decks: [
        { name: 'Chart room', y: 237, x0: 560, x1: 1300 },
        { name: 'Counting house', y: 318, x0: 220, x1: 740 },
        { name: 'Strongroom', y: 345, x0: 790, x1: 1310 },
        { name: 'Treasury', y: 405, x0: 260, x1: 1240 },
        { name: 'Engine hold', y: 510, x0: 300, x1: 1220 }
      ],
      ladders: [{ a: 1, b: 0, xa: 600, xb: 670 }, { a: 1, b: 2, xa: 735, xb: 795 }, { a: 2, b: 3, xa: 1250, xb: 1250 }, { a: 3, b: 4, xa: 1225, xb: 1215 }],
      cabin: { x: 20, y: 100, w: 190, h: 230 }, hold: { x: 300, y: 425, w: 920, h: 85 }
    },
    artificer: {
      file: 'artificer.webp', w: 1536, h: 634, th: 64, sky: '#101a22',
      quarter: { y: 135, x0: 130, x1: 290 },
      decks: [
        { name: 'Open deck', y: 185, x0: 330, x1: 1250, open: true },
        { name: 'Print workshop', y: 357, x0: 130, x1: 1320 },
        { name: 'Stockroom', y: 530, x0: 200, x1: 1310 }
      ],
      ladders: [{ a: 0, b: 1, xa: 1250, xb: 1320 }, { a: 1, b: 2, xa: 1300, xb: 1300 }, { a: 1, b: 2, xa: 780, xb: 780 }],
      cabin: { x: 15, y: 150, w: 95, h: 190 }, hold: { x: 170, y: 380, w: 300, h: 150 }
    },
    raider: {
      file: 'raider.webp', w: 1536, h: 622, th: 60, sky: '#0d1822',
      quarter: { y: 100, x0: 140, x1: 270 },
      decks: [
        { name: 'Gun deck', y: 160, x0: 290, x1: 1300, open: true },
        { name: 'Chart and mess', y: 295, x0: 125, x1: 1330 },
        { name: 'Cargo deck', y: 470, x0: 200, x1: 1300 }
      ],
      ladders: [{ a: 0, b: 1, xa: 620, xb: 560 }, { a: 1, b: 2, xa: 650, xb: 710 }],
      cabin: { x: 30, y: 120, w: 85, h: 180 }, hold: { x: 200, y: 350, w: 420, h: 120 }
    },
    signal: {
      file: 'signal.webp', w: 1536, h: 611, th: 58, sky: '#0b1a1f',
      quarter: { y: 188, x0: 200, x1: 470 },
      decks: [
        { name: 'Top deck', y: 188, x0: 520, x1: 1240, open: true },
        { name: 'Signal room', y: 283, x0: 130, x1: 1250 },
        { name: 'Studio', y: 397, x0: 200, x1: 1290 },
        { name: 'Archive', y: 520, x0: 220, x1: 1260 }
      ],
      ladders: [{ a: 0, b: 1, xa: 525, xb: 525 }, { a: 0, b: 1, xa: 1016, xb: 1066 }, { a: 1, b: 2, xa: 570, xb: 570 }, { a: 1, b: 2, xa: 1272, xb: 1272 },
        { a: 2, b: 3, xa: 735, xb: 735 }, { a: 2, b: 3, xa: 1050, xb: 975 }],
      cabin: { x: 55, y: 70, w: 135, h: 120 }, hold: { x: 580, y: 415, w: 125, h: 105 }
    },
    alchemist: {
      file: 'alchemist.webp', w: 1536, h: 632, th: 58, sky: '#0b1a1c',
      quarter: { y: 188, x0: 640, x1: 840 },
      decks: [
        { name: 'Weather deck', y: 188, x0: 240, x1: 1230, open: true },
        { name: 'Laboratory', y: 335, x0: 230, x1: 1250 },
        { name: 'Library', y: 488, x0: 345, x1: 1230 }
      ],
      ladders: [{ a: 0, b: 1, xa: 600, xb: 478 }, { a: 1, b: 2, xa: 478, xb: 360 }, { a: 0, b: 1, xa: 1000, xb: 1000 }],
      cabin: { x: 75, y: 180, w: 110, h: 90 }, hold: { x: 1036, y: 360, w: 80, h: 125 }
    }
  };
  // which painting each department sails in (a host can pass its own map)
  const DEFAULT_SHIPS = { operations: 'sovereign', etsy: 'artificer', services: 'raider', youtube: 'signal', lab: 'alchemist' };

  function create(opts) {
    opts = opts || {};
    const base = opts.base || 'ship-art/', ships = opts.ships || DEFAULT_SHIPS, loaded = new Map();
    function load(key) {
      if (loaded.has(key)) return loaded.get(key);
      const geom = GEOM[key], entry = { ready: false, img: null, geom };
      loaded.set(key, entry);
      if (!geom) return entry;
      const img = new Image();
      img.onload = () => { entry.img = img; entry.ready = true; if (opts.onReady) opts.onReady(key); };
      img.src = base + geom.file;
      return entry;
    }
    return {
      get(deptId) { const k = ships[deptId]; if (!k) return null; const e = load(k); return e.ready ? { key: k, img: e.img, geom: e.geom } : null; },
      preload() { Object.values(ships).forEach(load); }
    };
  }
  return { GEOM, DEFAULT_SHIPS, create };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = GrittyShipArt;
if (typeof window !== 'undefined') window.GrittyShipArt = GrittyShipArt;
