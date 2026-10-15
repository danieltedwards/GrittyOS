/* GRITTY FLEET — fleet-fixture.js : SIMULATED input for the preview only.

   Shaped like Dan's real station: the 28 agent IDs and names come from the station export of 2026-10-15, and the
   department IDs, room IDs, crew counts and postures from GRITTY_OS_SHARED_HANDOFF.md. Which agent belongs to
   which department is ASSUMED here (the PC's gritty-os-model.js is the authority). All statuses and evidence
   records are invented for the preview. Never load this file in the live app. */
'use strict';
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GrittyFleetFixture = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const departments = [
    { id: 'operations', name: "Admiral's Flagship", rooms: ['r257', 'r262', 'r264'], posture: 'Manual operations', captainId: 'agent',
      deckNames: ['Command deck', 'Counting house', 'Chart room'] },
    { id: 'etsy', name: 'Etsy', rooms: ['r260'], posture: 'Artwork paused', captainId: 'drafter' },
    { id: 'services', name: 'Services', rooms: ['r348'], posture: 'Inactive', captainId: 'service-lead' },
    { id: 'youtube', name: 'YouTube', rooms: ['r349'], posture: 'Inactive', captainId: 'video-lead' },
    { id: 'lab', name: 'Market Lab', rooms: ['r258'], posture: 'Dormant', captainId: null }
  ];
  const R = (agentId, name, deptId, status) => ({ agentId, name, deptId, status: status || 'idle' });
  const roster = [
    R('agent', 'GRITTY', 'operations'), R('chief', 'CHIEF OF STAFF', 'operations'), R('treasurer', 'TREASURER', 'operations'),
    R('researcher', 'RESEARCHER', 'operations'), R('writer', 'SCRIPTWRITER', 'operations'), R('harvester', 'TELEMETRY', 'operations', 'unknown'),
    R('provisioner', 'ARCHIVIST', 'operations'),
    R('drafter', 'ETSY MANAGER', 'etsy'), R('designer', 'ETSY DESIGNER', 'etsy', 'paused'), R('publisher', 'ETSY CONTENT', 'etsy', 'blocked'),
    R('copywriter', 'ETSY COPYWRITER', 'etsy', 'waiting-approval'), R('treasurer-2', 'ETSY TREASURER', 'etsy'),
    R('service-lead', 'SERVICE LEAD', 'services', 'offline'), R('service-intake', 'SERVICE INTAKE', 'services', 'offline'),
    R('service-producer', 'SERVICE PRODUCER', 'services', 'offline'), R('service-qa', 'SERVICE QA', 'services', 'offline'),
    R('service-delivery', 'SERVICE DELIVERY', 'services', 'offline'), R('service-perf', 'SERVICE PERFORMANCE', 'services', 'offline'),
    R('video-lead', 'VIDEO LEAD', 'youtube', 'offline'), R('video-research', 'VIDEO RESEARCH', 'youtube', 'offline'),
    R('video-writer', 'VIDEO WRITER', 'youtube', 'offline'), R('video-producer', 'VIDEO PRODUCER', 'youtube', 'offline'),
    R('video-package', 'VIDEO PACKAGE', 'youtube', 'offline'), R('video-qa', 'VIDEO QA', 'youtube', 'offline'),
    R('video-perf', 'VIDEO PERFORMANCE', 'youtube', 'offline'),
    R('strategist', 'STRATEGIST', 'lab', 'offline'), R('analyst', 'QUANT', 'lab', 'offline'), R('analyst-2', 'RISK', 'lab', 'offline')
  ];
  // Etsy conveyor order from the routing compiler, per the shared handoff. No independent final QA stage exists.
  const conveyors = { etsy: ['designer', 'publisher', 'copywriter'] };
  // t0 is "now" for the preview; ages are relative so the fixture never depends on the real clock.
  function evidence(t0) {
    return [
      { id: 'ap-1', kind: 'approval', deptId: 'etsy', state: 'open', at: t0 - 40 * 60e3, ref: 'approval:ap-1', label: 'Listing draft v2 waits for your approval' },
      { id: 'f-7', kind: 'failure', deptId: 'etsy', state: 'open', blocking: true, at: t0 - 25 * 60e3, ref: 'run:f-7', label: 'ETSY CONTENT blocked: Canva connector needs sign-in again' },
      { id: 'f-2', kind: 'failure', deptId: 'etsy', state: 'resolved', at: t0 - 3 * 864e5, ref: 'run:f-2', label: 'Old timeout, resolved 3 days ago' },
      { id: 'd-1', kind: 'data', deptId: 'operations', state: 'open', at: t0 - 5 * 60e3, ref: 'feed:telemetry', label: 'TELEMETRY status unknown: no data since restart' },
      { id: 'h-1', kind: 'handoff', from: 'operations', to: 'etsy', state: 'open', at: t0 - 20e3, ref: 'task:h-1', label: 'RESEARCHER → ETSY MANAGER: research packet' }
    ];
  }
  return { departments, roster, conveyors, evidence };
});
