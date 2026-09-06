import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { Suspense } from 'react';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Deterministic, minimal next/link + next/image for jsdom (no Next runtime).
vi.mock('next/link', async () => {
  const R = (await import('react')).default;
  return {
    default: (props: Record<string, unknown>) =>
      R.createElement('a', props, props.children),
  };
});

vi.mock('next/image', async () => {
  const R = (await import('react')).default;
  return {
    default: (props: Record<string, unknown>) =>
      R.createElement('img', {
        src: props.src,
        alt: props.alt,
        className: props.className,
        loading: props.loading,
      }),
  };
});

// Controllable useSearchParams.
vi.mock('next/navigation', () => ({
  useSearchParams: vi.fn(() => new URLSearchParams('')),
}));

import { useSearchParams } from 'next/navigation';
import NotFound from '@/app/not-found';
import SearchPage from '@/app/search/page';
import { MovieTrailer } from '@/components/MovieTrailer';

const msp = vi.mocked(useSearchParams);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Phase 3: /not-found (branded 404)', () => {
  it('renders an accessible, branded 404 with primary + secondary CTAs', () => {
    const { container } = render(<NotFound />);

    // Heading hierarchy
    const heading = screen.getByRole('heading', { name: /page not found/i });
    expect(heading).toBeInTheDocument();

    // The 404 numeral is present in the DOM
    expect(container.textContent).toContain('404');

    // Primary CTA -> home, secondary CTA -> trending
    const home = screen.getByRole('link', { name: /back to home/i });
    const trending = screen.getByRole('link', { name: /browse trending/i });
    expect(home).toHaveAttribute('href', '/');
    expect(trending).toHaveAttribute('href', '/trending');
  });

  it('has an aria-labelled section for screen readers', () => {
    const { container } = render(<NotFound />);
    const section = container.querySelector('section');
    expect(section).not.toBeNull();
    expect(section?.getAttribute('aria-labelledby')).toBeTruthy();
  });
});

describe('Phase 3: /search (results page)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('prompts the user when there is no query and makes no network call', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    msp.mockReturnValue(new URLSearchParams(''));

    render(
      <Suspense fallback={null}>
        <SearchPage />
      </Suspense>
    );

    expect(screen.getByRole('heading', { name: /search moviemind/i })).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('shows a status skeleton while loading for a given query', async () => {
    let resolveFetch: (value: unknown) => void = () => {};
    const fetchSpy = vi.fn(
      () => new Promise((resolve) => (resolveFetch = resolve))
    );
    vi.stubGlobal('fetch', fetchSpy);
    msp.mockReturnValue(new URLSearchParams('q=interstellar'));

    render(
      <Suspense fallback={null}>
        <SearchPage />
      </Suspense>
    );

    // Loading state exposes role=status
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/search?query=interstellar',
      expect.anything()
    );

    // Resolve to move out of loading
    resolveFetch({ results: [] });
    await waitFor(() => {
      expect(screen.queryByRole('status')).toBeNull();
    });
  });

  it('renders a results grid with poster links wrapped in <a> when results exist', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            { id: 155, media_type: 'movie', title: 'Inception', poster_path: '/x.jpg', release_date: '2010-07-16', vote_average: 8.4 },
            { id: 1399, media_type: 'tv', name: 'Breaking Bad', poster_path: '/y.jpg', first_air_date: '2008-01-20', vote_average: 9.0 },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchSpy);
    msp.mockReturnValue(new URLSearchParams('q=inception'));

    const { container } = render(
      <Suspense fallback={null}>
        <SearchPage />
      </Suspense>
    );

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /view details for inception/i })).toBeInTheDocument();
    });

    const links = container.querySelectorAll('a[href^="/movie/"], a[href^="/tv/"]');
    expect(links.length).toBeGreaterThanOrEqual(2);
    // Each result poster is rendered as an <img> with a TMDB src
    const posters = container.querySelectorAll('img');
    expect(posters.length).toBeGreaterThanOrEqual(2);
    expect(posters[0]?.getAttribute('src')).toContain('image.tmdb.org');
    // Media type badges are present
    expect(container.textContent).toContain('Movie');
    expect(container.textContent).toContain('TV');
  });

  it('renders the no-results empty state when the API returns nothing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ results: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      )
    );
    msp.mockReturnValue(new URLSearchParams('q=zzzznotreal'));

    render(
      <Suspense fallback={null}>
        <SearchPage />
      </Suspense>
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /no results found/i })).toBeInTheDocument();
    });
  });
});

describe('Phase 3: MovieTrailer (no dead /videos call)', () => {
  it('makes no network call and shows the fallback when initialTrailerKey is null', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const { container } = render(<MovieTrailer movieId="603" initialTrailerKey={undefined} />);

    expect(screen.getByText(/no trailer available/i)).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
    // No iframe rendered
    expect(container.querySelector('iframe')).toBeNull();
  });

  it('makes no network call when initialTrailerKey is an invalid/unsafe value', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    render(<MovieTrailer movieId="603" initialTrailerKey={'javascript:alert(1)'} />);

    expect(screen.getByText(/no trailer available/i)).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('renders the YouTube embed (no fetch) when given a valid trailer key', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const { container } = render(
      <MovieTrailer movieId="603" initialTrailerKey="dQw4w9WgXcQ" />
    );

    // A valid 11-char key produces the nocookie embed iframe, still without a fetch.
    expect(container.querySelector('iframe')).not.toBeNull();
    expect(container.querySelector('iframe')?.getAttribute('src')).toContain('youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
