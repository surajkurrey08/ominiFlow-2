import { NextRequest, NextResponse } from "next/server";

import { REFRESH_COOKIE_NAME } from "@/lib/auth/session-utils";
import { clearSessionCookies, isSameOrigin, renewSession, setSessionCookies } from "@/lib/auth/refresh";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const raw = request.cookies.get(REFRESH_COOKIE_NAME)?.value;
  const result = raw ? await renewSession(raw) : { status: "invalid" as const };
  if (result.status === "unavailable") return NextResponse.json({ error: "Session renewal is temporarily unavailable." }, { status: 503 });
  if (result.status === "invalid") {
    const response = NextResponse.json({ error: "Your session has expired. Sign in again." }, { status: 401 });
    clearSessionCookies(response);
    return response;
  }
  const response = NextResponse.json({ success: true });
  setSessionCookies(response, result.tokens);
  return response;
}
