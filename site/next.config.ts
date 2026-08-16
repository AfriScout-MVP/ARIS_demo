import type { NextConfig } from "next";

const isGhPages = process.env.DEPLOY_TARGET === "gh-pages";

const nextConfig: NextConfig = {
  ...(isGhPages && {
    output: "export",
    basePath: "/ARIS_demo",
    images: { unoptimized: true },
  }),
};

export default nextConfig;
