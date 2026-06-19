// Test-runner only: neutralize the `server-only` marker so server modules that
// `import 'server-only'` can be unit-tested under node+tsx. Scoped to this single
// specifier — React et al. keep their normal (default) resolution.
export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'server-only') {
    return { url: 'data:text/javascript,export%20default%20undefined', shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
