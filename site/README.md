# ARIS — Africa Referee Intelligence System

**ARIS** is a platform by Prestige Solutions of Afrika
for referee performance intelligence, AI-powered match assignment, and career
management across African football (CAF, its zones, federations, and leagues).

The app is live-only: every screen reads and writes through the Cloudflare Worker in
[`../api`](../api/README.md) — sign-in, the three roles, designations saved in D1, notifications and the
referee's personal space at `/me`. `npm run build:cloudflare` produces the static export (`out/`) the Worker serves.

Built to preview the functional scope from the ARIS Cahier des Charges v2.0 (July 2026).

## Stack
Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · Recharts · Framer Motion

## Run

```bash
npm install
ARIS_API_PROXY=http://localhost:8787 npm run dev   # against `wrangler dev` in ../api
```

## Structure

- `/` — overview of the refereeing corps
- `/calendar`, `/arae`, `/copilot` — appointments: fixtures and crews, assisted appointment, AI assistant
- `/decision-engine`, `/assessments`, `/heatmaps`, `/rankings`, `/compare` — performance
- `/referees`, `/development` — the referee corps; `/federations`, `/reports` — organisation
