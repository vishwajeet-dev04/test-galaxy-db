export function apiDetail(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") return fallback;
  const detail = (body as { detail?: unknown }).detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0];
    if (typeof first === "string" && first.trim()) return first;
    if (first && typeof first === "object" && "msg" in first) {
      const msg = String((first as { msg: unknown }).msg || "").trim();
      if (msg) return msg;
    }
  }
  return fallback;
}
