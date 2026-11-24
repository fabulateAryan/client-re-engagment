import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

/**
 * Hexagonal boundary for src/core.
 *
 * The core is pure TypeScript. It may only import other files inside core/
 * using relative paths. That rules out @nestjs/*, HTTP clients, database
 * clients, Node built-ins and any other package, plus anything in adapters/,
 * config/, app.module or main.
 */
export const coreBoundaryRule = [
  'error',
  {
    patterns: [
      {
        regex: '^[^.]',
        message:
          'core/ must stay pure TypeScript: no package or Node built-in imports (@nestjs/*, HTTP, DB clients, etc.). Define a port in core/ports instead.',
      },
      {
        regex: '(^|/)(adapters|config)(/|$)|(^|/)(app\\.module|main)$',
        message:
          'core/ must not import from adapters/, config/, app.module or main. Dependencies point inwards only.',
      },
    ],
  },
];

export default defineConfig(
  globalIgnores(['dist', 'coverage']),
  js.configs.recommended,
  tseslint.configs.strict,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      // Nest modules and controllers are decorated classes; empty ones are normal.
      '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],
    },
  },
  {
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': coreBoundaryRule,
    },
  },
  prettier,
);
