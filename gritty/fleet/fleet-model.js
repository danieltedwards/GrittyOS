/* GRITTY FLEET — fleet-model.js : the PURE half of the fleet layer (no DOM, no clock, no RNG).

   It turns operational records into what the fleet draws, and turns a click on the fleet into a call on the
   EXISTING GRITTY OS entry points. It never starts work, changes permissions, or writes a record: a click only
   selects something that already exists (shared handoff, "A visual click selects an existing operational entity").

   Inputs are plain data so the PC app can feed it from gritty-os-model.js and the preview can feed it a fixture:
     departments : [{ id, name, rooms:[roomId], posture, captainId? }]
     roster      : [{ agentId, name, deptId, status }]                 status: see STATUS below
     evidence    : [{ id, kind, deptId, state, blocking?, at, ref?, from?, to? }]
                   kind  'approval' | 'failure' | 'data' | 'handoff'
                   state 'open' | 'resolved'   (handoff events use 'open' only)
   UMD like StarNet's own pure modules: window.GrittyFleetModel in the browser, module.exports under node. */
'use strict';
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GrittyFleetModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Sea states, worst first. 'unknown' outranks 'calm': missing data must never read as calm water.
  const SEA = ['trouble', 'attention', 'unknown', 'calm'];
  const STATUS = ['running', 'waiting-approval', 'blocked', 'failed', 'paused', 'idle', 'offline', 'unknown'];
  const MAX_ATTACKERS = 3;

  const rank = (agentId, dept) => agentId === 'agent' ? 'admiral' : (dept && dept.captainId === agentId ? 'captain' : 'crew');

  /* ---------- alerts: only open, current evidence makes weather ---------- */
  function seaStateFor(deptId, evidence) {
    const mine = (evidence || []).filter(e => e && e.deptId === deptId);
    const open = mine.filter(e => e.state === 'open');
    const troubles = open.filter(e => e.kind === 'failure' && e.blocking);
    const approvals = open.filter(e => e.kind === 'approval');
    const unknown = open.filter(e => e.kind === 'data');
    // a resolved failure, or one that blocks nothing, is history: shown as a logbook flag, never as an attack
    const history = mine.filter(e => e.kind === 'failure' && (e.state === 'resolved' || !e.blocking));
    const level = troubles.length ? 'trouble' : approvals.length ? 'attention' : unknown.length ? 'unknown' : 'calm';
    return {
      level,
      attackers: Math.min(MAX_ATTACKERS, troubles.length),
      reasons: [...troubles, ...approvals, ...unknown].map(e => ({ id: e.id, kind: e.kind, ref: e.ref || null, label: e.label || '' })),
      history: history.map(e => ({ id: e.id, ref: e.ref || null, label: e.label || '' }))
    };
  }

  /* ---------- handoff ropes: only real cross-ship events, deduplicated, inside a time window ---------- */
  function activeHandoffs(evidence, now, ttlMs) {
    const seen = new Set(), out = [];
    for (const e of evidence || []) {
      if (!e || e.kind !== 'handoff' || !e.id || seen.has(e.id)) continue;
      seen.add(e.id);
      if (!e.from || !e.to || e.from === e.to) continue;          // two agents on one ship is not a fleet handoff
      if (!(now - e.at >= 0 && now - e.at < ttlMs)) continue;
      out.push({ id: e.id, from: e.from, to: e.to, ref: e.ref || null, age: now - e.at });
    }
    return out;
  }

  /* ---------- the fleet itself ---------- */
  function buildFleet(input) {
    const depts = (input && input.departments) || [];
    const roster = (input && input.roster) || [];
    const evidence = (input && input.evidence) || [];
    return depts.map(d => {
      const crew = roster.filter(a => a.deptId === d.id).map(a => ({
        id: a.agentId, name: a.name, status: STATUS.includes(a.status) ? a.status : 'unknown', rank: rank(a.agentId, d)
      }));
      return {
        id: d.id, name: d.name, posture: d.posture || 'unknown', rooms: (d.rooms || []).slice(),
        flagship: crew.some(c => c.rank === 'admiral'),
        captainId: d.captainId || null,
        laidUp: /inactive|dormant|deferred/i.test(d.posture || ''),
        crew, sea: seaStateFor(d.id, evidence)
      };
    });
  }

  /* ---------- clicks → existing GRITTY OS entry points ----------
     Hotspot kinds inside a cutaway: 'ship' (the whole vessel / captain's cabin), 'crew', 'conveyor', 'hold',
     'alert'. The crew target depends on Dan's choice: 'workboard' (GrittyOS.openAgent), 'dossier'
     (StationUI.showAgent brief), 'operations' (StationUI.showAgent config lane), or 'ask' (show the chooser). */
  const CREW_CHOICES = {
    workboard: id => ({ fn: 'GrittyOS.openAgent', args: [id] }),
    dossier: id => ({ fn: 'StationUI.showAgent', args: [id, 'brief'] }),
    character: id => ({ fn: 'StationUI.showAgent', args: [id, 'character'] }),
    operations: id => ({ fn: 'StationUI.showAgent', args: [id, 'config'] })
  };
  function targetFor(hit, crewChoice) {
    if (!hit || !hit.kind) return null;
    switch (hit.kind) {
      case 'ship': return { fn: 'GrittyOS.open', args: [hit.deptId] };
      case 'conveyor': return { fn: 'GrittyOS.openWork', args: [hit.deptId] };
      case 'hold': return { fn: 'GrittyOS.openOutputs', args: [hit.deptId] };
      case 'alert':
        // Opens the department where the record lives. Focusing the exact record needs a host function that
        // is not confirmed to exist yet (see INTEGRATION.md); the record id travels along for it.
        return { fn: 'GrittyOS.open', args: [hit.deptId], focus: hit.ref || null };
      case 'crew': {
        const make = CREW_CHOICES[crewChoice];
        return make ? make(hit.agentId) : { fn: 'choose', args: [hit.agentId] };
      }
      default: return null;
    }
  }
  // Resolve "GrittyOS.openWork" on a host object and call it. Returns what happened instead of throwing,
  // so a missing entry point shows as "not available here" rather than a broken click.
  function invoke(host, target) {
    if (!target || target.fn === 'choose') return { ok: false, reason: 'needs-choice' };
    const [ns, name] = target.fn.split('.');
    const fn = host && host[ns] && host[ns][name];
    if (typeof fn !== 'function') return { ok: false, reason: 'missing', fn: target.fn };
    try { fn.apply(host[ns], target.args); return { ok: true, fn: target.fn }; }
    catch (err) { return { ok: false, reason: 'threw', fn: target.fn, message: String(err && err.message || err) }; }
  }

  /* ---------- effect pacing: the sea must not become constant noise ---------- */
  function createPacer(minGapMs) {
    const last = new Map();
    return {
      // true when this ship may fire its next cosmetic effect (cannon puff, attacker lunge) at time `now`
      allow(key, now) {
        const t = last.get(key);
        if (t !== undefined && now - t < minGapMs) return false;
        last.set(key, now); return true;
      }
    };
  }

  return { SEA, STATUS, MAX_ATTACKERS, seaStateFor, activeHandoffs, buildFleet, targetFor, invoke, createPacer };
});
