import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  applyRateLimitUser: vi.fn(),
  fetch: vi.fn(),
  findOne: vi.fn(),
  findOneAndUpdate: vi.fn(),
  create: vi.fn(),
  lean: vi.fn(),
}));

vi.mock('@/lib/mongodb', () => ({
  default: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/lib/security/auth', () => ({
  requireSession: mocks.requireUser,
  requireUser: mocks.requireUser,
}));

vi.mock('@/lib/security/rateLimit', () => ({
  applyRateLimitUser: mocks.applyRateLimitUser,
  RATE_LIMITS: { chat: {}, chatHistoryWrite: {} },
}));

vi.mock('@/lib/models/ChatHistory', () => ({
  ChatHistory: {
    findOne: mocks.findOne,
    findOneAndUpdate: mocks.findOneAndUpdate,
    create: mocks.create,
  },
}));

function denied(status: number, error: string) {
  return {
    ok: false,
    response: new Response(JSON.stringify({ error }), { status }),
  };
}

function allow(email = 'owner@example.com') {
  return { ok: true, user: { id: 'u1', email, role: 'user' } };
}

function geminiOk(text = 'A movie answer') {
  return new Response(
    JSON.stringify({
      candidates: [{ content: { parts: [{ text }] } }],
    }),
    { status: 200 }
  );
}

describe('R5 chat trust boundary', () => {
  beforeEach(() => {
    mocks.requireUser.mockReset();
    mocks.applyRateLimitUser.mockReset().mockResolvedValue(null);
    mocks.fetch.mockReset();
    mocks.findOne.mockReset();
    mocks.findOneAndUpdate.mockReset().mockResolvedValue({});
    mocks.create.mockReset().mockResolvedValue({ _id: '507f1f77bcf86cd799439011' });
    mocks.lean.mockReset();
    mocks.findOne.mockReturnValue({ lean: mocks.lean });
    vi.stubEnv('GOOGLE_API_KEY', 'test-placeholder-key');
    globalThis.fetch = mocks.fetch as unknown as typeof fetch;
  });

  it('unauthenticated chat rejected before model call', async () => {
    mocks.requireUser.mockResolvedValue(denied(401, 'Authentication required'));
    vi.resetModules();
    const { POST } = await import('@/app/api/chat/route.ts');
    const res = await POST(
      new NextRequest('http://localhost/api/chat', {
        method: 'POST',
        body: JSON.stringify({ message: 'hello' }),
      })
    );
    expect(res.status).toBe(401);
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('foreign chatId rejected', async () => {
    mocks.requireUser.mockResolvedValue(allow('owner@example.com'));
    mocks.lean.mockResolvedValue(null);
    vi.resetModules();
    const { POST } = await import('@/app/api/chat/route.ts');
    const res = await POST(
      new NextRequest('http://localhost/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          message: 'hello',
          chatId: '507f1f77bcf86cd799439012',
        }),
      })
    );
    expect(res.status).toBe(403);
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.findOne).toHaveBeenCalledWith({
      _id: '507f1f77bcf86cd799439012',
      userId: 'owner@example.com',
    });
  });

  it('invalid chatId rejected', async () => {
    mocks.requireUser.mockResolvedValue(allow());
    vi.resetModules();
    const { POST } = await import('@/app/api/chat/route.ts');
    const res = await POST(
      new NextRequest('http://localhost/api/chat', {
        method: 'POST',
        body: JSON.stringify({ message: 'hello', chatId: 'not-an-id' }),
      })
    );
    expect(res.status).toBe(400);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('client-supplied assistant response is ignored or rejected', async () => {
    mocks.requireUser.mockResolvedValue(allow());
    vi.resetModules();
    const { POST } = await import('@/app/api/chat/route.ts');
    const res = await POST(
      new NextRequest('http://localhost/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          message: 'hello',
          response: 'fabricated assistant output',
        }),
      })
    );
    expect(res.status).toBe(400);
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('client previousMessages cannot inject another user history', async () => {
    mocks.requireUser.mockResolvedValue(allow('owner@example.com'));
    mocks.lean.mockResolvedValue({
      messages: [{ role: 'user', content: 'owned history' }],
    });
    mocks.fetch.mockResolvedValue(geminiOk());
    vi.resetModules();
    const { POST } = await import('@/app/api/chat/route.ts');
    const res = await POST(
      new NextRequest('http://localhost/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          message: 'hello',
          chatId: '507f1f77bcf86cd799439011',
          previousMessages: [
            { role: 'user', content: 'INJECTED_FOREIGN_HISTORY' },
          ],
        }),
      })
    );
    expect(res.status).toBe(200);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    const init = mocks.fetch.mock.calls[0][1] as { body: string; headers: Record<string, string> };
    expect(init.body).not.toContain('INJECTED_FOREIGN_HISTORY');
    expect(init.body).toContain('owned history');
    expect(init.body).toContain('systemInstruction');
    expect(init.body).not.toContain('owner@example.com');
    expect(init.body).not.toContain('?key=');
    expect(JSON.stringify(init.headers)).not.toMatch(/\?key=/);
    const url = String(mocks.fetch.mock.calls[0][0]);
    expect(url).not.toContain('?key=');
  });

  it('history is loaded only with authenticated ownership criteria', async () => {
    mocks.requireUser.mockResolvedValue(allow('owner@example.com'));
    mocks.lean.mockResolvedValue({ messages: [] });
    mocks.fetch.mockResolvedValue(geminiOk());
    vi.resetModules();
    const { POST } = await import('@/app/api/chat/route.ts');
    await POST(
      new NextRequest('http://localhost/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          message: 'hello',
          chatId: '507f1f77bcf86cd799439011',
        }),
      })
    );
    expect(mocks.findOne).toHaveBeenCalledWith({
      _id: '507f1f77bcf86cd799439011',
      userId: 'owner@example.com',
    });
  });

  it('oversized message rejected', async () => {
    mocks.requireUser.mockResolvedValue(allow());
    vi.resetModules();
    const { POST } = await import('@/app/api/chat/route.ts');
    const res = await POST(
      new NextRequest('http://localhost/api/chat', {
        method: 'POST',
        body: JSON.stringify({ message: 'x'.repeat(2001) }),
      })
    );
    expect(res.status).toBe(400);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('model is not called on validation or ownership failure', async () => {
    mocks.requireUser.mockResolvedValue(allow());
    mocks.lean.mockResolvedValue(null);
    vi.resetModules();
    const { POST } = await import('@/app/api/chat/route.ts');
    await POST(
      new NextRequest('http://localhost/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          message: 'hello',
          chatId: '507f1f77bcf86cd799439012',
        }),
      })
    );
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('user and assistant messages are persisted only after valid response', async () => {
    mocks.requireUser.mockResolvedValue(allow('owner@example.com'));
    mocks.fetch.mockResolvedValue(geminiOk('Validated reply'));
    vi.resetModules();
    const { POST } = await import('@/app/api/chat/route.ts');
    const res = await POST(
      new NextRequest('http://localhost/api/chat', {
        method: 'POST',
        body: JSON.stringify({ message: 'hello' }),
      })
    );
    expect(res.status).toBe(200);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    const created = mocks.create.mock.calls[0][0] as {
      userId: string;
      messages: Array<{ role: string; content: string }>;
    };
    expect(created.userId).toBe('owner@example.com');
    expect(created.messages[0]).toMatchObject({ role: 'user', content: 'hello' });
    expect(created.messages[1]).toMatchObject({
      role: 'assistant',
      content: 'Validated reply',
    });
    const body = await res.json() as { chatId?: string; response?: string };
    expect(body.chatId).toBe('507f1f77bcf86cd799439011');
    expect(body.response).toBe('Validated reply');
  });

  it('failed model response does not persist a fabricated assistant message', async () => {
    mocks.requireUser.mockResolvedValue(allow());
    mocks.fetch.mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'upstream boom' } }), { status: 500 })
    );
    vi.resetModules();
    const { POST } = await import('@/app/api/chat/route.ts');
    const res = await POST(
      new NextRequest('http://localhost/api/chat', {
        method: 'POST',
        body: JSON.stringify({ message: 'hello' }),
      })
    );
    expect(res.status).toBe(503);
    expect(mocks.create).not.toHaveBeenCalled();
    const body = await res.json() as Record<string, unknown>;
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('upstream boom');
    expect(serialized).not.toContain('GOOGLE_API_KEY');
    expect(serialized).not.toContain('?key=');
    expect(serialized).not.toContain('systemInstruction');
    expect(serialized).not.toContain('test-placeholder-key');
    expect(serialized).not.toContain('owner@example.com');
    expect(body.code).toBe('AI_UNAVAILABLE');
  });
});

describe('R5 chat-history persistence is server-side only', () => {
  beforeEach(() => {
    mocks.requireUser.mockReset();
    mocks.applyRateLimitUser.mockReset().mockResolvedValue(null);
  });

  it('POST /api/chat-history rejects client-supplied assistant responses', async () => {
    mocks.requireUser.mockResolvedValue(allow());
    vi.resetModules();
    const { POST } = await import('@/app/api/chat-history/route.ts');
    const res = await POST(
      new NextRequest('http://localhost/api/chat-history', {
        method: 'POST',
        body: JSON.stringify({
          messages: [{ role: 'assistant', content: 'fabricated' }],
        }),
      })
    );
    expect(res.status).toBe(403);
  });
});
