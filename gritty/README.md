# gritty/ (GRITTY OS redesign workspace)

This folder holds GRITTY OS design and planning work done on the **upstream StarNet fork**. It is kept apart from
StarNet's source on purpose, so it can be brought into Dan's customized PC project later without conflicts.

- Nothing here is loaded by `frontend/index.html`, staged into the desktop bundle, or run by the test gates.
- No StarNet file (`frontend/`, `sidecar/`, `shared/`, `src-tauri/`) was modified.
- All data in the previews is labelled simulated or demo fixture data.

| Path | What it is |
| --- | --- |
| `fleet/` | **Current direction.** The pixel-art fleet layer: one ship per department on the sea, clickable cutaways, every click mapped to an existing GRITTY OS entry point. Open `fleet/fleet-preview.html` in a browser (deep links `#etsy`, `#operations`). Tests: `node gritty/fleet/test/fleet-model.test.js` |
| `fleet/INTEGRATION.md` | Handoff for Codex: files, adapter contract, wiring steps for the PC app, assumptions to verify |
| `ARCHITECTURE_PROPOSAL.md` | What the upstream code actually does, risks (identity, updater, remote), capability matrix template. Starts with a dated update listing what the later handoffs changed |
| `prototype/gritty-preview.html` | Earlier single-ship study (superseded by the fleet). Kept for its dashboard and dossier ideas; its roles are invented |

To bring this into the PC project: `git checkout <this-fork>/claude/starnet-upstream-architecture-xwn46h -- gritty/`,
then follow `fleet/INTEGRATION.md`.
