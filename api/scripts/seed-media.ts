// Uploads the files described by .seed/media.json to the R2 bucket, under exactly the keys media_assets lists.
//
//   npm run db:seed:media            # local R2 (what `wrangler dev` serves)
//   npm run db:seed:media:remote     # Cloudflare R2

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { r2BucketName } from "./lib/resources";

const remote = process.argv.includes("--remote");
const list = path.resolve(".seed/media.json");
if (!existsSync(list)) throw new Error("Run `npm run db:seed:generate` first: .seed/media.json is missing");

// The bucket comes from wrangler.jsonc, so this always writes where the Worker reads.
const bucket = r2BucketName();
console.error(`Uploading to R2 bucket ${bucket} (${remote ? "remote" : "local"}) …`);

const res = spawnSync(
  "npx",
  ["wrangler", "r2", "bulk", "put", bucket, "--filename", list, "--content-type", "image/svg+xml", "--cache-control", "public, max-age=86400", remote ? "--remote" : "--local", "--force"],
  { stdio: "inherit" },
);
process.exit(res.status ?? 1);
