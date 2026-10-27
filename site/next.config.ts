import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

// ARIS ships as a static export served by the Cloudflare Worker at the site root, next to the
// API it reads from (`/api/v1`, same origin). In development the Worker runs beside Next
// (`wrangler dev`): set ARIS_API_PROXY to its URL and `/api` is proxied so cookies stay same-origin.
const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  // Pin the workspace root to this folder: a stray lockfile in a parent directory must not change what is bundled.
  turbopack: { root: fileURLToPath(new URL(".", import.meta.url)) },
  ...(process.env.ARIS_API_PROXY && process.env.NODE_ENV !== "production"
    ? {
        async rewrites() {
          return [{ source: "/api/:path*", destination: `${process.env.ARIS_API_PROXY}/api/:path*` }];
        },
      }
    : {}),
};

export default nextConfig;
