'use strict';
// Run: node gritty/fleet/test/fleet-model.test.js
const assert = require('node:assert/strict');
const M = require('../fleet-model.js');
const F = require('../fleet-fixture.js');

const T0 = 1792080000000;

// --- sea state: evidence → weather ---
{
  const ev = F.evidence(T0);
  const etsy = M.seaStateFor('etsy', ev);
  assert.equal(etsy.level, 'trouble', 'an open blocking failure outranks a pending approval');
  assert.equal(etsy.attackers, 1);
  assert.deepEqual(etsy.reasons.map(r => r.id), ['f-7', 'ap-1'], 'trouble first, then attention');
  assert.deepEqual(etsy.history.map(h => h.id), ['f-2'], 'a resolved failure is history, not an attack');
  assert.equal(M.seaStateFor('operations', ev).level, 'unknown', 'missing data is never calm water');
  assert.equal(M.seaStateFor('services', ev).level, 'calm');
}
{
  const nonBlocking = [{ id: 'x', kind: 'failure', deptId: 'etsy', state: 'open', blocking: false, at: T0 }];
  const s = M.seaStateFor('etsy', nonBlocking);
  assert.equal(s.level, 'calm', 'a non-blocking failure does not start an attack');
  assert.equal(s.history.length, 1);
}
{
  const many = Array.from({ length: 7 }, (_, i) => ({ id: 'f' + i, kind: 'failure', deptId: 'etsy', state: 'open', blocking: true, at: T0 }));
  assert.equal(M.seaStateFor('etsy', many).attackers, M.MAX_ATTACKERS, 'attackers are capped');
}
{
  const approvalOnly = [{ id: 'a', kind: 'approval', deptId: 'etsy', state: 'open', at: T0 }];
  assert.equal(M.seaStateFor('etsy', approvalOnly).level, 'attention');
  const resolved = [{ id: 'a', kind: 'approval', deptId: 'etsy', state: 'resolved', at: T0 }];
  assert.equal(M.seaStateFor('etsy', resolved).level, 'calm', 'a resolved approval stops the cannon fire');
}

// --- handoff ropes ---
{
  const ev = [
    { id: 'h1', kind: 'handoff', from: 'operations', to: 'etsy', at: T0 - 1000 },
    { id: 'h1', kind: 'handoff', from: 'operations', to: 'etsy', at: T0 - 500 },     // duplicate delivery
    { id: 'h2', kind: 'handoff', from: 'etsy', to: 'etsy', at: T0 - 500 },           // same ship
    { id: 'h3', kind: 'handoff', from: 'etsy', to: 'lab', at: T0 - 120000 },         // too old
    { id: 'h4', kind: 'handoff', from: 'lab', to: 'etsy', at: T0 + 5000 }             // future timestamp
  ];
  const ropes = M.activeHandoffs(ev, T0, 60000);
  assert.deepEqual(ropes.map(r => r.id), ['h1']);
}

// --- fleet assembly from the real roster shape ---
{
  const fleet = M.buildFleet({ departments: F.departments, roster: F.roster, evidence: F.evidence(T0) });
  assert.equal(fleet.length, 5);
  assert.equal(fleet.reduce((n, s) => n + s.crew.length, 0), 28, 'every agent in the export is on exactly one ship');
  const counts = Object.fromEntries(fleet.map(s => [s.id, s.crew.length]));
  assert.deepEqual(counts, { operations: 7, etsy: 5, services: 6, youtube: 7, lab: 3 }, 'crew counts match the shared handoff');
  const flag = fleet.find(s => s.id === 'operations');
  assert.equal(flag.flagship, true);
  assert.equal(flag.crew.find(c => c.id === 'agent').rank, 'admiral');
  assert.equal(fleet.find(s => s.id === 'etsy').crew.find(c => c.id === 'drafter').rank, 'captain');
  assert.equal(fleet.find(s => s.id === 'lab').captainId, null, 'no captain is invented for Market Lab');
  assert.equal(fleet.find(s => s.id === 'services').laidUp, true);
  assert.equal(fleet.find(s => s.id === 'etsy').laidUp, false);
}

// --- clicks map to existing entry points and never to anything that starts work ---
{
  assert.deepEqual(M.targetFor({ kind: 'ship', deptId: 'etsy' }), { fn: 'GrittyOS.open', args: ['etsy'] });
  assert.deepEqual(M.targetFor({ kind: 'conveyor', deptId: 'etsy' }), { fn: 'GrittyOS.openWork', args: ['etsy'] });
  assert.deepEqual(M.targetFor({ kind: 'hold', deptId: 'etsy' }), { fn: 'GrittyOS.openOutputs', args: ['etsy'] });
  assert.deepEqual(M.targetFor({ kind: 'crew', agentId: 'designer' }, 'workboard'), { fn: 'GrittyOS.openAgent', args: ['designer'] });
  assert.deepEqual(M.targetFor({ kind: 'crew', agentId: 'designer' }, 'dossier'), { fn: 'StationUI.showAgent', args: ['designer', 'brief'] });
  assert.deepEqual(M.targetFor({ kind: 'crew', agentId: 'designer' }, 'operations'), { fn: 'StationUI.showAgent', args: ['designer', 'config'] });
  assert.equal(M.targetFor({ kind: 'crew', agentId: 'designer' }, 'ask').fn, 'choose');
  assert.equal(M.targetFor({ kind: 'alert', deptId: 'etsy', ref: 'approval:ap-1' }).focus, 'approval:ap-1');
  assert.equal(M.targetFor({ kind: 'nonsense' }), null);
}
{
  const calls = [];
  const host = { GrittyOS: { openWork(d) { calls.push(['openWork', d]); } } };
  assert.deepEqual(M.invoke(host, { fn: 'GrittyOS.openWork', args: ['etsy'] }), { ok: true, fn: 'GrittyOS.openWork' });
  assert.deepEqual(calls, [['openWork', 'etsy']]);
  assert.equal(M.invoke(host, { fn: 'GrittyOS.openOutputs', args: ['etsy'] }).reason, 'missing', 'a missing entry point is reported, not thrown');
  assert.equal(M.invoke({}, { fn: 'choose', args: ['x'] }).reason, 'needs-choice');
  const throwing = { GrittyOS: { open() { throw new Error('boom'); } } };
  assert.equal(M.invoke(throwing, { fn: 'GrittyOS.open', args: ['etsy'] }).reason, 'threw');
}

// --- effect pacing ---
{
  const p = M.createPacer(5000);
  assert.equal(p.allow('etsy', 0), true);
  assert.equal(p.allow('etsy', 1000), false);
  assert.equal(p.allow('lab', 1000), true, 'pacing is per ship');
  assert.equal(p.allow('etsy', 5000), true);
}

console.log('fleet-model.test: OK');
