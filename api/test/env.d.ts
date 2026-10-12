// Gives `env` from "cloudflare:workers" the Worker's real binding types.
import type { Env as WorkerEnv } from "../src/env";

declare global {
  namespace Cloudflare {
    interface Env extends WorkerEnv {}
  }
}
export {};
