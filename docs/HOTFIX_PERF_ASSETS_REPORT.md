# HOTFIX / PERF / ASSETS REPORT

**Date:** 2026-09-06  
**Scope:** `useFeatures` 503 fallback, placeholder image paths, `<Image />` optimization, NextAuth dev cookie gating

---

## 1. Files Modified

| File | Change |
|------|--------|
| `hooks/useFeatures.ts` | Removed throw on 503; parse body even on non-OK status |
| `lib/auth.ts` | Conditionally gate `__Host-`/`__Secure-` cookie prefixes to production only |
| `components/GridItemCard.tsx` | `/placeholder-poster.png` → `/images/placeholder-poster.png`; added `loading="lazy"` |
| `components/CompactItemCard.tsx` | Same path fix + `sizes` + `loading="lazy"` |
| `components/DetailedItemCard.tsx` | Same path fix + `sizes` + `loading="lazy"` |
| `components/FavoriteDetailedItemCard.tsx` | Same path fix + `sizes` + `loading="lazy"` |
| `components/FavoriteGridItemCard.tsx` | Same path fix + `loading="lazy"` |
| `components/FavoriteCompactItemCard.tsx` | Same path fix + `sizes` + `loading="lazy"` |
| `components/ForYouSection.tsx` | Same path fix + `sizes` + `loading="lazy"` |
| `components/Favorites.tsx` | `/placeholder-poster.png` → `/images/placeholder-poster.png` |
| `app/movie/[id]/page.tsx` | Both placeholder paths fixed; 3 `<Image fill>` instances got `sizes` + `loading="lazy"` |
| `app/actor/[id]/page.tsx` | Both placeholder paths fixed; 2 `<Image fill>` instances got `sizes` + `loading="lazy"` |
| `app/tv/[id]/page.tsx` | Both placeholder paths fixed; 3 `<Image fill>` instances got `sizes` + `loading="lazy"` |

---

## 2. Placeholder Paths — Confirmed Updated

All 13 references resolved. Zero remaining old-path occurrences in source files:

```
/placeholder-poster.png   → /images/placeholder-poster.png  (11 locations)
/placeholder-avatar.png   → /images/placeholder-avatar.png  ( 2 locations)
```

---

## 3. `useFeatures` Fallback — Verified

Before:
```typescript
if (!response.ok) {
  throw new Error('Failed to fetch features')   // → client got stale {aiAssistant:true}
}
```

After:
```typescript
const data: SystemConfig = await response.json().catch(
  () => ({ features: { aiAssistant: false } })
)
if (data?.features) {
  setFeatures(data.features)
} else {
  setFeatures({ aiAssistant: false })
}
```

Now reads the 503 JSON payload (`{features:{aiAssistant:false}}`) so the client stays in sync with the server's fail-closed intent.

---

## 4. Verification Results

### `npx tsc --noEmit`
```
Exit code: 0 — 0 errors
```

### `npm run lint`
```
✖ 97 problems (0 errors, 97 warnings)
Exit code: 0
```

### `npx vitest run`
```
Test Files  17 passed (17)
     Tests  245 passed (245)
 Duration  50.02s
 Exit code: 0
```

---

## 5. Summary

| Issue | Status |
|-------|--------|
| Feature hook 503 fallback | ✅ Fixed |
| Placeholder image 400s | ✅ Fixed (13 locations) |
| Image eager preloading | ✅ Fixed (`sizes` + `loading="lazy"` on all card `<Image fill>` usages) |
| Dev cookie prefix warnings | ✅ Fixed (production-hardened, dev-friendly) |
| TypeScript compilation | ✅ 0 errors |
| Lint | ✅ 0 errors |
| Tests | ✅ 245/245 green |
