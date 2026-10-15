# GRITTY pirate skins for StarNet

Seven original pirate characters in **StarNet's own skin format**. They drop into StarNet's existing appearance
picker and renderer with no code changes: the station floor, crew cards, COMMS avatars and portraits all use them.

| Skin id | Name | Suggested for |
| --- | --- | --- |
| `gritty_admiral` | GRITTY · Admiral | GRITTY |
| `gritty_captain` | Pirate Captain | department leads (ETSY MANAGER, SERVICE LEAD, VIDEO LEAD) |
| `gritty_quartermaster` | Quartermaster | treasurers, managers |
| `gritty_deckhand` | Deckhand | producers, builders |
| `gritty_navigator` | Navigator | researchers, analysts |
| `gritty_gunner` | Gunner | QA, risk |
| `gritty_corsair` | Corsair | writers, designers |

Each skin has the same 64 frames as StarNet's approved skins, as 144×144 PNGs with a 76px figure and feet on row 111:
- standing in 8 directions
- a 6-step walk in each of the 8 directions
- sitting in 4 directions
- 4 typing frames

## Install on the PC

From this repository, pointing at the StarNet source the desktop app is built from:

```
node gritty/skins/install-skins.mjs "C:\path\to\starnet-native-source" --dry-run   # see what it would change
node gritty/skins/install-skins.mjs "C:\path\to\starnet-native-source"
```

It changes exactly three things:
1. It copies the `approved_gritty_*` folders into `frontend/assets/sprites/`.
2. It adds their frames to `frontend/assets/sprites/manifest.json`.
3. It adds 7 lines, in a marked block, to `frontend/app/data-shim.js`.

Re-running is safe. `--uninstall` removes exactly those changes and was tested to restore both files byte for byte.
Then rebuild the desktop app, because its frontend is embedded in the executable, and pick a pirate in an
agent's **CONFIG → Appearance**.

Verified on 2026-10-15 against this fork's StarNet (0.13.2) running in dev mode:
- all 7 pirates appear in the appearance picker
- choosing one updates the crew card, the COMMS avatar and the figure on the station floor

## Changing or adding pirates

The characters are defined in `pirate-skins.js` (`CHARACTERS`): coat, hat, hair, beard, extras like an eyepatch,
epaulettes, a sword or a bandolier, and build. Edit or add an entry, then rebuild the PNGs:

```
node gritty/skins/build-skins.mjs
```

All art is original and drawn in code. No StarNet artwork is reused.
