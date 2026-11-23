import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const store = vi.hoisted(() => ({
  findLatestFeatureDoc: vi.fn(),
}));
const db = vi.hoisted(() => ({
  connect: vi.fn(),
}));
const auth = vi.hoisted(() => ({
  getToken: vi.fn(),
}));

vi.mock('@/lib/features-store', () => ({
  findLatestFeatureDoc: store.findLatestFeatureDoc,
}));
vi.mock('@/lib/mongodb', () => ({ default: db.connect }));
vi.mock('next-auth/jwt', () => ({ getToken: auth.getToken }));

const ROOT = process.cwd();

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

describe('Phase 25 F/G: server feature-state service', () => {
  beforeEach(() => {
    vi.resetModules();
    store.findLatestFeatureDoc.mockReset();
    db.connect.mockReset();
  });

  it('reads the database document when present', async () => {
    db.connect.mockResolvedValue(undefined);
    store.findLatestFeatureDoc.mockResolvedValue({ features: { aiAssistant: false } });
    const { readFeatureState, isAiAssistantEnabled } = await import('@/lib/features');

    const state = await readFeatureState();
    expect(state.ok).toBe(true);
    expect(state.source).toBe('database');
    expect(state.features.aiAssistant).toBe(false);
    expect(isAiAssistantEnabled(state)).toBe(false);
  });

  it('falls back to the documented default when no document exists', async () => {
    db.connect.mockResolvedValue(undefined);
    store.findLatestFeatureDoc.mockResolvedValue(null);
    const { readFeatureState } = await import('@/lib/features');

    const state = await readFeatureState();
    expect(state).toMatchObject({ ok: true, source: 'default', features: { aiAssistant: true } });
  });

  it('fails closed when the database is unavailable', async () => {
    db.connect.mockRejectedValue(new Error('connect ECONNREFUSED'));
    const { readFeatureState, isAiAssistantEnabled } = await import('@/lib/features');

    const state = await readFeatureState();
    expect(state).toMatchObject({ ok: false, source: 'unavailable', features: { aiAssistant: false } });
    expect(isAiAssistantEnabled(state)).toBe(false);
    expect(store.findLatestFeatureDoc).not.toHaveBeenCalled();
  });

  it('fails closed instead of hanging when the database never answers', async () => {
    db.connect.mockReturnValue(new Promise(() => {}));
    const { readFeatureState } = await import('@/lib/features');

    const state = await readFeatureState({ timeoutMs: 25 });
    expect(state).toMatchObject({ ok: false, source: 'unavailable', features: { aiAssistant: false } });
  });
});

describe('Phase 25 G: Edge middleware no longer self-fetches feature state', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('contains no internal HTTP request to /api/features', () => {
    const source = read('middleware.ts');
    expect(source).not.toMatch(/\/api\/features/);
    expect(source).not.toMatch(/fetch\(\s*`\$\{request\.nextUrl\.origin\}/);
    expect(source).not.toMatch(/nextUrl\.origin/);
  });

  it('does not import Node-only feature, Mongo, or Redis modules', () => {
    const source = read('middleware.ts');
    expect(source).not.toMatch(/from ['"]@\/lib\/features['"]/);
    expect(source).not.toMatch(/from ['"]@\/lib\/features-store['"]/);
    expect(source).not.toMatch(/from ['"]mongoose['"]/);
    expect(source).not.toMatch(/from ['"]@\/lib\/(mongodb|redis|redis-health|cache)['"]/);
  });

  it('performs no network fetch for an authenticated AI route at runtime', async () => {
    auth.getToken.mockResolvedValue({ email: 'user@example.com' });
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const { middleware } = await import('@/middleware');
    const { NextRequest } = await import('next/server');
    const response = await middleware(new NextRequest('http://localhost/api/ai-recommendations'));
    expect(response.status).toBe(200);
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe('Phase 25 G: the Node route handler owns the feature gate', () => {
  it('gates after auth and before DB reads, cache writes, TMDB and Gemini', () => {
    const source = read('app/api/ai-recommendations/route.ts');
    const authAt = source.indexOf('requireUser()');
    const gateAt = source.indexOf('readFeatureState(');
    const connectAt = source.indexOf('connectToMongoDB()');
    const historyAt = source.indexOf('History.find(');
    const tmdbAt = source.indexOf('api.themoviedb.org');
    const geminiAt = source.indexOf('callGemini(');

    expect(authAt).toBeGreaterThan(-1);
    expect(gateAt).toBeGreaterThan(authAt);
    expect(connectAt).toBeGreaterThan(gateAt);
    expect(historyAt).toBeGreaterThan(connectAt);
    expect(tmdbAt).toBeGreaterThan(gateAt);
    expect(geminiAt).toBeGreaterThan(gateAt);
    expect(source).toMatch(/status:\s*503/);
  });

  it('keeps the features endpoint private and non-cacheable', () => {
    const source = read('app/api/features/route.ts');
    expect(source).toMatch(/private,\s*no-store/);
    expect(source).toMatch(/readFeatureState/);
    expect(source).not.toMatch(/mongoose/);
  });
});

describe('Phase 25 H: one shared client feature-state fetch', () => {
  beforeEach(async () => {
    const mod = await import('@/hooks/useFeatures');
    mod.resetFeatureStateForTests();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shares one in-flight request between concurrent consumers', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      calls.push(url);
      return new Response(JSON.stringify({ features: { aiAssistant: true } }), { status: 200 });
    }));
    const { loadFeatureState } = await import('@/hooks/useFeatures');

    const [a, b, c] = await Promise.all([loadFeatureState(), loadFeatureState(), loadFeatureState()]);
    expect(calls).toHaveLength(1);
    expect(a.features.aiAssistant).toBe(true);
    expect(b.features.aiAssistant).toBe(true);
    expect(c.features.aiAssistant).toBe(true);
  });

  it('serves repeat consumers from the bounded cache', async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ features: { aiAssistant: true } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);
    const { loadFeatureState } = await import('@/hooks/useFeatures');

    await loadFeatureState();
    await loadFeatureState();
    await loadFeatureState();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('honours the server fail-closed 503 body and caches it', async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ features: { aiAssistant: false } }), { status: 503 }));
    vi.stubGlobal('fetch', fetchSpy);
    const { loadFeatureState } = await import('@/hooks/useFeatures');

    const state = await loadFeatureState();
    expect(state.features.aiAssistant).toBe(false);
    expect(state.source).toBe('fallback');
    await loadFeatureState();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('does not cache a transport failure, so recovery is possible', async () => {
    const fetchSpy = vi.fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ features: { aiAssistant: true } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);
    const { loadFeatureState } = await import('@/hooks/useFeatures');

    const failed = await loadFeatureState();
    expect(failed.features.aiAssistant).toBe(false);
    expect(failed.source).toBe('fallback');
    const recovered = await loadFeatureState();
    expect(recovered.features.aiAssistant).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('has a single feature endpoint and no polling loop', () => {
    const source = read('hooks/useFeatures.ts');
    expect(source.match(/\/api\/features/g)).toHaveLength(1);
    expect(source).not.toMatch(/setInterval/);
  });

  it('no longer fetches feature state from the language provider', () => {
    const source = read('contexts/LanguageContext.tsx');
    expect(source).not.toMatch(/\/api\/features/);
  });
});
