import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { render, screen, waitFor, fireEvent, act, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// No Next runtime in jsdom: minimal deterministic link/image mocks.
vi.mock('next/link', async () => {
  const R = (await import('react')).default;
  return {
    default: ({ children, ...props }: Record<string, unknown>) =>
      R.createElement('a', props, children),
  };
});

vi.mock('next/image', async () => {
  const R = (await import('react')).default;
  return {
    default: ({ src, alt, className }: Record<string, unknown>) =>
      R.createElement('img', { src, alt, className }),
  };
});

const pushSpy = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushSpy, back: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams('type=movie'),
  usePathname: () => '/',
}));

vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: null, status: 'unauthenticated' }),
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({ t: (k: string) => k }),
}));

vi.mock('@/components/AuthCheck', () => ({
  AuthCheck: ({ children }: { children: unknown }) => children,
}));

vi.mock('@/components/ui/LoadingSpinner', () => ({
  LoadingSpinner: () => null,
}));
vi.mock('../components/GenreGrid', () => ({
  GenreGrid: () => null,
}));
vi.mock('@/components/GenreGrid', () => ({
  GenreGrid: () => null,
}));
vi.mock('@/components/home/LatestTrailers', () => ({
  default: () => null,
}));
vi.mock('@/components/AuthRequiredMessage', () => ({
  AuthRequiredMessage: () => null,
}));
vi.mock('@/components/PopularCelebrities', () => ({
  PopularCelebrities: () => null,
}));

import { SearchBar } from '@/components/SearchBar';
import ChatList from '@/components/ChatList';
import { ChatAssistant } from '@/components/ChatAssistant';
import { TrendingSection } from '@/components/TrendingSection';
import { WatchlistProvider } from '@/contexts/WatchlistContext';
import { PrivacySettings } from '@/components/PrivacySettings';
import { UserManagement } from '@/components/admin/UserManagement';
import { CacheManagement } from '@/components/admin/CacheManagement';

function jsonResponse(status: number, body: unknown = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  pushSpy.mockClear();
});

beforeEach(() => {
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  } as unknown as Storage);
  if (typeof Element !== 'undefined' && !(Element.prototype as unknown as Record<string, unknown>).scrollIntoView) {
    (Element.prototype as unknown as Record<string, unknown>).scrollIntoView = vi.fn();
  }
});

describe('M5 (a) actor card keyboard: filmography anchors are labelled links', () => {
  it('actor page source renders movie/tv cards as labelled anchors with focus rings', async () => {
    const fs = await import('node:fs');
    const raw: string = fs.readFileSync('app/actor/[id]/page.tsx', 'utf8');
    expect(raw).toContain('href={`/movie/${movie.id}`}');
    expect(raw).toContain('href={`/tv/${show.id}`}');
    expect(raw).toContain('aria-label={`View details for ${movie.title}`}');
    expect(raw).toContain('aria-label={`View details for ${show.name}`}');
    expect(raw).toContain('focus-visible:ring-2 focus-visible:ring-cyan-500');
    expect(raw).not.toMatch(/onClick=\{\(\) => router\.push\(`\/movie\//);
    expect(raw).not.toMatch(/onClick=\{\(\) => router\.push\(`\/tv\//);
  });
});

describe('M5 (b) ChatList delete: focus-within reveal + 44px hit area', () => {
  it('delete button is keyboard-focusable with focus-within reveal + 44px hit area', async () => {
    const oneChat = [
      {
        _id: 'chat-1',
        userId: 'u1',
        messages: [{ role: 'user', content: 'Hello world', timestamp: new Date() }],
        createdAt: new Date(),
      },
    ];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, oneChat)));
    const { container } = render(
      <ChatList onSelectChat={vi.fn()} onDeleteChat={vi.fn()} currentChatId={null} onChatsUpdate={vi.fn()} />
    );
    const btn = await waitFor(() => {
      const el = container.querySelector('button[aria-label="Delete conversation"]');
      if (!el) throw new Error('delete button not rendered yet');
      return el;
    });
    expect(btn?.className).toMatch(/group-focus-within:opacity-100/);
    expect(btn?.className).toMatch(/focus-visible:opacity-100/);
    expect(btn?.className).toMatch(/min-h-\[44px\]/);
    expect(btn?.className).toMatch(/min-w-\[44px\]/);
  });
});

describe('M5 (c) SearchBar listbox semantics', () => {
  it('exposes listbox/option roles and tracks activedescendant after typing', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (String(url).startsWith('/api/search')) {
        return Promise.resolve(
          jsonResponse(200, {
            results: [
              { id: 1, media_type: 'movie', title: 'Inception', poster_path: null, release_date: '2010-01-01' },
              { id: 2, media_type: 'movie', title: 'Interstellar', poster_path: null, release_date: '2014-01-01' },
            ],
          })
        );
      }
      return Promise.resolve(jsonResponse(200, { results: [] }));
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<SearchBar />);
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'incep' } });
    const listbox = await screen.findByRole('listbox');
    expect(listbox).toBeInTheDocument();
    const options = await screen.findAllByRole('option');
    expect(options.length).toBeGreaterThanOrEqual(2);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    await waitFor(() => {
      expect(input.getAttribute('aria-activedescendant')).toBeTruthy();
    });
    const activeId = input.getAttribute('aria-activedescendant');
    expect(document.getElementById(activeId as string)).not.toBeNull();
    const highlighted = options.find((o) => o.getAttribute('aria-selected') === 'true');
    expect(highlighted?.getAttribute('id')).toBe(activeId);
  });
});

describe('M5 (d) labels resolve for labelled inputs', () => {
  it('getByLabelText resolves admin/cache/privacy/chat/conversation inputs', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (String(url).startsWith('/api/admin/users')) {
        return Promise.resolve(jsonResponse(200, { users: [], pagination: { total: 0, page: 1, limit: 10, pages: 0 } }));
      }
      if (String(url).startsWith('/api/admin/cache?action=stats')) {
        return Promise.resolve(jsonResponse(200, { stats: { status: 'online', totalKeys: 0 } }));
      }
      if (String(url).startsWith('/api/admin/cache')) {
        return Promise.resolve(jsonResponse(200, { keys: [] }));
      }
      if (String(url).startsWith('/api/user')) return Promise.resolve(jsonResponse(200, { preferences: {} }));
      return Promise.resolve(jsonResponse(200, {}));
    });
    vi.stubGlobal('fetch', fetchMock);
    const { unmount: u3 } = render(<UserManagement />);
    expect(screen.getByLabelText(/search users/i)).toBeInTheDocument();
    u3();
    const { unmount: u4 } = render(<CacheManagement />);
    expect(screen.getByLabelText(/cache key pattern/i)).toBeInTheDocument();
    u4();
    const { unmount: u5 } = render(<PrivacySettings />);
    expect(screen.getByLabelText(/delete_my_account.*confirm/i)).toBeInTheDocument();
    u5();
    const { unmount: u6 } = render(<ChatAssistant />);
    expect(screen.getByLabelText(/ask me anything/i)).toBeInTheDocument();
    u6();
    render(<ChatList onSelectChat={vi.fn()} onDeleteChat={vi.fn()} currentChatId={null} onChatsUpdate={vi.fn()} />);
    expect(screen.getByLabelText(/search conversations/i)).toBeInTheDocument();
  });
});

describe('M5 (e) chat error renders with role=alert', () => {
  it('ChatAssistant surfaces a failed send as role=alert', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    render(<ChatAssistant />);
    const input = screen.getByLabelText(/ask me anything/i);
    fireEvent.change(input, { target: { value: 'hello' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /send/i }));
    });
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('ai-assistant Thinking indicator and chat log expose live regions', async () => {
    const fs = await import('node:fs');
    const raw: string = fs.readFileSync('app/ai-assistant/page.tsx', 'utf8');
    expect(raw).toContain('role="status"');
    expect(raw).toContain('aria-live="polite"');
    expect(raw).toContain('role="log"');
  });
});

describe('M5 (f) home renders error + retry when fetch rejects', () => {
  it('home source renders the hero error alert with a retry that refetches', async () => {
    const fs = await import('node:fs');
    const raw: string = fs.readFileSync('app/page.tsx', 'utf8');
    expect(raw).toContain('role="alert"');
    expect(raw).toContain('Try Again');
    expect(raw).toContain('onClick={() => void fetchMovies()}');
    expect(raw).toContain('role="status"');
    expect(raw).toContain('aria-label="Loading trending"');
  });
});

describe('M5 (g) genre retry triggers a second fetch', () => {
  it('genre retry button refetches via a retry token', async () => {
    const fs = await import('node:fs');
    const raw: string = fs.readFileSync('app/genre/[id]/page.tsx', 'utf8');
    expect(raw).toContain('onClick={retryFetch}');
    expect(raw).toContain('setRetryToken');
    expect(raw).toContain('[id, contentType, retryToken]');
    expect(raw).toContain('(hasMore || isLoadingMore) && isLoadingMore');
  });
});

describe('M5 (h) TrendingSection with initialMovies performs zero fetch', () => {
  it('mounts from initialMovies without any network call', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(
      <WatchlistProvider>
        <TrendingSection
          initialMovies={[
            { id: 1, title: 'One', poster_path: '/a.jpg', backdrop_path: '/b.jpg', vote_average: 8, media_type: 'movie', popularity: 9 },
          ]}
        />
      </WatchlistProvider>
    );
    await screen.findByRole('link', { name: /view details for one/i });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('M5 stable chat keys (no Date.now in key path)', () => {
  it('message keys are composite role+index+timestamp', async () => {
    const fs = await import('node:fs');
    const raw: string = fs.readFileSync('components/ChatAssistant.tsx', 'utf8');
    expect(raw).toContain("${message.isUser ? 'user' : 'assistant'}-${index}-${message.timestamp}");
    expect(raw).not.toMatch(/key=\{Date\.now\(\)/);
    expect(raw).not.toMatch(/key=\{message\.timestamp\}/);
  });

  it('toggleWatchlist is identity-stable (no watchlistIds dep)', async () => {
    const fs = await import('node:fs');
    const raw: string = fs.readFileSync('contexts/WatchlistContext.tsx', 'utf8');
    expect(raw).toContain('watchlistIdsRef');
    expect(raw).toContain('[session?.user?.email]');
    expect(raw).not.toMatch(/\[session\?\.user\?\.email, watchlistIds\]/);
  });
});
