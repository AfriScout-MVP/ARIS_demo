# ARIS — Africa Referee Intelligence System

Investor-facing product demo for **ARIS**, a platform by Prestige Solutions of Afrika
for referee performance intelligence, AI-powered match assignment, and career
management across African football (CAF, its zones, federations, and leagues).

No backend — everything is realistic mock data, built to preview the functional
scope from the ARIS Cahier des Charges v2.0 (July 2026).

## Stack
Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · Recharts · Framer Motion

## Run

```bash
npm install
npm run dev
```

## Structure

- `/` — overview of the refereeing corps
- `/calendar`, `/arae`, `/copilot` — appointments: fixtures and crews, assisted appointment, AI assistant
- `/decision-engine`, `/assessments`, `/heatmaps`, `/rankings`, `/compare` — performance
- `/referees`, `/development` — the referee corps; `/federations`, `/reports` — organisation
