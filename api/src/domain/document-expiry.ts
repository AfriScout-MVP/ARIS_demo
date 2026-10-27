// Daily job: documents of an official's file that carry an expiry date (medical certificate, identity paper,
// licence scan …). Mirrors the licence alerts in cron.ts: the official and their federation are told when a
// document enters its last 30 days, and again once it has expired — once per threshold, never twice.

import { CONTINENTAL } from "../lib/access";
import { notifyOfficialStmts, notifyStmts } from "../lib/notify";
import { addDays } from "./engine-ctx";

export const DOCUMENT_WARNING_DAYS = 30;

const KIND: Record<string, { en: string; fr: string }> = {
  licence: { en: "Licence", fr: "Licence" },
  identity: { en: "Identity document", fr: "Pièce d'identité" },
  medical: { en: "Medical certificate", fr: "Certificat médical" },
  certificate: { en: "Certificate", fr: "Certificat" },
  attestation: { en: "Attestation", fr: "Attestation" },
  receipt: { en: "Receipt", fr: "Justificatif" },
  photo: { en: "Photo", fr: "Photo" },
  other: { en: "Document", fr: "Document" },
};

/**
 * Raises the alerts due today (`t`, YYYY-MM-DD) and returns how many documents got one. Idempotent: the dedupe key
 * is (document, expiry date, threshold), and documents already alerted at their current threshold are not even read,
 * so a long list of old expired papers never crowds out the new ones.
 */
export async function documentExpiryAlerts(db: D1Database, t: string) {
  const { results } = await db
    .prepare(
      `SELECT d.id, d.kind, d.expires_on AS expiresOn, m.filename, o.id AS officialId, o.name, o.country_code AS countryCode,
              CASE WHEN d.expires_on < ?1 THEN 'expired' ELSE 'soon' END AS threshold
         FROM documents d JOIN officials o ON o.id = d.official_id JOIN media_assets m ON m.id = d.media_id
        WHERE d.expires_on IS NOT NULL AND d.expires_on <= ?2 AND d.status <> 'rejected' AND o.status <> 'retired'
          AND NOT EXISTS (SELECT 1 FROM notifications n
                           WHERE n.dedupe_key = 'document:' || d.id || ':' || d.expires_on || ':' || CASE WHEN d.expires_on < ?1 THEN 'expired' ELSE 'soon' END)
        ORDER BY d.expires_on LIMIT 300`,
    )
    .bind(t, addDays(t, DOCUMENT_WARNING_DAYS))
    .all<{ id: string; kind: string; expiresOn: string; filename: string; officialId: string; name: string; countryCode: string; threshold: "expired" | "soon" }>();

  for (const d of results) {
    const expired = d.threshold === "expired";
    const what = KIND[d.kind] ?? KIND.other;
    const key = `document:${d.id}:${d.expiresOn}:${d.threshold}`;
    const staff = {
      dedupeKey: key,
      title: { en: expired ? "Document expired" : "Document expiring", fr: expired ? "Document expiré" : "Document à renouveler" },
      detail: {
        en: `${d.name}: ${what.en} (${d.filename}) ${expired ? "expired" : "expires"} on ${d.expiresOn}.`,
        fr: `${d.name} : ${what.fr} (${d.filename}) ${expired ? "expiré" : "expire"} le ${d.expiresOn}.`,
      },
      tone: expired ? ("red" as const) : ("amber" as const),
      href: `/referees/profile?id=${encodeURIComponent(d.officialId)}`,
    };
    await db.batch([
      ...(await notifyOfficialStmts(db, d.officialId, {
        title: { en: expired ? "Document expired" : "Document expiring soon", fr: expired ? "Document expiré" : "Document bientôt expiré" },
        detail: {
          en: `${what.en} (${d.filename}) ${expired ? "expired" : "expires"} on ${d.expiresOn}. Please upload a new one.`,
          fr: `${what.fr} (${d.filename}) ${expired ? "expiré" : "expire"} le ${d.expiresOn}. Merci d'en déposer un nouveau.`,
        },
        tone: staff.tone,
        href: "/me",
        dedupeKey: `${key}:official`,
      })),
      // the official's federation (an official always has a country; CAF is never one, but stay safe)
      ...notifyStmts(db, d.countryCode === CONTINENTAL ? { ...staff, audienceRole: "admin" } : { ...staff, audienceRole: "federation", countryCode: d.countryCode }),
    ]);
  }
  return results.length;
}
