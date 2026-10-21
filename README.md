# ARIS_demo

ARIS — Africa Referee Intelligence System.

* `site/` — the app (Next.js). `npm run build:cloudflare` builds the static export served by the Worker (the GitHub Pages demo build is retired).
* `api/` — the serverless backend (Cloudflare Worker + D1 SQL + R2 media). See [`api/README.md`](api/README.md).
* `.github/workflows/` — CI and the Cloudflare deploy.

The files at the repository root (`index.html`, `_next/`, …) are the old published GitHub Pages demo build (frozen, mock data, no longer produced).
