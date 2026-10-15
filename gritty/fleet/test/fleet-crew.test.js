'use strict';
// Run: node gritty/fleet/test/fleet-crew.test.js
const assert = require('node:assert/strict');
const Crew = require('../fleet-crew.js');

const world = { decks: [{ y: 160, x0: 260, x1: 500 }, { y: 200, x0: 260, x1: 480 }, { y: 240, x0: 260, x1: 460 }], ladderX: 241, quarter: { y: 74, x0: 96, x1: 210 } };
const run = (sim, seconds) => { for (let i = 0; i < seconds * 20; i++) sim.step(0.05); };

// a working agent goes to its own station and sits working there, on its own deck
{
  const sim = Crew.create(world, [{ id: 'a', status: 'running', deck: 2, homeX: 400 }]);
  const a = sim.agents.get('a'); a.deck = 0; a.y = 160; a.x = 300;           // start on a different deck
  let climbed = false;
  for (let i = 0; i < 400; i++) { sim.step(0.05); if (a.act === 'climb') { climbed = true; assert.equal(Math.round(a.x), world.ladderX, 'climbing happens on the ladder'); } }
  assert.ok(climbed, 'changing decks uses the ladder');
  assert.equal(a.deck, 2); assert.equal(Math.round(a.x), 400); assert.equal(a.y, 240);
  assert.equal(a.act, 'work'); assert.deepEqual(sim.frameOf(a, 0).track, 'type');
}

// waiting on you: back at the station, standing and facing the viewer; it stays there
{
  const sim = Crew.create(world, [{ id: 'b', status: 'waiting-approval', deck: 0, homeX: 320 }]);
  run(sim, 20); const b = sim.agents.get('b');
  assert.equal(b.act, 'attend'); assert.equal(Math.round(b.x), 320); assert.equal(b.facing, 'south');
  run(sim, 20); assert.equal(Math.round(b.x), 320, 'a status pose holds');
}

// idle crew wander, but never leave the walkable floor
{
  const sim = Crew.create(world, [{ id: 'c', status: 'idle', deck: 1, homeX: 300 }]);
  const c = sim.agents.get('c'), xs = new Set();
  for (let i = 0; i < 3000; i++) {
    sim.step(0.05); xs.add(Math.round(c.x / 20));
    if (c.act !== 'climb') { const d = world.decks[c.deck]; assert.ok(c.x >= Math.min(d.x0, world.ladderX) - 0.01 && c.x <= d.x1 + 0.01, 'stays on the deck'); assert.equal(c.y, d.y, 'feet on the floor'); }
  }
  assert.ok(xs.size > 5, 'idle crew actually move around');
}

// a status change sends them where the new status says
{
  const sim = Crew.create(world, [{ id: 'd', status: 'idle', deck: 0, homeX: 450 }]);
  run(sim, 10); sim.setStatus('d', 'running'); run(sim, 30);
  const d = sim.agents.get('d'); assert.equal(d.act, 'work'); assert.equal(Math.round(d.x), 450);
}

// a handoff aboard: the sender walks to the receiver's station, then goes back to work
{
  const sim = Crew.create(world, [{ id: 'from', status: 'running', deck: 0, homeX: 280 }, { id: 'to', status: 'running', deck: 0, homeX: 460 }]);
  run(sim, 10);
  assert.equal(sim.handoff('from', 'to'), true);
  assert.equal(sim.handoff('from', 'to'), false, 'one errand at a time');
  const f = sim.agents.get('from'); let reached = 0;
  for (let i = 0; i < 600; i++) { sim.step(0.05); reached = Math.max(reached, f.x); }
  assert.ok(reached > 430, 'walked over to the receiver');
  assert.equal(f.act, 'work'); assert.equal(Math.round(f.x), 280, 'and back to its own station');
}

// walk frames advance with distance, so feet do not slide
{
  const sim = Crew.create(world, [{ id: 'e', status: 'running', deck: 0, homeX: 480 }]);
  const e = sim.agents.get('e'); e.x = 260; const seen = new Set();
  for (let i = 0; i < 40; i++) { sim.step(0.05); const f = sim.frameOf(e, 0); if (f.track === 'walk') { seen.add(f.i); assert.equal(f.dir, 'east'); } }
  assert.equal(seen.size, 6, 'all six walk frames are used');
}

console.log('fleet-crew.test: OK');
