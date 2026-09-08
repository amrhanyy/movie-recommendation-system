import { describe, it, expect, vi } from 'vitest';
import * as React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import fs from 'node:fs';
import path from 'node:path';

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
    default: ({ src, alt, onLoadingComplete, ...props }: Record<string, unknown>) =>
      R.createElement('img', { src, alt, ...props }),
  };
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}));

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { MediaCard } from '@/components/MediaCard';
import { Section } from '@/components/Section';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { LANGUAGES } from '@/contexts/LanguageContext';

const item = {
  _id: 'abc',
  itemId: 11,
  title: 'Test Title',
  type: 'movie' as const,
  posterPath: '/p.jpg',
  addedAt: new Date().toISOString(),
  releaseDate: '2024-01-02',
  voteAverage: 7.55,
  runtime: 120,
  overview: 'An overview.',
  genres: ['Action', 'Drama'],
};

describe('M6 consistency', () => {
  it('MediaCard grid/cyan renders with explicit aria-pressed="true" and accent class', () => {
    render(<MediaCard item={item} onRemove={() => {}} variant="grid" accent="cyan" />);
    const btn = screen.getByRole('button', { name: /remove test title from watchlist/i });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    expect(btn.className).toMatch(/text-cyan-500/);
    expect(screen.getByAltText('Test Title')).toBeInTheDocument();
  });

  it('MediaCard detailed/pink renders heart action with Favorites label', () => {
    render(<MediaCard item={item} onRemove={() => {}} variant="detailed" accent="pink" />);
    const btn = screen.getByRole('button', { name: /remove test title from favorites/i });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText(/added:/i)).toBeInTheDocument();
  });

  it('MediaCard compact renders rating and first genre', () => {
    const { container } = render(<MediaCard item={item} onRemove={() => {}} variant="compact" accent="cyan" />);
    expect(screen.getAllByText('7.5').length).toBeGreaterThan(0);
    // jsdom splits icon svg + text oddly; assert via container text instead.
    expect(container.textContent).toMatch(/Action/);
  });

  it('Section renders landmark section with labelled header', () => {
    render(
      <Section title="Picks">
        <p>child</p>
      </Section>
    );
    const region = screen.getByRole('region', { name: 'Picks' });
    expect(region.tagName).toBe('SECTION');
    expect(screen.getByRole('heading', { name: 'PICKS' })).toBeInTheDocument();
  });

  it('ConfirmDialog blocks action until confirmed', async () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        trigger={<button type="button">Clear list</button>}
        title="Clear watchlist?"
        description="Cannot be undone."
        confirmLabel="Clear all"
        onConfirm={onConfirm}
      />
    );
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Clear list' }));
    // Dialog content appears only after trigger; confirm fires only on action.
    const confirm = await screen.findByRole('button', { name: 'Clear all' });
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('LANGUAGES matches exactly the shipped translated locales', () => {
    expect(Object.keys(LANGUAGES).sort()).toEqual(['de-DE', 'en-US', 'es-ES', 'fr-FR']);
    expect(Object.keys(LANGUAGES)).toHaveLength(4);
  });

  it('package.json tripwire: removed dep names absent', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')
    ) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const all = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
    for (const dead of [
      'embla-carousel-react',
      'embla-carousel',
      'date-fns',
      'input-otp',
      'vaul',
      'sonner',
      'react-day-picker',
    ]) {
      expect(all[dead], `dead dep still present: ${dead}`).toBeUndefined();
    }
    // recharts kept: DashboardOverview imports it directly.
    expect(all['recharts']).toBeDefined();
  });

  it('superseded card files + dead ui primitives are deleted', () => {
    for (const f of [
      'components/GridItemCard.tsx',
      'components/DetailedItemCard.tsx',
      'components/CompactItemCard.tsx',
      'components/FavoriteGridItemCard.tsx',
      'components/FavoriteDetailedItemCard.tsx',
      'components/FavoriteCompactItemCard.tsx',
      'components/ui/carousel.tsx',
      'components/ui/calendar.tsx',
      'components/ui/input-otp.tsx',
      'components/ui/drawer.tsx',
      'components/ui/chart.tsx',
      'components/ui/sonner.tsx',
      'components/ui/use-toast.ts',
    ]) {
      expect(fs.existsSync(path.join(process.cwd(), f)), `${f} should be deleted`).toBe(false);
    }
    expect(fs.existsSync(path.join(process.cwd(), 'components/MediaCard.tsx'))).toBe(true);
    expect(fs.existsSync(path.join(process.cwd(), 'hooks/use-toast.ts'))).toBe(true);
  });
});
