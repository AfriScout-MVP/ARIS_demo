import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, NetworkError } from "@/lib/api/client";
import { uploadFile } from "@/lib/api/upload";

const file = new File([new Uint8Array([1, 2, 3])], "crest.png", { type: "image/png" });

function mockFetch(impl: (url: string, init: RequestInit) => Promise<Response> | Response) {
  const fn = vi.fn(async (url: string, init: RequestInit) => impl(url, init));
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe("uploadFile", () => {
  it("PUTs multipart form data to /api/v1 with the session cookie", async () => {
    const fetchMock = mockFetch(() => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const res = await uploadFile<{ ok: boolean }>("/federations/f1/logo", file);
    expect(res).toEqual({ ok: true });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/federations/f1/logo");
    expect(init.method).toBe("PUT");
    expect(init.credentials).toBe("include");
    expect(init.body).toBeInstanceOf(FormData);
    // the browser must set the multipart boundary itself
    expect(init.headers).toBeUndefined();

    const sent = (init.body as FormData).get("file") as File;
    expect(sent.name).toBe("crest.png");
    expect(sent.type).toBe("image/png");
    expect(sent.size).toBe(3);
  });

  it("adds extra text fields and can POST", async () => {
    const fetchMock = mockFetch(() => new Response(null, { status: 204 }));
    await uploadFile("/documents", file, { kind: "licence", note: "été" }, { method: "POST" });
    const init = fetchMock.mock.calls[0][1];
    const form = init.body as FormData;
    expect(init.method).toBe("POST");
    expect(form.get("kind")).toBe("licence");
    expect(form.get("note")).toBe("été");
    expect(form.has("file")).toBe(true);
  });

  it("names an anonymous blob", async () => {
    const fetchMock = mockFetch(() => new Response("{}", { status: 200 }));
    await uploadFile("/x", new Blob(["a"], { type: "image/png" }));
    expect(((fetchMock.mock.calls[0][1].body as FormData).get("file") as File).name).toBe("upload");
  });

  it("returns null for an empty body", async () => {
    mockFetch(() => new Response(null, { status: 204 }));
    expect(await uploadFile("/x", file)).toBeNull();
  });

  it("maps an error response to ApiError with status, code and details", async () => {
    mockFetch(() => new Response(JSON.stringify({ error: { code: "validation_failed", message: "bad", details: [{ path: "file" }] } }), { status: 422 }));
    const err = await uploadFile("/x", file).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 422, code: "validation_failed", message: "bad", details: [{ path: "file" }] });
  });

  it("falls back to http_error when the body is not the error envelope", async () => {
    mockFetch(() => new Response("<html>502</html>", { status: 502 }));
    const err = await uploadFile("/x", file).catch((e) => e);
    expect(err).toMatchObject({ status: 502, code: "http_error" });
  });

  it("maps a failed fetch to NetworkError", async () => {
    mockFetch(() => Promise.reject(new TypeError("Failed to fetch")));
    await expect(uploadFile("/x", file)).rejects.toBeInstanceOf(NetworkError);
  });

  it("lets an abort through untouched", async () => {
    mockFetch(() => Promise.reject(new DOMException("aborted", "AbortError")));
    await expect(uploadFile("/x", file)).rejects.toMatchObject({ name: "AbortError" });
  });

  it("passes the abort signal on", async () => {
    const fetchMock = mockFetch(() => new Response("{}", { status: 200 }));
    const controller = new AbortController();
    await uploadFile("/x", file, {}, { signal: controller.signal });
    expect(fetchMock.mock.calls[0][1].signal).toBe(controller.signal);
  });
});
