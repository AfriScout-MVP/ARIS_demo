# ARIS — Africa Referee Intelligence System

Investor-facing product demo for **ARIS**, a platform by Prestige Solutions of Afrika
for referee performance intelligence, AI-powered match assignment, and career
management across African football (CAF, its zones, federations, and leagues).

Two ways to run it:

* **Demo** (GitHub Pages) — no backend, realistic mock data, `npm run build:pages`.
* **Live** (Cloudflare) — the same screens read and write through the Worker in [`../api`](../api/README.md):
  sign-in, roles, designations saved in D1, notifications, the referee's personal space at `/me`.
  `npm run build:cloudflare` (sets `NEXT_PUBLIC_DATA_SOURCE=api`).

Built to preview the functional scope from the ARIS Cahier des Charges v2.0 (July 2026).

## Stack
Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · Recharts · Framer Motion

## Run

```bash
npm install
npm run dev                                    # demo data
ARIS_API_PROXY=http://localhost:8787 NEXT_PUBLIC_DATA_SOURCE=api npm run dev   # against `wrangler dev`
```

## Structure

- `/` — overview of the refereeing corps
- `/calendar`, `/arae`, `/copilot` — appointments: fixtures and crews, assisted appointment, AI assistant
- `/decision-engine`, `/assessments`, `/heatmaps`, `/rankings`, `/compare` — performance
- `/referees`, `/development` — the referee corps; `/federations`, `/reports` — organisation
