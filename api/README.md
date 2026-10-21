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
only `paid` after presence, match validation and expense checks) · assessments (weighted grid, confidential until
published) · discipline (incidents, cases, suspensions that block designation) · training (licences, fitness tests,
courses) · reports (CSV, workload, absences, reconciliation) · notifications · append-only audit log.

Business rules are enforced **in the database** as well as in code (CHECK constraints, unique indexes, append-only
triggers), so a bug in a route cannot write an illegal state.

The designation engine is shared: `site/src/lib/core/` is bundled into the Worker and used by the browser, so the screen
and the server can never disagree about who is eligible (`scripts/parity-check.ts` proves it on 740 slots).

## Roles — exactly three

| Role | Sees / does |
| --- | --- |
| `admin` | Super-admin: every country, accounts, federations, the supported-countries list, continental (`CAF`) competitions, scheduled jobs |
| `federation` | One national federation = one supported country. Its officials, fixtures, matches, payments, cases, courses, fee scales and audit trail — never another country's (those answer 404) |
| `referee` | Only their own space: designations, availability, payments, documents, notifications. An official designated `OBS` on a fixture files that match's assessment from this account |

A country is *supported* when `countries.active = 1` (20 today, seeded); each has at most one federation, and federation
seats are users tied to it. Suspending a federation or deactivating a country closes its seats at once.
The full HTTP contract is in [`docs/api-contract.md`](docs/api-contract.md), the rules for contributors in
[`docs/backend-rules.md`](docs/backend-rules.md).

## Data, images and translations

* `migrations/0001`–`0010` (identity, media, geography, officials, fixtures, matches, payments, evaluation, discipline &
  training, notifications & audit). `matches` mirrors the AfriScout-Backend table (plus `fixture_id` / `referee_id`).
* Images live in **R2** (`aris-media`) with one `media_assets` row each; the API streams them at `GET /api/v1/media/:id`
  (flags, crests and logos are public and cacheable; photos and documents need a session with access).
* User-facing stored copy is `Localized` JSON (`fr`, `en`, `es`, `de`); French is the default.
* `seed/demo-data.ts` is the **demo dataset** (20 countries, 144 officials, 153 fixtures, 99 teams, 57 stadiums). The seed
  generator (`scripts/seed/`) turns it into `.seed/seed.sql` and `.seed/media.json` (+ SVG files) for D1 and R2.

## Local development

```bash
cd api
npm ci
cp .dev.vars.example .dev.vars        # then put a long random JWT_SECRET in it
npm run db:reset:local                # wipes .wrangler/state, applies migrations
npm run db:seed                       # demo data into local D1, images into local R2 — never run against production
ARIS_PASSWORD='a long passphrase' npm run user:demo      # admin@aris.local, frmf@aris.local, fif@aris.local, gfa@aris.local, karim@aris.local, amina@aris.local
(cd ../site && npm ci && npm run build:cloudflare)
npm run dev                           # http://localhost:8787 — app and API together
```

Real accounts: `ARIS_PASSWORD=… npm run user:create -- --email x@y.org --name "X" --role admin|federation|referee [--federation CODE] [--official ID] --apply`.

The six demo logins share one password and well-known addresses, so putting them on a remote database takes a
deliberate second step — `--remote` on its own is refused:

```bash
ARIS_PASSWORD='…' ARIS_ALLOW_REMOTE_DEMO=1 npm run user:demo -- --remote    # demo deployments only
```

The D1 database and R2 bucket names are read from `wrangler.jsonc` by every script (`scripts/lib/resources.ts`),
so renaming either one is a single edit there.

Hot-reload the UI against the Worker: run `ARIS_API_PROXY=http://localhost:8787 npm run dev` in `site/` (Next proxies `/api`).

```bash
npm run typecheck && npm test         # tests live in test/<domain>/*.test.ts, on a real D1 + R2 (workerd)
```

## Deploying

CI/CD lives in `.github/workflows/`:

* `ci.yml` — on every pull request: Worker typecheck + tests, app typecheck + lint + tests + production build.
* `deploy.yml` — on every push to `main`: CI, create the D1 database and R2 bucket if missing
  (`scripts/cf-bootstrap.sh`), apply migrations (optionally the demo seed, manual runs only), `wrangler deploy`, set secrets, smoke-test `/api/health`.

Repository **secrets** to add (Settings → Secrets and variables → Actions):

| Secret | What |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | API token with *Workers Scripts: Edit*, *D1: Edit*, *Workers R2 Storage: Edit* |
| `CLOUDFLARE_ACCOUNT_ID` | Account id |
| `JWT_SECRET` | 48+ random bytes, e.g. `openssl rand -base64 48` — signs sessions. Rotating it signs everyone out |
| `MAIL_WEBHOOK_URL`, `MAIL_WEBHOOK_TOKEN` | *Optional.* Where queued e-mail / SMS / WhatsApp notifications are POSTed |
| `ARIS_DEMO_PASSWORD` | *Optional, demo deployments only.* Password for the six shared `@aris.local` logins. Used only by a **manual** run of `deploy.yml` with *Load the demo dataset* ticked. Leave it unset on a real deployment |

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
* Analytics are computed from `performance_history`, `match_decisions` and `match_officiating`; nothing is invented, so an empty database shows empty charts.
* The referee profile is one static page, `/referees/profile?id=…`, fed by the API — a new official needs no rebuild.
* The seed is **demo data**. Production starts empty (the 20 reference countries can be added from the admin console).
