# GRITTY OS on StarNet: architecture read and redesign proposal

Status: proposal plus a standalone design preview. Nothing in StarNet's `frontend/`, `sidecar/`, `shared/` or
`src-tauri/` was changed.

Source inspected: this repository (`danieltedwards/GrittyOS`), branch `claude/starnet-upstream-architecture-xwn46h`,
forked from upstream `androoAGI/starnet` at `54899e5f`, package `starnet-harness` 0.13.2. This is the **upstream fork,
not Dan's customized PC project**. Anything below about "what Dan sees" is a hypothesis to check against the PC
(handoff §6). The PC work has to be the baseline when the two are reconciled (§9).

---

## 1. What the upstream code actually is (verified by reading it)

| Concern | Where it lives | What it means for GRITTY OS |
| --- | --- | --- |
| Process model | `sidecar/index.js` (~11k lines): one Node process, HTTP + SSE on `:8787`, serves `frontend/` statically, runs the agent loop in-process | One runtime. A GRITTY frontend can be served by the same sidecar, so no second backend is needed |
| Frontend | `frontend/index.html` loads ~80 `app/*.js` modules in order. No build step, no framework | New GRITTY modules can be added the same way, as plain scripts. No React or game engine is needed |
| World renderer | `frontend/app/world.js` (~11.4k lines, canvas), `worldmodel.js` (station doc), `worldrenderer.js`, `stationbake.js` | Rooms are rectangles in a `starnet.station` v2 doc: `{id, kind:'hab'|'corridor', name, rects, floorStyle…}`. There is **no department or business-unit field** on a room |
| Capabilities | `sidecar/capability/*`: object = capability. Tools come from props placed at an agent's workstation (`World.heroCaps`) | Moving or decorating rooms **can change tool grants**. The ship layout must keep visual geometry separate from capability props (handoff §9.4) |
| Roster | `frontend/app/app.js` owns the roster. The sidecar mirrors it via `/api/roster` | Crew IDs are frontend-owned. GRITTY role profiles have to map onto these IDs, not replace them |
| "Dossier" | `frontend/app/dossier.js` + `dossierstore.js` is the **Commander** dossier (beliefs about the human), not an agent view | Do not redesign the wrong file. The agent view is `StationUI.openAgent` → `buildAgents` in `stationui.js`, styled by `css/agent-dossier.css` |
| Agent view today | `stationui.js` ~L3340–3430: console with five sections, BRIEF · GROWTH · RECORD · MEMORY · CONFIG, plus lanes from `windows/logbook.js` and `windows/rewind.js` | Gamified (XP, growth). It has no single-responsibility statement, current-task stage view, handoff contract or per-period performance with denominators |
| Work and tasks | `workstreams.js` (per-stream run state), `workview.js` (pure projection: planned / doing / needs-you / finished), `deliverables.js` (artifacts), `quests.js`, `goals.js` | `workview.js` is already the "no invented counters" projection the handoff asks for. It is the right base for the dashboard view model |
| Conveyors | `conveyor.js` (belt rendering and simulation, explicitly cosmetic), `pipeline.js` + `/api/routing/*`, `/api/line-jobs` (real routed lines) | Real staged workflows exist as "lines". The belt animation is decoration and must not stand in for task state (handoff §9.5) |
| Oversight | `sidecar/overseer.js` + `/api/overseer`: delegated threads, worker runs, reviews | A parent/worker/review spine already exists. GRITTY escalations should build on it, not on a new queue |
| Approvals | `/api/consent*`, `/api/permissions*`, `permissions.js`, `permgrants.js` | Approvals are per tool call today. Artifact-version approval (handoff §13) is a **gap** |
| Costs | `cost.js`, `spend.js`, `ledger.js`, `/api/budget/status` | One authoritative spend ledger exists. Dashboards must read it, not keep their own |
| Channels | `sidecar/channels/` (Telegram, Discord) | Keep as is |
| Remote phone | `frontend/app/remoteview.js` renders `World.renderStill()` of the **whole station** and POSTs it to `/api/remote/view`. Default relay is `https://remote.starnetos.com` (`sidecar/index.js` ~L10863, `relay/`) | Probably explains Dan's screenshot: a still of the whole station letterboxed into a tall phone frame, with no dashboards because the phone only gets a picture. It also depends on upstream's hosted relay (§7) |
| Desktop shell | `src-tauri/tauri.conf.json`: `productName: StarNet`, `identifier: ai.skynet.harness`, updater → `androoAGI/starnet-releases` | A GRITTY build must change the identifier **and** the updater endpoint, or upstream releases can overwrite it. Changing the identifier moves the data root and keychain namespace (§7) |
| Packaging | `scripts/stage-frontend-dist.mjs` stages `frontend/` into `frontend-dist` / `frontend-embed` | Every GRITTY asset must live under the staged frontend tree or the packaged app returns 404 for it |
| Contract | `shared/events.js`, `shared/schema.js`: frozen, additive-only | GRITTY events/fields are added, never renamed |

## 2. Diagnosis against the handoff's reported problems

1. **"The environment barely changed."** Room art comes from `world.js` / `stationbake.js` / `roomstyles.js` and the
   industrial-texture bakes. Recolouring rooms or renaming them in the station doc leaves the room-box-cluster
   silhouette as it is. A ship needs a **hull layer and a designed layout**, not restyled rooms.
2. **"The dossier barely changed."** Edits aimed at `dossier.js` change the Commander profile, not agents. Edits to
   `buildAgents` that add fields keep the five-section gamified console. Check which of these the PC branch touched.
3. **"Phone shows a small cluster in black."** Expected from `remoteview.js`: it frames the whole station and
   the phone letterboxes the still. A redesigned desktop UI will not show up on the phone at all.
4. **Dashboards feel thin.** Upstream has no department/unit concept. Any dashboard has to invent that grouping
   somewhere, and if it lives only in a modal it will be shallow. It needs a projection layer (§5).

## 3. Proposed boundary

```
GRITTY desktop shell        src-tauri (new identifier, own updater or none)          adapt
GRITTY frontend             frontend/gritty/*  (ship, workspaces, dossiers)           new
  └─ GRITTY view models     frontend/gritty/viewmodel.js  (pure, node-testable)       new
Frontend/runtime adapter    existing modules: Workstreams, WorkView, Deliverables,    reuse
                            StationUI, Channels + /api/* routes
Runtime                     sidecar/* (loop, providers, tools, capability, consent,   preserve
                            spend, overseer, cron, channels)
Contract                    shared/events.js, schema.js (additive only)               extend
```

- **Ship renderer.** Ship it first as a separate SVG/canvas layer with its own versioned layout file
  (`gritty.ship` v1: rooms with id, polygon, label, `departmentId`, hit region, walkable rects, doors). Keep
  StarNet's `world.js` reachable as a "legacy deck" view during development. Do not edit `world.js` geometry to
  fake a hull: it is 11k lines and its room-to-capability coupling is load-bearing.
- **Department mapping lives in GRITTY data, not in room geometry.** A department record names its units, role pool
  and the StarNet agent IDs and workstream tags it covers. Moving a room on the ship never moves capability props.
- **Workspaces and dossiers** are new windows registered through StationUI's existing
  `registerWindow` / `toggleTerm` (see `return {…}` at the end of `stationui.js`), so z-order, Escape and
  minimize behave like the rest of the app. The old `AGENT DOSSIER` stays reachable from the new dossier
  ("Classic dossier" link) until the capability matrix shows nothing is lost.
- **No second queue or ledger.** Tasks = workstreams (+ line-jobs). Outputs = deliverables. Approvals = consent
  (+ the new artifact-version binding, §6). Costs = spend ledger. GRITTY incidents = overseer threads/reviews,
  plus a small incident store only if dedupe state cannot live there.

## 4. The design preview in this folder

`gritty/prototype/gritty-preview.html` is a single self-contained file. Open it in any browser or use the published
artifact link. It uses only fixture data and labels it on every screen. It covers handoff Phase B:

| Preview | What to look for | Deep link |
| --- | --- | --- |
| Ship overview | Hull silhouette, bridge at the bow, engines at the stern, one main passage, ten compartments, crew tokens with status by shape and colour, Etsy conveyor tokens = specific tasks | (default) |
| Etsy workspace | Header with scope and freshness, unit switcher, summary that separates current counts from period totals, six-stage conveyor, outputs, decisions bound to versions, crew. Plus Production / Outputs / Crew / Performance / Settings tabs | `#etsy` |
| Worker dossier | Identity column + factual status sentence + Overview / Current work / Responsibilities / Activity / Performance / Configuration | `#dossier` |
| GRITTY dossier | Department health, deduplicated escalations shown as issue → evidence → decision → outcome, pending decisions, intervention metrics (routine tasks done by GRITTY: target 0) | `#gritty` |
| Narrow screens | Ship shrinks to a strip; the department list becomes primary navigation; workspaces and dossiers go full width | resize to ~400px |

Proposed and open for Dan's correction: hull shape and room order, palette (charcoal steel, weathered brass,
amber, small teal), stencil display face, compartment names (Chart Room, Signal Room, Cargo Hold…), tab
groupings. The preview's ship art is deliberately flat vector placeholder geometry. Final artwork should be one
coherent style (pixel or illustrated, handoff §9.2), chosen once Dan approves the layout.

## 5. View-model contract (what the preview's `FX` fixture is shaped like)

A pure module projects runtime state into these records. Every screen (ship labels, workspace, dossier, phone)
reads the same projection, so they cannot disagree.

```
Department   { id, name, fn, health: ok|attention|inactive|empty, unitIds[], rolePool[agentId], note }
Unit         { id, departmentId, name, platform, accountRef, state: active|experimental|paused, budgetRef }
Crew         { id (StarNet agent id), name, role (one sentence), departmentId, unitScope, status, modelLabel, configVersion }
Task         { id (workstream id), unitId, stage index, status, ownerId, startedAt, next, blocker, artifactVersion, qaCycle }
Output       { id (deliverable id), taskId, version, qaState, releaseState, previewRef, provenance }
Approval     { id, taskId, artifactId, version, scope, decision, decidedAt }
Incident     { id, title, evidence, decision, outcome, state, relatedRunIds[] }
Metric       { value, unit, period, source, freshness, kind: observed|estimated|unavailable|not-connected|fixture }
```

Status vocabulary (handoff §9.5 and §13): queued, ready, running, waiting-input, waiting-review, waiting-approval,
blocked, failed, paused, completed, cancelled, plus offline and unknown for agents. Each status has a shape and a
label, never colour alone.

Sources: Crew ← roster + `StationUI.isAgentRunning` + `Channels.pendingOf`; Task ← `WorkView.project` buckets
+ workstream run state + line-job stage; Output ← `Deliverables`; Approval ← consent queue (+ §6 extension);
Metric ← `/api/budget/status` / spend ledger; Incident ← `/api/overseer` threads/reviews.

## 6. Runtime gaps the redesign exposes (Phase D, not UI work)

| Gap | Why it matters | Proposed approach |
| --- | --- | --- |
| Department / unit records | Nothing upstream groups agents or work by business | Additive GRITTY store (versioned JSON under the workspace), referenced by ID; no change to roster ownership |
| Stage-based workflow per department | Workstreams have lanes, not named production stages with accepted-input checks | Build on routing lines (`pipeline.js`, `/api/routing`, `/api/line-jobs`) before adding anything new |
| Artifact-version approval | Consent approves tool calls; it cannot say "approve listing package v3 only" | New consent kind bound to `{deliverableId, version, scope}`; revision invalidates it |
| Bounded QA loop + escalation | No cap of two correction cycles followed by an escalation to the overseer | Counter on the task; at the cap, open an overseer thread instead of retrying |
| Idempotent external release | Needed before any publish/upload automation | Idempotency key + receipt on the release step; until then release stays manual (as in the preview) |
| Per-task budgets | Spend is per run / station | Attribute spend ledger rows to task + agent; enforce the cap in the loop, not the UI |

## 7. Identity, data and remote risks (decide before Phase E)

- `identifier: ai.skynet.harness` → data root `%APPDATA%\ai.skynet.harness\workspaces` and the keychain
  namespace. A new identifier (e.g. `os.gritty.desktop`) gives a **clean, empty** install. A migration step
  (copy workspace, re-reference keychain entries) is required, and the old StarNet install stays runnable for rollback.
- Updater points at `androoAGI/starnet-releases`. A GRITTY build must remove or replace it. Do not reuse upstream's
  updater pubkey or claim signing that does not exist.
- Remote: the phone path is upstream's hosted relay (`remote.starnetos.com`) carrying a **still image**. A
  derivative app may or may not be accepted by that relay. Keep it working unchanged first. A phone-friendly
  GRITTY view (departments, approvals, dossiers as data, not a picture) is a separate decision because it needs
  relay or hosting changes.
- Assets: check `NOTICE.md` and each art asset's provenance before redistributing upstream artwork under the
  GRITTY name. The preview uses no upstream art.

## 8. Phased plan in this fork

| Phase | Deliverable | Touches upstream files? |
| --- | --- | --- |
| A | This document + capability matrix template (§10). The PC-side run-identity checkpoint must be done **on the PC** | No |
| B | `gritty/prototype/` preview → Dan's corrections | No |
| C | `frontend/gritty/viewmodel.js` (pure + node tests), ship layer, Etsy workspace and dossier as StationUI windows, behind a `?ui=gritty` / settings toggle. Classic UI still default | Additive: new files + one `<script>` block in `index.html` + `registerWindow` calls |
| D | §6 runtime gaps, one at a time, each with focused tests in `test/fast.list` | Yes, sidecar, additive |
| E | GRITTY identity in `src-tauri`, migration rehearsal, updater decision, remote decision | Yes |
| F | Fiverr / YouTube / Market Lab workspaces, layout editor | Additive |

## 9. Reconciling with Dan's PC changes

The PC project is the source of truth for Dan's customizations. This branch keeps everything that could conflict
out of upstream files so it can be brought over without merge fights:

1. On the PC: commit (or `git stash` + branch) the current work, record `git remote -v`, branch, commit, and
   `git status`. Do not reset to upstream.
2. Add this fork as a remote on the PC (`git remote add gritty-fork https://github.com/danieltedwards/GrittyOS`)
   and fetch `claude/starnet-upstream-architecture-xwn46h`.
3. Bring over only the `gritty/` folder (`git checkout gritty-fork/claude/starnet-upstream-architecture-xwn46h -- gritty/`).
   It touches no StarNet file, so it cannot conflict with PC edits.
4. Compare the PC's changed files against §1. Specifically: which file got the "dashboards" (likely `stationui.js`
   or a new window), whether `dossier.js` or `buildAgents` was edited, and whether `tauri.conf.json` identity or
   the remote relay changed. Record the answers in the capability matrix.
5. Phase C code is written against whatever the PC branch actually has. If the PC already added a department
   concept, the view model consumes that instead of the §6 store.

## 10. Capability matrix template (fill on the PC)

| Capability | Existing entry point | Owner (file/route) | PC baseline status | GRITTY entry point | Verification | Result | Limitation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Agent roster / create / edit | CREW rail, AGENT DOSSIER | `app.js`, `stationui.js`, `/api/roster` | | Crew route + dossier | | | |
| Run / cancel / steer | COMMS | `chat.js`, `/api/run`, `/api/cancel`, `/api/run/steer` | | Dossier controls | | | |
| E-STOP / halt | topbar | `/api/halt` | | Command bar | | | |
| Tool consent | COMMS inline | `/api/consent*` | | Approvals route | | | |
| Permissions / grants | Settings › PERMISSIONS | `/api/permissions*` | | Dossier › Configuration (link) | | | |
| Spending limits / usage | Settings › SPENDING LIMITS | `/api/budget/status`, `spend.js` | | Engine Room, workspace summary | | | |
| Deliverables / outputs | Output browser | `deliverables.js`, `outputbrowser.js` | | Cargo Hold, workspace Outputs | | | |
| Routing lines / line jobs | Workflows window | `pipeline.js`, `/api/routing*`, `/api/line-jobs` | | Workspace conveyor | | | |
| Overseer / delegation | (implicit) | `/api/overseer` | | Bridge / GRITTY dossier | | | |
| Schedules (cron) | Automation | `cron*.js` | | Dossier › Configuration | | | |
| Telegram | Settings › channels | `sidecar/channels/telegram*` | | Signal Room | | | |
| Remote phone | Settings › REMOTE | `remoteview.js`, relay | | unchanged in C | | | |
| Memory / transcripts / rewind | Dossier MEMORY / RECORD | `memcore.js`, transcript store | | Dossier › Activity | | | |
| Skills | Skill library / market | `/api/skills*` | | Dossier › Responsibilities (link) | | | |
| Voice | COMMS | `voice*.js`, `/api/stt`, `/api/tts` | | unchanged | | | |
| Build mode | Build | `build.js`, `refit.js` | | Legacy deck | | | |
| Save / backup / restore | Settings | `save.js`, `station-recovery.mjs` | | unchanged | | | |
