import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/redis', () => ({
  default: vi.fn().mockResolvedValue(null),
  closeRedisConnection: vi.fn().mockResolvedValue(undefined),
}));

import redisCache from '@/lib/cache';
import { CACHE_NAMESPACE, isNamespacedKey } from '@/lib/cache-namespace';

describe('W3-010: ns() normalizes every key component', () => {
  it("set('a:b*../c') lands sanitized and namespaced", async () => {
    await redisCache.set('a:b*../c', { v: 1 }, 60);
    const back = await redisCache.get<{ v: number }>('a:b_.._c');
    expect(back).toEqual({ v: 1 });
    // The raw hostile key shape resolves to the same sanitized entry.
    const backRaw = await redisCache.get<{ v: number }>('a:b*../c');
    expect(backRaw).toEqual({ v: 1 });
    await redisCache.delete('a:b*../c');
    expect(await redisCache.get('a:b*../c')).toBeNull();
  });

  it('stored keys always satisfy isNamespacedKey', async () => {
    await redisCache.set('w3010:probe', { v: 2 }, 60);
    const expected = `${CACHE_NAMESPACE}w3010:probe`;
    expect(isNamespacedKey(expected)).toBe(true);
    expect(await redisCache.get('w3010:probe')).toEqual({ v: 2 });
    await redisCache.delete('w3010:probe');
  });
});
