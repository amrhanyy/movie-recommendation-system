import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor, act, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Prevent DOM leakage between tests (testing-library does not auto-cleanup).
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// WatchlistContext: single source of truth + optimistic toggle + rollback.
// ---------------------------------------------------------------------------

const sessionMock = vi.hoisted(() => ({
  value: {
    data: { user: { email: 'test@example.com' } },
    status: 'authenticated' as string,
  },
}));

vi.mock('next-auth/react', () => ({
  useSession: () => sessionMock.value,
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('react-hot-toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import {
  WatchlistProvider,
  useWatchlistContext,
} from '@/contexts/WatchlistContext';

function jsonResponse(status: number, body: unknown = []) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Renders N independent consumers that all read item 42. */
function MultiProbe({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <MemberProbe key={i} id={42} testId={`probe-${i}`} />
      ))}
    </>
  );
}

function MemberProbe({ id, testId }: { id: number; testId: string }) {
  const { isInWatchlist } = useWatchlistContext();
  return (
    <span data-testid={testId}>{isInWatchlist(id) ? 'in' : 'out'}</span>
  );
}

/** A consumer with a real toggle button for item 500. */
function ToggleProbe() {
  const { isInWatchlist, toggleWatchlist } = useWatchlistContext();
  const inList = isInWatchlist(500);
  return (
    <div>
      <span data-testid="opt-probe">{inList ? 'in' : 'out'}</span>
      <button
        type="button"
        onClick={() =>
          void toggleWatchlist({ itemId: 500, type: 'movie', title: 'Optimism', posterPath: null })
        }
        aria-pressed={inList}
        aria-label={inList ? 'Remove Optimism from watchlist' : 'Add Optimism to watchlist'}
      >
        toggle
      </button>
    </div>
  );
}

describe('WatchlistContext', () => {
  beforeEach(() => {
    vi.resetModules();
    sessionMock.value = {
      data: { user: { email: 'test@example.com' } },
      status: 'authenticated',
    };
  });

  it('fetches /api/watchlist exactly once even with many consumers (no redundant fetches)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, [{ itemId: 42 }, { itemId: 7 }]));
    vi.stubGlobal('fetch', fetchMock);

    render(
      <WatchlistProvider>
        <MultiProbe count={5} />
      </WatchlistProvider>
    );

    await waitFor(() => expect(screen.getByTestId('probe-0').textContent).toBe('in'));

    // The duplicate-fetch anti-pattern is gone: exactly ONE network call.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/watchlist');

    // Every consumer reads the same shared state.
    for (let i = 0; i < 5; i++) {
      expect(screen.getByTestId(`probe-${i}`).textContent).toBe('in');
    }
  });

  it('does not fetch when there is no authenticated session', async () => {
    sessionMock.value = { data: null, status: 'unauthenticated' };
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(
      <WatchlistProvider>
        <MemberProbe id={42} testId="probe-0" />
      </WatchlistProvider>
    );

    await waitFor(() => expect(screen.getByTestId('probe-0').textContent).toBe('out'));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rolls back and toasts an error when an add fails', async () => {
    const { toast } = await import('react-hot-toast');
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();

    // Initial list load succeeds; the subsequent add rejects.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, [{ itemId: 42 }]))
      .mockRejectedValueOnce(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);

    render(
      <WatchlistProvider>
        <ToggleProbe />
      </WatchlistProvider>
    );

    // Initial load settles: 500 is not in the watchlist.
    await waitFor(() => expect(screen.getByTestId('opt-probe').textContent).toBe('out'));

    const btn = screen.getByRole('button', { name: /add optimism to watchlist/i });
    await act(async () => {
      await fireEvent.click(btn);
    });

    // The failed request rolls the optimistic add back to 'out'.
    await waitFor(() => expect(screen.getByTestId('opt-probe').textContent).toBe('out'));
    expect(vi.mocked(toast.error)).toHaveBeenCalled();
  });

  it('issues a DELETE for removal when the item is already in the watchlist', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/watchlist') return jsonResponse(200, [{ itemId: 500 }]);
      return jsonResponse(200, {});
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <WatchlistProvider>
        <ToggleProbe />
      </WatchlistProvider>
    );

    // Initial load puts 500 in the watchlist.
    await waitFor(() => expect(screen.getByTestId('opt-probe').textContent).toBe('in'));

    const btn = screen.getByRole('button', { name: /remove optimism from watchlist/i });
    await act(async () => {
      await fireEvent.click(btn);
    });

    await waitFor(() => expect(screen.getByTestId('opt-probe').textContent).toBe('out'));
    const removeCall = fetchMock.mock.calls.find((c) => String(c[0]).includes('itemId=500'));
    expect(removeCall).toBeTruthy();
    expect(removeCall?.[1]).toMatchObject({ method: 'DELETE' });
  });
});

// ---------------------------------------------------------------------------
// MobileNav: trigger toggle, drawer links, and accessibility attributes.
// ---------------------------------------------------------------------------

vi.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({
    language: 'en-US',
    setLanguage: () => {},
    t: (k: string) => k,
    getDisplayName: (c: string) => c,
  }),
}));

vi.mock('@/hooks/useFeatures', () => ({
  useFeatures: () => ({
    loading: false,
    error: null,
    features: { aiAssistant: true },
    isEnabled: () => true,
  }),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
}));

import { MobileNav } from '@/components/layout/MobileNav';

describe('MobileNav', () => {
  beforeEach(() => {
    vi.resetModules();
    sessionMock.value = { data: null, status: 'unauthenticated' };
  });

  it('renders an accessible hamburger trigger with correct aria state', () => {
    render(<MobileNav />);
    const btn = screen.getByRole('button', { name: /open navigation menu/i });
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    expect(btn).toHaveAttribute('aria-controls', 'mobile-navigation');
  });

  it('opens the drawer on click, exposing the primary navigation links', async () => {
    render(<MobileNav />);
    const trigger = screen.getByRole('button', { name: /open navigation menu/i });

    await act(async () => {
      await fireEvent.click(trigger);
    });

    // Radix Dialog panel is announced with the SheetTitle.
    expect(await screen.findByText('Menu')).toBeInTheDocument();

    // All primary routes are present as links.
    for (const label of ['trending', 'topRated', 'genres', 'watchlist', 'favorites', 'aiAssistant']) {
      expect(screen.getByRole('link', { name: new RegExp(label, 'i') })).toBeInTheDocument();
    }

    // Trigger reflects the open state. (Radix marks the outside as aria-hidden
    // while the dialog is open, so query including hidden nodes.)
    expect(
      screen.getByRole('button', { name: /open navigation menu/i, hidden: true })
    ).toHaveAttribute('aria-expanded', 'true');
  });
});
