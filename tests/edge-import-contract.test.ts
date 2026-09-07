import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

/**
 * Edge-import contract (M3-BF): `node:net` must live in exactly one module.
 *
 * Background: `lib/env.ts` once imported `BlockList` from `node:net`, and
 * `instrumentation.ts` imports `./lib/env`. Webpack cannot resolve `node:`
 * URIs in that bundle (`UnhandledSchemeError`), breaking `npm run build`.
 * The fix isolates all `node:net` matching in `lib/security/proxy-cidr.ts`;
 * this suite is the tripwire — any new `node:net` importer fails loudly.
 */

const ROOT = process.cwd();

function read(rel: string): string {
  return readFileSync(resolve(ROOT, rel), 'utf8');
}

function walkTs(dirRel: string, out: string[] = []): string[] {
  const dir = resolve(ROOT, dirRel);
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const rel = join(dirRel, name);
    const full = resolve(ROOT, rel);
    const st = statSync(full);
    if (st.isDirectory()) {
      walkTs(rel, out);
    } else if (/\.tsx?$/.test(name)) {
      out.push(rel);
    }
  }
  return out;
}

const NODE_NET = /from\s+["']node:net["']/;

describe('edge-import contract: node:net isolation', () => {
  it('lib/env.ts has zero node: imports (edge-safe for instrumentation)', () => {
    const src = read('lib/env.ts');
    expect(src).not.toMatch(/from\s+["']node:/);
    expect(src).not.toContain('proxy-cidr');
  });

  it('instrumentation.ts and middleware.ts never import node:net directly', () => {
    expect(read('instrumentation.ts')).not.toMatch(NODE_NET);
    expect(read('middleware.ts')).not.toMatch(NODE_NET);
  });

  it('lib/security/proxy-cidr.ts is the sole node:net importer under lib/ and app/', () => {
    const files = [...walkTs('lib'), ...walkTs('app')];
    const hits = files.filter((f) => NODE_NET.test(read(f)));
    expect(hits.map((f) => f.replace(/\\/g, '/'))).toEqual(['lib/security/proxy-cidr.ts']);
  });
});
