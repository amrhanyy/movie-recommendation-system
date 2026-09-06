# Security Policy

## Reporting a vulnerability

If you believe you have found a security vulnerability in this project, do
NOT open a public issue.

1. Email the operator's security contact. **[OPERATOR: replace this
   placeholder with a real security contact before production.]**
2. Include a description, reproduction steps, and affected versions.
3. Allow reasonable time for triage before public disclosure.

If no security contact has been configured yet, treat this project as
pre-production and do not run it with real user data.

## Supported versions

Only the latest release on the `main` branch is supported. Older forks and
checkpoints from interrupted remediation batches are not supported.

## Scope notes

- Server-side controls (authentication, authorization, rate limiting, CSP,
  AI output validation, privacy deletion) are implemented and tested, but
  some controls require staging-browser verification (see
  `DEPLOYMENT_SECURITY_CHECKLIST.md`).
- Prompt injection against the AI assistant is a residual risk by design;
  model output is treated as untrusted.

## Secret-rotation expectations

Rotate a secret immediately if it may have been exposed:

| Secret | Rotation action |
|---|---|
| `NEXTAUTH_SECRET` | Generate a new value (`openssl rand -base64 32`); existing sessions sign out |
| `GOOGLE_CLIENT_SECRET` | Rotate in Google Cloud Console; update deployment |
| `GOOGLE_API_KEY` | Regenerate/restrict the key in Google Cloud; update deployment |
| `TMDB_API_KEY` | Regenerate in TMDB; update deployment |
| `MONGODB_URI` | Rotate the database user password; update the connection string |
| `REDIS_PASSWORD` | Rotate the Redis ACL password; update deployment |

Never commit real values to `.env.example`, workflows, docs, or tests. CI
uses obviously non-production `ci-placeholder` values only.

Secret scanning runs in CI (gitleaks with the default rule set; narrow
allowlist limited to `.env.example` and test fixtures). If a scan flags a
possible existing secret: record type and file only, do not print the value,
rotate the secret, and do not claim the project is safe until rotation is
confirmed. Git history is not rewritten automatically; if a secret was
committed historically, rotation is mandatory and history rewriting is an
operator decision.
