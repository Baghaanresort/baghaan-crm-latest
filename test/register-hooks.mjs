// Test-runner only: neutralize the `server-only` marker so server modules that
// `import 'server-only'` can be unit-tested under node+tsx. Scoped strictly to the
// single `server-only` specifier — React et al. keep their normal (default)
// resolution (no global `--conditions=react-server`).
//
// Two interception points are needed because tsx transpiles the ESM TypeScript
// sources to CommonJS and loads them via `require()`:
//   1. ESM `resolve` hook  — for any genuine ESM `import 'server-only'`.
//   2. CJS `_resolveFilename` patch — for the `require('server-only')` that tsx
//      actually emits. Without this, CJS resolves `server-only`'s `default`
//      export condition to its `index.js`, which throws by design.
import { register, createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// (1) ESM path: redirect `import 'server-only'` to a no-op data: module.
register('./server-only-stub.mjs', import.meta.url);

// (2) CJS path: resolve `server-only` to a local no-op stub.
const require = createRequire(import.meta.url);
const Module = require('node:module');
const stub = fileURLToPath(new URL('./server-only-stub.cjs', import.meta.url));
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === 'server-only') {
    return stub;
  }
  return originalResolveFilename.call(this, request, ...rest);
};
