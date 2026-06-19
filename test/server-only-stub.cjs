// Test-runner only: no-op replacement for the `server-only` marker package so
// server modules that `import 'server-only'` can be unit-tested under node+tsx.
// tsx compiles the TS sources to CommonJS, so the marker arrives here via
// `require('server-only')`; resolving it to this empty module makes it a no-op.
module.exports = {};
