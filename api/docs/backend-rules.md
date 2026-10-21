# Backend rules (read before touching `api/src`)

## The model in one paragraph
Three roles: `admin` (super-admin), `federation` (one national federation = one country, `user.country`), `referee`
(an official's own space). A country is "supported" when `countries.active = 1`; each has at most one `federations` row;
federation seats are `users` with `federation_id`. There is no `commission`, no `observer`, no `scope` any more.
The database is the source of truth for invariants (see `migrations/`): read the CHECKs before writing a route.

## Authorization — always through `src/lib/access.ts`
* `staff` (middleware) = admin or federation. `requireRole(...)` for the rest.
* A federation seat acts **only inside its own country**: `inCountry(user, countryCode)`, `assertCountry`, `countryFilter(user, "col")`,
  `scopeCountry(user, requested)`. Continental ties (`country_code = 'CAF'`) are admin-only.
* Officials: `officialAccess` / `assertReadOfficial` / `assertActFor` (async - they load the official's country).
  A referee reaches only their own file.
* **Foreign-country records answer 404 (not 403)** for a federation seat, so existence is not leaked. A referee calling a
  staff route gets 403.
* List endpoints must filter in SQL with `countryFilter`; never fetch everything and filter in JS.
* Anything a federation can create (fee scales, courses, teams, stadiums...) is tagged with its country/federation and only
  editable by it (or by an admin). Platform defaults (`federation_id IS NULL`) are admin-only to change.
* An official designated `OBS` on a fixture may file that match's assessment from their `referee` account (this replaces the
  old observer role); never for a match they refereed.

## Data conventions
* Countries are ISO alpha-3 codes. Seasons are `YYYY/YYYY`. Instants are UTC ISO strings; fixtures store `kickoff_at` (UTC)
  and expose a generated `date` (UTC date). **Show local time at the venue** with `lib/time.ts` (`localParts(kickoffAt, tz)`,
  `toUtcIso(date, time, tz)`), where `tz` is `countries.timezone` of the stadium's country (fixture country for domestic ties).
* Teams and stadiums are rows (`teams`, `stadiums`); a fixture/match holds ids, never names. National sides are
  `teams.kind = 'national'` whose `country` is the nation (continental ties). The app-facing `home`/`away` strings are joined in.
* `matches` mirrors AfriScout's table (league_id, season, matchday, home_team_id, away_team_id, match_date, venue, referee,
  home_score, away_score, status, ...). Read it only through `domain/matches.ts` (`MATCH_SQL`, `toMatch`).
* User-facing stored copy is `Localized` JSON (`{fr, en, es?, de?}`, `lib/localized.ts`). Write at least fr + en.
* Files: R2 object + one `media_assets` row each (`media_id` everywhere). Never store an R2 key anywhere else.

## Every write
1. validates with zod (`readJson` / `parseQuery`), 2. checks scope, 3. runs **one `db.batch([...])`** containing the change
AND its `auditStmt(...)` (with `countryCode`), 4. notifies through `notify.ts` where a person must know
(`countryCode` narrows a role-wide notice to one federation).
Errors are `ApiError` with a stable `code`. Never interpolate user input into SQL - bind parameters; chunk IN lists (`chunk`, `marks`).

## Tests (Vitest on a real D1 + R2 via workerd)
* `api/test/<domain>/<topic>.test.ts` - several small files per domain, never one giant file. Shared helpers: `test/helpers`
  (`api`, `login`, `addCountry`, `addFederation`, `addFederationSeat`, `addTeam`, `addStadium`, `addCompetition`, `addOfficial`,
  `addFixture`, `addUser`, `sql`). Add new helpers to `test/helpers/factories.ts` with a surgical edit.
* Every route you touch needs: the happy path, validation failure, 401 unauthenticated, 403 wrong role, and **cross-country
  isolation** (a federation seat of country A cannot see, change or learn about country B's record: expect 404 and no side effects).
* Run: `cd api && npx vitest run test/<your dir>`; types: `npx tsc --noEmit` (errors inside files another agent owns are expected
  until they finish; none may come from your files).

## Don'ts
* Don't edit `migrations/*.sql` unless the schema truly cannot express what is needed - then make a minimal surgical edit
  (nothing is deployed yet, migrations are not frozen) and say so in your report. Never add a second migration for a fix.
* Don't edit files owned by another agent; additive one-line edits to `src/index.ts` (mounting a router) are fine.
* No `git commit` / `git push`. No screenshots. Stay inside /home/siaziz/Desktop/ARIS_demo.
