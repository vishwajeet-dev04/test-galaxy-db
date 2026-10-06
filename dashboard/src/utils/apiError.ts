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

export function looksLikeHtml(text: string): boolean {
  const start = text.trimStart().slice(0, 15).toLowerCase();
  return start.startsWith("<!doctype") || start.startsWith("<html");
}

/** Real JWT failure is JSON 401. HTML 401/403 is a block page, not an expired token. */
export function isSessionExpiredStatus(status: number, raw = ""): boolean {
  return status === 401 && !looksLikeHtml(raw);
}

/** Window event AuthContext listens for; any authenticated call that gets a JWT 401 fires it. */
export const SESSION_EXPIRED_EVENT = "galaxy:session-expired";

export function notifySessionExpired(): void {
  window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
}

function hasAuthHeader(init?: RequestInit): boolean {
  if (!init?.headers) return false;
  return new Headers(init.headers).has("Authorization");
}

export async function readApiBody(res: Response): Promise<{ json: unknown; raw: string }> {
  const raw = await res.text();
  if (!raw) return { json: {}, raw: "" };
  try {
    return { json: JSON.parse(raw), raw };
  } catch {
    return { json: null, raw };
  }
}

export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<{ res: Response; json: unknown; raw: string }> {
  let last: { res: Response; json: unknown; raw: string } | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const res = await fetch(input, init);
    const parsed = await readApiBody(res);
    last = { res, json: parsed.json, raw: parsed.raw };
    if (!looksLikeHtml(parsed.raw)) break;
    if (attempt === 0) await new Promise((r) => setTimeout(r, 250));
  }
  // Only calls that sent a token can mean "session expired"; a login 401 is a wrong password.
  if (hasAuthHeader(init) && isSessionExpiredStatus(last!.res.status, last!.raw)) {
    notifySessionExpired();
  }
  return last!;
}

export function httpErrorMessage(status: number, json: unknown, raw: string, fallback: string): string {
  if (status === 429) {
    return apiDetail(json && typeof json === "object" ? json : {}, "Too many requests. Try again in a minute.");
  }
  if (looksLikeHtml(raw)) {
    return "This request was intercepted (HTML block page, not Galaxy). Turn off Chrome device mode (Ctrl+Shift+M). Incognito with extensions off if it persists.";
  }
  if (json && typeof json === "object") return apiDetail(json, fallback);
  return fallback;
}
