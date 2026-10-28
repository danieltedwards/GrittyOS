# GRITTY OS (StarNet plugin window)

Read-only department dashboard over StarNet records: runs, line jobs, deliverables, schedules, line stats, budget
and providers. Leads, output kinds, search and honest output labels are carried over from the built-in GRITTY OS
(source recovery package, October 27, 2026).

```
plugin.json            the manifest (one wide window, plus index.js)
index.js               the backend: answers the window's `read` calls from StarNet's workspace files, read-only
ui/index.html          the window page
ui/bridge.js           Harness.apiFetch(route) → starnet.backend.call('read', { route })
ui/gritty-os-model.js  departments, agents, lines, businesses + pure projection logic (edit departments here)
ui/gritty-os.js        rendering and navigation
ui/dashboard.css       layout only; colours and controls come from the station kit
test/                  node plugins/gritty-os/test/model.test.js · node plugins/gritty-os/test/backend.test.js
```

Install: copy this folder's `plugin.json`, `index.js` and `ui/` over the installed plugin in
`<workspaces>/plugins/<id>/` (the `test/` and README are not needed there), then approve it again in
ABILITIES → EXTENSIONS: any file change turns a plugin off until the new code is approved.

What the backend reads, all inside the workspace folder two levels above the plugin: `agent.save.json` (agent
name, role, purpose, model only), `runs.jsonl` (newest 16 MB, up to 2000 runs), `line-jobs.json`, `budget.json`,
`ledger.jsonl` (trailing 24h spend, shown as a floor), `cron.jobs.json` (no prompts), `line-spend.json`, and a run's own
recorded artifacts (allowlisted types, jailed to its workspace, 8 MB max). It never writes, never touches the
network and never reads keys. Things only the running station knows (whether the scheduler is armed, provider
logins, a line's shipped count and cap) are left out rather than guessed.
