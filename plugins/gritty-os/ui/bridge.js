/* Harness.apiFetch(route) → a fetch-style Response, answered by this plugin's backend handler `read`
   (index.js: api.handle('read', ({ route }) => ({ status, body } | { status, binary: <base64>, mime }))). */
window.Harness = {
  apiFetch: async function (route) {
    let r;
    try { r = await starnet.backend.call('read', { route }); }
    catch (e) { return new Response(JSON.stringify({ error: e.message }), { status: 503, headers: { 'Content-Type': 'application/json' } }); }
    if (!r || typeof r !== 'object') return new Response('{}', { status: 502, headers: { 'Content-Type': 'application/json' } });
    if (r.binary) return new Response(Uint8Array.from(atob(r.binary), (c) => c.charCodeAt(0)), { status: r.status, headers: { 'Content-Type': r.mime || 'application/octet-stream' } });
    return new Response(JSON.stringify(r.body ?? null), { status: r.status || 200, headers: { 'Content-Type': 'application/json' } });
  }
};
