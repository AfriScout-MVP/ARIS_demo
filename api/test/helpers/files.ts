// Synthetic files for upload tests: just enough leading bytes for the sniffer, nothing from anyone's disk.
import { api, type Session } from "./app";

const pad = (head: number[], extra = 24) => new Uint8Array([...head, ...Array.from({ length: extra }, (_, i) => i)]);

export const png = (seed = 0) => pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, seed]);
export const jpeg = (seed = 0) => pad([0xff, 0xd8, 0xff, 0xe0, seed]);
export const webp = (seed = 0) => pad([0x52, 0x49, 0x46, 0x46, 0x10, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, seed]);
export const pdf = (seed = 0) => pad([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, seed]);
export const svg = () => new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>');
export const html = () => new TextEncoder().encode("<html><script>alert(1)</script></html>");
export const exe = () => new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 1, 2, 3, 4]);

/** A multipart request with a `file` field (and any extra text fields). */
export function upload(session: Session | null, method: string, path: string, bytes: Uint8Array, name = "file.png", fields: Record<string, string> = {}) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  form.set("file", new File([bytes], name, { type: "application/octet-stream" }));
  return api(method, `/api/v1${path}`, { session, raw: form });
}
