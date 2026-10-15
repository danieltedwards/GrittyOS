'use strict';
// Run: node gritty/fleet/test/fleet-doc.test.js
const assert = require('node:assert/strict');
const D = require('../fleet-doc.js');
const F = require('../fleet-fixture.js');

// --- the default document is valid by its own rules ---
{
  const doc = D.defaultDoc(F.departments);
  assert.equal(doc.schema, 'gritty.fleet');
  assert.deepEqual(doc.order, ['operations', 'etsy', 'services', 'youtube', 'lab']);
  assert.equal(doc.ships.operations.hull, 'flagship');
  assert.equal(doc.ships.operations.decks.length, 3, 'one deck per room');
  assert.deepEqual(doc.ships.operations.decks.map(d => d.roomId), ['r257', 'r262', 'r264']);
  for (const id of doc.order) {
    const s = doc.ships[id], r = D.canPlaceShip(doc, id, s.pos.x, s.pos.y);
    assert.equal(r.ok, true, id + ' default berth must be legal: ' + (r.msg || ''));
  }
  assert.deepEqual(D.migrate(doc), doc, 'migrate leaves a valid document unchanged');
}

// --- migrate is total: garbage in, a valid document out ---
{
  for (const raw of [null, 42, 'x', [], {}, { ships: 'nope' }, { ships: { a: null, b: { decks: 'x' } }, order: ['a', 'b', 'b', 'zz'] }]) {
    const m = D.migrate(raw);
    assert.equal(m.schema, 'gritty.fleet');
    assert.ok(Array.isArray(m.order));
    for (const id of m.order) assert.ok(m.ships[id].decks.length >= 1, 'every ship has at least one deck');
  }
  const m = D.migrate({ ships: { b: { decks: 'x' } }, order: ['b', 'b'] });
  assert.deepEqual(m.order, ['b'], 'duplicate order entries collapse');
}
{
  // anything that is not layout is dropped: no permissions, tools or models can ride in the file
  const m = D.migrate({ ships: { etsy: { deptId: 'etsy', hull: 'galleon', permissions: ['shell.exec'], tools: ['fs.write'], model: 'x',
    decks: [{ roomId: 'r260', props: [{ type: 'easel', x: 9999 }, { type: 'workbench', grants: 'fs.write' }, { type: 'rocket' }] }],
    stations: { designer: { deck: 7, x: -50, tool: 'shell' } } } } });
  const s = m.ships.etsy;
  assert.equal(s.hull, 'brig', 'unknown hull falls back');
  assert.equal(s.permissions, undefined); assert.equal(s.tools, undefined); assert.equal(s.model, undefined);
  assert.deepEqual(s.decks[0].props, [{ type: 'easel', x: D.BOUNDS.deckX1 }, { type: 'workbench', x: null }], 'unknown props and extra keys are dropped; x is clamped');
  assert.deepEqual(s.stations.designer, { deck: 0, x: D.BOUNDS.deckX0 }, 'station deck and x are clamped');
}

// --- edits validate first and never half-apply ---
{
  const f = D.create(D.defaultDoc(F.departments)), etsy = () => f.get().ships.etsy;
  const start = { ...etsy().pos };
  assert.equal(f.moveShip('etsy', 338, 188).error, 'aground', 'cannot berth on the island');
  assert.equal(f.moveShip('etsy', 138, 202).error, 'collision', 'cannot berth on another ship');
  assert.equal(f.moveShip('etsy', 5, 5).error, 'out-of-bounds');
  assert.deepEqual(etsy().pos, start, 'refused moves change nothing');
  assert.equal(f.canUndo(), false, 'refused moves leave no undo step');
  assert.equal(f.moveShip('etsy', 200, 40).ok, true);
  assert.deepEqual(etsy().pos, { x: 200, y: 40 });
  assert.equal(f.addProp('etsy', 0, 'rocket').error, 'unknown-prop');
  assert.equal(f.addProp('etsy', 3, 'easel').error, 'no-deck');
  assert.equal(f.addProp('etsy', 0, 'chest', 300).ok, true);
  assert.equal(f.renameShip('etsy', '   ').error, 'empty-name');
  assert.equal(f.renameShip('etsy', 'The Brass Quill').ok, true);
  assert.equal(etsy().name, 'The Brass Quill');
}

// --- undo / redo / transact ---
{
  const f = D.create(D.defaultDoc(F.departments));
  f.moveShip('lab', 560, 150); f.renameShip('lab', 'Night Owl');
  assert.equal(f.get().ships.lab.name, 'Night Owl');
  f.undo(); assert.equal(f.get().ships.lab.name, 'Market Lab');
  f.undo(); assert.deepEqual(f.get().ships.lab.pos, { x: 546, y: 96 });
  assert.equal(f.undo().error, 'nothing');
  f.redo(); assert.deepEqual(f.get().ships.lab.pos, { x: 560, y: 150 });
  // a compound edit is one undo step, and a refused one rolls back completely
  const before = f.serialize();
  const bad = f.transact(api => { api.renameShip('lab', 'Half'); return api.moveShip('lab', 338, 188); });
  assert.equal(bad.ok, false); assert.equal(f.serialize(), before, 'refused transaction leaves the document untouched');
  assert.equal(f.transact(api => { api.renameShip('lab', 'A'); api.renameDeck('lab', 0, 'Instrument deck'); return { ok: true }; }).ok, true);
  f.undo(); assert.equal(f.get().ships.lab.name, 'Market Lab'); assert.equal(f.get().ships.lab.decks[0].name, 'Deck');
}

// --- change notifications ---
{
  const f = D.create(D.defaultDoc(F.departments)), seen = [];
  f.onChange(p => seen.push(p.op));
  f.moveShip('etsy', 200, 40); f.moveShip('etsy', 338, 188); f.undo();
  assert.deepEqual(seen, ['moveShip', 'undo'], 'refused edits do not notify');
}

console.log('fleet-doc.test: OK');
