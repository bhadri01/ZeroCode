#!/usr/bin/env node
// Assemble the unified web/dist/ that zerocode-api serves.
//   web/app/dist/*    -> web/dist/
//   web/docs/dist/*   -> web/dist/docs/

import { cp, rm, mkdir, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const appDist = resolve(root, 'app/dist');
const docsDist = resolve(root, 'docs/dist');
const outDir = resolve(root, 'dist');

// When docs are hidden for a launch, they are neither built nor served.
const hideDocs = process.env.VITE_HIDE_DOCS === 'true';

async function exists(p) {
  try { await stat(p); return true; } catch { return false; }
}

if (!(await exists(appDist))) throw new Error(`missing ${appDist} — run pnpm build:app first`);
if (!hideDocs && !(await exists(docsDist))) throw new Error(`missing ${docsDist} — run pnpm build:docs first`);

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
await cp(appDist, outDir, { recursive: true });
if (hideDocs) {
  console.log('VITE_HIDE_DOCS=true → docs excluded from dist (/docs/ will 404)');
} else {
  await cp(docsDist, resolve(outDir, 'docs'), { recursive: true });
}

console.log(`assembled ${outDir}`);
