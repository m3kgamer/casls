// Minimal stand-in for node:assert/strict so core.test.mjs can also run in a browser (tests/index.html).
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const fail = (m, a, b) => { throw new Error(`${m || 'assertion failed'}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`); };
export default {
  equal: (a, b, m) => { if (a !== b) fail(m, a, b); },
  deepEqual: (a, b, m) => { if (!eq(a, b)) fail(m, a, b); },
  ok: (v, m) => { if (!v) fail(m, v, true); },
};
