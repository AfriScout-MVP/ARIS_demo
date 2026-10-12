# ARIS backend — serverless on Cloudflare

One **Cloudflare Worker** serves both the app (static files from `site/out`) and the API (`/api/*`).
Same origin, so there is no CORS and the session is a plain `HttpOnly` cookie.

| Need | Cloudflare product | Binding |
| --- | --- | --- |
| API, rules, jobs | Workers (Hono 4, Zod 4) | `src/index.ts` |
| SQL database | **D1** (SQLite) — schema in `migrations/` | `DB` |
| Media (photos, licences, medical certificates, receipts) | **R2** bucket `aris-media` | `MEDIA` |
| Notification delivery, licence alerts | Cron Triggers (`*/15 * * * *`, `0 5 * * *`) | `src/cron.ts` |

## What it implements (the expert's eight modules)

Officials & registry · availability · **designations** (draft → awaiting confirmation → validated → published, with
accept / decline and a written *motif* for every replacement) · fees & payments (scales, expenses, advances, a payment is
only `paid` after presence, match validation and expense checks) · observer assessments (weighted grid, confidential until
published) · discipline (incidents, cases, suspensions that block designation) · training (licences, fitness tests,
courses) · reports (CSV, workload, absences, reconciliation) · notifications · append-only audit log.

Business rules are enforced **in the database** as well as in code (CHECK constraints, unique indexes, append-only
triggers), so a bug in a route cannot write an illegal state.

The designation engine is shared: `site/src/lib/core/` is bundled into the Worker and used by the browser, so the screen
and the server can never disagree about who is eligible (`scripts/parity-check.ts` proves it on 740 slots).

## Roles

| Role | Sees / does |
| --- | --- |
| `admin` | Everything, accounts, scheduled jobs |
| `commission` | Designations, payments, discipline, reports — limited to its scope (`all`, `zone:UNAF`, `country:EGY`) for writes |
| `observer` | Read access to the snapshot; files reports on their own matches |
| `referee` | Only their own space: designations, availability, payments, notifications |

## Local development

```bash
cd api
npm ci
cp .dev.vars.example .dev.vars        # then put a long random JWT_SECRET in it
npm run db:migrate:local
npm run db:seed                       # demo data (referees, fixtures…) — never run this against production
ARIS_PASSWORD='a long passphrase' npm run user:create -- --email you@example.org --name "You" --role admin --apply
(cd ../site && npm ci && npm run build:cloudflare)
npm run dev                           # http://localhost:8787 — app and API together
```

Hot-reload the UI against the Worker: run `ARIS_API_PROXY=http://localhost:8787 npm run dev` in `site/` (Next proxies `/api`).

```bash
npm run typecheck && npm test         # 57 tests on a real D1 + R2 (workerd)
```

## Deploying

CI/CD lives in `.github/workflows/`:

* `ci.yml` — on every pull request: Worker typecheck + tests, app typecheck + lint + both production builds.
* `deploy.yml` — on every push to `main`: CI, create the D1 database and R2 bucket if missing
  (`scripts/cf-bootstrap.sh`), apply migrations, `wrangler deploy`, set secrets, smoke-test `/api/health`.

Repository **secrets** to add (Settings → Secrets and variables → Actions):

| Secret | What |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | API token with *Workers Scripts: Edit*, *D1: Edit*, *Workers R2 Storage: Edit* |
| `CLOUDFLARE_ACCOUNT_ID` | Account id |
| `JWT_SECRET` | 48+ random bytes, e.g. `openssl rand -base64 48` — signs sessions. Rotating it signs everyone out |
| `MAIL_WEBHOOK_URL`, `MAIL_WEBHOOK_TOKEN` | *Optional.* Where queued e-mail / SMS / WhatsApp notifications are POSTed |

Optional repository **variable** `ARIS_URL` — the public address when a custom domain is used.

R2 must be enabled on the Cloudflare account once (dashboard → R2) before the first deploy.

First administrator on a fresh production database (run from your machine; the password stays out of git and logs):

```bash
cd api
CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… ./scripts/cf-bootstrap.sh     # once, locally, to pick up the D1 id
ARIS_PASSWORD='a long passphrase' npm run user:create -- --email you@example.org --name "You" --role admin --apply --remote
```

(`cf-bootstrap.sh` writes the real D1 id into `wrangler.jsonc`; that edit is local — do not commit it.)

## Security notes

* Passwords: PBKDF2-SHA256, 100 000 iterations (the Workers maximum), per-user salt.
* Sessions: HS256 JWT in an `HttpOnly; SameSite=Lax` cookie (`Secure` over HTTPS); a `token_version` on the user revokes every
  session when a password, role, scope or active flag changes; the user is re-read from D1 on every request.
* Sign-in throttle (5 failures per e-mail / 30 per IP per 15 min); identical error for unknown account and wrong password.
* CSRF: unsafe methods must be same-origin (`Origin` / `Sec-Fetch-Site`).
* Uploads: type sniffed from magic bytes (PDF / PNG / JPEG / WebP, 8 MB), stored in R2 under server-generated keys.
* CSV exports neutralise spreadsheet formulas. Audit and designation history cannot be edited or deleted.

## Known limits

* E-mail / SMS / WhatsApp are queued in `notification_outbox`; nothing is delivered until `MAIL_WEBHOOK_URL` points at a sender.
* Analytics without a data feed yet (ARPS trend, decision breakdown, heat maps, VAR accuracy trend) keep their demo values.
* `referees/[id]` pages are pre-rendered at build time: an official registered after the last deploy has no profile page until
  the next build. (Their data is in the API; only the static route is missing.)
* The seed script is **demo data** (it loads the investor demo's referees and fixtures). Production starts empty.
