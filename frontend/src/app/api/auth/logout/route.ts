import { NextRequest, NextResponse } from "next/server";

import { backendApiUrl } from "@/lib/auth/backend";
import { getSessionAccessToken } from "@/lib/auth/session";
import { REFRESH_COOKIE_NAME } from "@/lib/auth/session-utils";
import { clearSessionCookies, isSameOrigin } from "@/lib/auth/refresh";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const token = await getSessionAccessToken();
  const refresh = request.cookies.get(REFRESH_COOKIE_NAME)?.value;
  let serverSessionRevoked = !token && !refresh;
  if (token || refresh) {
    try {
      const upstream = await fetch(backendApiUrl(refresh ? "/auth/revoke" : "/auth/logout"), {
        method: "POST",
        headers: {
          Accept: "application/json",
          ...(refresh ? { "Content-Type": "application/json" } : { Authorization: `Bearer ${token}` }),
        },
        ...(refresh ? { body: JSON.stringify({ refresh_token: refresh }) } : {}),
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      });
      serverSessionRevoked = upstream.ok;
    } catch {
      serverSessionRevoked = false;
    }
  }

  const response = NextResponse.json({ success: true, server_session_revoked: serverSessionRevoked });
  clearSessionCookies(response);
  return response;
}
