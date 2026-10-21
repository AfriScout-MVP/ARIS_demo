// Where ARIS reads its data from: always the API, `/api/v1` on the same origin as the app
// (the Cloudflare Worker serves both). In development `ARIS_API_PROXY` forwards `/api` to a local Worker.

/** Empty = same origin, which is how the Worker serves the app and the API together. */
export const API_BASE = (process.env.NEXT_PUBLIC_API_BASE ?? "").replace(/\/$/, "");
