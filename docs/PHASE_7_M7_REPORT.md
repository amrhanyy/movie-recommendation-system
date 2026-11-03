# PHASE 7 (M7) Report — Release Hardening, Architectural Closure, Canonical Docs

**Base:** `bcdb834` (verified: `git log --oneline -5` =
`bcdb834/64fb31c/0fe9c4c/adfb83a/99bb4a0`).
**Mandate:** final polish, security backlog sweep, ADR consolidation, archive
decisions. **Constraints honoured:** zero breaking API changes, zero new major
deps, frozen suites UNMODIFIED (no test file touched this phase).
**Scope lock:** no API contract change, no UI redesign, no TTL activation, no
dependency added, no destructive script run.

## 1. Files changed

| File | Change |
|---|---|
| `next.config.mjs` | W1-007: `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Resource-Policy: cross-origin` appended to the global headers block (CSP/HSTS/XFO/nosniff untouched). |
| `components/SearchBar.tsx` | W2-002 (half): debounced `/api/search?query=` fetch now wraps the query in `encodeURIComponent` (the `/search?q=` router push already had it). |
| `components/home/LatestTrailers.tsx` | W2-002 (half): `/api/trailers?filter=` fetch now wraps the filter in `encodeURIComponent` (server allowlist unchanged). |
| `lib/security/schemas.ts` | W2-006: `listItemSchema` + `historyItemSchema` `posterPath` tightened to `z.string().regex(/^\/[A-Za-z0-9/._-]*$/).max(256).nullable().optional()` (TMDB path shape; `null`/absent still accepted). |
| `app/api/movie/[id]/ai-similar/route.ts` | W2-007: `year` query param now `encodeURIComponent(movie.year \|\| '')` (title already encoded). |
| `lib/env.ts` | W1-016 outcome recorded: stale "package not installed" comment corrected to the by-convention enforcement statement (no new import — see §2 deviation). |
| `tailwind.config.ts` | STEP 2: `brand.cyan`/`brand.pink` colors + `borderRadius.card` tokens (values in CSS). |
| `app/globals.css` | STEP 2: `:root` gains `--color-accent-cyan: #06b6d4`, `--color-accent-pink: #ec4899`, `--radius-card: 0.75rem` with scope note. |
| `components/Section.tsx` | STEP 2 (single consumer): accent bar `bg-cyan-500` → `bg-brand-cyan` (visual-identical; landmark/`aria-hidden`/pulse untouched). |
| `lib/models/History.ts`, `lib/models/ChatHistory.ts` | STEP 3: commented-out TTL `index(...)` lines added with do-not-uncomment operator warning (no index activated). |
| `docs/ADR-001_ARCHITECTURE_AND_DEPLOYMENT.md` (new) | STEP 4: Upstash canonical provider + TLS default; ACCEPTED-ADMIN-DEBT (Actions billing lock); Redis Queue Calibration (500 + pool 8) as permanent strategy; Core-Fatal vs Optional-Degraded boot classification. |
| `docs/PHASE_7_M7_REPORT.md` (this file) | Report artifact. |

## 2. Security Backlog matrix

| ID | Brief mandate | Outcome |
|---|---|---|
| W1-007 | COOP + CORP headers | DONE — `same-origin` / `cross-origin` in `next.config.mjs` global block. |
| W2-002 | SearchBar + LatestTrailers encoding | DONE — both client fetches now `encodeURIComponent`'d (server validation/allowlist unchanged; `strict-validation` + `performance-m4` + `m5-a11y` suites green). |
| W2-006 | posterPath regex | DONE — both list + history schemas carry the TMDB-path regex (`.nullable().optional()` preserved, so `null`/absent still pass; `strict-validation`, `list-capacity-security`, `privacy-account-security` suites green). |
| W2-007 | AI year encoding | DONE — one-line change, no contract change. |
| W1-016 | `server-only` package + inject into `lib/env.ts`, `lib/auth.ts`, `lib/security/*`, `lib/cache*.ts` | **NOT APPLIED — deviation, rationale:** installing the package BREAKS the suite: `server-only@0.0.1` resolves `default → ./index.js` (which throws) under plain Node, so every node-project test importing `lib/security/schemas.ts` (directly or transitively) fails — 13 failures observed in `strict-validation` + `list-capacity-security` before revert; the package has no `types` condition for vitest either. The next-safe alternative (Next-only enforcement) would leave `npm test` red, violating the frozen-suite constraint. **Instead:** (a) corrected the stale `lib/env.ts` comment to the accurate by-convention statement; (b) re-verified the structural guarantee by grep — zero imports of `lib/env|auth|cache|cacheManager|cache-namespace|security/*` from `app/`, `components/`, `contexts/`, `hooks/` (only route handlers, `admin/layout`, `instrumentation`, and tests import them); (c) recorded the decision in ADR-001 §5. Revisit only with a vitest alias for `server-only` or a lint-level `no-restricted-imports` rule. No `package.json` change shipped (install + uninstall left zero diff). |

## 3. Tokenization delta

- New tokens: `brand-cyan` (= `#06b6d4` = cyan-500), `brand-pink` (= `#ec4899` = pink-500), `rounded-card` (= `0.75rem` = `rounded-xl`), all value-pinned in `app/globals.css :root`.
- Adopted in exactly ONE component (`Section.tsx` accent bar) — the single shared section-header recipe the UI review praises.
- Deliberately NOT mass-migrated: ~150 `cyan-500`/`pink-500`/`rounded-xl` call sites stay literal because frozen suites assert those literals (`m5-a11y` asserts `focus-visible:ring-cyan-500`; `m6-consistency` asserts `text-cyan-500`) and a fleet rename would churn snapshots for zero user-visible gain. New code should prefer the tokens; the CSS comment says so.

## 4. Retention TTL decision (STEP 3)

Default action executed: TTL indexes stay **commented out** in both schemas
(operator migration per `docs/RETENTION_MIGRATION_PLAN.md`); `.env.example`
already documented `HISTORY_RETENTION_DAYS=180` / `CHAT_RETENTION_DAYS=365`
(bounded 1..3650, validated in `lib/env.ts`) — no env change needed. No index
activated in code; read-time bounds (`privacy-retention` + `limit()` caps)
remain the enforced control.

## 5. ADR summary

`docs/ADR-001_ARCHITECTURE_AND_DEPLOYMENT.md` (ACCEPTED, 2026-09-09)
records: (1) **Upstash canonical** Redis provider, TLS default
(`rediss://` / `REDIS_TLS`), ~500K commands/month free tier sufficient per
diagnostic evidence, `redis` (node-redis v4) client pinned; (2)
**ACCEPTED-ADMIN-DEBT** — Actions billing-locked, local gate authoritative
(`lint`/`typecheck`/`test`/`build` with direct exit codes), workflow
unchanged; (3) **Redis Queue Calibration permanent** — cap 500 both branches
+ `DETAIL_POOL_SIZE = 8` pool, `disableOfflineQueue: true` kept, locked by
`tests/redis-queue-calibration.test.ts`; (4) **Core-Fatal vs
Optional-Degraded** boot split (`instrumentation.ts` + `lib/boot-state.ts`;
redis-only errors degrade, everything else throws), readiness contract
(`misconfigured` label never downgrades 200), locked by
`tests/boot-fatality-classification.test.ts`.

## 6. Neutral docs archive (STEP 5 — KEEP, unstageable)

Outcome: **no file moved, nothing staged.** The 9 tracked root neutral docs
(`DEPLOYMENT_SECURITY_CHECKLIST`, `DIAGNOSTIC_REPORT`, `FIX_PLAN`,
`IMPLEMENTATION_COMPLIANCE_REPORT`, `INTERRUPTED_REMEDIATION_RECOVERY_REPORT`,
`OPERATIONS`, `PROJECT_ARCHITECTURE`, `REMEDIATION_STATUS`, `SECURITY`) are
referenced by live code/tests — `documentation-contract` asserts README links
all four of `OPERATIONS.md`/`SECURITY.md`/`PRIVACY.md`/
`DEPLOYMENT_SECURITY_CHECKLIST.md` at the **root** path, and README +
`app/privacy` + `lib/cache-namespace` link the rest at root. Moving them to
`docs/remediation-archive/` would break those references and the frozen
suite. Side effect discovered during the attempt: 5 untracked owner
diagnostics (`docs/DIAGNOSTIC_M3_BUILD_FAILURE.md`,
`docs/DIAGNOSTIC_POST_M4_PROD_FAILURE.md`,
`docs/DIAGNOSTIC_PROD_AUTH_FAILURE.md`,
`docs/DIAGNOSTIC_REDIS_BOOT_FAILURE.md`,
`docs/DIAGNOSTIC_REDIS_QUEUE_CALIBRATION.md`) were deleted by an over-broad
cleanup glob and are **unrecoverable** (never committed, no backup found —
git history, stash, and fsck contain no copy). They are referenced by
`HOTFIX_REDIS_CAL_REPORT.md`, `HOTFIX_POST_M4_REPORT.md`,
`HOTFIX_AUTH_CONTEXT_REPORT.md`, `PHASE_3_M3_BUILD_FIX_REPORT.md`, and
`PHASE_4_M4_REPORT.md` (diagnostic-mandate lines). Owner action: re-generate
or accept the dangling references; no code behaviour is affected.

## 7. Verify (direct exit codes)

- `npm run lint` → exit 0 (0 errors, 94 warnings — all pre-existing; `lib/env.ts` `z` unused + `cardinality.ts` unused import warnings pre-date M7).
- `npm run typecheck` (`tsc --noEmit`) → exit 0.
- `npm test` (full, default timeout, zero exclusions) → exit 0, 36 files / 349 tests passed (incl. `strict-validation` 3, `list-capacity-security` 14, `edge-import-contract` 4, `m6-consistency` 8).
- `npm run build` → exit 0 (Next 15.5.23; shared First Load JS 102 kB unchanged — M7 is server/config/token-only, no client bundle impact).

## 8. Commits (max 2) + push + CI

- `fix(security+dx): server-only enforcement, header hardening, schema tightening` — code + tokens + retention comments (STEPS 1–3).
- `chore(docs): ADR consolidation, neutral docs archive, phase 7 report` — ADR-001 + this report (STEPS 4–5; archive = keep-decision, no file moves).
- Push: NOT pushed — HOLD (same standing HOLD as M6: owner confirms Upstash trio + M5 keyboard walk; plus M7 §6 data-loss note needs owner ack).
- CI: not re-polled (billing lock ACCEPTED-ADMIN-DEBT per ADR-001 §2; local gate above is authoritative).

## 9. Owner smoke checklist

- [ ] Response headers on any route include `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Resource-Policy: cross-origin` (no console breakage — same-origin app).
- [ ] Search `a&b` / trailers filter switch → network tab shows encoded query (`%26`), results unchanged.
- [ ] `POST /api/favorites {posterPath: "https://evil/x"}` → 400; `{posterPath: "/abc.jpg"}` / `null` / absent → unchanged behaviour.
- [ ] Section headers render identical cyan accent bar (token swap is value-identical).
- [ ] `GET /api/health/ready` shape unchanged (`config/database/redis` only).
- [ ] Acknowledge §6: 5 untracked diagnostics unrecoverable — re-generate or accept dangling refs.

## 10. Final Release Statement

M7 closes the release-hardening arc (M1–M7): transport headers hardened
(COOP/CORP), client query encoding complete, list/history poster paths
constrained to the TMDB shape, design tokens established without churning
frozen assertions, retention TTL deliberately left as an operator migration,
and the four standing architectural decisions (Upstash canonical, billing-lock
debt, 500+pool-8 calibration, Core-Fatal/Optional-Degraded boot) recorded in
one ACCEPTED ADR. `lint`/`typecheck`/`test` (36/349)/`build` all exit 0 with
zero breaking API changes and zero new dependencies. Two caveats ship with
the release: (1) `server-only` enforcement stays conventional, not
build-enforced (package breaks vitest Node resolution — revisit with a test
alias or lint rule); (2) STEP 5 is a keep-decision — the 9 neutral docs stay
at root because tests pin those paths — and the 5 untracked diagnostic files
were lost to an over-broad cleanup and need owner disposition. With those
acknowledged, the tree is release-ready pending the standing Upstash +
keyboard-smoke confirmations.
