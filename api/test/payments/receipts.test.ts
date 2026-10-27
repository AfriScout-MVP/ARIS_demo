import { beforeAll, describe, expect, it } from "vitest";
import { exe, pdf, png, sql, upload } from "../helpers";
import { addPlayedMatch, get, makeWorld, post, put, type World } from "../helpers/evaluation";

// A receipt attached to a payment line by staff: stored through the media pipeline, linked by documents.payment_id.
let w: World;
let paymentId: string;
beforeAll(async () => {
  w = await makeWorld("PRA", "PRB");
  await put(w.seatA, "/fee-scales", { tier: "d1", role: "R", amount: 1000 });
  const { fixtureId } = await addPlayedMatch({ country: "PRA", competition: "PRA-d1", referee: "PRA-ref1" });
  await post(w.seatA, "/payments/generate", { fixtureId });
  paymentId = (await get(w.seatA, `/payments?fixtureId=${fixtureId}`)).json.payments[0].id;
});

describe("POST /payments/:id/receipts", () => {
  it("stores a PDF or an image and lists it on the payment for staff and for the official paid", async () => {
    const res = await upload(w.seatA, "POST", `/payments/${paymentId}/receipts`, pdf(1), "virement.pdf");
    expect(res.status).toBe(201);
    expect(res.json.receipt).toMatchObject({ kind: "receipt", contentType: "application/pdf", filename: "virement.pdf" });
    expect((await upload(w.admin, "POST", `/payments/${paymentId}/receipts`, png(2), "slip.png")).status).toBe(201);
    const doc = await sql("SELECT payment_id AS paymentId, official_id AS officialId, kind FROM documents WHERE id = ?", res.json.receipt.id).first();
    expect(doc).toEqual({ paymentId, officialId: "PRA-ref1", kind: "receipt" });
    const media = await sql("SELECT kind, owner_type AS ownerType, owner_id AS ownerId, visibility FROM media_assets WHERE id = ?", res.json.receipt.mediaId).first();
    expect(media).toEqual({ kind: "receipt", ownerType: "payment", ownerId: paymentId, visibility: "private" });

    const seen = (await get(w.seatA, `/payments/${paymentId}`)).json.payment.receipts;
    expect(seen.map((r: { filename: string }) => r.filename)).toEqual(["virement.pdf", "slip.png"]);
    expect((await get(w.refA1, `/payments/${paymentId}`)).json.payment.receipts).toHaveLength(2);
    // the file itself: the paying federation and the official, nobody else
    const url = `/media/${res.json.receipt.mediaId}`;
    expect((await get(w.seatA, url)).status).toBe(200);
    expect((await get(w.refA1, url)).status).toBe(200);
    expect((await get(w.refA2, url)).status).toBe(404);
    expect((await get(w.seatB, url)).status).toBe(404);
  });

  it("refuses anything but PDF / PNG / JPEG / WebP", async () => {
    expect((await upload(w.seatA, "POST", `/payments/${paymentId}/receipts`, exe(), "virement.exe")).status).toBe(415);
  });

  it("is 404 across borders, 403 to a referee (even the official paid), 401 signed out", async () => {
    const before = (await sql("SELECT COUNT(*) AS n FROM documents WHERE payment_id = ?", paymentId).first<{ n: number }>())!.n;
    expect((await upload(w.seatB, "POST", `/payments/${paymentId}/receipts`, pdf(3))).status).toBe(404);
    expect((await upload(w.refA1, "POST", `/payments/${paymentId}/receipts`, pdf(4))).status).toBe(403);
    expect((await upload(null, "POST", `/payments/${paymentId}/receipts`, pdf(5))).status).toBe(401);
    expect((await sql("SELECT COUNT(*) AS n FROM documents WHERE payment_id = ?", paymentId).first<{ n: number }>())!.n).toBe(before);
  });
});
