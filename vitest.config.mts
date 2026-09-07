import { defineConfig } from 'vitest/config';
import path from 'path';

const alias = {
  '@': path.resolve(__dirname, './'),
};

// Vitest 3: replace deprecated environmentMatchGlobs with named projects.
// Node-environment project: .ts tests run under plain Node.
// DOM-environment project: React Testing Library tests (Markdown XSS,
// YouTube iframe attributes) require a browser-like DOM.
export default defineConfig({
  test: {
    testTimeout: 20000,
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['tests/**/*.test.ts'],
        },
        resolve: { alias },
      },
      {
        extends: true,
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: ['tests/**/*.test.tsx'],
        },
        resolve: { alias },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: [
        'app/api/**/*.ts',
        'lib/security/**/*.ts',
        'lib/ai-security.ts',
        'lib/ai-markdown.tsx',
        'lib/gemini-payload.ts',
        'components/SafeYouTubeEmbed.tsx',
        'components/SafeExternalLink.tsx',
      ],
    },
  },
});
