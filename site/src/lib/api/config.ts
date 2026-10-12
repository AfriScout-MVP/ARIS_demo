// Where ARIS reads its data from. Decided at build time:
//   NEXT_PUBLIC_DATA_SOURCE=api  → the Cloudflare Worker (`/api/v1`, same origin)
//   anything else                → the in-memory demo data (GitHub Pages)

export const LIVE = process.env.NEXT_PUBLIC_DATA_SOURCE === "api";

/** Empty = same origin, which is how the Worker serves the app and the API together. */
export const API_BASE = (process.env.NEXT_PUBLIC_API_BASE ?? "").replace(/\/$/, "");
