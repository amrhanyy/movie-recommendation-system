import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor, act, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'node:fs';

// ---------------------------------------------------------------------------
// Phase 6 network isolation (LIST-FIX-9): deny-by-default global fetch.
// Only /api/watchlist and /api/favorites (optionally with query strings) are
// reachable in this suite. Every other URL — including external provider
// hosts (TMDB, Gemini, OAuth) and non-allowed internal routes — throws
// immediately. No fallthrough to the real network, no generic success
// responses for unknown URLs: each test's handler must enumerate its own
// allowed (url, method) pairs and throws for anything else.
// ---------------------------------------------------------------------------
const ALLOWED_URL = /^\/api\/(watchlist|favorites)(\?.*)?$/;

interface FetchCall {
  url: string;
  init?: RequestInit;
}

function denyFetch(
  respond: (url: string, init?: RequestInit) => Response | Promise<Response>
): { fetchMock: ReturnType<typeof vi.fn>; calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      calls.push({ url, init });
      if (!ALLOWED_URL.test(url)) {
        throw new Error(`Network isolation violated: unmatched fetch URL "${url}"`);
      }
      return respond(url, init);
    }
  );
  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, calls };
}

const sessionMock = vi.hoisted(() => ({
  value: {
    data: { user: { email: 'phase6@example.com' } },
    status: 'authenticated' as string,
  },
}));

vi.mock('next-auth/react', () => ({
  useSession: () => sessionMock.value,
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// LoadingSpinner has no React import (automatic JSX in Next); mock it so the
// classic-JSX vitest transform never evaluates its JSX.
vi.mock('@/components/ui/LoadingSpinner', () => ({
  LoadingSpinner: () => null,
}));

import {
  WatchlistProvider,
  useWatchlistContext,
  type WatchlistToggleItem,
} from '@/contexts/WatchlistContext';
import { FavoritesProvider, useFavoritesContext } from '@/contexts/FavoritesContext';
import { FavoriteButton } from '@/components/FavoriteButton';

type MediaType = 'movie' | 'tv';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const ok = (body: unknown): Response => jsonResponse(200, body);

// Synthetic fixtures. 603 deliberately collides: same numeric id, both types.
const MOVIE_603 = { itemId: 603, type: 'movie', title: 'Movie Six Zero Three', posterPath: null };
const TV_603 = { itemId: 603, type: 'tv', title: 'TV Six Zero Three', posterPath: null };

// --- Probes -----------------------------------------------------------------

function WatchProbe({ type, id, testId }: { type: MediaType; id: number; testId: string }) {
  const { isInWatchlist } = useWatchlistContext();
  return <span data-testid={testId}>{isInWatchlist(type, id) ? 'in' : 'out'}</span>;
}

/** Renders whether the raw membership set contains the BARE NUMERIC id. */
function WatchNumberProbe({ id, testId }: { id: number; testId: string }) {
  const { watchlistIds } = useWatchlistContext();
  const hasNumeric = (watchlistIds as unknown as ReadonlySet<unknown>).has(id);
  return <span data-testid={testId}>{hasNumeric ? 'numeric' : 'no-numeric'}</span>;
}

function WatchKeyProbe({ keyValue, testId }: { keyValue: string; testId: string }) {
  const { watchlistIds } = useWatchlistContext();
  return <span data-testid={testId}>{watchlistIds.has(keyValue) ? 'keyed' : 'unkeyed'}</span>;
}

function WatchToggleProbe({
  type,
  id,
  testId,
  title,
}: {
  type: MediaType;
  id: number;
  testId: string;
  title: string;
}) {
  const { isInWatchlist, toggleWatchlist } = useWatchlistContext();
  const inList = isInWatchlist(type, id);
  return (
    <div>
      <span data-testid={testId}>{inList ? 'in' : 'out'}</span>
      <button
        type="button"
        aria-pressed={inList}
        aria-label={inList ? `Remove ${title} from watchlist` : `Add ${title} to watchlist`}
        onClick={() => void toggleWatchlist({ itemId: id, type, title, posterPath: null })}
      >
        toggle
      </button>
    </div>
  );
}

const watchToggleRefs: Array<(item: WatchlistToggleItem) => Promise<void>> = [];

function WatchStabilityProbe() {
  const { isInWatchlist, toggleWatchlist } = useWatchlistContext();
  watchToggleRefs.push(toggleWatchlist);
  const inList = isInWatchlist('movie', 603);
  return (
    <button
      type="button"
      aria-pressed={inList}
      aria-label={
        inList
          ? 'Remove Movie Six Zero Three from watchlist'
          : 'Add Movie Six Zero Three from watchlist'
      }
      onClick={() =>
        void toggleWatchlist({ itemId: 603, type: 'movie', title: 'Movie Six Zero Three', posterPath: null })
      }
    >
      toggle
    </button>
  );
}

function FavProbe({ type, id, testId }: { type: MediaType; id: number; testId: string }) {
  const { isFavorite } = useFavoritesContext();
  return <span data-testid={testId}>{isFavorite(type, id) ? 'in' : 'out'}</span>;
}

function FavNumberProbe({ id, testId }: { id: number; testId: string }) {
  const { favoriteIds } = useFavoritesContext();
  const hasNumeric = (favoriteIds as unknown as ReadonlySet<unknown>).has(id);
  return <span data-testid={testId}>{hasNumeric ? 'numeric' : 'no-numeric'}</span>;
}

function FavToggleProbe({
  type,
  id,
  testId,
  title,
}: {
  type: MediaType;
  id: number;
  testId: string;
  title: string;
}) {
  const { isFavorite, toggleFavorite } = useFavoritesContext();
  const inList = isFavorite(type, id);
  return (
    <div>
      <span data-testid={testId}>{inList ? 'in' : 'out'}</span>
      <button
        type="button"
        aria-pressed={inList}
        aria-label={inList ? `Remove ${title} from favorites` : `Add ${title} to favorites`}
        onClick={() => void toggleFavorite({ itemId: id, type, title, posterPath: null })}
      >
        toggle
      </button>
    </div>
  );
}

// --- Lifecycle ----------------------------------------------------------------

beforeEach(() => {
  sessionMock.value = {
    data: { user: { email: 'phase6@example.com' } },
    status: 'authenticated',
  };
  watchToggleRefs.length = 0;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// --- Harness self-test ---------------------------------------------------------

describe('deny-by-default fetch harness', () => {
  it('throws immediately for every unmatched URL (external hosts and non-allowed internal routes)', async () => {
    const { fetchMock, calls } = denyFetch(() => {
      throw new Error('unreachable: allowed URL without a handler');
    });
    await expect(
      fetchMock('https://api.themoviedb.org/3/trending/movie/us')
    ).rejects.toThrow(/unmatched fetch URL/);
    await expect(
      fetchMock('https://generativelanguage.googleapis.com/v1beta/models')
    ).rejects.toThrow(/unmatched fetch URL/);
    await expect(fetchMock('/api/movies')).rejects.toThrow(/unmatched fetch URL/);
    // No request was ever answered (no generic success fallthrough).
    expect(calls).toHaveLength(3);
    for (const call of calls) {
      expect(ALLOWED_URL.test(call.url)).toBe(false);
    }
  });
});

// --- Watchlist ------------------------------------------------------------------

describe('WatchlistContext media-type membership identity', () => {
  it('RED A: movie-only hydration — movie 603 in, tv 603 out, no bare-numeric key', async () => {
    denyFetch((url) => {
      if (url === '/api/watchlist') return jsonResponse(200, [MOVIE_603]);
      throw new Error(`unhandled ${url}`);
    });
    render(
      <WatchlistProvider>
        <WatchProbe type="movie" id={603} testId="movie-603" />
        <WatchProbe type="tv" id={603} testId="tv-603" />
        <WatchNumberProbe id={603} testId="num-603" />
      </WatchlistProvider>
    );
    await waitFor(() => expect(screen.getByTestId('movie-603').textContent).toBe('in'));
    expect(screen.getByTestId('tv-603').textContent).toBe('out');
    expect(screen.getByTestId('num-603').textContent).toBe('no-numeric');
  });

  it('RED B: tv-only hydration — tv 603 in, movie 603 out, no bare-numeric key', async () => {
    denyFetch((url) => {
      if (url === '/api/watchlist') return jsonResponse(200, [TV_603]);
      throw new Error(`unhandled ${url}`);
    });
    render(
      <WatchlistProvider>
        <WatchProbe type="movie" id={603} testId="movie-603" />
        <WatchProbe type="tv" id={603} testId="tv-603" />
        <WatchNumberProbe id={603} testId="num-603" />
      </WatchlistProvider>
    );
    await waitFor(() => expect(screen.getByTestId('tv-603').textContent).toBe('in'));
    expect(screen.getByTestId('movie-603').textContent).toBe('out');
    expect(screen.getByTestId('num-603').textContent).toBe('no-numeric');
  });

  it('coexistence: movie 603 + tv 603 hydrate as distinct canonical keys', async () => {
    denyFetch((url) => {
      if (url === '/api/watchlist') return jsonResponse(200, [MOVIE_603, TV_603]);
      throw new Error(`unhandled ${url}`);
    });
    render(
      <WatchlistProvider>
        <WatchProbe type="movie" id={603} testId="movie-603" />
        <WatchProbe type="tv" id={603} testId="tv-603" />
        <WatchKeyProbe keyValue="movie:603" testId="key-movie" />
        <WatchKeyProbe keyValue="tv:603" testId="key-tv" />
        <WatchNumberProbe id={603} testId="num-603" />
      </WatchlistProvider>
    );
    await waitFor(() => expect(screen.getByTestId('movie-603').textContent).toBe('in'));
    expect(screen.getByTestId('tv-603').textContent).toBe('in');
    expect(screen.getByTestId('key-movie').textContent).toBe('keyed');
    expect(screen.getByTestId('key-tv').textContent).toBe('keyed');
    expect(screen.getByTestId('num-603').textContent).toBe('no-numeric');
  });

  it('removing movie 603 preserves tv 603 (DELETE scoped to type=movie)', async () => {
    denyFetch((url, init) => {
      if (url === '/api/watchlist') return jsonResponse(200, [MOVIE_603, TV_603]);
      if (url === '/api/watchlist?itemId=603&type=movie' && init?.method === 'DELETE') {
        return ok({ success: true });
      }
      throw new Error(`unhandled ${url} ${init?.method ?? 'GET'}`);
    });
    render(
      <WatchlistProvider>
        <WatchToggleProbe type="movie" id={603} testId="movie-603" title="Movie Six Zero Three" />
        <WatchProbe type="tv" id={603} testId="tv-603" />
      </WatchlistProvider>
    );
    await waitFor(() => expect(screen.getByTestId('movie-603').textContent).toBe('in'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove Movie Six Zero Three from watchlist' }));
    });
    await waitFor(() => expect(screen.getByTestId('movie-603').textContent).toBe('out'));
    expect(screen.getByTestId('tv-603').textContent).toBe('in');
  });

  it('removing tv 603 preserves movie 603 (DELETE scoped to type=tv)', async () => {
    denyFetch((url, init) => {
      if (url === '/api/watchlist') return jsonResponse(200, [MOVIE_603, TV_603]);
      if (url === '/api/watchlist?itemId=603&type=tv' && init?.method === 'DELETE') {
        return ok({ success: true });
      }
      throw new Error(`unhandled ${url} ${init?.method ?? 'GET'}`);
    });
    render(
      <WatchlistProvider>
        <WatchToggleProbe type="tv" id={603} testId="tv-603" title="TV Six Zero Three" />
        <WatchProbe type="movie" id={603} testId="movie-603" />
      </WatchlistProvider>
    );
    await waitFor(() => expect(screen.getByTestId('tv-603').textContent).toBe('in'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove TV Six Zero Three from watchlist' }));
    });
    await waitFor(() => expect(screen.getByTestId('tv-603').textContent).toBe('out'));
    expect(screen.getByTestId('movie-603').textContent).toBe('in');
  });

  it('absent cross-type toggle takes POST (not no-op DELETE) with the exact body, both directions', async () => {
    // Direction 1: movie present, tv absent -> adding tv must POST type=tv.
    const { fetchMock: fetchMock1 } = denyFetch((url, init) => {
      if (url === '/api/watchlist' && init?.method === 'POST') {
        return ok({ success: true });
      }
      if (url === '/api/watchlist' && (!init || !init.method || init.method === 'GET')) {
        return jsonResponse(200, [MOVIE_603]);
      }
      throw new Error(`unhandled ${url} ${init?.method ?? 'GET'}`);
    });
    render(
      <WatchlistProvider>
        <WatchToggleProbe type="tv" id={603} testId="tv-603" title="TV Six Zero Three" />
        <WatchProbe type="movie" id={603} testId="movie-603" />
      </WatchlistProvider>
    );
    await waitFor(() => expect(screen.getByTestId('movie-603').textContent).toBe('in'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add TV Six Zero Three to watchlist' }));
    });
    await waitFor(() => expect(fetchMock1).toHaveBeenCalledTimes(2));
    // Optimistic add reflected; request is a POST (not the old no-op DELETE).
    expect(screen.getByTestId('tv-603').textContent).toBe('in');
    expect(screen.getByTestId('movie-603').textContent).toBe('in');
    expect(fetchMock1.mock.calls[1][0]).toBe('/api/watchlist');
    expect(fetchMock1.mock.calls[1][1]).toMatchObject({ method: 'POST' });
    expect(JSON.parse(String(fetchMock1.mock.calls[1][1].body))).toEqual({
      itemId: 603,
      type: 'tv',
      title: 'TV Six Zero Three',
      posterPath: null,
    });
    cleanup();

    // Direction 2: tv present, movie absent -> adding movie must POST type=movie.
    const { fetchMock: fetchMock2 } = denyFetch((url, init) => {
      if (url === '/api/watchlist' && init?.method === 'POST') {
        return ok({ success: true });
      }
      if (url === '/api/watchlist' && (!init || !init.method || init.method === 'GET')) {
        return jsonResponse(200, [TV_603]);
      }
      throw new Error(`unhandled ${url} ${init?.method ?? 'GET'}`);
    });
    render(
      <WatchlistProvider>
        <WatchToggleProbe type="movie" id={603} testId="movie-603" title="Movie Six Zero Three" />
        <WatchProbe type="tv" id={603} testId="tv-603" />
      </WatchlistProvider>
    );
    await waitFor(() => expect(screen.getByTestId('tv-603').textContent).toBe('in'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add Movie Six Zero Three to watchlist' }));
    });
    await waitFor(() => expect(fetchMock2).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId('movie-603').textContent).toBe('in');
    expect(screen.getByTestId('tv-603').textContent).toBe('in');
    expect(fetchMock2.mock.calls[1][0]).toBe('/api/watchlist');
    expect(fetchMock2.mock.calls[1][1]).toMatchObject({ method: 'POST' });
    expect(JSON.parse(String(fetchMock2.mock.calls[1][1].body))).toEqual({
      itemId: 603,
      type: 'movie',
      title: 'Movie Six Zero Three',
      posterPath: null,
    });
  });

  it('failed add rolls back only the targeted key (cross-type pill untouched)', async () => {
    const { toast } = await import('react-hot-toast');
    vi.mocked(toast.error).mockClear();
    const { fetchMock } = denyFetch((url, init) => {
      if (url === '/api/watchlist' && init?.method === 'POST') {
        return Promise.reject(new Error('forced network failure'));
      }
      if (url === '/api/watchlist' && (!init || !init.method || init.method === 'GET')) {
        return jsonResponse(200, [MOVIE_603]);
      }
      throw new Error(`unhandled ${url} ${init?.method ?? 'GET'}`);
    });
    render(
      <WatchlistProvider>
        <WatchToggleProbe type="tv" id={603} testId="tv-603" title="TV Six Zero Three" />
        <WatchProbe type="movie" id={603} testId="movie-603" />
      </WatchlistProvider>
    );
    await waitFor(() => expect(screen.getByTestId('movie-603').textContent).toBe('in'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add TV Six Zero Three to watchlist' }));
    });
    // The POST was attempted (not the old no-op DELETE)...
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1][0]).toBe('/api/watchlist');
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'POST' });
    // ...and the optimistic tv add is rolled back.
    await waitFor(() => expect(screen.getByTestId('tv-603').textContent).toBe('out'));
    // The movie pill is untouched (type-specific rollback).
    expect(screen.getByTestId('movie-603').textContent).toBe('in');
    expect(vi.mocked(toast.error)).toHaveBeenCalled();
  });

  it('failed delete restores only the targeted key (cross-type pill untouched)', async () => {
    const { toast } = await import('react-hot-toast');
    vi.mocked(toast.error).mockClear();
    denyFetch((url, init) => {
      if (url === '/api/watchlist') return jsonResponse(200, [MOVIE_603, TV_603]);
      if (url === '/api/watchlist?itemId=603&type=movie' && init?.method === 'DELETE') {
        return Promise.reject(new Error('forced network failure'));
      }
      throw new Error(`unhandled ${url} ${init?.method ?? 'GET'}`);
    });
    render(
      <WatchlistProvider>
        <WatchToggleProbe type="movie" id={603} testId="movie-603" title="Movie Six Zero Three" />
        <WatchProbe type="tv" id={603} testId="tv-603" />
      </WatchlistProvider>
    );
    await waitFor(() => expect(screen.getByTestId('movie-603').textContent).toBe('in'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove Movie Six Zero Three from watchlist' }));
    });
    // The failed movie delete is rolled back (pill restored)...
    await waitFor(() => expect(screen.getByTestId('movie-603').textContent).toBe('in'));
    // ...and the tv pill never flipped.
    expect(screen.getByTestId('tv-603').textContent).toBe('in');
    expect(vi.mocked(toast.error)).toHaveBeenCalled();
  });

  it('performs exactly one GET with many consumers', async () => {
    const { fetchMock } = denyFetch((url) => {
      if (url === '/api/watchlist') return jsonResponse(200, [MOVIE_603]);
      throw new Error(`unhandled ${url}`);
    });
    render(
      <WatchlistProvider>
        {Array.from({ length: 5 }).map((_, i) => (
          <WatchProbe key={i} type={i % 2 ? 'tv' : 'movie'} id={603} testId={`probe-${i}`} />
        ))}
      </WatchlistProvider>
    );
    await waitFor(() => expect(screen.getByTestId('probe-0').textContent).toBe('in'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/watchlist');
  });

  it('toggleWatchlist reference remains stable across membership changes', async () => {
    denyFetch((url, init) => {
      if (url === '/api/watchlist') return jsonResponse(200, [MOVIE_603]);
      if (url === '/api/watchlist?itemId=603&type=movie' && init?.method === 'DELETE') {
        return ok({ success: true });
      }
      throw new Error(`unhandled ${url} ${init?.method ?? 'GET'}`);
    });
    render(<WatchlistProvider><WatchStabilityProbe /></WatchlistProvider>);
    const btn = () => screen.getByRole('button', { name: /six zero three/i });
    await waitFor(() => expect(btn().getAttribute('aria-pressed')).toBe('true'));
    const before = watchToggleRefs[watchToggleRefs.length - 1];
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove Movie Six Zero Three from watchlist' }));
    });
    await waitFor(() => expect(btn().getAttribute('aria-pressed')).toBe('false'));
    const after = watchToggleRefs[watchToggleRefs.length - 1];
    // Multiple renders occurred (hydration + optimistic + settle) yet the
    // callback identity never changed (ref-mirror pattern preserved).
    expect(watchToggleRefs.length).toBeGreaterThan(1);
    expect(after).toBe(before);
    expect(new Set(watchToggleRefs).size).toBe(1);
  });

  it('skips invalid hydrated records (bad type, non-finite or non-positive itemId)', async () => {
    denyFetch((url) => {
      if (url === '/api/watchlist') {
        return jsonResponse(200, [
          MOVIE_603,
          { itemId: 707, type: 'person', title: 'Person Seven Zero Seven', posterPath: null },
          { itemId: 'not-a-number', type: 'tv', title: 'Bad Id', posterPath: null },
          { itemId: -5, type: 'tv', title: 'Negative', posterPath: null },
          { itemId: null, type: 'tv', title: 'Null Id', posterPath: null },
          { itemId: 808, type: 'tv', title: 'TV Eight Zero Eight', posterPath: null },
        ]);
      }
      throw new Error(`unhandled ${url}`);
    });
    render(
      <WatchlistProvider>
        <WatchProbe type="movie" id={603} testId="movie-603" />
        <WatchProbe type="tv" id={808} testId="tv-808" />
        <WatchProbe type="tv" id={707} testId="tv-707" />
        <WatchNumberProbe id={603} testId="num-603" />
      </WatchlistProvider>
    );
    await waitFor(() => expect(screen.getByTestId('movie-603').textContent).toBe('in'));
    expect(screen.getByTestId('tv-808').textContent).toBe('in');
    expect(screen.getByTestId('tv-707').textContent).toBe('out');
    expect(screen.getByTestId('num-603').textContent).toBe('no-numeric');
  });
});

// --- Favorites -----------------------------------------------------------------

describe('FavoritesContext media-type membership identity', () => {
  it('RED C: movie-only hydration — movie 603 favorited, tv 603 not, no bare-numeric key', async () => {
    denyFetch((url) => {
      if (url === '/api/favorites') return jsonResponse(200, [MOVIE_603]);
      throw new Error(`unhandled ${url}`);
    });
    render(
      <FavoritesProvider>
        <FavProbe type="movie" id={603} testId="movie-603" />
        <FavProbe type="tv" id={603} testId="tv-603" />
        <FavNumberProbe id={603} testId="num-603" />
      </FavoritesProvider>
    );
    await waitFor(() => expect(screen.getByTestId('movie-603').textContent).toBe('in'));
    expect(screen.getByTestId('tv-603').textContent).toBe('out');
    expect(screen.getByTestId('num-603').textContent).toBe('no-numeric');
  });

  it('RED D: tv-only hydration — tv 603 favorited, movie 603 not, no bare-numeric key', async () => {
    denyFetch((url) => {
      if (url === '/api/favorites') return jsonResponse(200, [TV_603]);
      throw new Error(`unhandled ${url}`);
    });
    render(
      <FavoritesProvider>
        <FavProbe type="movie" id={603} testId="movie-603" />
        <FavProbe type="tv" id={603} testId="tv-603" />
        <FavNumberProbe id={603} testId="num-603" />
      </FavoritesProvider>
    );
    await waitFor(() => expect(screen.getByTestId('tv-603').textContent).toBe('in'));
    expect(screen.getByTestId('movie-603').textContent).toBe('out');
    expect(screen.getByTestId('num-603').textContent).toBe('no-numeric');
  });

  it('coexistence: movie 603 + tv 603 favorites hydrate as distinct memberships', async () => {
    denyFetch((url) => {
      if (url === '/api/favorites') return jsonResponse(200, [MOVIE_603, TV_603]);
      throw new Error(`unhandled ${url}`);
    });
    render(
      <FavoritesProvider>
        <FavProbe type="movie" id={603} testId="movie-603" />
        <FavProbe type="tv" id={603} testId="tv-603" />
        <FavNumberProbe id={603} testId="num-603" />
      </FavoritesProvider>
    );
    await waitFor(() => expect(screen.getByTestId('movie-603').textContent).toBe('in'));
    expect(screen.getByTestId('tv-603').textContent).toBe('in');
    expect(screen.getByTestId('num-603').textContent).toBe('no-numeric');
  });

  it('absent tv adds via POST with exact body; movie delete keeps tv (type-scoped DELETE)', async () => {
    const { fetchMock } = denyFetch((url, init) => {
      if (url === '/api/favorites' && init?.method === 'POST') {
        return ok({ success: true });
      }
      if (url === '/api/favorites?itemId=603&type=movie' && init?.method === 'DELETE') {
        return ok({ success: true });
      }
      if (url === '/api/favorites' && (!init || !init.method || init.method === 'GET')) {
        return jsonResponse(200, [MOVIE_603]);
      }
      throw new Error(`unhandled ${url} ${init?.method ?? 'GET'}`);
    });
    render(
      <FavoritesProvider>
        <FavToggleProbe type="tv" id={603} testId="tv-603" title="TV Six Zero Three" />
        <FavToggleProbe type="movie" id={603} testId="movie-603" title="Movie Six Zero Three" />
      </FavoritesProvider>
    );
    await waitFor(() => expect(screen.getByTestId('movie-603').textContent).toBe('in'));
    // Add the absent tv -> POST with the exact type-correct body.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add TV Six Zero Three to favorites' }));
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId('tv-603').textContent).toBe('in');
    expect(screen.getByTestId('movie-603').textContent).toBe('in');
    expect(fetchMock.mock.calls[1][0]).toBe('/api/favorites');
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'POST' });
    expect(JSON.parse(String(fetchMock.mock.calls[1][1].body))).toEqual({
      itemId: 603,
      type: 'tv',
      title: 'TV Six Zero Three',
      posterPath: null,
    });
    // Remove the movie -> DELETE type=movie; tv membership survives.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove Movie Six Zero Three from favorites' }));
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock.mock.calls[2][0]).toBe('/api/favorites?itemId=603&type=movie');
    expect(fetchMock.mock.calls[2][1]).toMatchObject({ method: 'DELETE' });
    await waitFor(() => expect(screen.getByTestId('movie-603').textContent).toBe('out'));
    expect(screen.getByTestId('tv-603').textContent).toBe('in');
  });

  it('failed delete restores only the targeted key (cross-type pill untouched)', async () => {
    const { toast } = await import('react-hot-toast');
    vi.mocked(toast.error).mockClear();
    denyFetch((url, init) => {
      if (url === '/api/favorites') return jsonResponse(200, [MOVIE_603, TV_603]);
      if (url === '/api/favorites?itemId=603&type=movie' && init?.method === 'DELETE') {
        return Promise.reject(new Error('forced network failure'));
      }
      throw new Error(`unhandled ${url} ${init?.method ?? 'GET'}`);
    });
    render(
      <FavoritesProvider>
        <FavToggleProbe type="movie" id={603} testId="movie-603" title="Movie Six Zero Three" />
        <FavProbe type="tv" id={603} testId="tv-603" />
      </FavoritesProvider>
    );
    await waitFor(() => expect(screen.getByTestId('movie-603').textContent).toBe('in'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove Movie Six Zero Three from favorites' }));
    });
    await waitFor(() => expect(screen.getByTestId('movie-603').textContent).toBe('in'));
    expect(screen.getByTestId('tv-603').textContent).toBe('in');
    expect(vi.mocked(toast.error)).toHaveBeenCalled();
  });

  it('performs exactly one GET with many consumers', async () => {
    const { fetchMock } = denyFetch((url) => {
      if (url === '/api/favorites') return jsonResponse(200, [MOVIE_603]);
      throw new Error(`unhandled ${url}`);
    });
    render(
      <FavoritesProvider>
        {Array.from({ length: 3 }).map((_, i) => (
          <FavProbe key={i} type={i % 2 ? 'tv' : 'movie'} id={603} testId={`probe-${i}`} />
        ))}
      </FavoritesProvider>
    );
    await waitFor(() => expect(screen.getByTestId('probe-0').textContent).toBe('in'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/favorites');
  });

  it('FavoriteButton reflects membership for its explicit type prop', async () => {
    denyFetch((url) => {
      if (url === '/api/favorites') return jsonResponse(200, [MOVIE_603]);
      throw new Error(`unhandled ${url}`);
    });
    render(
      <FavoritesProvider>
        <FavoriteButton itemId={603} type="movie" title="Movie Six Zero Three" posterPath={null} />
        <FavoriteButton itemId={603} type="tv" title="TV Six Zero Three" posterPath={null} />
      </FavoritesProvider>
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Remove from favorites' })).toBeInTheDocument()
    );
    const addButton = screen.getByRole('button', { name: 'Add to favorites' });
    expect(screen.getByRole('button', { name: 'Remove from favorites' })).toHaveAttribute('aria-pressed', 'true');
    expect(addButton).toHaveAttribute('aria-pressed', 'false');
  });

  it('keeps the existing toggleFavorite dependency structure (FE-DATA-002 left unmodified)', () => {
    const raw: string = readFileSync('contexts/FavoritesContext.tsx', 'utf8');
    expect(raw).toContain('[session?.user?.email, favoriteIds]');
  });
});
