# ARIS API contract (v1)

Base: same origin, `/api/v1`. JSON in and out. The session is an `HttpOnly` cookie (`aris_session`); the browser
attaches it (`credentials: "include"`). Errors are always `{ "error": { "code", "message", "details?" } }`.
Unsafe methods (POST/PUT/PATCH/DELETE) must be same-origin.

## Roles — four

| Role | Label (UI) | Confined to |
| --- | --- | --- |
| `admin` | Super-admin | nothing: every country, every account, continental (`CAF`) competitions |
| `federation` | Fédération | **one country** (`user.country`, ISO alpha-3). Its officials, fixtures, matches, payments, cases, courses, fee scales, audit trail |
| `referee` | Arbitre | their own file (`/me/*`): designations, availability, payments, notifications, documents |
| `tagger` | Tagger | **one country**, like a federation seat (`federationId`/`country`), but reaches only `GET /matches`, `GET /matches/:id`, `GET /matches/event-types` and `POST`/`DELETE .../decisions` — nothing else a federation seat can touch |

A federation seat can never read or write another country's records: those answer **404** (not 403). A tagger follows the
same 404-not-403 rule for matches outside its country. A referee calling a staff endpoint gets **403**. "Staff" below
means `admin` + `federation`; tagging routes additionally accept `tagger` (see `GET/POST/DELETE /matches...` below).

## Localized text

Anything stored as copy is a `Localized` object: `{ fr: string; en: string; es?: string; de?: string }`.
Display with fallback `locale → fr → en`. (Frontend helper: `pickLocalized` in `lib/i18n/localized.ts`.)
Locales: `fr` (default) · `en` · `es` · `de`.

## Session user

```ts
interface SessionUser {
  id: string; email: string; name: string;
  role: "admin" | "federation" | "referee" | "tagger";
  officialId: string | null;      // referee accounts
  federationId: string | null;    // federation seats
  federationCode: string | null;  // "FSF"
  country: string | null;         // federation seats: "MAR"
  locale: "fr" | "en" | "es" | "de";
  mustChangePassword: boolean;    // a staff-set password: only /auth/* answers until it is changed
}
```
(The old `scope` field is gone.)

* `POST /auth/login {email,password}` → `{ token, user }` (+ cookie). 401 `invalid_credentials`, 429 `too_many_attempts`.
* `GET /auth/me` → `{ user }` · `POST /auth/logout` · `POST /auth/change-password {currentPassword,newPassword}` (signs out).
* `PATCH /auth/me {locale?, name?}` → `{ user }` — a user changing their own language / display name.

## Snapshot — `GET /snapshot` (admin, federation)

One request that loads everything the staff screens draw. **A federation seat receives only its own country's data**
(its country row, competitions, officials, fixtures, matches, assessments, licences …). Query: `from`, `to` (ISO dates, the
fixture window; default today −21 … +35).

```ts
{
  today: "YYYY-MM-DD",
  window: { from, to },
  countries: Country[],
  competitions: Competition[],
  referees: Referee[], assistants: Assistant[],
  fixtures: Fixture[],
  matches: MatchRecord[],
  assessments: Assessment[], licences: Licence[], fitnessTests: FitnessTest[], courses: Course[], dossiers: Dossier[],
  availability: Array<{ officialId, date, state }>,
  criteria: Array<{ key, label: Localized, weight }>,
  analytics: {
    arpsTrend: Array<{ month: "YYYY-MM", score: number }>,          // from performance_history, oldest first
    decisionsBreakdown: Array<{ id: "correct" | "correct-var" | "overturned", value: number }>, // percentages, computed from match_decisions
  },
}
```

Shapes are the ones in `site/src/lib/mock-data.ts` today (`Country`, `Competition`, `Referee`, `Fixture`, `MatchRecord`,
`Assessment` …) with these changes:

* `Country` adds `iso2`, `nameEs`, `nameDe`, `flagUrl: string | null` (`/api/v1/media/<id>`, public), `federation` (federation code),
  `federationName`, `timezone`, `currency`, `active: boolean`. `clubs: string[]` is the list of club teams of the country.
* `Referee` / `Assistant` add `photoUrl: string | null` (private media; the browser sends the cookie). `bio` is `Localized`.
* `Fixture`: `date` and `kickoff` are the **local** date / HH:MM at the venue (the database stores UTC `kickoffAt`, also returned);
  adds `kickoffAt`, `homeTeamId`, `awayTeamId`, `homeCode`/`awayCode` (nation codes on continental ties, else null),
  `designationStatus`, `status: "scheduled" | "played" | "postponed" | "cancelled"`. `played` stays as a boolean helper.
* `MatchRecord` adds `homeScore`, `awayScore`, `status`, `season`; `score` is still the display string `"2–1"`;
  `heatPoints: Array<{x,y,intensity}>` comes with each match (so `heatPointsFor()` goes away).
* All bilingual `{en, fr}` pairs become `Localized`.

## Management endpoints

All return `{ <thing>: … }` or `{ <things>: [...] }`. Writes are audited.

### Users — `/users` (staff)
* `GET /users?role=&q=&country=` — admin: everyone. Federation: referee accounts of its own country + the seats of its own federation (read only).
* `POST /users` — admin: any role (`federation` needs `federationId`, `referee` needs `officialId`). Federation: only `role: "referee"` with an `officialId` of its own country.
  Body `{ email, name, role, officialId?, federationId?, locale?, password }` (password ≥ 12 chars). 409 `email_taken`.
* `PATCH /users/:id {name?, locale?, active?, role?, officialId?, federationId?}` — admin: anything (role changes bump `token_version`). Federation: `active`, `name`, `locale` of its own referee accounts only.
* `POST /users/:id/reset-password {password}` — same scope as PATCH.
* `POST /users/:id/sign-out` — same scope as PATCH, and anyone for their own account. Ends every session of the account
  (bumps `token_version`); the password is unchanged. `{ ok: true, self }`. Audited `user.sign_out_everywhere`.
* The platform always keeps ≥ 1 active admin (409 `last_admin`).
User row: `{ id, email, name, role, officialId, officialName?, federationId, federationCode, country, locale, active, lastLoginAt, createdAt }`.

### Federations — `/federations`
* `GET /federations` — admin: all; federation: its own. Row: `{ id, code, name, country, countryName, status: "active"|"suspended", logoUrl, agreementReference, seats, createdAt }`.
* `POST /federations` (admin) `{ code, name, country, agreementReference? }` — `country` must be a supported country with no federation yet.
* `PATCH /federations/:id` (admin) `{ name?, code?, status?, agreementReference? }`. Suspending closes every seat of that federation immediately.
* `PUT /federations/:id/logo` (admin; multipart field `file`, PNG/JPEG/WebP ≤ 8 MB).

### Countries (the supported-countries list) — `/countries`
* `GET /countries?all=1` — signed-in users: active countries (public info). Admin with `all=1`: also inactive ones. Row = snapshot `Country`.
* `POST /countries` (admin) `{ code (alpha-3), iso2, name, nameFr, nameEs, nameDe, zone, capital, timezone, currency, flag? , federation?: { code, name } }` — adds a supported country (and optionally its federation).
* `PATCH /countries/:code` (admin) — any of the above, plus `active` (deactivating a country closes its federation seats).
* `PUT /countries/:code/flag` (admin; multipart `file`).

### Teams & stadiums — `/teams`, `/stadiums` (staff; federation: own country only)
* `GET /teams?country=&kind=` · `POST /teams {name, shortName?, kind, country, city?}` · `PATCH /teams/:id` · `PUT /teams/:id/logo`.
* `GET /stadiums?country=` · `POST /stadiums {name, city, country, capacity?}` · `PATCH /stadiums/:id`.
* `DELETE /teams/:id` — only a team with no fixtures or matches (else **409 `in_use`**, `details: { fixtures, matches }`);
  its crest goes with it. `DELETE /stadiums/:id` — only a stadium no fixture is played at (else 409 `in_use`); teams that
  had it as home ground lose the link: `{ ok: true, homeGroundCleared }`. Both audited (`team.delete`, `stadium.delete`).

### Media — `GET /media/:id`
Streams the object from R2. `public` assets (flags, crests, logos) need no session and are cacheable; `private` ones (photos,
documents) need a session with access to the owner. Always `X-Content-Type-Options: nosniff`, and a sandboxing CSP.

### Audit — `GET /audit?entity=&entityId=&limit=` (staff; federation sees only its own country's trail)

### Existing resources, now country-scoped
`/officials`, `/fixtures`, `/notifications`, `/payments`, `/fee-scales`, `/advances`, `/assessments`, `/evaluation-criteria`,
`/matches`, `/dossiers`, `/incidents`, `/cases`, `/licences`, `/fitness`, `/courses`, `/reports`, `/me` keep their paths and
bodies; the only differences are the scoping above, `Localized` copy, and `observer` no longer being a role (an official
designated `OBS` on a fixture files that match's report from their referee account).

## Changes in this release

### 2026-10-24 — gap closing (account recovery, e-mail delivery, notifications)

**Schema:** `migrations/0013_auth_recovery.sql` — new column `users.must_change_password` (0/1); new tables
`password_resets` (SHA-256 of the token only, `token_version` at issue, `expires_at`, `used_at`) and `auth_throttle`
(`forgot` / `reset` requests, its own counter so asking for links never locks sign-in); new column
`notification_reads.dismissed` (0/1). **`notification_outbox` is rebuilt:** status enum gains **`dead`** (old `failed` rows
become `dead`), new columns `user_id`, `subject`, `body`, `next_attempt_at`, `expires_at`; `notification_id` is now nullable
(a direct e-mail such as a reset link has no in-app notification).

**Breaking for a client:**
* `SessionUser` gains `mustChangePassword: boolean`. While it is `true`, **every route outside `/auth/*` answers
  403 `password_change_required`**; the client must show the change-password screen first. It is set on accounts created
  through `POST /users` or a partnership onboarding, and by `POST /users/:id/reset-password`; it is cleared by
  `POST /auth/change-password` and `POST /auth/reset`.
* User rows (`GET /users`, `GET /users/:id`, `POST /users`, `PATCH /users/:id`) gain `mustChangePassword: boolean`.

**New endpoints:**
* `POST /auth/forgot {email}` (signed out) → **always 202** `{ ok, message }` — same body whether the address has an
  account, a closed account or none. A usable account gets an e-mail (through the outbox) with
  `<PUBLIC_ORIGIN or request origin>/reset-password?token=…` (32 random bytes, base64url; valid 60 minutes, once; a newer link
  replaces an older one). 422 on a malformed address; 429 `too_many_attempts` (`Retry-After: 900`) after 3 requests per address
  or 20 per network address in 15 minutes.
* `POST /auth/reset {token, password}` (signed out) → `{ ok }`. Password policy as everywhere (12–200 chars, 422). Bumps
  `token_version` (every session ends), clears `mustChangePassword`, consumes the link, audits `auth.reset_password`, and
  sends the holder an in-app + e-mail notice. 400 `invalid_token` for an unknown, used, expired or superseded link (any
  password change, admin reset, deactivation or sign-out-everywhere kills outstanding links); 429 after 20 failures per
  network address in 15 minutes.
* `GET /users/:id` (staff) → `{ user }` in the list's row shape. Federation: its country's referees and its federation's
  seats; anything else 404. Referee 403.
* `DELETE /notifications/:id` (any signed-in user) → `{ ok }`. Removes it from the caller's own list (a shared role-wide
  notice stays for everyone else, and counts as read). 404 for anything the caller cannot see, or already removed.
* `GET /notifications/outbox?status=queued|sent|failed|dead&limit=1..200&cursor=<id>` (staff) →
  `{ messages: OutboxMessage[], counts: {queued,sent,failed,dead}, nextCursor: number | null }`, newest first.
  Admin: every message. Federation: messages for accounts of its own country only. Referee 403. A message's body is never
  returned. `OutboxMessage = { id, kind: "notification" | "direct", notificationId, channel, recipient, status, attempts,
  lastError, nextAttemptAt, expiresAt, createdAt, sentAt, subject (direct only), title (Localized, notification only),
  userId, userName, country }`.
* `POST /notifications/outbox/:id/retry` (admin) → `{ message }` — requeues a `failed` / `dead` message with a fresh retry
  budget and audits `outbox.retry`. 409 `already_sent`, `already_queued`, `expired` (a reset link whose text is gone);
  404 unknown; federation / referee 403.

**Changed behaviour:**
* `GET /notifications` takes `cursor` (opaque, from `nextCursor`) and answers `nextCursor: string | null` (additive);
  removed notifications are left out of the list.
* Delivery (`*/15` cron and right after a reset request): e-mail goes through **Resend** (`POST https://api.resend.com/emails`,
  `{from: MAIL_FROM, to: [recipient], subject, text}`) when the `RESEND_API_KEY` secret is set; otherwise everything goes to
  `MAIL_WEBHOOK_URL` as before (payload now also carries `subject` and `text`); with neither, messages stay queued.
  A failure is `failed` and retried after 5, 10, 20, 40, 80 minutes; the 6th failure makes it `dead`. `sent` and `dead` are
  never retried by the cron. Subject/text are in the recipient account's language; links use `PUBLIC_ORIGIN`.
* Staff notices (`audienceRole` admin / federation, or one admin / federation account) now also queue one e-mail per active,
  usable account they reach. Referee-wide notices are not mass-mailed; officials keep their e-mail / SMS channels.
* New vars in `wrangler.jsonc`: `PUBLIC_ORIGIN`, `MAIL_FROM` (empty by default); new optional secret `RESEND_API_KEY`.

### 2026-10-24 — gap closing (referee self-service & training)

**Schema:** `migrations/0014_self_service_training.sql` — new tables `fitness_test_history` (every physical test; backfilled
from `fitness_tests`, which stays the latest test per official), `assessment_comments`, `case_defences`; new columns
`courses.starts_on`, `ends_on`, `open_enrolment` (0/1), `closed_at`; `course_enrolments.state` (`enrolled` | `completed` |
`failed`, backfilled), `exam_score` (0–100), `enrolled_at`, `self_enrolled`.

**New endpoints**
* `GET /me/calendar.ics` (any official) — RFC 5545 `text/calendar`, CRLF, folded at 75 octets, escaped TEXT values. One
  `VEVENT` per pending/accepted designation of a non-cancelled fixture from 90 days ago on; `UID` = `<fixtureId>-<role>@aris`,
  `SEQUENCE` = designation version, `DTSTART`/`DTEND` (kickoff + 2 h) in UTC with `Z` (no `VTIMEZONE`), `STATUS` `CONFIRMED`
  (accepted, scheduled) else `TENTATIVE`. Staff without an official file 403; signed out 401.
* `GET /me/convocations/:fixtureId` — the caller's own convocation: only when designated **and accepted** (else 404) and the
  crew is published (else 409 `not_published`). `{convocation: {fixtureId, role, competition, season, round, home, away, date,
  kickoff (venue local), kickoffAt (UTC), timezone, venue, city, countryCode, publishedAt, issuer {name, code}, official {name,
  matricule, licenceNo}, crew [{role, name, me}]}}` — colleagues by name only, no contact details.
* `GET /me/earnings?by=season|year` — `{by, periods: [{period, currency, paid, pending (due + validated), contested, lines}]}`,
  cancelled lines excluded; `season` is the competition's season.
* `GET /me/payments/:id/slip` — own line only (else 404), paid only (409 `not_paid`): breakdown, `paymentRef`, `paidAt`,
  official, fixture (local `date`/`kickoff`), competition, season, `payer {name, code}`.
* `DELETE /me/advances/:id` — withdraws an own advance while `requested` (409 `bad_state` after a decision; another
  official's 404). The row is deleted; audited `advance.withdraw` with the request in `before`; the federation is notified.
* `GET|POST /assessments/:id/comments` — the assessed referee (once the report is filed and released; otherwise 404),
  staff of the match's country (foreign 404; continental: admin). Referee posts `{kind?: comment|contest, body 3–2000}`;
  staff post `{body}` and it is stored as `response` (`kind: contest|comment` from staff, or `response` from a referee: 422).
  `GET` → `{comments: [{id, kind, body, authorRole, authorName, createdAt}], contest: none|open|answered}`. A referee's post
  notifies the federation (admin for continental), a staff answer notifies the referee; every post is audited.
* `GET /assessment-comments?status=awaiting|all` (staff, scoped) — `{threads: [{assessmentId, matchId, refereeId, refereeName,
  countryCode, overall, lastKind, lastBody, lastAt, contested}]}`; `awaiting` = the referee spoke last.
* `GET /cases/:id/defence` (the official concerned; staff of the country, foreign 404) → `{defence: {statement, filedAt,
  updatedAt, filedBy} | null}`. `POST /cases/:id/defence` (referee, own case only — another's 404, staff 403)
  `{statement 10–5000}` while the case is `opened` or `hearing_scheduled` (else 409 `case_decided`); re-posting revises it
  (`200 {updated: true}`, first filing 201). Audited, federation notified.
* `GET /officials/:id/fitness?limit=&offset=` (the official, their federation, admin; other referee 403, foreign 404) →
  `{current, history: [{id, date, test1 {result, bestSprint}, test2 {result, laps}, retestDate, passed, recordedAt}], limit,
  offset, hasMore}`, newest first.
* `GET /courses/:id` — same visibility as the list (a referee: platform-wide or their federation's; otherwise 404).
* `PATCH /courses/:id` (staff; a federation only its own courses — platform-wide 403, another federation's 404)
  `{kind?, name?, provider?, hours?, startsOn?, endsOn?, openEnrolment?}`.
* `DELETE /courses/:id` (same owners) — deleted when nobody was ever enrolled (`{deleted: true}`), otherwise **closed**
  (`closed_at` set, `openEnrolment` off, `{deleted: false, closed: true}`); a closed course refuses enrolment (409 `course_closed`).
* `POST /courses/:id/unenrol` (staff) `{officialIds}` — removes enrolments still `enrolled`; `{removed, kept}` (finished ones stay).
* `PATCH /courses/:id/enrolments/:officialId` (staff) `{state?: enrolled|completed|failed, examScore?: 0–100|null}`.
* `POST /courses/:id/enrolment` / `DELETE /courses/:id/enrolment` (referee, self) — join a course with `openEnrolment`, not
  closed/completed and not ended (409 `enrolment_closed`); leave only a self-made enrolment still in progress (409
  `enrolled_by_federation` / `enrolment_finished`).
* `DELETE /licences/:id` (**admin only**; federation 403). VAR eligibility is re-synced.

**Changed behaviour**
* `PATCH /licences/:id` also accepts `kind` (audited `licence.change_kind`; VAR eligibility follows either kind).
* `PUT /fitness/:officialId` appends to the history and only moves the current row forward (an older date does not rewind it);
  the response gains `id`.
* `DELETE /officials/:id/availability/:date` — a referee may withdraw only their own day, today or later (409 `past_date`); an
  undeclared day is 404 (was a silent 200). Staff may still clear past days.
* `DELETE /officials/:id/conflicts/:conflictId` — now open to the official themself (was staff only); another referee 403.
* `GET /me/designations` accepts `state=pending|confirmed|declined`.
* `GET /me/history` accepts `limit` (1–100, default 100) and `offset`, and answers `{matches, limit, offset, hasMore}`.
* `POST /courses/:id/complete` sets the enrolment `state` to `completed`; `courses.state` is still maintained for older clients
  (`completed` once nobody is left `enrolled`, back to `enrolled` when someone is reopened or added).

**Additive response fields** — `GET /courses` rows: `startsOn`, `endsOn`, `openEnrolment`, `closedAt`, `closed`,
`enrolments [{officialId, officialName, countryCode, state, examScore, completedAt, enrolledAt, selfEnrolled}]` (scoped as
`officialIds`); for a referee also `myEnrolment` and `canSelfEnrol`. Courses are now ordered by `startsOn`, then id.

### 2026-10-24 — gap closing (honest data, print, scale, contact)

**Schema:** `migrations/0016_contact_sync.sql` — `partnerships.source` (`manual` | `website`), table `contact_throttle`,
`dossiers.sections` (JSON array), two indexes on `updated_at`.

* **New `PUT /matches/:id/officiating/:officialId`** (admin; federation of the match's country — foreign 404, referee 403).
  Records what the positioning screen draws: `heatPoints` `[{x 0–105, y 0–68, intensity 0–1}]` (≤ 1500), `physical`
  `{distanceKm, sprints, topSpeed, avgDistanceToBall, diagonalAdherence}` (all five, bounded), `pressureTimeline`
  `[{minute 0–130, pressure 0–100}]` (≤ 140, one per minute; sets `pressureAvg`), `weather` `{condition, temperatureC?,
  humidity?}` or `null`. Partial: only the keys sent change; unknown keys are 422. `:officialId` must be the match's
  referee (422 `not_the_referee`). Never touches `arpsForMatch` / `rmcs`. Audited `match.positioning` (counts, not the
  point clouds). Answers `{ match }` (no decisions).
* **Match DTO — additive:** `weather` (the recorded `weather_conditions`, or `null`) on `GET /matches/:id`, the snapshot and
  the new route.
* **New `GET /dossiers/:id`** (staff; foreign 404, referee 403): `{ dossier, match, decisions, referee, crew, reports
  (filed, with marks and notes), criteria, competition, country }` — everything the printable dossier shows.
  **`POST /dossiers`** accepts `sections` (subset of `summary, decisions, positioning, observer, crew, comparison`;
  default all), stored in print order; dossiers (list, snapshot, read) carry `sections`.
* **Snapshot — changed meaning, same field names:** a country's `syncHealth` / `lastSyncHours` are now **derived** from the
  latest change to its fixtures, crews, matches and reports (`domain/freshness.ts`, healthy ≤ `FRESH_WITHIN_HOURS` = 168 h).
  `syncHealth` is `healthy | stale | none` (**`manual` is no longer produced; `none` is new** = no data at all) and
  `lastSyncHours` is `null` when there is no data. Additive: `lastActivityAt`. The seeded `countries.sync_health` /
  `last_sync_hours` columns are no longer read by the snapshot.
* **Snapshot — additive:** `analytics.criterionAverages` `[{refereeId, reports, marks: {criterionKey: {avg, n}}}]` — the
  mean 0–10 mark per grid criterion over each referee's **filed** reports (country-scoped), for the profile radar.
* **Snapshot ranges:** an explicit `from` / `to` now also returns that range's matches (≤ 500) and their reports (≤ 800)
  on top of the 200 most recent matches. `from`/`to` must be real days, `from ≤ to`, at most 400 days apart (422
  `bad_range` / `range_too_long`); before, an impossible date was a 500.
* **`GET /public/summary` — additive `activity`:** `{ days: 7, federations: [{country, federation, designationsPublished,
  assessmentsFiled}] }` — counts only, live federations with any activity in the last 7 days. No names, ids or instants.
* **New `GET /public/countries`** (no session): every listed country's code and names plus `active` — the contact form's
  choices.
* **New `POST /public/contact`** (no session; same-origin): `{name, email, organisation, role?, country, message, locale?,
  website}`. Text is reduced to plain text (no HTML stored) and length-capped; `website` is a honeypot (filled → 202, nothing
  stored). 5 accepted per IP per hour and 300 per day platform-wide → 429 `too_many_requests` (the IP is kept only as a
  salted SHA-256). Creates a `prospect` partnership with `source: "website"` (or adds an `email` event to the country's open
  one) and an in-app notice to admins. Always `202 {ok: true}` so the form reveals nothing about the pipeline.
* **Partnerships:** new **`POST /partnerships/:id/reopen`** `{stage?: prospect|contacted|negotiating, reason}` for a
  `declined` (409 `partnership_exists` if the country has another open one) or `onboarded` partnership (a renegotiation:
  it keeps its federation, and `POST /:id/stage {stage: "onboarded"}` from `agreement_signed` closes it again without
  creating anything). New **`DELETE /partnerships/:id`** (removes the entry and its timeline; audited with what it was).
  Rows carry `source`. Admin-only, as the rest of `/partnerships`.

### 2026-10-24 — sessions, cross-border payments, admin actions

**Schema:** `migrations/0012_revoked_tokens.sql` (table `revoked_tokens`). Apply before deploying the Worker — every
signed-in request reads it.

* **Signing out is now enforced on the server.** Session tokens carry an id (`jti`). `POST /auth/logout` lists it in
  `revoked_tokens`, so a copy of that token (cookie or `Bearer`) is refused at once; the account's other sessions keep
  working. **Breaking:** a token without `jti` (every token issued before this release) is refused, so everyone signs in
  once more. The daily job prunes revocations once the token would have expired. Audited `auth.logout`.
* **A payment belongs to the country paying it — the one running the fixture.** Before, lines were generated on the
  host federation's scales and currency but listed and managed by the official's home federation, so a neutral official's
  line was invisible to the federation paying it. Now `/payments` (list, read, adjust, validate, pay, resolve, cancel),
  receipt access, `GET /reports/overview` (budget), `/reports/fees` and `/reports/reconciliation` scope by
  `fixtures.country_code`. Continental ties (`CAF`) are the administrators'. **Response shape:** a payment's `countryCode`
  is now the paying country (was the official's); the new **`officialCountryCode`** carries the official's own. A contested
  line notifies the paying federation, or the administrators for a continental tie.
* **New endpoints:** `POST /users/:id/sign-out`, `DELETE /teams/:id`, `DELETE /stadiums/:id` (see above).

Everything below is live in the Worker and covered by `api/test`. **Schema:** one new migration. **Response shapes:**
additive only, except `GET /api/health` (trimmed) and the change-password error codes, listed first.

### Breaking for a client

* **`GET /api/health`** now answers `{ ok, service: "aris-api", database: "ok" }`. `environment` and `accounts` are gone:
  the route is public and must not reveal how many accounts exist or which environment it is.
* **`POST /auth/change-password`**: a wrong current password is **403 `wrong_password`** (was 401 `invalid_credentials`,
  which made clients sign the person out). New: **422 `same_password`**, and **429 `too_many_attempts`** with
  `Retry-After: 900`. Failures count against the same per-email throttle as sign-in.

### New schema — `migrations/0011_partnerships.sql`

Tables `partnerships` and `partnership_events`. Apply with `npm run db:migrate:remote` before deploying the Worker.

### New endpoints

* **`/partnerships`** (admin only; federation seats get 403). The pipeline of federations ARIS is in contact with:
  `prospect → contacted → negotiating → agreement_signed → onboarded`, with `on_hold` (and back) and `declined`.
  * `GET /partnerships?stage=&q=` · `POST /partnerships` · `GET /partnerships/:id` · `PATCH /partnerships/:id`
  * `POST /partnerships/:id/stage {stage, reason?}` — illegal moves are 409 `bad_transition`.
  * `POST /partnerships/:id/events {kind: note|call|email|meeting, …}` — the contact log.
  * `POST /partnerships/:id/onboard` — the only way to `onboarded`. It activates the country and creates the federation and its first seat in one batch.
  * Codes: `partnership_exists`, `already_partner`, `agreement_required`, `not_signed`, `code_required`, `invalid_owner`, `partnership_closed`, `use_onboard`, `future_date`, `reason_required`.
* **`DELETE /matches/:id/decisions/:decisionId`** (staff). Removes a decision logged by mistake. Decisions are never
  edited; the audit row `decision.remove` keeps `{ id, minute, type }`. Another country's match is 404, a referee 403.

### Changed behaviour

* **`POST /officials/:id/conflicts`**: a `country` conflict must name a known country code. Otherwise it is
  **422 `unknown_country`**; previously free text such as `"Senegal"` was stored and never matched anything.
* **`POST /payments/generate`** answers
  `{ created, missingScale, currencyMismatch, defaultScaleUsed, reissued, heldByPrevious }`. It is **201** when lines
  were created, **200** otherwise.
* **Designation changes cancel unpaid payment lines.** Clearing or replacing a slot cancels the unpaid line of the
  official who left it, and the cancellation is audited as `payment.cancel`. Paid lines are never touched.
* **`PATCH /payments/:id`**: a deduction may bring a line to 0, never below: **422 `negative_total`** with `details.total`.
* **`var_qualified` is managed automatically** for officials who have a `VAR Certification` licence on file. A valid
  certificate sets it, and once every certificate has expired it is cleared (audited as `official.var_qualified` /
  `official.var_lapsed`). Officials with no certificate on file keep the flag staff set by hand.
* **Daily cron summary** gains `varLapsed` and `partnerships` (follow-ups now due).
* **Notifications** carry an `href` to the screen concerned. For example, discipline notices link to `/discipline`
  and `/discipline?tab=cases`.

### Additive response fields

* **`GET /officials/:id`, `GET /officials`** (`toOfficialFile`): assistants now carry `status`, `city`, `yearsActive`,
  `varQualified` and `bio` like referees do, so the register can edit both kinds. `GET /officials/:id` also returns
  `conflicts: [{ id, kind, subject, note, declaredAt }]`.

### Seed

* `scripts/seed/reference-tables.ts` gives every non-FCFA federation its own fee scale: the default barème re-expressed
  at an **illustrative** rate: 357 rows on top of the 28 default ones (385 in total). ARIS never converts currencies, so without a scale in its
  own currency a federation's fees could not be computed. These are demo figures for each federation to replace.

## `tagger` role and the event → sub-event → outcome tagging model (`migrations/0017_tagging.sql`)

* **New role: `tagger`.** Country-scoped like a federation seat (same `federationId`/`country`), but reaches only the
  endpoints below — not officials, payments, discipline, training, teams, competitions, federations, the outbox, the
  audit log or `/snapshot`. `POST /users` (admin only) and `PATCH /users/:id` accept `role: "tagger"` with a
  `federationId`; `422 federation_required` without one.
* **The referee-decision taxonomy** (`api/src/domain/eventTaxonomy.ts`) replaces the old flat 6-value `type` enum
  with `event_type → sub_event → outcome` (7 event types: `penalty_decision`, `card`, `offside_call`,
  `foul_advantage`, `var_review`, `misconduct_dissent`, `goal_validation`). It is backend-owned; the frontend fetches
  it rather than hardcoding it.
  * **New `GET /matches/event-types`** (any authenticated role) → `{ eventTypes: EventType[] }`.
  * **`POST /matches/:id/decisions`** body changes: `type` → `eventType` (required, one of the 7 keys), plus
    optional `subEvent`/`outcome`; an invalid combination (not in the taxonomy) is **422 `invalid_event_flow`**.
    Allowed for `staff` (admin/federation) **or** `tagger` of the match's own country (**404**, not 403, outside it).
  * **`GET /matches/:id`'s `decisions[]`** and the dossier's `decisions[]`: `type` → `eventType`, plus `subEvent`/
    `outcome` (`null` on decisions logged before this migration).
  * **`DELETE /matches/:id/decisions/:decisionId`**: now also allowed for a tagger of the match's country (same
    404-not-403 rule); the audit row keeps `{ id, minute, type, sub_event, outcome }`.
  * `match_decisions` gained a nullable `tagged_by` (the account that logged it).
