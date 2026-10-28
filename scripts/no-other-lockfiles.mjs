// Fails if a non-pnpm lockfile appears anywhere (pnpm is the only package manager).
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
const bad = new Set(['package-lock.json', 'yarn.lock', 'bun.lockb', 'bun.lock', 'npm-shrinkwrap.json']);
const skip = new Set(['node_modules', '.git', '.svelte-kit', '.wrangler', 'data']);
const hits = [];
(function walk(dir) {
  for (const f of readdirSync(dir)) {
    if (skip.has(f)) continue;
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (bad.has(f)) hits.push(p);
  }
})(process.cwd());
if (hits.length) { console.error('Non-pnpm lockfiles found (use pnpm only):\n' + hits.join('\n')); process.exit(1); }
console.log('ok: no non-pnpm lockfiles');
