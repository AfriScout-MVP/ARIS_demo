# ARIS API contract (v1)

Base: same origin, `/api/v1`. JSON in and out. The session is an `HttpOnly` cookie (`aris_session`); the browser
attaches it (`credentials: "include"`). Errors are always `{ "error": { "code", "message", "details?" } }`.
Unsafe methods (POST/PUT/PATCH/DELETE) must be same-origin.

## Roles — exactly three

| Role | Label (UI) | Confined to |
| --- | --- | --- |
| `admin` | Super-admin | nothing: every country, every account, continental (`CAF`) competitions |
| `federation` | Fédération | **one country** (`user.country`, ISO alpha-3). Its officials, fixtures, matches, payments, cases, courses, fee scales, audit trail |
| `referee` | Arbitre | their own file (`/me/*`): designations, availability, payments, notifications, documents |

A federation seat can never read or write another country's records: those answer **404** (not 403). A referee calling a
staff endpoint gets **403**. "Staff" below means `admin` + `federation`.

## Localized text

Anything stored as copy is a `Localized` object: `{ fr: string; en: string; es?: string; de?: string }`.
Display with fallback `locale → fr → en`. (Frontend helper: `pickLocalized` in `lib/i18n/localized.ts`.)
Locales: `fr` (default) · `en` · `es` · `de`.

## Session user

```ts
interface SessionUser {
  id: string; email: string; name: string;
  role: "admin" | "federation" | "referee";
  officialId: string | null;      // referee accounts
  federationId: string | null;    // federation seats
  federationCode: string | null;  // "FRMF"
  country: string | null;         // federation seats: "MAR"
  locale: "fr" | "en" | "es" | "de";
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

### Media — `GET /media/:id`
Streams the object from R2. `public` assets (flags, crests, logos) need no session and are cacheable; `private` ones (photos,
documents) need a session with access to the owner. Always `X-Content-Type-Options: nosniff`, and a sandboxing CSP.

### Audit — `GET /audit?entity=&entityId=&limit=` (staff; federation sees only its own country's trail)

### Existing resources, now country-scoped
`/officials`, `/fixtures`, `/notifications`, `/payments`, `/fee-scales`, `/advances`, `/assessments`, `/evaluation-criteria`,
`/matches`, `/dossiers`, `/incidents`, `/cases`, `/licences`, `/fitness`, `/courses`, `/reports`, `/me` keep their paths and
bodies; the only differences are the scoping above, `Localized` copy, and `observer` no longer being a role (an official
designated `OBS` on a fixture files that match's report from their referee account).
