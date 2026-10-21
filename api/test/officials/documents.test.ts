import { describe, expect, it } from "vitest";
import { addFederationSeat, addOfficial, addUser, api, login, png, sql, upload } from "../helpers";

describe("official documents", async () => {
  const sa = await addFederationSeat("ODA");
  const sb = await addFederationSeat("ODB");
  await addOfficial("od-1", "ODA");
  await addOfficial("od-2", "ODA");
  await addUser("od-ref1@aris.test", "referee", { officialId: "od-1" });
  await addUser("od-ref2@aris.test", "referee", { officialId: "od-2" });
  const ref1 = await login("od-ref1@aris.test");
  const ref2 = await login("od-ref2@aris.test");
  const fedA = await login(sa.email);
  const fedB = await login(sb.email);
  const up = (s: typeof ref1 | null, official: string, kind = "medical") => upload(s, "POST", `/officials/${official}/documents`, png(1), "doc.png", { kind });

  it("lets the official and their federation upload; nobody else", async () => {
    expect((await up(ref1, "od-1")).status).toBe(201);
    expect((await up(fedA, "od-1")).status).toBe(201);
    expect((await up(ref1, "od-2")).status).toBe(403); // another official of the same country
    expect((await up(fedB, "od-1")).status).toBe(404); // another country
    expect((await up(null, "od-1")).status).toBe(401);
    expect((await up(fedA, "nobody")).status).toBe(404);
    expect((await sql("SELECT COUNT(*) AS n FROM documents WHERE official_id = 'od-2'").first<{ n: number }>())!.n).toBe(0);
  });

  it("lists the documents on the official's file for the official and their federation only", async () => {
    const own = await api("GET", "/api/v1/officials/od-1", { session: ref1 });
    expect(own.json.documents.length).toBe(2);
    expect(own.json.documents[0]).toMatchObject({ kind: "medical", contentType: "image/png", status: "pending" });
    expect((await api("GET", "/api/v1/officials/od-1", { session: fedA })).json.documents.length).toBe(2);
    expect((await api("GET", "/api/v1/officials/od-1", { session: ref2 })).status).toBe(403);
    expect((await api("GET", "/api/v1/officials/od-1", { session: fedB })).status).toBe(404);
  });

  it("serves a document only to those who may read the file", async () => {
    const id = (await up(ref1, "od-1", "identity")).json.document.id as string;
    for (const s of [ref1, fedA]) expect((await api("GET", `/api/v1/documents/${id}`, { session: s })).status).toBe(200);
    for (const s of [ref2, fedB]) expect((await api("GET", `/api/v1/documents/${id}`, { session: s })).status).toBe(404);
    expect((await api("GET", `/api/v1/documents/${id}`)).status).toBe(401);
    expect((await api("GET", `/api/v1/documents/ghost`, { session: fedA })).status).toBe(404);
  });

  it("is verified or rejected by the federation of the country (and the official hears about it), never by the official", async () => {
    const id = (await up(ref1, "od-1", "licence")).json.document.id as string;
    expect((await api("PATCH", `/api/v1/documents/${id}/status`, { session: ref1, body: { status: "verified" } })).status).toBe(403);
    expect((await api("PATCH", `/api/v1/documents/${id}/status`, { session: fedB, body: { status: "verified" } })).status).toBe(404);
    expect((await api("PATCH", `/api/v1/documents/${id}/status`, { session: fedA, body: { status: "maybe" } })).status).toBe(422);
    expect((await sql("SELECT status FROM documents WHERE id = ?", id).first<{ status: string }>())!.status).toBe("pending");
    const ok = await api("PATCH", `/api/v1/documents/${id}/status`, { session: fedA, body: { status: "verified" } });
    expect(ok.status).toBe(200);
    expect((await sql("SELECT status FROM documents WHERE id = ?", id).first<{ status: string }>())!.status).toBe("verified");
    const notes = (await api("GET", "/api/v1/notifications", { session: ref1 })).json.notifications;
    expect(JSON.stringify(notes)).toContain("Document verified");
    // a reviewed document can no longer be withdrawn by the official, but can by the federation
    expect((await api("DELETE", `/api/v1/documents/${id}`, { session: ref1 })).status).toBe(403);
    expect((await api("DELETE", `/api/v1/documents/${id}`, { session: fedB })).status).toBe(404);
    expect((await api("DELETE", `/api/v1/documents/${id}`, { session: fedA })).status).toBe(200);
  });

  it("lets an official withdraw a pending document of their own only", async () => {
    const id = (await up(ref1, "od-1", "other")).json.document.id as string;
    expect((await api("DELETE", `/api/v1/documents/${id}`, { session: ref2 })).status).toBe(404);
    expect((await api("DELETE", `/api/v1/documents/${id}`, { session: ref1 })).status).toBe(200);
    expect((await api("DELETE", `/api/v1/documents/${id}`, { session: ref1 })).status).toBe(404);
  });
});
