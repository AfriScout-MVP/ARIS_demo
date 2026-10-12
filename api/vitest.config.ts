import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.join(__dirname, "migrations"));
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.test.jsonc" },
        miniflare: { bindings: { TEST_MIGRATIONS: migrations, JWT_SECRET: "test-secret-test-secret-test-secret-0123" } },
      }),
    ],
    resolve: { alias: { "@core": path.join(__dirname, "../site/src/lib/core") } },
    test: { setupFiles: ["./test/setup.ts"], include: ["test/**/*.test.ts"] },
  };
});
