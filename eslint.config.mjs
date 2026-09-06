import { FlatCompat } from '@eslint/eslintrc';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

export default [
  {
    ignores: ['node_modules/**', '.next/**', 'coverage/**', 'dist/**', 'next-env.d.ts'],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      // Security-relevant and React-hook rules remain at their defaults.
    },
  },
  // Operational Node.js scripts and config files legitimately use CommonJS
  // require() — this is the standard Node runtime syntax, not application code.
  {
    files: ['scripts/**/*.js', 'scripts/**/*.cts', 'tailwind.config.ts'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
];