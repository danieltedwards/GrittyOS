/* GRITTY FLEET — fleet-crew.js : crew who live aboard (pure: no DOM; time and randomness are injected).

   StarNet's station has avatars that walk to their desks, wander when idle and carry work along conveyors. This is
   the same idea for a ship's cutaway: decks are walkable floors, a ladder joins them, and every crew member picks
   what to do from their REAL status:
     running            → go to their own station and sit at it, working (typing frames)
     waiting-approval,
     blocked, failed    → go to their station and stand facing you (the marker above says why)
     paused             → sit at their station
     idle               → wander their deck, pause, look around; now and then climb to another deck
     offline / laid up  → sit, off duty
   A real handoff between two crew aboard (evidence {kind:'handoff', fromAgent, toAgent}) sends the sender walking
   to the receiver's station and back. Movement never invents work: it only acts out the status it is given.

   Positions are in cutaway scene pixels: x along a deck, y the floor line the feet stand on. */
'use strict';
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GrittyFleetCrew = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const WALK = 30, CLIMB = 20;               // px per second
  const STRIDE = 3.4;                        // px of travel per walk frame (6 frames per cycle)

  function rngFrom(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619); let s = h >>> 0 || 1; return () => { s = Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9 | 0; s ^= s >>> 13; return ((s >>> 0) % 100000) / 100000; }; }

  /* world: { decks:[{ y, x0, x1 }], ladderX, quarter:{ y, x0, x1 } | null }
     crew:  [{ id, status, deck (home deck index, -1 = quarterdeck), homeX }] */
  function create(world, crew, opts) {
    opts = opts || {};
    const agents = new Map();
    const deckY = d => d === -1 ? world.quarter.y : world.decks[d].y;
    const bounds = d => d === -1 ? world.quarter : world.decks[d];
    for (const c of crew) {
      const rnd = rngFrom(c.id + (opts.seed || ''));
      agents.set(c.id, { id: c.id, status: c.status, home: { deck: c.deck, x: c.homeX }, deck: c.deck, x: c.homeX + (rnd() - 0.5) * 20, y: deckY(c.deck),
        facing: 'south', act: 'stand', path: [], wait: rnd() * 2, dist: 0, rnd, errand: null, settled: false });
    }

    // waypoints from where the agent is to (deck, x): along the floor, up/down the ladder, along the floor
    function route(a, deck, x) {
      const pts = [], b = bounds(deck), tx = Math.max(b.x0, Math.min(b.x1, x));
      if (deck === a.deck || deck === -1 || a.deck === -1) pts.push({ x: tx, y: deckY(a.deck), deck: a.deck });
      else { pts.push({ x: world.ladderX, y: deckY(a.deck), deck: a.deck }); pts.push({ x: world.ladderX, y: deckY(deck), deck, climb: true }); pts.push({ x: tx, y: deckY(deck), deck }); }
      a.path = pts;
    }
    function goal(a) {
      const s = a.status;
      if (a.errand) return a.errand;
      if (s === 'running') return { deck: a.home.deck, x: a.home.x, then: 'work' };
      if (s === 'waiting-approval' || s === 'blocked' || s === 'failed' || s === 'unknown') return { deck: a.home.deck, x: a.home.x, then: 'attend' };
      if (s === 'paused' || s === 'offline') return { deck: a.home.deck, x: a.home.x, then: 'sit' };
      return null;                                                        // idle: wander
    }
    function decide(a) {
      const g = goal(a);
      if (g) { a.target = g; route(a, g.deck, g.x); a.settled = false; return; }
      // idle wander: mostly along the home deck, sometimes another deck, sometimes back to the station
      const r = a.rnd(); let deck = a.home.deck;
      if (deck >= 0 && world.decks.length > 1 && r < 0.18) deck = Math.floor(a.rnd() * world.decks.length);
      if (a.deck !== a.home.deck && r > 0.6) deck = a.home.deck;
      const b = bounds(deck), x = b.x0 + a.rnd() * (b.x1 - b.x0);
      a.target = { deck, x, then: 'look' }; route(a, deck, x); a.settled = false;
    }

    function setStatus(id, status) { const a = agents.get(id); if (a && a.status !== status) { a.status = status; a.wait = 0; a.path = []; a.settled = false; a.target = null; } }
    // a real handoff aboard: carry it to the receiver's station, then walk back
    function handoff(fromId, toId) {
      const a = agents.get(fromId), to = agents.get(toId); if (!a || !to || a.errand) return false;
      a.errand = { deck: to.home.deck, x: to.home.x + (to.home.x > a.home.x ? -16 : 16), then: 'deliver', to: toId };
      a.target = a.errand; a.wait = 0; a.settled = false; route(a, a.errand.deck, a.errand.x); return true;
    }

    function step(dt) {
      for (const a of agents.values()) {
        if (!a.path.length) {
          if (!a.settled && a.target) {   // arrived: take up the pose the goal asked for
            const t = a.target.then; a.settled = true;
            a.act = t === 'work' ? 'work' : t === 'sit' ? 'sit' : t === 'attend' ? 'attend' : 'stand';
            a.facing = t === 'work' ? 'north' : t === 'look' ? ['south', 'east', 'west', 'south'][Math.floor(a.rnd() * 4)] : 'south';
            if (t === 'deliver') { a.errand = null; a.act = 'stand'; a.facing = a.x < agents.get(a.target.to).x ? 'east' : 'west'; a.wait = 1.4; a.settled = false; a.target = null; continue; }
            a.wait = t === 'look' ? 2 + a.rnd() * 5 : 0;
          }
          if (a.settled && goal(a) && a.act !== 'stand') continue;                // holding a status pose
          a.wait -= dt; if (a.wait > 0 && !(goal(a) && !a.settled)) continue;      // only idle crew linger before moving
          decide(a); continue;
        }
        const p = a.path[0], climbing = !!p.climb, sp = (climbing ? CLIMB : WALK) * dt;
        const dx = p.x - a.x, dy = p.y - a.y, d = Math.hypot(dx, dy);
        a.act = climbing ? 'climb' : 'walk';
        a.facing = climbing ? 'north' : dx > 0.3 ? 'east' : dx < -0.3 ? 'west' : a.facing;
        if (d <= sp) { a.x = p.x; a.y = p.y; a.deck = p.deck; a.dist += d; a.path.shift(); }
        else { a.x += dx / d * sp; a.y += dy / d * sp; a.dist += sp; }
      }
    }
    // what to draw: frame track and index, for StarNet-format skins
    function frameOf(a, t) {
      if (a.act === 'walk') return { track: 'walk', dir: a.facing, i: Math.floor(a.dist / STRIDE) % 6 };
      if (a.act === 'climb') return { track: 'walk', dir: 'north', i: Math.floor(a.dist / (STRIDE * 0.8)) % 6 };
      if (a.act === 'work') return { track: 'type', dir: 'north', i: Math.floor(t / 170) % 4 };
      if (a.act === 'sit') return { track: 'sit', dir: 'south', i: 0 };
      return { track: 'rot', dir: a.facing, i: 0 };
    }
    return { agents, step, setStatus, handoff, frameOf, route };
  }

  return { create, WALK, CLIMB };
});
