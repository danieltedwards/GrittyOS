# gritty/ (GRITTY OS redesign workspace)

This folder holds GRITTY OS design and planning work done on the **upstream StarNet fork**. It is kept apart from
StarNet's source on purpose, so it can be brought into Dan's customized PC project later without conflicts.

- Nothing here is loaded by `frontend/index.html`, staged into the desktop bundle, or run by the test gates.
- No StarNet file (`frontend/`, `sidecar/`, `shared/`, `src-tauri/`) was modified.
- All data in the prototype is labelled demo fixture data.

| File | What it is |
| --- | --- |
| `ARCHITECTURE_PROPOSAL.md` | What the upstream code actually does, where GRITTY OS should attach, the view-model contract, runtime gaps, identity/remote risks, phased plan, PC reconciliation steps, capability matrix template |
| `prototype/gritty-preview.html` | Self-contained interactive design preview: ship overview, Etsy department workspace, worker dossier, GRITTY oversight dossier, narrow-screen layout. Open it directly in a browser. Deep links: `#etsy`, `#dossier`, `#gritty` |

To bring this into the PC project: `git checkout <this-fork>/claude/starnet-upstream-architecture-xwn46h -- gritty/`
(see §9 of the proposal).
