import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { email: 'fav@example.com' } } }),
  signIn: vi.fn(),
}));

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// LoadingSpinner has no React import (automatic JSX in Next); mock it so the
// classic-JSX vitest transform never evaluates its JSX.
vi.mock('@/components/ui/LoadingSpinner', () => ({
  LoadingSpinner: () => null,
}));

import { FavoritesProvider } from '@/contexts/FavoritesContext';
import { FavoriteButton } from '@/components/FavoriteButton';

const ITEMS = [11, 22, 33, 44, 55].map((itemId) => ({
  itemId,
  type: 'movie' as const,
  title: `Title ${itemId}`,
  posterPath: null,
}));

/**
 * M4 STEP 5: FavoritesContext single-fetch. 5 buttons under one provider
 * perform exactly ONE GET /api/favorites; toggle POSTs + optimistic add;
 * forced failure rolls back.
 */
describe('FavoritesContext N+1 elimination', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('5 buttons share ONE GET; toggle POSTs optimistically; failure rolls back', async () => {
    const getCalls: string[] = [];
    const postCalls: unknown[] = [];
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/api/favorites' && (!init || !init.method || init.method === 'GET')) {
        getCalls.push(url);
        return Promise.resolve(
          new Response(JSON.stringify([{ itemId: 11, type: 'movie' }]), { status: 200 })
        );
      }
      if (url === '/api/favorites' && init?.method === 'POST') {
        postCalls.push(JSON.parse(String(init.body)));
        return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
      }
      if (url.startsWith('/api/favorites?') && init?.method === 'DELETE') {
        return Promise.reject(new Error('forced failure'));
      }
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <FavoritesProvider>
        {ITEMS.map((item) => (
          <FavoriteButton key={item.itemId} {...item} />
        ))}
      </FavoritesProvider>
    );

    await waitFor(() => expect(getCalls.length).toBe(1));

    // itemId 11 starts favorited (aria-pressed true); toggle 22 adds optimistically.
    const addButtons = await screen.findAllByLabelText('Add to favorites');
    expect(addButtons.length).toBe(4);
    fireEvent.click(addButtons[0]);
    await waitFor(() => expect(postCalls.length).toBe(1));
    expect((postCalls[0] as { itemId: number }).itemId).toBe(22);
    await waitFor(() =>
      expect(screen.queryAllByLabelText('Add to favorites').length).toBe(3)
    );

    // Forced DELETE failure on 11 rolls back to still-favorited.
    const removeButtons = screen.queryAllByLabelText('Remove from favorites');
    expect(removeButtons.length).toBe(2);
    fireEvent.click(removeButtons[0]);
    await waitFor(() =>
      expect(screen.queryAllByLabelText('Remove from favorites').length).toBe(2)
    );
  });
});
