#!/usr/bin/env node
// install-git-hooks — point THIS repository's git at scripts/git-hooks (Batch 4, 2026-11-04: the pre-push checks).
// Sets core.hooksPath in this repo's own .git/config only; never the global config. Run by `npm install` (prepare).
// Never fails an install: on CI / Vercel, outside a git checkout, or if git is missing, it does nothing.
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
try {
  if (process.env.CI || process.env.VERCEL) process.exit(0);
  const top = execFileSync('git', ['-C', ROOT, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  if (!top || !existsSync(join(ROOT, 'scripts/git-hooks/pre-push'))) process.exit(0);
  chmodSync(join(ROOT, 'scripts/git-hooks/pre-push'), 0o755);
  execFileSync('git', ['-C', ROOT, 'config', '--local', 'core.hooksPath', 'scripts/git-hooks']);
  console.log('git hooks: scripts/git-hooks (pre-push checks) for this repository');
} catch { /* not a git checkout, or no git: nothing to install */ }
