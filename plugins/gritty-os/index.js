'use strict';
/* GRITTY OS backend: a local, read-only projection of StarNet's own workspace files for the GRITTY OS window.
   No credentials, network requests, schedules, tools or write handlers. The window asks for API-shaped routes
   (starnet.backend.call('read', { route })); only the routes below are answered, everything else is refused.

   The plugin lives at <workspaces>/plugins/<id>/, so the workspace root is two folders up: no hardcoded user path. */
const fs = require('fs'), path = require('path');

const RUN_TAIL_BYTES = 16 * 1024 * 1024;   // newest part of runs.jsonl that is read
const MAX_RUNS = 2000, MAX_PAGE = 500, MAX_FILE = 8 * 1024 * 1024;
const DAY = 864e5;
const RUN_FIELDS = ['runId', 'agentId', 'provider', 'reason', 'turns', 'tokens', 'usd', 'title', 'sessionTitle', 'streamId', 'model',
  'unmetered', 'spendUnknown', 'startedAt', 'endedAt', 'durationMs', 'ts', 'failureCode', 'failureStage', 'businessId', 'lineId',
  'dockId', 'stepTest', 'completionEvidence'];
const FAILED_REASONS = ['error', 'refusal', 'max_iters', 'budget'];   // as sidecar/routing/line-stats.js counts a failed line run
const FILE_TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.pdf': 'application/pdf', '.zip': 'application/zip', '.md': 'text/plain;charset=utf-8', '.markdown': 'text/plain;charset=utf-8',
  '.csv': 'text/plain;charset=utf-8', '.txt': 'text/plain;charset=utf-8', '.json': 'text/plain;charset=utf-8' };

const reply = (body, status = 200) => ({ status, body });
const pick = (row, keys) => Object.fromEntries(keys.filter((k) => row[k] !== undefined).map((k) => [k, row[k]]));
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

function makeReader(root, clock = () => Date.now()) {
  const file = (name) => path.join(root, name);
  function json(name) {
    // StarNet keeps a .bak last-known-good beside its stores: fall back to it if the main file is torn mid-write
    for (const f of [file(name), file(name) + '.bak']) {
      try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { if (e.code !== 'ENOENT' && !(e instanceof SyntaxError)) throw e; }
    }
    return null;
  }
  // newest-tail lines of a JSONL file; a torn or corrupt line is skipped, never fatal
  function jsonl(name, tail) {
    let text;
    try {
      const fd = fs.openSync(file(name), 'r');
      try {
        const size = fs.fstatSync(fd).size, start = Math.max(0, size - tail), buf = Buffer.alloc(size - start);
        fs.readSync(fd, buf, 0, buf.length, start);
        text = buf.toString('utf8');
        if (start) text = text.slice(text.indexOf('\n') + 1);
      } finally { fs.closeSync(fd); }
    } catch (e) { if (e.code === 'ENOENT') return []; throw e; }
    const rows = [];
    for (const line of text.split(/\r?\n/)) { if (!line) continue; try { const r = JSON.parse(line); if (r && typeof r === 'object') rows.push(r); } catch {} }
    return rows;
  }

  // runs.jsonl, re-read only when it changes. An interrupted run's recovery appends newer rows with the same runId:
  // show ONE row with the newest content at the first row's time, the way StarNet's own run list does.
  let cache = { key: '', rows: [] };
  function runs() {
    let st; try { st = fs.statSync(file('runs.jsonl')); } catch (e) { if (e.code === 'ENOENT') return []; throw e; }
    const key = st.size + ':' + st.mtimeMs;
    if (cache.key === key) return cache.rows;
    const byId = new Map(), order = [];
    for (const r of jsonl('runs.jsonl', RUN_TAIL_BYTES)) {
      if (!r.runId) continue;
      const prev = byId.get(r.runId);
      if (!prev) { byId.set(r.runId, r); order.push(r.runId); } else byId.set(r.runId, Object.assign({}, prev, r, { ts: prev.ts }));
    }
    const rows = order.map((id) => byId.get(id)).sort((a, b) => num(b.ts) - num(a.ts)).slice(0, MAX_RUNS);
    cache = { key, rows };
    return rows;
  }

  function runsRoute(u) {
    const all = runs(), limit = Math.max(1, Math.min(MAX_PAGE, Number(u.searchParams.get('limit')) || 100));
    const before = u.searchParams.get('beforeRunId') || '';
    let start = 0;
    if (before) { const i = all.findIndex((r) => r.runId === before); if (i < 0) return reply({ error: 'cursor no longer in the loaded history' }, 410); start = i + 1; }
    const page = all.slice(start, start + limit);
    const more = start + limit < all.length;
    return reply({ runs: page.map((r) => pick(r, RUN_FIELDS)), nextCursor: more && page.length ? page[page.length - 1].runId : '', snapshotAt: clock() });
  }

  function save() { const r = json('agent.save.json') || {}; return r.doc || r.save || r; }

  // run artifacts as outputs (Workshop-only builds stay in StarNet's own Deliverables window)
  function outputs() {
    const out = [];
    for (const r of runs()) {
      for (const [i, a] of (r.artifacts || []).entries()) {
        if (!a || !a.path) continue;
        out.push({ id: 'run:' + r.runId + ':' + i, agentId: r.agentId, runId: r.runId, title: path.basename(a.path), source: 'run',
          status: r.reason === 'done' ? 'produced' : 'partial', createdAt: r.ts, updatedAt: r.ts, businessId: r.businessId || null,
          files: [{ path: a.path, bytes: Number.isFinite(a.bytes) ? a.bytes : null,
            openUrl: '/api/file?agent=' + encodeURIComponent(r.agentId) + '&path=' + encodeURIComponent(a.path) + '&record=' + encodeURIComponent(r.runId) }] });
        if (out.length >= 100) return out;
      }
    }
    return out;
  }

  // the trailing-24h sum StarNet's ledger calls usdForDay. An interrupted run's charge may not be booked yet, so this is a floor.
  function budget() {
    const b = json('budget.json') || {}, caps = (b.caps && typeof b.caps === 'object') ? b.caps : {};
    let spentToday = null;
    try { const since = clock() - DAY; spentToday = jsonl('ledger.jsonl', 4 * 1024 * 1024).filter((r) => num(r.ts) > since).reduce((s, r) => s + num(r.usd), 0); } catch {}
    return reply({ caps: { perDay: caps.perDay, perRun: caps.perRun, perAgent: caps.perAgent, global: caps.global },
      spentToday: null, atLeast: spentToday == null ? null : { today: Math.round(spentToday * 1e6) / 1e6 }, source: 'files' });
  }

  // scheduled routines as saved. Whether the scheduler is armed lives only in the running station, so `enabled` is left out.
  function cron() {
    const raw = json('cron.jobs.json'), jobs = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.jobs) ? raw.jobs : []);
    return reply({ jobs: jobs.filter((j) => j && j.id).map((j) => pick(j, ['id', 'name', 'agentId', 'runsLine', 'scheduleDisplay', 'enabled', 'state',
      'nextRunAt', 'lastRunAt', 'lastStatus', 'lastReason'])), source: 'files' });
  }

  // today's runs per line from the run log; spend from the line ledger (UTC day). Shipped needs the live routing plan: left null.
  function lineStats(u) {
    const q = Number(u.searchParams.get('since')), now = clock(), since = q > 0 && q <= now ? q : now - (now % DAY);
    const by = new Map();
    for (const r of runs()) {
      if (!r.lineId || num(r.ts) <= since || r.stepTest === true) continue;
      const L = by.get(r.lineId) || { lineId: String(r.lineId), runs: 0, shipped: null, failed: 0, usdToday: null, capUsdPerDay: null };
      L.runs++; if (FAILED_REASONS.includes(r.reason)) L.failed++;
      by.set(r.lineId, L);
    }
    const spend = json('line-spend.json'), buckets = spend && typeof spend === 'object' ? (spend.lines || spend) : {}, today = Math.floor(now / DAY);
    for (const [id, b] of Object.entries(buckets || {})) {
      if (!b || b.day !== today) continue;
      const L = by.get(id) || { lineId: id, runs: 0, shipped: null, failed: 0, usdToday: null, capUsdPerDay: null };
      L.usdToday = num(b.usd); by.set(id, L);
    }
    return reply({ since, lines: [...by.values()], source: 'files' });
  }

  function lineJobs() {
    const j = json('line-jobs.json') || {}, list = Array.isArray(j.jobs) ? j.jobs : (j.value && Array.isArray(j.value.jobs) ? j.value.jobs : []);
    return reply({ jobs: list.slice().sort((a, b) => num(b.startedAt) - num(a.startedAt)).slice(0, 100).map((r) => ({ id: r.id, line: r.line, name: r.name,
      status: r.status, startedAt: r.startedAt, endedAt: r.endedAt, usd: r.usd, steps: Array.isArray(r.runs) ? r.runs.length : undefined,
      preview: String(r.output || '').slice(0, 1500), error: r.error, retryOf: r.retryOf, text: String(r.text || '').slice(0, 240), businessId: r.businessId || null })) });
  }

  // one recorded artifact of a loaded run, jailed to that run's workspace, by an allowlisted type
  function fileRoute(u) {
    const agent = u.searchParams.get('agent') || '', want = u.searchParams.get('path') || '', runId = u.searchParams.get('record') || '';
    if (!/^[a-z0-9_-]{1,64}$/i.test(agent)) return reply({ error: 'Invalid agent' }, 400);
    const row = runs().find((r) => r.runId === runId && r.agentId === agent && (r.artifacts || []).some((a) => a && a.path === want));
    if (!row) return reply({ error: 'File is not an artifact of a loaded run' }, 404);
    const ext = path.extname(want).toLowerCase(), mime = FILE_TYPES[ext];
    if (!mime) return reply({ error: 'This file type is not exposed by the dashboard; use StarNet Deliverables' }, 403);
    const base = row.projectRoot ? path.resolve(row.projectRoot) : path.resolve(root, agent), target = path.resolve(base, want);
    if (!target.startsWith(base + path.sep)) return reply({ error: 'File is outside its recorded workspace' }, 403);
    try {
      const realBase = fs.realpathSync(base), real = fs.realpathSync(target);
      const inside = process.platform === 'win32' ? real.toLowerCase().startsWith((realBase + path.sep).toLowerCase()) : real.startsWith(realBase + path.sep);
      if (!inside) return reply({ error: 'File link is outside its recorded workspace' }, 403);
      if (fs.statSync(real).size > MAX_FILE) return reply({ error: 'File exceeds 8 MB; use StarNet Deliverables' }, 413);
      return { status: 200, binary: fs.readFileSync(real).toString('base64'), mime };
    } catch (e) { return reply({ error: e.code === 'ENOENT' ? 'Recorded file is missing' : 'Recorded file cannot be read' }, 404); }
  }

  function read(args) {
    const route = String((args && args.route) || '');
    if (!route.startsWith('/api/')) return reply({ error: 'Read route is not allowed' }, 403);
    const u = new URL(route, 'http://local'), p = u.pathname;
    try {
      if (p === '/api/save' && u.searchParams.get('agent') === 'agent') {
        const d = save();
        return reply({ save: { station: { rooms: d.station && d.station.rooms }, agents: (d.agents || []).map((a) => ({ id: a.id, name: a.name, role: a.role,
          purpose: a.purpose, provider: a.provider, model: a.model, approvalMode: a.approvalMode, executionProfile: a.executionProfile,
          docs: { purpose: a.docs && a.docs.purpose } })) } });
      }
      if (p === '/api/runs' && u.searchParams.get('agent') === '*') return runsRoute(u);
      if (p === '/api/line-jobs') return lineJobs();
      if (p === '/api/deliverables') return reply({ items: outputs() });
      if (p === '/api/budget/status') return budget();
      if (p === '/api/cron') return cron();
      if (p === '/api/routing/lines/stats') return lineStats(u);
      if (p === '/api/file') return fileRoute(u);
    } catch (e) { return reply({ error: 'could not read ' + p + ': ' + ((e && e.code) || (e && e.message) || e) }, 500); }
    return reply({ error: 'Read route is not allowed' }, 403);
  }
  return { read, runs };
}

const reader = makeReader(path.resolve(__dirname, '..', '..'));
module.exports = { register(api) { api.handle('read', (args) => reader.read(args)); }, _test: { makeReader } };
