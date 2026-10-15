# GRITTY fleet: art brief for ChatGPT

Hand this whole file to ChatGPT together with **the captain sprite sheet**, so the style and scale match.
Claude wires the images in: it cuts them out, marks floors, ladders, desks, cabin and hold, and adds the
walking crew, lighting, reflections and alerts on top.

## Rules for every image

- **Pixel art**, in the same style and scale as the attached captain sprite.
- Weathered pirate fleet: rusty, desaturated, lantern-lit dusk. Think FAR: Lone Sails meets Barotrauma.
- **No people or creatures** in any image. The crew are added live.
- **Transparent background.** If that isn't possible, use flat magenta `#FF00FF` behind the subject.
- One subject per image. No text, labels or watermarks.

## 1. Ship cutaways (side view, cross-section). The most important images

One per ship, each **at least 2560×1440**, wide format, the ship filling most of the width:

| File | Ship | Working decks inside |
| --- | --- | --- |
| `cutaway-flagship.png` | Admiral's flagship (GRITTY, operations) | **3**: command deck, counting house, chart room |
| `cutaway-etsy.png` | Etsy ship | 1 or 2: print workshop (easels, hanging prints, paint shelves) |
| `cutaway-services.png` | Services ship | 1 or 2: workshop (workbenches, tool walls) |
| `cutaway-youtube.png` | YouTube ship | 1 or 2: film studio (camera, stage lights, storyboards) |
| `cutaway-lab.png` | Market Lab ship | 1 or 2: laboratory (instrument racks, chalkboards, charts) |

Every cutaway must have:
- **Flat, empty floors** running the full width of each deck. Nothing standing on the walkway.
- **Ceilings about twice the captain's height**.
- **One ladder or stairwell** joining all decks, near the back (stern) end.
- **Desks or workstations against the back wall**, one per crew member (3–7), with space for a person to sit in front of each.
- **A captain's cabin** at the stern, with a **flat railed roof deck** on top where the captain stands.
- **A cargo hold** at the bottom with treasure chests, crates and barrels.
- Masts, rigging and patched sails above. The hull is cut away so the decks are visible.

Prompt to paste (change the deck line per ship):

> Pixel-art side-view cutaway cross-section of a weathered pirate ship, same pixel style and scale as the attached
> captain sprite. Three interior decks stacked vertically, each with a flat, empty wooden floor running the full width
> and a ceiling about twice the captain's height. One ladder connects all decks near the stern. Desks with pinned maps
> and lanterns stand only against the back wall. Captain's cabin at the stern with a flat railed roof deck. Cargo hold
> with treasure chests at the bottom. Masts with patched sails and rigging above. Rusty, desaturated, lantern-lit dusk
> colours. No people. Transparent background. 2560×1440.

## 2. Sky and sea behind the cutaways

`backdrop-dusk.png`, **2560×1440**:
- Dusk sky over the sea, with distant sea stacks and clouds.
- Horizon about 57% down from the top.
- No ships, and opaque, not transparent.

## 3. Fleet view (top-down)

- `harbour.png`, **2560×1440**: the sea from directly above, with an island in the middle and a small dock on its west side. No ships.
- Top-down ships, transparent background, bow pointing **right**, each about 600px long:
  - `top-flagship.png` and `top-flagship-furled.png` (the flagship larger than the others)
  - `top-etsy.png`, `top-services.png`, `top-youtube.png`, `top-lab.png`, each with a matching `-furled.png` version

## 4. Optional extras

All with transparent backgrounds:
- `enemy-side.png` and `enemy-top.png`: black-sailed raider ship, side view and top-down.
- `chest.png`, `crate.png`, `barrel.png` at captain scale.
- `belt.png`: a short straight piece of wooden conveyor with brass rollers, side view.

## After the images are made

Upload them to the GRITTY conversation with Claude. Mismatched sizes are fine: Claude scales and cuts them.
If a cutaway comes back with furniture blocking a floor, or no ladder, ask ChatGPT to redo that one. The crew
need clear floors and a ladder to walk on.

## Round 1 result (2026-10-15)

Five paintings arrived (Sovereign, Artificer, Raider, Signal, Alchemist) and are wired in: `ship-art/` + `fleet-shipart.js`.
Sovereign is operations, Artificer is Etsy, Raider is Services, Signal is YouTube and Alchemist is the Lab.
Each painting combined a top-down view with a cutaway, so only the cutaway half is used. Painted crew stand in
every room, which competes with the live crew. For round 2, ask ChatGPT for each ship:

> The same cutaway as before (keep the ship, rooms and style exactly), but with **no people, animals or figures anywhere**, no title,
> no top-down view. Keep the floors clear between the desks. Extend the masts and sails fully to the top of the image. 16:9.
