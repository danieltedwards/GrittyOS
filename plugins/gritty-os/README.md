# GRITTY OS (StarNet plugin window)

Read-only department dashboard over StarNet records: runs, line jobs, deliverables, budget and providers.

```
ui/index.html          the window page
ui/bridge.js           Harness.apiFetch(route) → starnet.backend.call('read', { route })
ui/gritty-os-model.js  departments, agents, lines, businesses + pure projection logic (edit departments here)
ui/gritty-os.js        rendering and navigation
ui/dashboard.css       layout only; colours and controls come from the station kit
test/model.test.js     node plugins/gritty-os/test/model.test.js
```

Install: copy `ui/` over the `ui/` folder of the installed plugin (`<workspaces>/plugins/<id>/`), keeping its
`plugin.json` and `index.js`. The backend contract is unchanged: `read` answers `{ status, body }` or
`{ status, binary, mime }`. For more than 500 runs of history it must also pass through the `through` and
`beforeRunId` query parameters of `/api/runs`; if it refuses them the window keeps the first 500 and says so.
Any file change turns the plugin off until it is re-approved in ABILITIES → EXTENSIONS.
