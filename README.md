# ARIS_demo

ARIS — Africa Referee Intelligence System.

* `site/` — the app (Next.js). `npm run build:pages` is the investor demo on GitHub Pages; `npm run build:cloudflare` is the live app.
* `api/` — the serverless backend (Cloudflare Worker + D1 SQL + R2 media). See [`api/README.md`](api/README.md).
* `.github/workflows/` — CI and the Cloudflare deploy.

The files at the repository root (`index.html`, `_next/`, …) are the published GitHub Pages demo build.
