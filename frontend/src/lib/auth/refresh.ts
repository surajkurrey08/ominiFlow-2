import { NextRequest, NextResponse } from "next/server";

import { backendApiUrl, isRecord, parseJson } from "@/lib/auth/backend";
import { REFRESH_COOKIE_NAME, SESSION_COOKIE_NAME, sessionCookieOptions, tokenMaxAgeSeconds } from "@/lib/auth/session-utils";

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  accessMaxAge: number;
  refreshMaxAge: number;
}

export function parseSessionTokens(payload: unknown): SessionTokens | null {
  if (!isRecord(payload) || typeof payload.access_token !== "string" ||
      payload.token_type !== "bearer" || typeof payload.refresh_token !== "string" ||
      payload.refresh_token.length < 32 || payload.refresh_token.length > 256 ||
      typeof payload.refresh_expires_at !== "string") return null;
  const accessMaxAge = tokenMaxAgeSeconds(payload.access_token);
  const refreshMaxAge = Math.floor((Date.parse(payload.refresh_expires_at) - Date.now()) / 1000);
  if (accessMaxAge === null || !Number.isFinite(refreshMaxAge) || refreshMaxAge <= 0) return null;
  return { accessToken: payload.access_token, refreshToken: payload.refresh_token, accessMaxAge, refreshMaxAge };
}

export function setSessionCookies(response: NextResponse, tokens: SessionTokens) {
  const secure = process.env.NODE_ENV === "production";
  response.cookies.set(SESSION_COOKIE_NAME, tokens.accessToken, sessionCookieOptions(secure, tokens.accessMaxAge));
  response.cookies.set(REFRESH_COOKIE_NAME, tokens.refreshToken, sessionCookieOptions(secure, tokens.refreshMaxAge));
  response.headers.set("Cache-Control", "no-store");
}

export function clearSessionCookies(response: NextResponse) {
  const options = sessionCookieOptions(process.env.NODE_ENV === "production", 0);
  response.cookies.set(SESSION_COOKIE_NAME, "", options);
  response.cookies.set(REFRESH_COOKIE_NAME, "", options);
  response.headers.set("Cache-Control", "no-store");
}

export function isSameOrigin(request: NextRequest) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true; // Server-to-server requests and same-origin navigation.
  try {
    return new URL(origin).host === request.headers.get("host") || new URL(origin).origin === request.nextUrl.origin;
  } catch { return false; }
}

export type RefreshResult = { status: "ok"; tokens: SessionTokens } | { status: "invalid" } | { status: "unavailable" };

export async function renewSession(raw: string): Promise<RefreshResult> {
  if (raw.length < 32 || raw.length > 256) return { status: "invalid" };
  try {
    const upstream = await fetch(backendApiUrl("/auth/refresh"), {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ refresh_token: raw }),
      cache: "no-store", signal: AbortSignal.timeout(10000),
    });
    if (upstream.status === 401) return { status: "invalid" };
    if (!upstream.ok) return { status: "unavailable" };
    const tokens = parseSessionTokens(await parseJson(upstream));
    return tokens ? { status: "ok", tokens } : { status: "unavailable" };
  } catch { return { status: "unavailable" }; }
}
