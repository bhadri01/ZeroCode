#!/usr/bin/env node
// Orchestrates the web build (replaces `pnpm -r build`).
//
// Honors VITE_HIDE_DOCS=true: the Astro docs build is skipped entirely and
// assemble-dist.mjs leaves docs out of dist/, so /docs/ 404s in production.
// Default (unset/false) builds and ships docs as before.

import { execSync } from 'node:child_process';

const hideDocs = process.env.VITE_HIDE_DOCS === 'true';
const run = (cmd) => execSync(cmd, { stdio: 'inherit' });

run('pnpm build:app');
if (hideDocs) {
  console.log('VITE_HIDE_DOCS=true → skipping docs build');
} else {
  run('pnpm build:docs');
}
run('node ./scripts/assemble-dist.mjs');
