import { NextRequest, NextResponse } from "next/server";

import { needsSessionRefresh, REFRESH_COOKIE_NAME, SESSION_COOKIE_NAME } from "@/lib/auth/session-utils";
import { clearSessionCookies, isSameOrigin, renewSession, setSessionCookies } from "@/lib/auth/refresh";

const PUBLIC_AUTH_ROUTES = new Set([
  "/api/auth/login", "/api/auth/register", "/api/auth/accept", "/api/auth/logout",
  "/api/auth/reset-password", "/api/auth/password-reset-request", "/api/auth/refresh",
]);
const WORKSPACE_ROOTS = new Set([
  "accept", "ai-configuration", "ai-credits", "analytics", "automations", "campaigns",
  "channels", "contacts", "dashboard", "e-commerce", "flow", "inbox", "keywords",
  "platform-admin", "postings", "settings", "team", "templates", "whatsapp-forms",
]);

// Renew before SSR/API handlers read cookies. No feature-specific request logic
// changes, body replay, or browser-readable refresh credentials are needed.
export async function proxy(request: NextRequest) {
  if (PUBLIC_AUTH_ROUTES.has(request.nextUrl.pathname)) return NextResponse.next();
  const root = request.nextUrl.pathname.split("/")[1];
  if (root !== "api" && !WORKSPACE_ROOTS.has(root)) return NextResponse.next();
  const refresh = request.cookies.get(REFRESH_COOKIE_NAME)?.value;
  const access = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!refresh || !needsSessionRefresh(access)) return NextResponse.next();
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });

  const result = await renewSession(refresh);
  if (result.status === "unavailable") {
    // Keep cookies intact during outages. Do not let a downstream 401 turn a
    // temporary refresh failure into a permanent sign-out.
    return NextResponse.json({ error: "Session renewal is temporarily unavailable. Please try again." }, {
      status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "5" },
    });
  }
  if (result.status === "invalid") {
    request.cookies.delete(SESSION_COOKIE_NAME);
    request.cookies.delete(REFRESH_COOKIE_NAME);
  } else {
    request.cookies.set(SESSION_COOKIE_NAME, result.tokens.accessToken);
    request.cookies.set(REFRESH_COOKIE_NAME, result.tokens.refreshToken);
  }
  const headers = new Headers(request.headers);
  headers.set("cookie", request.cookies.toString());
  const response = NextResponse.next({ request: { headers } });
  if (result.status === "ok") setSessionCookies(response, result.tokens);
  else clearSessionCookies(response);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff2?)$).*)"],
};
