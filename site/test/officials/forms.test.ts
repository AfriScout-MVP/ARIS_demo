import { describe, expect, it } from "vitest";
import type { OfficialDocument, OfficialFile } from "@/lib/api/officials";
import {
  docExpiry,
  documentSummary,
  emptyOfficial,
  formatBytes,
  fromFile,
  parseZones,
  toCreateBody,
  toPatch,
  toSelfPatch,
  validateDocumentFile,
  validateOfficial,
} from "@/lib/officials/forms";

const file = (over: Partial<OfficialFile> = {}): OfficialFile => ({
  id: "o1", kind: "referee", name: "Aïssatou Ndiaye", initials: "AN", photoUrl: null, countryCode: "SEN", city: "Dakar",
  level: "National D1", status: "active", yearsActive: 6, varQualified: false, bio: { fr: "Bio", en: "Bio" }, region: null,
  league: "Ligue 1", nationality: "Sénégalaise", disciplines: ["football"], interventionZones: ["SEN"], hasPhoto: false,
  matricule: "ARIS-SEN-R0001", licenceNo: null, birthDate: "1990-04-02", email: "a@fsf.sn", phone: null, updatedAt: "2026-10-01T00:00:00Z",
  ...over,
});
const doc = (over: Partial<OfficialDocument> = {}): OfficialDocument => ({
  id: "d1", kind: "medical", filename: "x.pdf", contentType: "application/pdf", size: 10, status: "pending", expiresOn: null,
  createdAt: "2026-10-01T00:00:00Z", mediaId: "m1", url: "/api/v1/media/m1", ...over,
});
const TODAY = "2026-10-23";

describe("parseZones", () => {
  it("splits, trims, upper-cases country codes and drops duplicates", () => {
    expect(parseZones("sen, Dakar ,, GMB; sen\nThiès")).toEqual(["SEN", "Dakar", "GMB", "Thiès"]);
    expect(parseZones("  ")).toEqual([]);
  });
});

describe("validateOfficial", () => {
  const ok = { ...emptyOfficial("SEN"), name: "Moussa Diop" };
  const opts = { creating: true, needsCountry: true, today: TODAY };
  it("accepts a minimal new official", () => {
    expect(validateOfficial(ok, opts)).toEqual({});
  });
  it("applies the Worker's rules", () => {
    const e = validateOfficial(
      { ...ok, name: "M", countryCode: "", matricule: "AB", licenceNo: "x".repeat(41), email: "nope", yearsActive: "61", disciplines: [], zones: "x".repeat(21) },
      opts,
    );
    expect(Object.keys(e).sort()).toEqual(["countryCode", "disciplines", "email", "licenceNo", "matricule", "name", "yearsActive", "zones"]);
  });
  it("only asks for a country when the caller must choose one, and only when creating", () => {
    expect(validateOfficial({ ...ok, countryCode: "" }, { ...opts, needsCountry: false }).countryCode).toBeUndefined();
    expect(validateOfficial({ ...ok, countryCode: "" }, { ...opts, creating: false }).countryCode).toBeUndefined();
  });
  it("keeps the birth date plausible: not in the future, at least 16", () => {
    expect(validateOfficial({ ...ok, birthDate: "2011-01-01" }, opts).birthDate).toBe("officials.errors.birthDate");
    expect(validateOfficial({ ...ok, birthDate: "2010-10-23" }, opts).birthDate).toBeUndefined();
    expect(validateOfficial({ ...ok, birthDate: "1920-01-01" }, opts).birthDate).toBeDefined();
  });
});

describe("toCreateBody", () => {
  const v = { ...emptyOfficial("SEN"), name: "  Moussa Diop ", matricule: "CUSTOM-1", zones: "sen, gmb", bioEs: "Hola" };
  it("sends the country and matricule only for an administrator", () => {
    expect(toCreateBody(v, { admin: true })).toMatchObject({ countryCode: "SEN", matricule: "CUSTOM-1", name: "Moussa Diop", interventionZones: ["SEN", "GMB"], bio: { fr: "", en: "", es: "Hola" } });
    const fed = toCreateBody(v, { admin: false });
    expect(fed).not.toHaveProperty("countryCode");
    expect(fed).not.toHaveProperty("matricule");
  });
  it("leaves empty text out rather than sending empty strings", () => {
    const body = toCreateBody(v, { admin: false });
    expect(body.email).toBeUndefined();
    expect(body.birthDate).toBeUndefined();
    expect(body.yearsActive).toBe(0);
  });
});

describe("toPatch", () => {
  it("is empty when nothing changed", () => {
    expect(toPatch(fromFile(file()), file())).toEqual({});
  });
  it("sends only what changed, clearing emptied fields with null", () => {
    const before = file();
    const v = { ...fromFile(before), level: "FIFA Listed" as const, email: "", phone: "+221", zones: "SEN, GMB", yearsActive: "7", bioDe: "Hallo" };
    expect(toPatch(v, before)).toEqual({ level: "FIFA Listed", email: null, phone: "+221", interventionZones: ["SEN", "GMB"], yearsActive: 7, bio: { fr: "Bio", en: "Bio", de: "Hallo" } });
  });
  it("never sends the status of a suspended official", () => {
    const before = file({ status: "suspended" });
    expect(toPatch({ ...fromFile(before), status: "active" }, before)).toEqual({});
  });
});

describe("toSelfPatch", () => {
  it("covers only the fields an official may change", () => {
    const before = file();
    const p = toSelfPatch({ email: "new@fsf.sn", phone: "", city: "Dakar", region: "Thiès", zones: "SEN" }, before);
    expect(p).toEqual({ email: "new@fsf.sn", region: "Thiès" });
  });
});

describe("documents", () => {
  it("checks the file before it leaves the browser", () => {
    expect(validateDocumentFile({ type: "application/pdf", size: 100 }, "medical")).toBeNull();
    expect(validateDocumentFile({ type: "application/pdf", size: 100 }, "photo")).toBe("type");
    expect(validateDocumentFile({ type: "text/plain", size: 100 }, "other")).toBe("type");
    expect(validateDocumentFile({ type: "image/png", size: 0 }, "photo")).toBe("empty");
    expect(validateDocumentFile({ type: "image/png", size: 9 * 1024 * 1024 }, "photo")).toBe("size");
  });
  it("tells expired, expiring and valid apart", () => {
    expect(docExpiry(doc(), TODAY)).toBe("none");
    expect(docExpiry(doc({ expiresOn: "2026-10-22" }), TODAY)).toBe("expired");
    expect(docExpiry(doc({ expiresOn: TODAY }), TODAY)).toBe("expiring");
    expect(docExpiry(doc({ expiresOn: "2026-11-22" }), TODAY)).toBe("expiring");
    expect(docExpiry(doc({ expiresOn: "2026-11-23" }), TODAY)).toBe("valid");
  });
  it("summarises what the federation still has to do, ignoring rejected documents", () => {
    const docs = [doc(), doc({ id: "d2", status: "verified", expiresOn: "2026-01-01" }), doc({ id: "d3", status: "rejected", expiresOn: "2026-01-01" }), doc({ id: "d4", status: "verified", expiresOn: "2026-11-01" })];
    expect(documentSummary(docs, TODAY)).toEqual({ pending: 1, expired: 1, expiring: 1 });
  });
  it("formats sizes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(3 * 1024 * 1024)).toBe("3.0 MB");
  });
});
