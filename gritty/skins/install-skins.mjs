// Install (or remove) the GRITTY pirate skin pack into a StarNet source checkout.
//
//   node gritty/skins/install-skins.mjs <path-to-starnet-source> [--dry-run] [--uninstall]
//
// What it changes, and nothing else:
//   1. copies gritty/skins/pack/approved_gritty_* folders into <root>/frontend/assets/sprites/
//   2. adds their frame lists to <root>/frontend/assets/sprites/manifest.json (existing keys are left alone)
//   3. adds one DATA.SKINS line per pirate to <root>/frontend/app/data-shim.js, inside a marked block
// Re-running is safe (it replaces its own block and frames). --uninstall removes exactly those three things.
// The packaged Windows app embeds the frontend: rebuild it afterwards to see the skins there.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2), dry = args.includes('--dry-run'), uninstall = args.includes('--uninstall');
const root = args.find(a => !a.startsWith('--'));
if (!root) { console.error('usage: node gritty/skins/install-skins.mjs <path-to-starnet-source> [--dry-run] [--uninstall]'); process.exit(2); }
const spritesDir = path.join(root, 'frontend/assets/sprites'), manifestPath = path.join(spritesDir, 'manifest.json');
const shimPath = path.join(root, 'frontend/app/data-shim.js'), pack = path.join(here, 'pack');
for (const p of [spritesDir, manifestPath, shimPath]) if (!fs.existsSync(p)) { console.error('not a StarNet source checkout: missing ' + p); process.exit(1); }
if (!uninstall && !fs.existsSync(path.join(pack, 'skins.json'))) { console.error('pack not built: run node gritty/skins/build-skins.mjs first'); process.exit(1); }

const BEGIN = '  /* GRITTY pirate skins (gritty/skins/install-skins.mjs) — begin */', END = '  /* GRITTY pirate skins — end */';
const log = m => console.log((dry ? '[dry-run] ' : '') + m);

// 1. frames
const sets = uninstall ? fs.readdirSync(spritesDir).filter(d => d.startsWith('approved_gritty_')) : fs.readdirSync(pack).filter(d => d.startsWith('approved_gritty_'));
for (const set of sets) {
  const dst = path.join(spritesDir, set);
  if (!dry) fs.rmSync(dst, { recursive: true, force: true });
  if (!uninstall) { if (!dry) fs.cpSync(path.join(pack, set), dst, { recursive: true }); log('frames  ' + set + ' (' + fs.readdirSync(path.join(pack, set)).length + ')'); }
  else log('removed ' + set);
}

// 2. manifest
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
for (const k of Object.keys(manifest.sprites)) if (k.startsWith('approved_gritty_')) delete manifest.sprites[k];
if (!uninstall) {
  const add = JSON.parse(fs.readFileSync(path.join(pack, 'manifest-additions.json'), 'utf8')).sprites;
  for (const [k, v] of Object.entries(add)) manifest.sprites[k] = v;
  log('manifest +' + Object.keys(add).length + ' tracks');
}
if (!dry) fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

// 3. DATA.SKINS lines, in a marked block right after "DATA.SKINS = {"
let shim = fs.readFileSync(shimPath, 'utf8');
const bi = shim.indexOf(BEGIN);
if (bi >= 0) { const ei = shim.indexOf(END, bi); shim = shim.slice(0, bi) + shim.slice(shim.indexOf('\n', ei) + 1); }
if (!uninstall) {
  const skins = JSON.parse(fs.readFileSync(path.join(pack, 'skins.json'), 'utf8'));
  const lines = Object.entries(skins).map(([id, s]) => '  ' + id + ': ' + JSON.stringify({ name: s.name, set: s.set, scale: s.scale, sourceStandingHeight: s.sourceStandingHeight }) + ',');
  const anchor = shim.indexOf('DATA.SKINS = {');
  if (anchor < 0) { console.error('could not find "DATA.SKINS = {" in data-shim.js'); process.exit(1); }
  const at = shim.indexOf('\n', anchor) + 1;
  shim = shim.slice(0, at) + BEGIN + '\n' + lines.join('\n') + '\n' + END + '\n' + shim.slice(at);
  log('data-shim.js +' + lines.length + ' skins');
} else log('data-shim.js block removed');
if (!dry) fs.writeFileSync(shimPath, shim);
log(uninstall ? 'uninstalled' : 'installed — pick a pirate in an agent\'s CONFIG → appearance. Rebuild the desktop app to see it there.');
