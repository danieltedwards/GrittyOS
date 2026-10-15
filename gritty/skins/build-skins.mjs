// Build the pirate skin pack: renders every frame in Chromium (the same canvas code the app uses) and writes
// StarNet-format PNG folders plus the manifest and DATA.SKINS entries to merge.
// Run: node gritty/skins/build-skins.mjs   (needs Playwright's Chromium; PLAYWRIGHT_BROWSERS_PATH is preset in cloud sessions)
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

const out = path.join(here, 'pack');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent('<html><body></body></html>');
await page.addScriptTag({ path: path.join(here, '../fleet/fleet-pixel.js') });
await page.addScriptTag({ path: path.join(here, 'pirate-skins.js') });
const pack = await page.evaluate(() => {
  const S = window.GrittyPirateSkins, res = [];
  for (const ch of S.CHARACTERS) {
    const set = 'approved_' + ch.id, fr = S.frames(ch), files = {};
    for (const [name, px] of Object.entries(fr)) files[name] = px.toCanvas().toDataURL('image/png');
    res.push({ set, ch: { id: ch.id, name: ch.name, role: ch.role }, files, manifest: S.manifestEntries(set, Object.keys(fr)) });
  }
  return res;
});
await browser.close();

const manifest = {}, skins = {};
for (const sk of pack) {
  const dir = path.join(out, sk.set);
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, url] of Object.entries(sk.files)) fs.writeFileSync(path.join(dir, name + '.png'), Buffer.from(url.split(',')[1], 'base64'));
  Object.assign(manifest, sk.manifest);
  skins[sk.ch.id] = { name: sk.ch.name, set: sk.set, scale: 0.25, sourceStandingHeight: 76, gritty: true, suggestedFor: sk.ch.role };
}
fs.writeFileSync(path.join(out, 'manifest-additions.json'), JSON.stringify({ sprites: manifest }, null, 2) + '\n');
fs.writeFileSync(path.join(out, 'skins.json'), JSON.stringify(skins, null, 2) + '\n');
console.log('built', pack.length, 'skins,', pack.reduce((n, s) => n + Object.keys(s.files).length, 0), 'frames →', path.relative(process.cwd(), out));
