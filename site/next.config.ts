import type { NextConfig } from "next";

// Where this build is going:
//   gh-pages    → static demo under /ARIS_demo, on its own mock data
//   cloudflare  → static export served by the Worker at the site root, reading /api/v1
//   (default)   → `next dev` / `next start`
const target = process.env.DEPLOY_TARGET;

const nextConfig: NextConfig = {
  ...(target === "gh-pages" && {
    output: "export",
    basePath: "/ARIS_demo",
    images: { unoptimized: true },
  }),
  ...(target === "cloudflare" && {
    output: "export",
    images: { unoptimized: true },
  }),
  // In development the Worker runs beside Next (`wrangler dev`); proxy /api to it so cookies stay same-origin.
  ...(!target && process.env.ARIS_API_PROXY
    ? {
        async rewrites() {
          return [{ source: "/api/:path*", destination: `${process.env.ARIS_API_PROXY}/api/:path*` }];
        },
      }
    : {}),
};

export default nextConfig;
