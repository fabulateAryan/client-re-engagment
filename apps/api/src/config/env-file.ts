import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Load a .env file into process.env if it exists. Variables already set in the
 * environment win, so deployment settings are never overridden by a stray file.
 */
export function loadEnvFileIfPresent(path: string): void {
  if (existsSync(path)) {
    process.loadEnvFile(path);
  }
}

/**
 * Load the repository-root env files. `.env.local` is read first, so its values win over
 * `.env`. Both are git-ignored; only `.env.example` is committed.
 */
export function loadRootEnvFiles(repoRoot: string): void {
  loadEnvFileIfPresent(join(repoRoot, '.env.local'));
  loadEnvFileIfPresent(join(repoRoot, '.env'));
}
