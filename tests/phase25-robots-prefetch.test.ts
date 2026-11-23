import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const LINK_KEEP = new Set(['/', '/trending', '/top-rated', '/genres', '/privacy']);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) walk(rel, out);
    else if (entry.name.endsWith('.tsx')) out.push(rel);
  }
  return out;
}

interface ParsedLink {
  file: string;
  href: string;
  dynamic: boolean;
  optedOut: boolean;
  gated: boolean;
  tag: string;
}

/**
 * Scans JSX opening tags with a quote/brace-aware state machine. A naive
 * `/<Link\b[\s\S]*?>/` match ends at the first `>` character, which lands
 * inside `onMouseEnter={() => ...}` long before a multi-line tag closes and
 * made a correctly opted-out link look un-opted-out.
 */
function linkTags(file: string): ParsedLink[] {
  const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const out: ParsedLink[] = [];
  let cursor = source.indexOf('<Link');
  while (cursor !== -1) {
    let index = cursor + '<Link'.length;
    let depth = 0;
    let quote: string | null = null;
    for (; index < source.length; index += 1) {
      const char = source[index];
      if (quote) {
        if (char === quote) quote = null;
        continue;
      }
      if (char === '"' || char === "'" || char === '`') {
        quote = char;
        continue;
      }
      if (char === '{') depth += 1;
      else if (char === '}') depth = Math.max(0, depth - 1);
      else if (char === '>' && depth === 0) break;
    }
    const tag = source.slice(cursor, index + 1);
    const literal = tag.match(/href=(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\})/);
    const expression = tag.match(/href=\{([^}]*)\}/);
    const href = literal ? (literal[1] ?? literal[2] ?? literal[3] ?? '') : expression ? `{${expression[1]}}` : '';
    out.push({
      file,
      tag,
      href,
      dynamic: Boolean(expression) || href.includes('${'),
      optedOut: /\bprefetch=\{false\}/.test(tag),
      // Phase 25 (K): a runtime href cannot be classified statically, so it is
      // allowed to carry the public-allowlist ternary instead of a literal
      // opt-out. The allowlist itself is asserted separately below.
      gated: /prefetch=\{PREFETCH_ALLOWED\.has\(href\) \? undefined : false\}/.test(tag),
    });
    cursor = source.indexOf('<Link', index + 1);
  }
  return out;
}

describe('Phase 25 Q: robots policy', () => {
  it('disallows Reflectionbot and blocks non-public paths for other crawlers', async () => {
    const { default: robots } = await import('@/app/robots');
    const result = robots();
    const rules = Array.isArray(result.rules) ? result.rules : [result.rules];

    const reflection = rules.find((rule) => {
      const agents = Array.isArray(rule.userAgent) ? rule.userAgent : [rule.userAgent];
      return agents.includes('Reflectionbot');
    });
    expect(reflection, 'Reflectionbot group must exist').toBeTruthy();
    const disallow = Array.isArray(reflection!.disallow) ? reflection!.disallow : [reflection!.disallow];
    expect(disallow).toContain('/');

    const general = rules.find((rule) => rule.userAgent === '*');
    expect(general, 'general group must exist').toBeTruthy();
    const generalDisallow = Array.isArray(general!.disallow) ? general!.disallow : [general!.disallow];
    for (const required of [
      '/api/',
      '/admin/',
      '/profile/',
      '/favorites/',
      '/watchlist/',
      '/ai-assistant/',
      '/auth/',
      '/search',
      '/movie/',
      '/tv/',
    ]) {
      expect(generalDisallow, required).toContain(required);
    }

    // No sitemap reference until a sitemap route actually exists.
    expect(result.sitemap).toBeUndefined();
    expect(fs.existsSync(path.join(ROOT, 'app/sitemap.ts'))).toBe(false);
  });
});

describe('Phase 25 J/K: Link prefetch containment', () => {
  const files = [...walk('app'), ...walk('components'), ...walk('contexts')];
  const links = files.flatMap(linkTags);

  it('scans the expected shared surfaces', () => {
    expect(links.length).toBeGreaterThan(20);
    expect(links.some((link) => link.file === 'components/MovieCard.tsx')).toBe(true);
    expect(links.some((link) => link.file === 'components/layout/FeatureNavItems.tsx')).toBe(true);
  });

  it('opts every dynamic, protected, or personalized link out of prefetch', () => {
    const offenders = links.filter((link) => !LINK_KEEP.has(link.href) && !link.optedOut && !link.gated);
    expect(offenders.map((link) => `${link.file} -> ${link.href}`)).toEqual([]);
  });

  it('keeps default prefetch for low-cardinality public navigation', () => {
    const publicLinks = links.filter((link) => LINK_KEEP.has(link.href));
    expect(publicLinks.length).toBeGreaterThan(0);
    const offenders = publicLinks.filter((link) => link.optedOut);
    expect(offenders.map((link) => `${link.file} -> ${link.href}`)).toEqual([]);
  });

  it('routes primary navigation prefetch through the public allowlist', () => {
    const allowlisted = ['/', '/trending', '/top-rated', '/genres'];
    for (const file of ['components/layout/FeatureNavItems.tsx', 'components/layout/MobileNav.tsx']) {
      const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
      const declaration = source.match(/const PREFETCH_ALLOWED = new Set\(\[([^\]]*)\]\)/);
      expect(declaration, `${file} must declare PREFETCH_ALLOWED`).toBeTruthy();
      const entries = (declaration![1].match(/'[^']*'/g) ?? []).map((entry) => entry.slice(1, -1));
      // Exact set equality: the allowlist may not be widened to cover a
      // protected or personalized destination.
      expect(new Set(entries), `${file} allowlist must match the public nav set`).toEqual(
        new Set(allowlisted)
      );
      // The map-rendered navigation link must consult the allowlist instead of
      // blanket-disabling prefetch for every entry.
      expect(source, `${file} must gate the nav prefetch prop`).toContain(
        'prefetch={PREFETCH_ALLOWED.has(href) ? undefined : false}'
      );
    }
  });

  it('has no global prefetch disable in next.config', () => {
    const config = fs.readFileSync(path.join(ROOT, 'next.config.mjs'), 'utf8');
    expect(config).not.toMatch(/prefetch/);
  });
});
