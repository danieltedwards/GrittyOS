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
| `fleet/fleet-pixel.js` | Pixel toolkit: colour ramps, dithering, noise, outlines, a pixel buffer | Yes |
| `fleet/fleet-art.js` | Sprite and prop library drawn in code: crew (per-agent looks and role tools), the Admiral, ~30 props, ships, trees, clouds | Yes, until hand-made sprite sheets replace pieces of it |
| `fleet/fleet-scenes.js` | The harbour and cutaway scenes at 640×360: baked layers, reflections, parallax sky, light pass | Yes |
| `fleet/fleet-crew.js` | Crew simulation: walk to desks, wander, climb ladders, carry handoffs, all driven by real status | Yes |
| `fleet/fleet-skins.js` | Loads StarNet-format skins (the agents' own station avatars) and sizes them for the ship | Yes |
| `fleet/fleet-doc.js` | Fleet layout document: berths, deck names, cosmetic props, crew stations; validated edits, undo | Yes |
| `fleet/fleet.js` | Controller: views, click layer, crew chooser, narrow-screen list | Yes |
| `fleet/preview-skins/gpt_captain/` | Dan's ChatGPT captain, sliced into StarNet frame names, for the preview | No (the PC already has it as a station skin) |
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

1. Copy the "ship it" files to `frontend/app/gritty-fleet/`. The packaged app 404s anything outside `frontend/`.
2. In `frontend/index.html`, load `gritty-fleet/fleet.css`, then `fleet-model.js`, `fleet-doc.js`, `fleet-pixel.js`, `fleet-art.js`, `fleet-scenes.js`, `fleet-crew.js`, `fleet-skins.js`, `fleet.js`,
   **after** `gritty-os.js` and `stationui.js`.
3. Write `frontend/app/gritty-fleet/fleet-source.js`, the one PC-specific file. Its job is
   `getInput()` returning `{ departments, roster, conveyors, evidence }` from `gritty-os-model.js` and
   live state. It is not written here because this fork does not have that model.
   - `departments`: `{ id, name, rooms, posture, captainId, deckNames? }` from the existing department mappings.
   - `roster`: `{ agentId, name, deptId, status }` from the saved roster, with status mapped to one of
     `running | waiting-approval | blocked | failed | paused | idle | offline | unknown`.
   - `conveyors`: `{ etsy: ['designer','publisher','copywriter'] }` from the routing compiler (`pipeline.js`).
   - `evidence`: as in the table above.
4. Give it the agents' own avatars: create a loader on StarNet's sprite folder and map each agent to the skin it
   already wears on the station:
   ```js
   const skins = GrittyFleetSkins.create({ base: 'assets/sprites/' });
   const skinFor = id => { const a = App.agents().find(x => x.id === id), sk = a && DATA.SKINS[a.skin]; return sk ? skins.get(sk.set) : null; };
   ```
   Pass `skinFor` to `mount`. An agent with no loadable skin falls back to the drawn pirate.
   For crew to carry work between stations, handoff evidence needs `fromAgent` and `toAgent`.
5. Mount it as a **Fleet** tab or window in the command deck:
   `GrittyFleet.mount(el, { getInput, host: window, crewChoice: savedChoice, skinFor })`. Call `.refresh()` from the
   U.bus listeners that already update the command deck (run start/end, permission prompt/response,
   deliverable changes). Keep the existing station floor and command deck reachable.
6. Persist the crew-click choice wherever the command deck keeps its settings, not in a separate store.
7. Rebuild and visually check the Windows app. Per the shared handoff, loose frontend file edits do not update
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

Everything is drawn in code at 640×360 logical pixels and is original, with no upstream or third-party assets. The direction is
FAR: Lone Sails weathering, with the techniques from Dan's references (Owlboy, Barotrauma):
- hue-shifted colour ramps, dithering and 1px outlines
- a light pass in which real lights cut through ambient darkness
- reflections, and a parallax sky with far sea stacks and clouds

Light carries status:
- A laid-up ship is dark.
- Each crew member's station lamp is lit only while they are active, and brighter while running.
- The stack smokes only while someone aboard is running.

Each builder in `fleet-art.js` returns a canvas, so hand-made sprite sheets can replace pieces one at a time.
That is the route to the last stretch of quality.

Dan's existing 15 avatars are **not** used yet. Crew get their look (skin, hat, coat, beard) from their agent ID
and hold a tool from their role, such as a brush, quill, coin, book, spyglass or map. Mapping the established
avatars onto crew sprites is the next art decision.

The entertainment game can reuse the art and scenes with its own simulated `getInput()`. It must never receive
the PC's `fleet-source.js` or any credentials.
