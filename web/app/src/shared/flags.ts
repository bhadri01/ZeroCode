/*
 * Build-time feature flags. Vite inlines `import.meta.env.VITE_*` at build
 * time, so these become plain constants in the bundle (dead code for the
 * hidden branch is dropped).
 *
 * VITE_HIDE_DOCS=true hides the documentation surface for a launch where the
 * docs aren't ready yet:
 *   - every /docs/* link is dropped from the UI,
 *   - "get started" / "quickstart" CTAs fall back to the playground,
 *   - the Astro docs site is excluded from the built bundle
 *     (see web/scripts/build.mjs + assemble-dist.mjs) so /docs/ returns 404.
 *
 * Default is OFF (docs shown) so `pnpm dev` keeps docs during development.
 * The production image turns it on (see deploy/Dockerfile.service); flip it
 * back to false / unset to restore docs.
 */
export const HIDE_DOCS = import.meta.env.VITE_HIDE_DOCS === 'true';

// Where "get started" CTAs point. With docs hidden, send visitors to the
// playground so they still have a clear next step.
export const GET_STARTED_HREF = HIDE_DOCS ? '/playground.html' : '/docs/quickstart';
