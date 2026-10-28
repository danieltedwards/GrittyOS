'use strict';
// node plugins/gritty-os/test/model.test.js
const assert = require('assert');
const M = require('../ui/gritty-os-model.js');
const now = Date.UTC(2026, 9, 28, 12);
const H = 36e5;

// every runstore reason and line-job status gets a real label, not "unclassified"
for (const reason of ['done', 'max_iters', 'budget', 'cancelled', 'error', 'empty', 'refusal', 'clarifying', 'interrupted'])
  assert.ok(!/unclassified|unknown/.test(M.state({ reason, ts: now })), reason);
for (const status of ['running', 'delivered', 'problem', 'stopped', 'failed', 'interrupted'])
  assert.ok(!/unclassified|unknown/.test(M.state({ status })), status);
assert.strictEqual(M.state({ status: 'delivered' }), 'completed');
assert.ok(M.isFailure({ reason: 'interrupted' }));

// an interrupted run with unbooked spend is unknown cost, never $0
const c = M.usd([{ runId: 'a', usd: 0.5 }, { runId: 'a', usd: 0.5 }, { runId: 'b', usd: 0, spendUnknown: true }, { runId: 'c', unmetered: true }, { runId: 'd' }]);
assert.deepStrictEqual(c, { amount: 0.5, unknown: 2, subscription: 1, count: 4 });

const snapshot = {
  at: now,
  agents: [{ id: 'chief', name: 'Chief' }, { id: 'designer', name: 'Designer' }, { id: 'stray', name: 'Stray' }],
  runs: [
    { runId: 'r1', agentId: 'designer', reason: 'done', usd: 1, ts: now - 2 * H },
    { runId: 'r2', agentId: 'designer', reason: 'error', usd: 2, ts: now - 1 * H },
    { runId: 'r3', agentId: 'designer', reason: 'done', usd: 4, ts: now - 3 * 24 * H, businessId: 'etsy:68552376' },
    { runId: 'r4', agentId: 'stray', reason: 'done', usd: 8, ts: now - H }
  ],
  jobs: [{ id: 'job-aaaaaaaa', line: 'p343', status: 'delivered', startedAt: now - H }, { id: 'job-bbbbbbbb', line: 'p999', status: 'problem', startedAt: now }],
  outputs: []
};
const etsy = M.scope(snapshot, 'etsy', '');
assert.strictEqual(etsy.latest.get('designer').runId, 'r2', 'latest is by time, not array order');
assert.strictEqual(etsy.spend.day.amount, 3);
assert.strictEqual(etsy.spend.week.amount, 7);
assert.strictEqual(etsy.failures.length, 1);
assert.ok(etsy.missing.includes('drafter'), 'listed-but-absent agents are reported');
assert.strictEqual(M.scope(snapshot, 'etsy', 'etsy:68552376').runs.length, 1);

// nothing silently disappears: the stray agent and the unlisted line land in Unmapped
assert.ok(M.hasUnmapped(snapshot));
const un = M.scope(snapshot, 'unmapped', '');
assert.deepStrictEqual(un.agents.map((a) => a.id), ['stray']);
assert.deepStrictEqual(un.runs.map((r) => r.runId), ['r4']);
assert.deepStrictEqual(un.jobs.map((j) => j.id), ['job-bbbbbbbb']);
assert.strictEqual(un.missing.length, 0);

assert.ok(M.safeFile('/api/file?p=x') && M.safeFile('/workshop-run/a/b/c.png'));
assert.ok(!M.safeFile('//evil/api/file') && !M.safeFile('https://x/api/file') && !M.safeFile('/api/save'));
assert.ok(M.safeLink('https://www.etsy.com/shop/x') && !M.safeLink('javascript:alert(1)'));
console.log('gritty-os model: ok');
