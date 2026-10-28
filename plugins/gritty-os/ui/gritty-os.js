/* GRITTY OS window: read-only department views over StarNet records.
   Runs inside a sandboxed StarNet plugin frame, so it only talks to the station through the `starnet` bridge
   (Harness.apiFetch → starnet.backend.call('read')). It never starts, retries or approves anything. */
(() => {
  'use strict';
  const M = GrittyOSModel;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const btn = (label, action, id = '', cls = '') => `<button class="sn-btn ${cls}" data-action="${action}" data-id="${esc(id)}">${esc(label)}</button>`;
  const badge = (state) => `<span class="sn-badge ${M.tone(state)}">${esc(state)}</span>`;
  const stamp = (t) => (t ? new Date(t).toLocaleString() : 'Unavailable');
  const RUN_PAGE = 500, RUN_PAGES = 4;   // up to 2000 runs of history, newest first
  const AUTO = { off: 0, '30s': 30e3, '1m': 60e3, '5m': 300e3 };

  let snapshot = {}, view = { tab: 'overview', business: '', detail: null, runFilter: 'all', query: '' }, back = [];
  let loading = false, generation = 0, previewUrl = null, timer = null, prefs = { auto: '1m', tab: 'overview' };
  const app = document.getElementById('app') || document.body.appendChild(document.createElement('main'));

  // ---------- data ----------
  async function get(url) {
    const r = await Harness.apiFetch(url);
    if (!r.ok) throw Error(`request failed (${r.status})`);
    return r.json();
  }
  // Page the run log with the same snapshot watermark so a run that lands mid-read can't shift the pages.
  async function getRuns() {
    const first = await get(`/api/runs?agent=*&limit=${RUN_PAGE}`);
    const runs = first.runs || [];
    let cursor = first.nextCursor, through = first.snapshotAt, pages = 1, pageError = null;
    while (cursor && pages < RUN_PAGES) {
      try {
        const next = await get(`/api/runs?agent=*&limit=${RUN_PAGE}&through=${encodeURIComponent(through || '')}&beforeRunId=${encodeURIComponent(cursor)}`);
        runs.push(...(next.runs || []));
        cursor = next.nextCursor; pages++;
      } catch (e) { pageError = e.message; break; }
    }
    return { runs, truncated: !!cursor, pageError };
  }

  async function refresh() {
    if (loading) return;
    loading = true;
    const g = ++generation;
    if (!snapshot.at) app.innerHTML = '<p class="sn-loading">Reading StarNet records…</p>';
    else setStatus('Refreshing…');
    const sources = {
      save: () => get('/api/save?agent=agent'),
      runs: getRuns,
      jobs: () => get('/api/line-jobs?limit=100'),
      outputs: () => get('/api/deliverables?limit=100'),
      budget: () => get('/api/budget/status'),
      providers: () => get('/api/providers'),
      cron: () => get('/api/cron'),
      lineStats: () => get(`/api/routing/lines/stats?since=${new Date().setHours(0, 0, 0, 0)}`)
    };
    const entries = await Promise.all(Object.entries(sources).map(async ([k, fn]) => {
      try { return [k, { data: await fn() }]; } catch (e) { return [k, { error: e.message }]; }
    }));
    loading = false;
    if (g !== generation) return;
    const raw = Object.fromEntries(entries), doc = raw.save.data?.save;
    const errors = entries.filter(([, v]) => v.error).map(([k, v]) => `${k}: ${v.error}`);
    if (raw.runs.data?.pageError) errors.push(`older runs: ${raw.runs.data.pageError}`);
    snapshot = {
      agents: doc?.agents || [], station: doc?.station,
      runs: raw.runs.data?.runs || [], runSourceAvailable: !raw.runs.error, truncated: !!raw.runs.data?.truncated,
      jobs: raw.jobs.data?.jobs || [], outputs: raw.outputs.data?.items || [],
      budget: raw.budget.data, providers: raw.providers.data?.providers || [], cron: raw.cron.data || null, lineStats: raw.lineStats.data || null,
      errors, at: Date.now()
    };
    const y = window.scrollY;
    render();
    window.scrollTo(0, y);
  }

  function schedule() {
    clearInterval(timer);
    const ms = AUTO[prefs.auto] || 0;
    // auto-refresh only on list views: a detail (an open file preview, an expanded evidence block) stays put
    if (ms) timer = setInterval(() => { if (document.visibilityState === 'visible' && !view.detail) refresh(); }, ms);
  }
  function savePrefs() { starnet.store.set('prefs', prefs).catch(() => {}); }

  // ---------- helpers ----------
  const agentName = (id) => snapshot.agents.find((a) => M.agentIdOf(a) === id)?.name || id || '—';
  const tabs = () => ['overview', ...M.departments.map((d) => d.id), ...(M.hasUnmapped(snapshot) ? [M.UNMAPPED.id] : [])];
  const costCell = (r) => (r.unmetered ? 'subscription' : r.spendUnknown || typeof r.usd !== 'number' ? 'unknown' : M.money(r.usd));
  function setStatus(text) { const el = app.querySelector('#gos-status'); if (el) el.textContent = text; }

  function navigate(next) { back.push({ ...view }); view = { ...view, ...next }; render(); app.scrollTop = 0; window.scrollTo(0, 0); }

  // ---------- render ----------
  function render() {
    if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
    if (!snapshot.at) return;
    const d = view.tab === 'overview' ? null : M.department(view.tab);
    starnet.ui.setTitle(view.detail ? 'details' : d ? d.name : 'overview').catch(() => {});
    const now = Date.now();
    let html = `<nav class="sn-tabs" role="tablist">${tabs().map((t) => {
      const on = t === view.tab && !view.detail;
      return `<button class="sn-tab ${on ? 'on' : ''}" role="tab" aria-selected="${on}" data-action="tab" data-id="${esc(t)}">${esc(t === 'overview' ? 'Overview' : M.department(t).name)}</button>`;
    }).join('')}</nav>
    <div class="sn-row-flex gos-bar">
      ${view.detail || back.length ? btn('◂ Back', 'back', '', 'xs') : ''}
      <span class="sn-muted" id="gos-status">Refreshed ${esc(M.ago(snapshot.at, now))} · read-only</span>
      <span class="sn-spacer"></span>
      <label class="sn-muted">Auto <select class="sn-select" id="gos-auto">${Object.keys(AUTO).map((k) => `<option ${k === prefs.auto ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
      ${btn('Refresh', 'refresh', '', 'xs')}
    </div>`;
    if (snapshot.errors.length) html += `<p class="sn-error">Unavailable: ${snapshot.errors.map(esc).join(' · ')}. Missing data is not zero.</p>`;
    if (view.detail) html += detail();
    else if (!d) html += overview(now);
    else html += department(d, now);
    app.innerHTML = html;
    if (view.detail?.[0] === 'file') showFile(view.detail[1]);
  }

  function overview(now) {
    const b = snapshot.budget || {}, cap = b.caps?.perDay;
    const today = b.spentToday ?? b.atLeast?.today ?? null, floor = b.spentToday == null && b.atLeast;
    const pct = cap > 0 && today != null ? Math.min(100, (today / cap) * 100) : null;
    const sp = M.spend(snapshot.runs, now), fails24 = snapshot.runs.filter((r) => M.when(r) >= now - M.DAY && M.isFailure(r)).length;
    const pending = snapshot.outputs.filter((o) => o.status === 'pending').length;
    let html = `<div class="sn-stats">
      <div class="sn-stat ${pct >= 90 ? 'bad' : pct >= 70 ? 'warn' : ''}"><b>${today == null ? 'Unknown' : (floor ? '≥ ' : '') + M.money(today)}</b><span>Spent today (ledger)${cap ? ' of ' + M.money(cap) + ' cap' : ''}</span>${pct == null ? '' : `<div class="sn-progress"><i style="width:${pct.toFixed(1)}%"></i></div>`}</div>
      <div class="sn-stat"><b>${snapshot.runSourceAvailable ? M.money(sp.week.amount) : 'Unavailable'}</b><span>Metered run cost, last 7 days</span></div>
      <div class="sn-stat ${fails24 ? 'bad' : 'ok'}"><b>${fails24}</b><span>Failed runs, last 24h</span></div>
      <div class="sn-stat ${pending ? 'warn' : ''}"><b>${pending}</b><span>Outputs waiting for review</span></div>
      <div class="sn-stat"><b>${snapshot.agents.length}</b><span>Agent profiles</span></div>
    </div>
    <p class="sn-hint">${sp.week.subscription} subscription runs carry no dollar figure; ${sp.week.unknown} runs this week have unknown cost. ${b.unsettled?.length ? `<span class="gos-warn">${b.unsettled.length} interrupted run(s) have unsettled spend in SPENDING LIMITS.</span> ` : ''}${snapshot.truncated ? `History covers the newest ${snapshot.runs.length} runs.` : `History covers all ${snapshot.runs.length} runs.`} Revenue and orders are not connected.</p>
    <div class="sn-sect">Departments</div><div class="sn-grid">`;
    for (const d of [...M.departments, ...(M.hasUnmapped(snapshot) ? [M.UNMAPPED] : [])]) {
      const s = M.scope(snapshot, d.id, ''), last = s.runs[0];
      const fails = s.runs.filter((r) => M.when(r) >= now - 7 * M.DAY && M.isFailure(r)).length;
      html += `<article class="sn-card gos-click" data-action="tab" data-id="${esc(d.id)}" tabindex="0">
        <div class="sn-row-flex"><h3>${esc(d.name)}</h3><span class="sn-spacer"></span><span class="sn-badge">${esc(d.status)}</span></div>
        <p>${s.agents.length} agents · ${s.jobs.length} line jobs · ${s.outputs.length} outputs</p>
        <p class="sn-muted">7d: ${M.money(s.spend.week.amount)} metered · <span class="${fails ? 'gos-bad' : ''}">${fails} failed</span><br>Last activity: ${last ? esc(M.ago(M.when(last), now)) + ' · ' + esc(agentName(last.agentId)) : 'none recorded'}</p>
        ${s.missing.length ? `<p class="gos-warn">${s.missing.length} of ${d.agents.length} listed agents not in this station</p>` : ''}
      </article>`;
    }
    html += `</div><div class="sn-sect">Provider connections</div><div class="sn-row-flex">${snapshot.providers.filter((p) => p.configured).map((p) => `<span class="sn-badge ok">${esc(p.name || p.id)}</span>`).join('') || '<span class="sn-empty">None configured</span>'}</div>
    <p class="sn-hint">A configured credential does not prove balance, entitlement or model quality. This window never starts an agent.</p>`;
    const cron = snapshot.cron;
    if (cron) {
      const jobs = cron.jobs || [], failing = jobs.filter((j) => M.scheduleState(j) === 'failed').length;
      html += `<div class="sn-sect">Schedules</div><p>${jobs.length} routines · ${jobs.filter((j) => M.scheduleState(j) === 'scheduled').length} scheduled · <span class="${failing ? 'gos-bad' : ''}">${failing} failing</span> · scheduler ${cron.halted ? '<span class="gos-warn">paused by E-STOP</span>' : !cron.enabled ? '<span class="gos-warn">disarmed</span>' : cron.health?.healthy ? 'healthy' : '<span class="gos-warn">armed, no recent tick</span>'}</p>`;
    }
    return html;
  }

  function department(d, now) {
    const s = M.scope(snapshot, d.id, view.business);
    let html = `<div class="sn-row-flex"><h2>${esc(d.name)}</h2><span class="sn-badge">${esc(d.status)}</span><span class="sn-spacer"></span>`;
    if (s.businesses.length) html += `<label class="sn-muted">Business <select class="sn-select" id="gos-business"><option value="">All records</option>${s.businesses.map((b) => `<option value="${esc(b.id)}" ${b.id === view.business ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select></label>`;
    html += '</div>';
    if (d === M.UNMAPPED) html += '<p class="sn-hint">Agents and conveyor lines that no department lists. Add their ids to <span class="sn-mono">departments</span> in gritty-os-model.js to file them.</p>';
    for (const b of s.businesses) html += `<p>${M.safeLink(b.url) ? btn(b.name + ' ↗', 'link', b.url, 'xs') : esc(b.name)} <span class="sn-muted">#${esc(b.externalId)} · ${esc(b.source)}</span></p>`;
    if (!s.businesses.length && d !== M.UNMAPPED) html += '<p class="sn-empty">No connected business registered for this department.</p>';
    if (view.business && s.unassigned) html += `<p class="sn-hint">${s.unassigned} runs carry no business id and are hidden while a business is selected.</p>`;
    if (s.missing.length) html += `<p class="gos-warn">Listed but not in this station: ${s.missing.map(esc).join(', ')}</p>`;

    html += `<div class="sn-stats">
      <div class="sn-stat"><b>${snapshot.runSourceAvailable ? M.money(s.spend.day.amount) : '—'}</b><span>Metered, 24h</span></div>
      <div class="sn-stat"><b>${snapshot.runSourceAvailable ? M.money(s.spend.week.amount) : '—'}</b><span>Metered, 7 days</span></div>
      <div class="sn-stat ${s.failures.length ? 'bad' : ''}"><b>${s.failures.length}</b><span>Failed runs in history</span></div>
      <div class="sn-stat"><b>${s.cost.unknown}</b><span>Unknown-cost runs</span></div>
    </div>`;

    // search narrows every list below; an agent's name matches its runs and outputs too
    const q = view.query || '', hit = (r) => M.matches({ ...r, name: r.name || agentName(r.agentId) }, q);
    const agents = s.agents.filter((a) => M.matches({ name: a.name, agentId: M.agentIdOf(a) }, q));
    const jobs = s.jobs.filter(hit), outputs = s.outputs.filter(hit), all = s.runs.filter(hit), failed = s.failures.filter(hit);
    html += `<input class="sn-input" id="gos-search" type="search" placeholder="Search agents, jobs, outputs, runs, files…" value="${esc(q)}" aria-label="Search this department">`;

    html += '<div class="sn-sect">Agents</div>';
    html += agents.length ? `<div class="sn-grid">${agents.map((a) => {
      const id = M.agentIdOf(a), last = s.latest.get(id);
      return `<article class="sn-card gos-click" data-action="agent" data-id="${esc(id)}" tabindex="0">
        <div class="sn-row-flex"><h3>${esc(a.name || id)}</h3>${M.isLead(id) ? '<span class="sn-badge gold">lead</span>' : ''}<span class="sn-spacer"></span>${last ? badge(M.state(last)) : '<span class="sn-badge">no runs</span>'}</div>
        <p>${esc(String(a.purpose || '').split('\n').find(Boolean) || a.role || '')}</p>
        <p class="sn-muted">${esc(a.provider)} / ${esc(a.model)}${last ? '<br>Last run ' + esc(M.ago(M.when(last), now)) : ''}</p></article>`;
    }).join('')}</div>` : `<p class="sn-empty">${q ? 'No agents match.' : 'No agents in this department.'}</p>`;

    if (s.lineStats.length) {
      html += '<div class="sn-sect">Line watch · today</div>';
      html += `<table class="sn-table"><thead><tr><th>Line</th><th>Runs</th><th>Shipped</th><th>Failed</th><th>Spend (UTC day)</th></tr></thead><tbody>${s.lineStats.map((l) => {
        const pct = l.capUsdPerDay ? Math.min(100, (l.usdToday / l.capUsdPerDay) * 100) : null;
        return `<tr><td class="sn-mono">${esc(l.lineId)}</td><td>${l.runs}</td><td>${l.shipped}</td><td class="${l.failed ? 'gos-bad' : ''}">${l.failed}</td>
          <td>${M.money(l.usdToday)}${l.capUsdPerDay ? ' of ' + M.money(l.capUsdPerDay) + `<div class="sn-progress"><i style="width:${pct.toFixed(1)}%"></i></div>` : ' · no cap'}</td></tr>`;
      }).join('')}</tbody></table>`;
    }

    html += '<div class="sn-sect">Conveyor jobs</div>';
    html += jobs.length ? `<table class="sn-table"><thead><tr><th>Job</th><th>Outcome</th><th>Cost</th><th>When</th></tr></thead><tbody>${jobs.map((j) =>
      `<tr><td>${btn(j.name || j.id, 'job', j.id, 'xs')}</td><td>${badge(M.state(j))}</td><td>${typeof j.usd === 'number' ? M.money(j.usd) : '—'}</td><td>${esc(M.ago(M.when(j), now))}</td></tr>`).join('')}</tbody></table>`
      : `<p class="sn-empty">${q ? 'No jobs match.' : 'No recorded conveyor jobs here.'}</p>`;

    if (s.schedules.length) {
      html += '<div class="sn-sect">Schedules</div>';
      html += `<table class="sn-table"><thead><tr><th>Routine</th><th>Agent</th><th>When</th><th>State</th><th>Next / last</th></tr></thead><tbody>${s.schedules.map((j) => {
        const st = M.scheduleState(j);
        return `<tr><td>${esc(j.name || j.id)}</td><td>${esc(j.agentId ? agentName(j.agentId) : j.runsLine ? 'line ' + j.runsLine : '—')}</td><td>${esc(j.scheduleDisplay || '')}</td>
          <td><span class="sn-badge ${st === 'failed' ? 'bad' : st === 'paused' ? 'gold' : st === 'scheduled' ? 'ok' : ''}">${esc(st)}</span></td>
          <td class="sn-muted">${j.nextRunAt && st === 'scheduled' ? 'next ' + esc(stamp(Date.parse(j.nextRunAt) || j.nextRunAt)) : ''}${j.lastRunAt ? '<br>last ' + esc(M.ago(Date.parse(j.lastRunAt) || j.lastRunAt, now)) + (j.lastStatus ? ' · ' + esc(j.lastStatus) : '') : ''}</td></tr>`;
      }).join('')}</tbody></table>`;
      if (snapshot.cron && (!snapshot.cron.enabled || snapshot.cron.halted)) html += `<p class="gos-warn">The scheduler is ${snapshot.cron.halted ? 'paused by E-STOP' : 'disarmed'}: these routines will not fire.</p>`;
    }

    html += '<div class="sn-sect">Outputs</div>';
    if (!outputs.length) html += `<p class="sn-empty">${q ? 'No outputs match.' : 'No recorded outputs here.'}</p>`;
    for (const kind of M.OUTPUT_KINDS) {
      const group = outputs.filter((o) => M.outputKind(o) === kind);
      if (!group.length) continue;
      html += `<h4>${esc(kind)} <span class="sn-muted">(${group.length})</span></h4><div class="sn-grid">${group.slice(0, 30).map((o) => `<article class="sn-card">
        <div class="sn-row-flex"><h3>${esc(o.title || o.id)}</h3><span class="sn-spacer"></span>${badge(M.state(o))}</div>
        <p class="sn-muted">${[agentName(o.agentId), o.source ? M.outputOrigin(o) : '', M.ago(o.updatedAt || o.createdAt, now)].filter(Boolean).map(esc).join(' · ')}</p>
        <div class="sn-row-flex">${(o.files || []).map((f, i) => btn(f.path, 'file', JSON.stringify([o.id, i]), 'xs')).join('')}</div></article>`).join('')}</div>${group.length > 30 ? `<p class="sn-hint">Showing the newest 30 of ${group.length}. Search to narrow.</p>` : ''}`;
    }

    const runs = view.runFilter === 'failed' ? failed : all;
    html += `<div class="sn-sect">Runs</div><div class="sn-row-flex">${btn(`All (${all.length})`, 'runFilter', 'all', 'xs' + (view.runFilter === 'all' ? ' primary' : ''))}${btn(`Failed (${failed.length})`, 'runFilter', 'failed', 'xs' + (view.runFilter === 'failed' ? ' primary' : ''))}</div>`;
    html += runs.length ? `<table class="sn-table"><thead><tr><th>Task</th><th>Agent</th><th>Outcome</th><th>Cost</th><th>When</th></tr></thead><tbody>${runs.slice(0, 50).map((r) =>
      `<tr><td>${btn((r.sessionTitle || r.title || r.runId).slice(0, 90), 'run', r.runId, 'xs')}</td><td>${esc(agentName(r.agentId))}</td><td>${badge(M.state(r))}</td><td>${esc(costCell(r))}</td><td>${esc(M.ago(M.when(r), now))}</td></tr>`).join('')}</tbody></table>${runs.length > 50 ? `<p class="sn-hint">Showing the newest 50 of ${runs.length}.</p>` : ''}`
      : '<p class="sn-empty">No runs match.</p>';
    return html;
  }

  function detail() {
    const [k, id] = view.detail;
    if (k === 'file') return '<div id="gos-file"><p class="sn-loading">Checking the actual file…</p></div>';
    if (k === 'agent') {
      const a = snapshot.agents.find((x) => M.agentIdOf(x) === id);
      if (!a) return '<p class="sn-empty">This agent is no longer in the save. Refresh to reload.</p>';
      const rows = snapshot.runs.filter((r) => r.agentId === id).sort((x, y) => M.when(y) - M.when(x)), c = M.usd(rows);
      const fails = rows.filter(M.isFailure).length;
      return `<h2>${esc(a.name || id)}</h2><p class="sn-muted">${[id, a.provider && a.model ? a.provider + ' / ' + a.model : '', a.approvalMode, a.executionProfile].filter(Boolean).map(esc).join(' · ')}</p>
        <div class="sn-stats"><div class="sn-stat"><b>${rows.length}</b><span>Runs in history</span></div><div class="sn-stat"><b>${M.money(c.amount)}</b><span>Metered cost</span></div>
        <div class="sn-stat ${fails ? 'bad' : 'ok'}"><b>${rows.length ? Math.round((1 - fails / rows.length) * 100) + '%' : '—'}</b><span>Runs without failure</span></div><div class="sn-stat"><b>${c.subscription} / ${c.unknown}</b><span>Subscription / unknown cost</span></div></div>
        <details><summary>Purpose</summary><pre>${esc(a.docs?.purpose || a.purpose || 'No purpose recorded.')}</pre></details>
        <div class="sn-sect">Recent runs</div><div class="sn-list">${rows.slice(0, 20).map((r) => `<div class="sn-item sn-row-flex">${btn((r.title || r.runId).slice(0, 90), 'run', r.runId, 'xs')}<span class="sn-spacer"></span>${badge(M.state(r))}<span class="sn-muted">${esc(costCell(r))}</span></div>`).join('') || '<p class="sn-empty">No runs recorded.</p>'}</div>`;
    }
    const record = k === 'run' ? snapshot.runs.find((r) => r.runId === id) : snapshot.jobs.find((r) => r.id === id);
    if (!record) return '<p class="sn-empty">This record is no longer in the loaded history. Refresh to reload.</p>';
    const evidence = k === 'run'
      ? { runId: record.runId, agentId: record.agentId, reason: record.reason, model: record.model, provider: record.provider, turns: record.turns, tokens: record.tokens, usd: record.usd, unmetered: record.unmetered, spendUnknown: record.spendUnknown, completionEvidence: record.completionEvidence, artifacts: record.artifacts }
      : { jobId: record.id, line: record.line, status: record.status, steps: record.steps, usd: record.usd, retryOf: record.retryOf, notes: record.notes, text: record.text };
    return `<h2>${esc(record.name || record.sessionTitle || record.title || record.id || record.runId)}</h2>
      <div class="sn-row-flex">${badge(M.state(record))}<span class="sn-muted">${esc(k === 'run' ? agentName(record.agentId) : 'line ' + record.line)} · ${esc(stamp(M.when(record)))} · ${esc(k === 'run' ? costCell(record) : M.money(record.usd))}</span></div>
      <pre>${esc(record.error || record.preview || record.deliveryText || record.failureCode || 'No result preview was recorded.')}</pre>
      <details><summary>Recorded evidence</summary><pre>${esc(JSON.stringify(evidence, null, 2))}</pre></details>
      <p class="sn-hint">A completed run is not proof of accepted QA or publication. Retry and release stay in StarNet's own windows.</p>`;
  }

  async function showFile(id) {
    const g = generation, host = app.querySelector('#gos-file');
    let pair; try { pair = JSON.parse(id); } catch { return; }
    const o = snapshot.outputs.find((x) => x.id === pair[0]), f = o?.files?.[pair[1]];
    if (!f || !M.safeFile(f.openUrl)) { host.innerHTML = '<p class="sn-empty">This file has no local opening route (it may be discarded or still pending).</p>'; return; }
    host.innerHTML = `<h2>${esc(f.path)}</h2><p class="sn-muted">${esc(o.title || o.id)} · ${esc(agentName(o.agentId))}</p><p class="sn-loading" id="gos-file-status">Checking the actual file…</p><div id="gos-file-content"></div>`;
    const status = host.querySelector('#gos-file-status'), out = host.querySelector('#gos-file-content');
    try {
      const r = await Harness.apiFetch(f.openUrl);
      if (!r.ok) throw Error(`File unavailable (${r.status})`);
      const blob = await r.blob();
      if (g !== generation || view.detail?.[1] !== id) return;
      if (blob.size > 8 * 1024 * 1024) throw Error('Preview exceeds 8 MB; open it from StarNet Deliverables.');
      status.className = 'sn-muted'; status.textContent = `Verified readable · ${blob.size.toLocaleString()} bytes`;
      previewUrl = URL.createObjectURL(blob);
      const kind = M.previewKind(f);
      if (kind === 'image' || /^image\//.test(blob.type)) {
        const img = document.createElement('img'); img.src = previewUrl; img.className = 'gos-preview'; img.alt = f.path; out.appendChild(img);
      } else if ((['markdown', 'csv', 'text'].includes(kind) || /^text\/|json/.test(blob.type)) && blob.size <= 512 * 1024) {
        const pre = document.createElement('pre'); pre.textContent = await blob.text(); out.appendChild(pre);
      }
      const a = document.createElement('a'); a.href = previewUrl; a.download = f.path.split(/[\\/]/).pop(); a.className = 'sn-btn'; a.textContent = 'Download file'; out.appendChild(a);
    } catch (e) { status.className = 'sn-error'; status.textContent = e.message; }
  }

  // ---------- events ----------
  function act(el) {
    const a = el.dataset.action, id = el.dataset.id;
    if (a === 'refresh') refresh();
    else if (a === 'back') { view = back.pop() || { tab: 'overview', business: '', detail: null, runFilter: 'all', query: '' }; render(); }
    else if (a === 'tab') { back = []; view = { tab: id, business: '', detail: null, runFilter: 'all', query: '' }; prefs.tab = id; savePrefs(); render(); }
    else if (a === 'runFilter') { view.runFilter = id; render(); }
    else if (a === 'link') starnet.ui.openLink(id).catch((e) => starnet.ui.toast(e.message, 'warn'));
    else if (['agent', 'run', 'job', 'file'].includes(a)) navigate({ detail: [a, id] });
  }
  app.addEventListener('click', (e) => { const el = e.target.closest('[data-action]'); if (el) act(el); });
  app.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.gos-click')) { e.preventDefault(); act(e.target); }
  });
  // re-rendering replaces the input, so put the caret back where the Commander was typing
  app.addEventListener('input', (e) => {
    if (e.target.id !== 'gos-search') return;
    const caret = e.target.selectionStart;
    view.query = e.target.value; render();
    const el = app.querySelector('#gos-search'); if (el) { el.focus(); el.setSelectionRange(caret, caret); }
  });
  app.addEventListener('change', (e) => {
    if (e.target.id === 'gos-business') { view.business = e.target.value; render(); }
    if (e.target.id === 'gos-auto') { prefs.auto = e.target.value; savePrefs(); schedule(); }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && view.detail) { e.preventDefault(); act({ dataset: { action: 'back' } }); }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && AUTO[prefs.auto] && Date.now() - (snapshot.at || 0) > AUTO[prefs.auto]) refresh();
  });
  if (typeof starnet.onData === 'function') starnet.onData(() => refresh());

  starnet.ready.then(async () => {
    try { prefs = { ...prefs, ...((await starnet.store.get('prefs')) || {}) }; } catch {}
    if (!(prefs.auto in AUTO)) prefs.auto = '1m';
    if (prefs.tab === 'overview' || M.department(prefs.tab)) view.tab = prefs.tab;
    schedule();
    refresh();
  });
  window.GrittyOS = { refresh, open: (id) => act({ dataset: { action: 'tab', id: id || 'overview' } }) };
})();
