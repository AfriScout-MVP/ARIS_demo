import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppEnv, Env } from "./env";
import { ApiError } from "./lib/http";
import { authenticate, currentUser } from "./middleware/auth";
import { sameOriginOnly, securityHeaders } from "./middleware/security";
import { auth } from "./routes/auth";
import { users } from "./routes/users";
import { officials } from "./routes/officials";
import { documents } from "./routes/documents";
import { fixtures } from "./routes/fixtures";
import { notifications } from "./routes/notifications";
import { audit } from "./routes/audit";
import { payments, feeScales, advances } from "./routes/payments";
import { assessments, criteria, dossiers, matches } from "./routes/assessments";
import { cases, incidents } from "./routes/discipline";
import { courses, fitness, licences } from "./routes/training";
import { reports } from "./routes/reports";
import { snapshot } from "./routes/snapshot";
import { me } from "./routes/me";
import { requireRole } from "./middleware/auth";
import { runDaily, runFrequent, runScheduled } from "./cron";

const app = new Hono<AppEnv>();

app.use("*", securityHeaders);
app.use("*", sameOriginOnly);
app.use("*", authenticate);

// Liveness for uptime monitors and the deploy smoke test. Public, reveals nothing sensitive.
app.get("/api/health", async (c) => {
  const row = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM users").first<{ n: number }>();
  return c.json({ ok: true, service: "aris-api", environment: c.env.ENVIRONMENT, database: "ok", accounts: row?.n ?? 0 });
});

const v1 = new Hono<AppEnv>();
v1.route("/auth", auth);

// Everything below needs a signed-in user.
v1.use("*", async (c, next) => {
  currentUser(c);
  await next();
});
v1.route("/users", users);
v1.route("/officials", officials);
v1.route("/documents", documents);
v1.route("/fixtures", fixtures);
v1.route("/notifications", notifications);
v1.route("/audit", audit);
v1.route("/payments", payments);
v1.route("/fee-scales", feeScales);
v1.route("/advances", advances);
v1.route("/assessments", assessments);
v1.route("/evaluation-criteria", criteria);
v1.route("/matches", matches);
v1.route("/dossiers", dossiers);
v1.route("/incidents", incidents);
v1.route("/cases", cases);
v1.route("/licences", licences);
v1.route("/fitness", fitness);
v1.route("/courses", courses);
v1.route("/reports", reports);
v1.route("/snapshot", snapshot);
v1.route("/me", me);

// Run the scheduled jobs on demand (the same code the cron triggers run).
v1.post("/admin/run-jobs", requireRole("admin"), async (c) => {
  const daily = await runDaily(c.env);
  const frequent = await runFrequent(c.env);
  return c.json({ daily, frequent });
});

app.route("/api/v1", v1);

app.notFound((c) => c.json({ error: { code: "not_found", message: "No such endpoint" } }, 404));

app.onError((err, c) => {
  if (err instanceof ApiError) {
    return c.json({ error: { code: err.code, message: err.message, details: err.details } }, err.status);
  }
  if (err instanceof HTTPException) {
    return c.json({ error: { code: "http_error", message: err.message } }, err.status);
  }
  console.error("unhandled", err);
  return c.json({ error: { code: "internal_error", message: "Something went wrong" } }, 500);
});

export default {
  fetch: app.fetch,
  scheduled: (event: ScheduledController, env: Env, ctx: ExecutionContext) => {
    ctx.waitUntil(runScheduled(event.cron, env));
  },
} satisfies ExportedHandler<Env>;

export { app };
