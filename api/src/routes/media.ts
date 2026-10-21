import { Hono } from "hono";
import type { AppEnv } from "../env";
import { ApiError, notFound } from "../lib/http";
import { ASSET_SQL, canReadAsset, serveAsset, type AssetRow } from "../lib/media";

/**
 * GET /media/:id — mounted BEFORE the sign-in gate, because public files (flags, crests, logos) need no session.
 * Private files (photos, documents, receipts) need a session with access to the owner; a file the caller may not
 * read answers 404, exactly like one that does not exist.
 */
export const media = new Hono<AppEnv>();

media.get("/:id", async (c) => {
  const asset = await c.env.DB.prepare(ASSET_SQL).bind(c.req.param("id")).first<AssetRow>();
  if (asset?.visibility !== "public") {
    const user = c.get("user");
    if (!user) throw new ApiError(401, "unauthenticated", "Sign in to continue");
    if (!asset || !(await canReadAsset(c.env.DB, user, asset))) throw notFound("File");
  }
  return serveAsset(c.env, c.req.raw, asset!);
});
