# DIAGNOSTIC REPORT

**Project:** movie-recommendation-system  
**Date:** 2026-09-06  
**Scope:** Read-only investigation of console/network errors

---

## 1. Feature Flags Hook Error (`hooks/useFeatures.ts:32`)

### Root Cause

In `hooks/useFeatures.ts`, line 30-32:

```typescript
if (!response.ok) {
  throw new Error('Failed to fetch features')  // LINE 32
}
```

The `/api/features` endpoint now returns **HTTP 503** (with `{features: {aiAssistant: false}}`) when MongoDB is unavailable. However, the hook checks `response.ok` **before** reading the JSON body. Since 503 is not OK, the hook throws and never consumes the fallback payload. The `catch` block (line 40-44) sets `error` state but **leaves `features` at its default** `{aiAssistant: true}` — directly contradicting the server's intent to disable the feature.

This causes a inconsistency: the UI sees `aiAssistant: true` (default) while the server has explicitly set it to `false`.

### Impact
- **Reliability**: Feature flag state desync between client and server on DB failure.
- **UX**: AI Assistant may appear enabled when it should be disabled (or vice versa after recovery).
- **Severity**: Medium — functional inconsistency, not a crash.

### Remediation
Read the response body even on non-OK status and apply fallbacks:

```typescript
// hooks/useFeatures.ts — replace lines 29-44
const response = await fetch('/api/features')
const data: SystemConfig = await response.json().catch(() => ({ features: { aiAssistant: false } }))
if (data.features) {
  setFeatures(data.features)
}
```

→ Skips the throw entirely; uses server-provided fallback on any response.

---

## 2. Image 400 Bad Requests (`placeholder-poster.png` & `placeholder-avatar.png`)

### Root Cause

The code references placeholder images with incorrect paths:

| File | Line | Current Path | Correct Path |
|------|------|-------------|--------------|
| `components/GridItemCard.tsx` | 55 | `/placeholder-poster.png` | `/images/placeholder-poster.png` |
| `components/ForYouSection.tsx` | 164 | `/placeholder-poster.png` | `/images/placeholder-poster.png` |
| `components/CompactItemCard.tsx` | 57 | `/placeholder-poster.png` | `/images/placeholder-poster.png` |
| `components/DetailedItemCard.tsx` | 73 | `/placeholder-poster.png` | `/images/placeholder-poster.png` |
| `components/FavoriteDetailedItemCard.tsx` | 84 | `/placeholder-poster.png` | `/images/placeholder-poster.png` |
| `app/movie/[id]/page.tsx` | 509 | `/placeholder-avatar.png` | `/images/placeholder-avatar.png` |
| `app/movie/[id]/page.tsx` | 589, 684 | `/placeholder-poster.png` | `/images/placeholder-poster.png` |
| `app/actor/[id]/page.tsx` | 218, 266 | `/placeholder-poster.png` | `/images/placeholder-poster.png` |
| `app/tv/[id]/page.tsx` | 451 | `/placeholder-avatar.png` | `/images/placeholder-avatar.png` |
| `app/tv/[id]/page.tsx` | 520, 610 | `/placeholder-poster.png` | `/images/placeholder-poster.png` |
| `components/FavoriteGridItemCard.tsx` | 70 | `/placeholder-poster.png` | `/images/placeholder-poster.png` |
| `components/Favorites.tsx` | 96 | `/placeholder-poster.png` | `/images/placeholder-poster.png` |
| `components/FavoriteCompactItemCard.tsx` | 71 | `/placeholder-poster.png` | `/images/placeholder-poster.png` |

The actual files are located at `public/images/placeholder-poster.png` and `public/images/placeholder-avatar.png`. Next.js `Image` optimization routes (`/_next/image?url=/placeholder...`) return **400** because the path `/placeholder-poster.png` does not resolve to a file in `public/`.

### Impact
- **Performance**: Every card with a missing image triggers a 400 network request + broken image placeholder.
- **UX**: Visible broken image icons degrading visual quality.
- **Severity**: High — affects every page rendering movie/actor/tv cards.

### Remediation
Replace all `/placeholder-poster.png` → `/images/placeholder-poster.png` and `/placeholder-avatar.png` → `/images/placeholder-avatar.png` across the 13 locations above.

---

## 3. High Network Request Volume (100+ Requests per Page)

### Root Cause

Multiple card components (`GridItemCard`, `CompactItemCard`, `DetailedItemCard`, `FavoriteDetailedItemCard`, `FavoriteGridItemCard`, `FavoriteCompactItemCard`) use Next.js `<Image>` components to render poster images. On pages with dense layouts (home `/`, `/trending`, `/genres`, `/movie/[id]`, `/actor/[id]`, `/tv/[id]`), each visible card issues a separate image request. With 20-50 cards per page, this easily exceeds 100 simultaneous requests.

Additionally, the `<Image>` components may lack `loading="lazy"` and `sizes` attributes, causing **eager preloading** of off-screen images instead of lazy loading.

### Impact
- **Performance**: High initial load time, bandwidth waste, potential OOM on mobile.
- **UX**: Slow page render, layout shift from images loading progressively.
- **Severity**: High — directly impacts Core Web Vitals (LCP, CLS).

### Remediation
1. Add `loading="lazy"` and appropriate `sizes` props to all `<Image>` components in card components.
2. Consider adding a temporary placeholder/skeleton to avoid layout shift.
3. For the home page carousel, ensure off-screen items use `loading="lazy"`.

---

## 4. NextAuth Cookie Prefix Warnings in Development

### Root Cause

In `lib/auth.ts` (lines 124-158), NextAuth is configured with prefixed cookie names:

```typescript
sessionToken: { name: `__Secure-next-auth.session-token`, options: { secure: process.env.NODE_ENV === "production" } }
callbackUrl:   { name: `__Secure-next-auth.callback-url`,   options: { secure: process.env.NODE_ENV === "production" } }
csrfToken:     { name: `__Host-next-auth.csrf-token`,      options: { secure: process.env.NODE_ENV === "production" } }
```

While `secure` is correctly gated to `NODE_ENV === 'production'`, the **cookie name prefixes** themselves carry browser-enforced requirements:

- **`__Host-` prefix** (line 145): Requires `Secure` flag, `Path=/`, and `SameSite=Lax/Strict`. Browsers **reject** `__Host-` cookies on non-secure origins (http://localhost) regardless of the `secure` option value.
- **`__Secure-` prefix** (lines 127, 136): Requires `Secure` flag. In dev (`secure: false`), these cookies should work on HTTP, but some browsers enforce prefix rules strictly.

The warning appears because the browser rejects `__Host-next-auth.csrf-token` on `http://localhost` — the `__Host-` prefix is incompatible with non-HTTPS origins by design.

### Impact
- **Reliability**: CSRF token cookie cannot be set in development, potentially breaking authentication flows locally.
- **UX**: Login/sign-in may fail silently in dev environment.
- **Severity**: Medium — only affects local development, not production.

### Remediation
Use conditional cookie names based on environment:

```typescript
const cookiePrefix = process.env.NODE_ENV === 'production' ? '__Host-next-auth.' : 'next-auth.';
// Then use `cookiePrefix + 'csrf-token'` etc.
```

Or simply remove the `__Host-` / `__Secure-` prefixes for the development environment.

---

## Summary

| # | Issue | Files Affected | Severity | Fix Complexity |
|---|-------|---------------|----------|----------------|
| 1 | Feature hook ignores 503 fallback | `hooks/useFeatures.ts:32` | Medium | Low (3 lines) |
| 2 | Wrong placeholder image paths | 13 locations across 11 files | High | Low (string replace) |
| 3 | 100+ image requests per page | Card components | High | Medium (add lazy/sizes) |
| 4 | __Host- cookie rejected on HTTP | `lib/auth.ts:145` | Medium | Low (env-gated prefix) |

**Priority order for remediation:** 2 → 1 → 4 → 3
