/** Origin/source checks for the browser connector; this module never stores tokens. */
export const PAIRING_PROTOCOL = "omniflow-pairing-v1";

export function websiteOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password ||
      !["", "/"].includes(url.pathname) || url.search || url.hash) return null;
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.protocol === "http:" && !local) return null;
    return url.origin;
  } catch { return null; }
}

export function connectorEvent(event: MessageEvent, popup: Window | null, requestId: string) {
  const data: unknown = event.data;
  if (!popup || event.source !== popup || !data || typeof data !== "object") return null;
  const body = data as Record<string, unknown>;
  if (body.protocol !== PAIRING_PROTOCOL || body.request_id !== requestId || typeof body.type !== "string") return null;
  return body;
}
