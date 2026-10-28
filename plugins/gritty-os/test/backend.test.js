'use strict';
// node plugins/gritty-os/test/backend.test.js — the read-only backend against a throwaway workspace
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const { makeReader } = require('../index.js')._test;
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gos-'));
const now = Date.UTC(2026, 9, 28, 12), H = 36e5;
const w = (name, v) => fs.writeFileSync(path.join(root, name), typeof v === 'string' ? v : JSON.stringify(v));

const lines = [];
for (let i = 0; i < 1200; i++) lines.push(JSON.stringify({ runId: 'r' + i, agentId: 'designer', reason: 'done', usd: 0.01, ts: now - (1200 - i) * 60e3, lineId: i % 2 ? 'p343' : undefined }));
lines.push(JSON.stringify({ runId: 'int', agentId: 'chief', reason: 'interrupted', usd: 0, spendUnknown: true, ts: now - 2 * H }));
lines.push('{"runId":"torn","agentId":');                                   // a half-written line must not break the read
lines.push(JSON.stringify({ runId: 'int', agentId: 'chief', reason: 'error', ts: now - H }));   // its recovery row
lines.push(JSON.stringify({ runId: 'art', agentId: 'designer', reason: 'done', ts: now, artifacts: [{ path: 'out/a.png' }, { path: '../../secret.txt' }, { path: 'x.exe' }] }));
w('runs.jsonl', lines.join('\n') + '\n');
fs.mkdirSync(path.join(root, 'designer', 'out'), { recursive: true });
fs.writeFileSync(path.join(root, 'designer', 'out', 'a.png'), Buffer.from([137, 80, 78, 71]));
fs.writeFileSync(path.join(root, 'secret.txt'), 'nope');
w('agent.save.json', { doc: { agents: [{ id: 'designer', name: 'Designer', apiKey: 'sk-should-not-leak' }] } });
w('budget.json', { version: 1, caps: { perDay: 5 } });
w('ledger.jsonl', [{ runId: 'a', usd: 1.5, ts: now - H }, { runId: 'b', usd: 9, ts: now - 2 * 864e5 }].map((r) => JSON.stringify(r)).join('\n'));
w('cron.jobs.json', { version: 1, jobs: [{ id: 'c1', name: 'Scan', agentId: 'designer', prompt: 'private prompt', enabled: true }] });
w('line-spend.json', { version: 1, lines: { p343: { day: Math.floor(now / 864e5), usd: 0.7 }, p999: { day: 1, usd: 4 } } });
w('line-jobs.json', { version: 1, jobs: [{ id: 'job-aaaaaaaa', line: 'p343', status: 'delivered', startedAt: now, runs: [{}, {}] }] });

const R = makeReader(root, () => now), read = (route) => R.read({ route });

// paging: 500 + 500 + the rest, newest first, with the interrupted chain collapsed to one row
const p1 = read('/api/runs?agent=*&limit=500');
assert.strictEqual(p1.status, 200); assert.strictEqual(p1.body.runs.length, 500); assert.ok(p1.body.nextCursor);
assert.strictEqual(p1.body.runs[0].runId, 'art');
const all = [...p1.body.runs];
for (let cur = p1.body.nextCursor; cur;) { const p = read(`/api/runs?agent=*&limit=500&through=1&beforeRunId=${cur}`); all.push(...p.body.runs); cur = p.body.nextCursor; }
assert.strictEqual(all.length, 1202);
const int = all.filter((r) => r.runId === 'int');
assert.strictEqual(int.length, 1); assert.strictEqual(int[0].reason, 'error'); assert.strictEqual(int[0].ts, now - 2 * H); assert.strictEqual(int[0].spendUnknown, true);
assert.strictEqual(read('/api/runs?agent=*&limit=5&beforeRunId=gone').status, 410);

assert.ok(!JSON.stringify(read('/api/save?agent=agent').body).includes('sk-should-not-leak'), 'only allowlisted agent fields leave');
const b = read('/api/budget/status').body;
assert.strictEqual(b.caps.perDay, 5); assert.strictEqual(b.atLeast.today, 1.5); assert.strictEqual(b.spentToday, null);
const c = read('/api/cron').body;
assert.strictEqual(c.jobs.length, 1); assert.ok(!('prompt' in c.jobs[0]), 'routine prompts stay private'); assert.ok(!('enabled' in c), 'scheduler state is not guessed');
const ls = read(`/api/routing/lines/stats?since=${now - 3 * H}`).body.lines;
const p343 = ls.find((l) => l.lineId === 'p343');
assert.strictEqual(p343.usdToday, 0.7); assert.strictEqual(p343.shipped, null); assert.ok(p343.runs > 0);
assert.ok(!ls.some((l) => l.lineId === 'p999'), 'an old day bucket is not today');
assert.strictEqual(read('/api/line-jobs?limit=100').body.jobs[0].steps, 2);

const items = read('/api/deliverables?limit=100').body.items.filter((o) => o.runId === 'art');
assert.strictEqual(items.length, 3);
const f = (i) => read(items[i].files[0].openUrl);
assert.strictEqual(f(0).status, 200); assert.strictEqual(f(0).mime, 'image/png');
assert.strictEqual(f(1).status, 403, 'an artifact path that climbs out of the workspace is refused');
assert.strictEqual(f(2).status, 403, 'unlisted file types are refused');
assert.strictEqual(read('/api/file?agent=designer&path=out/a.png&record=r1').status, 404, 'only a run\'s own artifacts open');

for (const bad of ['/api/settings', '/api/run', '/plugin-ui/x', 'https://evil.example/api/save', '/api/save?agent=other'])
  assert.strictEqual(read(bad).status, 403, bad);
fs.rmSync(root, { recursive: true, force: true });
console.log('gritty-os backend: ok');
