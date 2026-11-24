/**
 * Proves the ESLint rule that keeps src/core pure is active: lints small snippets as if
 * they lived in core/ and expects violations to be reported. `pnpm lint` enforces the
 * rule on the real code; this test guards against the rule being misconfigured or removed.
 */
import { ESLint } from 'eslint';
import { join } from 'node:path';

const apiRoot = join(__dirname, '..', '..');

async function coreImportViolations(code: string, file = 'src/core/domain/example.ts') {
  const eslint = new ESLint({ cwd: apiRoot });
  const [result] = await eslint.lintText(code, { filePath: join(apiRoot, file) });
  return (result?.messages ?? []).filter((m) => m.ruleId === 'no-restricted-imports');
}

describe('core import boundary', () => {
  it.each([
    ["import { Injectable } from '@nestjs/common';"],
    ["import axios from 'axios';"],
    ["import { Pool } from 'pg';"],
    ["import { readFileSync } from 'node:fs';"],
    ["import type { AppConfig } from '../../config';"],
    ["import { FakeClock } from '../../adapters/outbound/fakes';"],
    ["import { AppModule } from '../../app.module';"],
  ])('rejects %s', async (statement) => {
    const violations = await coreImportViolations(`${statement}\nexport {};\n`);
    expect(violations).toHaveLength(1);
  });

  it('allows relative imports within core', async () => {
    const violations = await coreImportViolations(
      "import { Platform } from '../domain';\nexport const p = Platform.LINKEDIN;\n",
      'src/core/application/example.ts',
    );
    expect(violations).toEqual([]);
  });

  it('does not restrict adapters', async () => {
    const violations = await coreImportViolations(
      "import { Injectable } from '@nestjs/common';\nexport const i = Injectable;\n",
      'src/adapters/outbound/example.ts',
    );
    expect(violations).toEqual([]);
  });
});
