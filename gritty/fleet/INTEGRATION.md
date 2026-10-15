# GRITTY Fleet layer: handoff for integrating into the PC app

From: Claude (cloud session on the upstream fork). For: Codex and Dan, working in the customized PC source
(`starnet-native-source`, StarNet v0.13.3, upstream `b35cf4ee`). This answers the checklist at the end of
`GRITTY_OS_SHARED_HANDOFF.md`.

## Where the work is

- Repository: `danieltedwards/GrittyOS`, branch `claude/starnet-upstream-architecture-xwn46h`.
- Base: upstream StarNet v0.13.2 (`54899e5f`). **This fork does not contain the PC's GRITTY OS files**
  (`gritty-os.js`, `gritty-os-model.js`, `gritty-os.css`, `gritty-freeport.js`). Nothing here was tested
  against them.
- Changed files: only new files under `gritty/`. No StarNet file was edited.

| File | Role | Ship to the app? |
| --- | --- | --- |
| `fleet/fleet-model.js` | Pure logic: evidence → sea state, handoff ropes, fleet assembly, click → entry-point mapping, effect pacing | Yes |
| `fleet/fleet-art.js` | Placeholder pixel art generated in code (palette, crew, Admiral, ships, props) | Yes, until real sprite sheets replace it |
| `fleet/fleet.js` | Canvas renderer + button layer for the fleet and the cutaways | Yes |
| `fleet/fleet.css` | Styles, all scoped under `.gf` | Yes |
| `fleet/fleet-fixture.js` | Simulated data for the preview | **No, never** |
| `fleet/fleet-preview.html` | Standalone preview with a stand-in host | No |
| `fleet/test/fleet-model.test.js` | `node gritty/fleet/test/fleet-model.test.js` | Add to the PC's test list if wanted |

## What it does

- **Fleet view.** One ship per department, bobbing on the water. The Admiral's flagship is larger.
  Inactive, dormant or deferred departments are "laid up": sails furled, anchored. Clicking a ship opens its cutaway.
- **Cutaway.** A side-on cross-section of the ship. Decks equal the department's rooms, so operations gets three
  decks for `r257`, `r262` and `r264`. The leader stands on the quarterdeck; GRITTY is drawn larger and more
  detailed as Admiral. Everything in it is a real button:

| Object | Calls | Opens in GRITTY OS |
| --- | --- | --- |
| Captain's cabin | `GrittyOS.open(deptId)` | Ship dashboard, overview |
| Crew member | depends on the "Crew click opens" setting (below) | Workboard or dossier |
| Conveyor belt (Etsy) or route board (others) | `GrittyOS.openWork(deptId)` | Real workflow map |
| Cargo hold | `GrittyOS.openOutputs(deptId)` | Output vault |
| Signal flag (only when the sea is not calm) | `GrittyOS.open(deptId)` + the record id in `focus` | The department; see assumption 2 |

Crew click setting: **Ask each time** (default; shows a small chooser with "Always open this"), **Workboard**
→ `GrittyOS.openAgent(id)`, **Dossier** → `StationUI.showAgent(id, 'brief')`, **Character** →
`StationUI.showAgent(id, 'character')`, **Operations** → `StationUI.showAgent(id, 'config')`.

A missing entry point is reported in the status line ("cannot open here") instead of failing silently. No click
starts a run, changes a permission, or writes a record.

## Live-state meaning (the adapter contract)

The fleet only reads `evidence` records. The PC adapter must build them from real runtime state:

| Evidence | Build it from | Fleet shows | Clears when |
| --- | --- | --- | --- |
| `{kind:'approval', state:'open'}` | a pending consent / approval record | Cannon puffs (paced, ≥7 s apart) + amber `!` pennant | that record is answered |
| `{kind:'failure', state:'open', blocking:true}` | an active, unresolved blocking failure | Enemy sloops circling (1 per issue, max 3) + red `x` pennant | the issue is resolved |
| `{kind:'failure'}` resolved or non-blocking | historical failures | Only a "past issue in the log" count; **never an attack** | n/a |
| `{kind:'data', state:'open'}` | a feed or agent whose state cannot be read | Fog bank + grey `?` pennant; **never calm water** | data returns |
| `{kind:'handoff', id, from, to, at}` | an actual handoff/queue event with a stable id, between **different** departments | A rope between the two ships for 60 s, deduplicated by id | it ages out |

Worst state wins per ship: trouble > attention > unknown > calm. Effects are cosmetic. Dismissing or reaching the
end of an effect never touches the record. Every state has a shape and a text label, so colour and sound are not
needed. There is no sound at all. Reduced motion stops all movement and keeps the markers.

## How to wire it into the PC app (proposed steps for Codex)

1. Copy the four "ship it" files to `frontend/app/gritty-fleet/`. The packaged app 404s anything outside `frontend/`.
2. In `frontend/index.html`, load `gritty-fleet/fleet.css`, then `fleet-model.js`, `fleet-art.js`, `fleet.js`,
   **after** `gritty-os.js` and `stationui.js`.
3. Write `frontend/app/gritty-fleet/fleet-source.js`, the one PC-specific file. Its job is
   `getInput()` returning `{ departments, roster, conveyors, evidence }` from `gritty-os-model.js` and
   live state. It is not written here because this fork does not have that model.
   - `departments`: `{ id, name, rooms, posture, captainId, deckNames? }` from the existing department mappings.
   - `roster`: `{ agentId, name, deptId, status }` from the saved roster, with status mapped to one of
     `running | waiting-approval | blocked | failed | paused | idle | offline | unknown`.
   - `conveyors`: `{ etsy: ['designer','publisher','copywriter'] }` from the routing compiler (`pipeline.js`).
   - `evidence`: as in the table above.
4. Mount it as a **Fleet** tab or window in the command deck:
   `GrittyFleet.mount(el, { getInput, host: window, crewChoice: savedChoice })`. Call `.refresh()` from the
   U.bus listeners that already update the command deck (run start/end, permission prompt/response,
   deliverable changes). Keep the existing station floor and command deck reachable.
5. Persist the crew-click choice wherever the command deck keeps its settings, not in a separate store.
6. Rebuild and visually check the Windows app. Per the shared handoff, loose frontend file edits do not update
   the installed executable.

## Simulated vs live

Everything in `fleet-fixture.js` is simulated, including every status, alert and event. The 28 agent IDs and names
come from the 2026-10-15 station export, and the department IDs, room IDs, crew counts and postures come from
the shared handoff. The preview's side panel logs the call that would be made instead of opening anything.

## Assumptions that still need checking on the PC

1. **Agent-to-department mapping.** The fixture assumes this split:
   - operations: GRITTY, CHIEF OF STAFF, TREASURER, RESEARCHER, SCRIPTWRITER, TELEMETRY, ARCHIVIST
   - lab: STRATEGIST, QUANT, RISK
   - etsy: the five Etsy agents
   - services: the six `service-*` agents
   - youtube: the seven `video-*` agents

   The counts match the handoff (7/5/6/7/3), but `gritty-os-model.js` is the authority.
2. **Focusing a specific record.** `GrittyOS.open(deptId)` is confirmed. Opening it focused on one approval or
   failure is not. If the command deck has, or can get, something like `GrittyOS.open(deptId, { focus })`, the
   signal flag should use it.
3. **Dossier lane names.** The fleet assumes `'brief'`, `'character'` and `'config'`, taken from the shared handoff.
4. **Ranks.** The fleet assumes Admiral = `agent` (GRITTY); captains = `drafter`, `service-lead`, `video-lead`.
   Market Lab has no captain, and none is invented. A Commodore and any Lab command need Dan's decision.
5. **Operations deck names.** "Command deck", "Counting house" and "Chart room" are placeholders for rooms
   `r257`, `r262` and `r264`.
6. **What counts as a handoff event.** Which bus events carry a stable id and a source/target department.
7. **Font.** Plates use VT323, which StarNet already bundles (`frontend/assets/fonts/vt323.woff2`). Check that the
   PC's CSS declares the `@font-face` before `fleet.css` loads.

## Art

All art is generated in code at 480×270 logical pixels. It is original, with no upstream or third-party assets.
Each builder in `fleet-art.js` returns a canvas, so hand-made sprite sheets can replace them one by one. Dan's
existing 15 avatars are **not** used yet: the crew are generic pirates in department colours. Mapping the
established avatars onto crew sprites is the next art decision. The entertainment game can reuse
`fleet-art.js` and `fleet.js` with its own simulated `getInput()`. It must never receive the PC's
`fleet-source.js` or any credentials.
