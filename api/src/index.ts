import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppEnv, Env } from "./env";
import { ApiError } from "./lib/http";
import { authenticate, currentUser } from "./middleware/auth";
import { sameOriginOnly, securityHeaders } from "./middleware/security";
import { auth } from "./routes/auth";
import { users } from "./routes/users";
import { federations } from "./routes/federations";
import { countries } from "./routes/countries";
import { teams, stadiums } from "./routes/teams";
import { media } from "./routes/media";
import { officials } from "./routes/officials";
import { officialRemoval } from "./routes/official-removal";
import { documents } from "./routes/documents";
import { fixtures } from "./routes/fixtures";
import { competitions } from "./routes/competitions";
import { notifications } from "./routes/notifications";
import { audit } from "./routes/audit";
import { payments, feeScales, advances } from "./routes/payments";
import { assessments, criteria, dossiers, matches } from "./routes/assessments";
import { cases, incidents } from "./routes/discipline";
import { courses, fitness, licences, officialTraining } from "./routes/training";
import { assessmentComments, assessmentInbox, caseDefence, meSelf } from "./routes/self-service";
import { reports } from "./routes/reports";
import { snapshot } from "./routes/snapshot";
import { me } from "./routes/me";
import { partnerships } from "./routes/partnerships";
import { publicApi } from "./routes/public";
import { officiating } from "./routes/officiating";
import { requireRole } from "./middleware/auth";
import { runDaily, runFrequent, runScheduled } from "./cron";

const app = new Hono<AppEnv>();

app.use("*", securityHeaders);
app.use("*", sameOriginOnly);
app.use("*", authenticate);

// Liveness for uptime monitors and the deploy smoke test. Public, so it says only whether the service and its
// database answer — never how many accounts exist or which environment this is.
app.get("/api/health", async (c) => {
  await c.env.DB.prepare("SELECT 1").first();
  return c.json({ ok: true, service: "aris-api", database: "ok" });
});

const v1 = new Hono<AppEnv>();
v1.route("/auth", auth);
// Public files (flags, crests, logos) need no session; private ones check it themselves.
v1.route("/media", media);
// What the signed-out landing page shows: countries and headline counts, nothing personal.
v1.route("/public", publicApi);

// Everything below needs a signed-in user — one whose password is their own (a staff-set password must be changed
// first, through /auth/change-password, which stays reachable above).
v1.use("*", async (c, next) => {
  if (currentUser(c).mustChangePassword) throw new ApiError(403, "password_change_required", "Change your password to continue");
  await next();
});
v1.route("/users", users);
v1.route("/federations", federations);
v1.route("/countries", countries);
v1.route("/teams", teams);
v1.route("/stadiums", stadiums);
v1.route("/officials", officials);
v1.route("/officials", officialRemoval);

v1.route("/officials", officialTraining);
v1.route("/documents", documents);
v1.route("/fixtures", fixtures);
v1.route("/competitions", competitions);
v1.route("/notifications", notifications);
v1.route("/audit", audit);
v1.route("/payments", payments);
v1.route("/fee-scales", feeScales);
v1.route("/advances", advances);
v1.route("/assessments", assessments);
v1.route("/assessments", assessmentComments);
v1.route("/assessment-comments", assessmentInbox);
v1.route("/evaluation-criteria", criteria);
v1.route("/matches", matches);
v1.route("/matches", officiating);
v1.route("/dossiers", dossiers);
v1.route("/incidents", incidents);
v1.route("/cases", cases);
v1.route("/cases", caseDefence);
v1.route("/licences", licences);
v1.route("/fitness", fitness);
v1.route("/courses", courses);
v1.route("/reports", reports);
v1.route("/snapshot", snapshot);
v1.route("/me", me);
v1.route("/me", meSelf);
v1.route("/partnerships", partnerships);

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
