import { ApiError, NetworkError } from "./client";
import { API_BASE } from "./config";

export interface UploadOptions {
  /** The contract uses PUT for logos and flags. */
  method?: "PUT" | "POST";
  signal?: AbortSignal;
}

/**
 * Sends one file as `multipart/form-data` (field `file`, plus any extra text fields).
 *
 * Same conventions as `api()`: same-origin `/api/v1`, the session cookie, failures as
 * `ApiError` (the Worker answered with an error) or `NetworkError` (it could not be reached).
 * The content type is left to the browser, which adds the multipart boundary itself.
 */
export async function uploadFile<T = unknown>(
  path: string,
  file: Blob,
  fields: Record<string, string> = {},
  { method = "PUT", signal }: UploadOptions = {},
): Promise<T> {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.append(name, value);
  form.append("file", file, "name" in file && typeof file.name === "string" && file.name ? file.name : "upload");

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/v1${path}`, { method, credentials: "include", body: form, signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new NetworkError();
  }

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!res.ok) {
    const e = (data as { error?: { code?: string; message?: string; details?: unknown } } | null)?.error;
    throw new ApiError(res.status, e?.code ?? "http_error", e?.message ?? `Request failed (${res.status})`, e?.details);
  }
  return data as T;
}
