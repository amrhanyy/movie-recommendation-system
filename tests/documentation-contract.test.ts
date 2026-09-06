import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const readme = readFileSync(resolve(ROOT, 'README.md'), 'utf8');
const ci = readFileSync(resolve(ROOT, '.github/workflows/ci.yml'), 'utf8');
const pkg = JSON.parse(
  readFileSync(resolve(ROOT, 'package.json'), 'utf8') as string
) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string>; overrides?: Record<string, string> };
const lock = JSON.parse(
  readFileSync(resolve(ROOT, 'package-lock.json'), 'utf8') as string
) as { packages?: Record<string, { version?: string }> };

function lockVersion(name: string): string {
  const entry = lock.packages?.[`node_modules/${name}`];
  return entry?.version ?? '';
}

function parseSemver(v: string): number[] {
  return v.split('.').map((p) => Number(p.replace(/\D.*$/, '')));
}

function gte(v: string, min: string): boolean {
  const a = parseSemver(v);
  const b = parseSemver(min);
  for (let i = 0; i < 3; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return true;
}

function section(title: string): string {
  const start = readme.indexOf(`## ${title}`);
  if (start === -1) return '';
  const next = readme.indexOf('\n## ', start + 1);
  return next === -1 ? readme.slice(start) : readme.slice(start, next);
}

// ---------------------------------------------------------------------------
// R8 README contract
// ---------------------------------------------------------------------------
describe('R8 README contract', () => {
  it('does not mention Prisma', () => {
    expect(readme.toLowerCase()).not.toContain('prisma');
  });

  it('does not mention ioredis', () => {
    expect(readme.toLowerCase()).not.toContain('ioredis');
  });

  it('does not instruct normal users to run setup-db', () => {
    const installation = section('Installation');
    expect(installation).not.toContain('setup-db');
    const gettingStarted = section('Getting Started');
    expect(gettingStarted).toBe(''); // stale section removed
    // The database-operations section explicitly warns against normal use.
    const db = section('Database operations');
    expect(db).toContain('Do not run `npm run setup-db` as part of normal setup');
    expect(db).toContain('must never run against production');
  });

  it('recommends npm ci for installation', () => {
    const installation = section('Installation');
    expect(installation).toContain('npm ci');
  });

  it('refers to .env.example', () => {
    expect(readme).toContain('.env.example');
  });

  it('documents Redis as optional', () => {
    expect(readme).toContain('Redis is optional');
  });

  it('documents REDIS_URL precedence', () => {
    expect(readme).toContain('`REDIS_URL` takes precedence');
  });

  it('documents all quality commands', () => {
    for (const cmd of [
      'npm run lint',
      'npm run typecheck',
      'npm test',
      'npm run test:coverage',
      'npm run build',
      'npm run verify',
    ]) {
      expect(readme).toContain(cmd);
    }
  });

  it('links OPERATIONS.md, SECURITY.md, PRIVACY.md, and DEPLOYMENT_SECURITY_CHECKLIST.md', () => {
    for (const doc of [
      'OPERATIONS.md',
      'SECURITY.md',
      'PRIVACY.md',
      'DEPLOYMENT_SECURITY_CHECKLIST.md',
    ]) {
      expect(readme).toContain(doc);
    }
  });

  it('contains no editor-export classes or lexical attributes', () => {
    expect(readme).not.toContain('data-lexical-text');
    expect(readme).not.toContain('fai-');
    expect(readme).not.toContain('spellcheck=');
    expect(readme).not.toMatch(/class(Name)?="[^"]*___/);
    expect(readme).not.toMatch(/<br\s*\/?>/);
  });

  it('does not claim live external integration testing', () => {
    const testing = section('Testing');
    expect(testing.toLowerCase()).toContain('staging verification remains required');
    expect(readme.toLowerCase()).not.toContain('tests prove live');
    expect(readme.toLowerCase()).not.toContain('proves live oauth');
  });
});

// ---------------------------------------------------------------------------
// R8 CI contract (after dependency updates)
// ---------------------------------------------------------------------------
describe('R8 CI contract', () => {
  it('still uses npm ci', () => {
    expect(ci).toContain('npm ci');
    expect(ci).not.toMatch(/npm install\b/);
  });

  it('has no continue-on-error', () => {
    expect(ci).not.toContain('continue-on-error');
  });

  it('does not run audit fix', () => {
    // The workflow may document the prohibition, but must never execute it.
    expect(ci).not.toMatch(/run:\s*[^\n]*npm audit fix/);
    expect(ci).not.toContain('npm audit fix --force');
    expect(ci).toContain('npm audit --audit-level=high --omit=dev');
  });

  it('keeps gitleaks and read-only permissions', () => {
    expect(ci).toContain('gitleaks');
    expect(ci).toContain('contents: read');
  });
});

// ---------------------------------------------------------------------------
// R8 resolved dependency versions vs reported vulnerable ranges
// ---------------------------------------------------------------------------
describe('R8 dependency versions', () => {
  it('postcss resolves outside the vulnerable range (<= 8.5.22)', () => {
    const v = lockVersion('postcss');
    expect(v).not.toBe('');
    expect(gte(v, '8.5.26')).toBe(true);
  });

  it('sharp resolves outside the vulnerable range (< 0.35.0)', () => {
    const v = lockVersion('sharp');
    expect(v).not.toBe('');
    expect(gte(v, '0.35.0')).toBe(true);
  });

  it('exactly one Next.js version resolves and it stays on the current major', () => {
    const keys = Object.keys(lock.packages ?? {}).filter((k) =>
      k.endsWith('node_modules/next') || k === 'node_modules/next'
    );
    expect(keys.length).toBe(1);
    const v = lockVersion('next');
    expect(v.startsWith('15.')).toBe(true);
  });

  it('overrides remain declared in package.json', () => {
    expect(pkg.overrides?.postcss).toBe('8.5.26');
    expect(pkg.overrides?.sharp).toBe('0.35.3');
    expect(pkg.devDependencies?.postcss).toBe('8.5.26');
  });

  it('redis client is the redis package (not ioredis) and lockfile agrees', () => {
    expect(pkg.dependencies?.redis).toBeDefined();
    expect(pkg.dependencies?.ioredis).toBeUndefined();
    expect(existsSync(resolve(ROOT, 'node_modules/redis/package.json'))).toBe(true);
  });
});
