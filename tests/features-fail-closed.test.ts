import { describe, it, expect, vi } from 'vitest';

// Mongoose model is mocked so the settings read can be made to throw,
// simulating a MongoDB outage. L-02: /api/features must fail closed (503 +
// aiAssistant=false) instead of returning the optimistic "enabled" default.
vi.mock('mongoose', () => {
  const model = {
    findOne: vi.fn().mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      lean: vi.fn().mockRejectedValue(new Error('mongo down')),
    }),
    create: vi.fn(),
  };
  return {
    __esModule: true,
    default: {
      Schema: vi.fn(),
      model: vi.fn().mockReturnValue(model),
      models: {},
    },
  };
});

vi.mock('@/lib/mongodb', () => ({
  default: vi.fn().mockRejectedValue(new Error('mongo down')),
}));

describe('L-02: /api/features fails closed on database error', () => {
  it('returns 503 with aiAssistant=false when the database is unreachable', async () => {
    const { GET } = await import('@/app/api/features/route.ts');
    const res = await GET();

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.features).toEqual({ aiAssistant: false });
  });
});
