import { NextRequest, NextResponse } from "next/server";

import { backendApiUrl, isRecord, parseJson } from "@/lib/auth/backend";
import { getSessionAccessToken } from "@/lib/auth/session";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session-utils";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ segments?: string[] }> };

function clearSession(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}

function unauthenticated() {
  return clearSession(NextResponse.json({ error: "Sign in to continue." }, { status: 401 }));
}

async function handle(request: NextRequest, context: RouteContext, method: string) {
  const token = await getSessionAccessToken();
  if (!token) return unauthenticated();

  const { segments = [] } = await context.params;

  let backendPath = `/social-posts`;
  if (segments.length > 0) {
    backendPath += `/${segments.join("/")}`;
  }

  const url = backendApiUrl(backendPath);
  url.search = request.nextUrl.searchParams.toString();

  const headers: HeadersInit = {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
  };

  let body: string | undefined;
  if (["POST", "PATCH", "PUT"].includes(method)) {
    headers["Content-Type"] = "application/json";
    body = await request.text();
  }

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method,
      headers,
      body,
      cache: "no-store",
    });
  } catch {
    return NextResponse.json(
      { error: "The postings service is temporarily unavailable." },
      { status: 503 },
    );
  }

  if (upstream.status === 204) {
    return new NextResponse(null, { status: 204 });
  }

  if (!upstream.ok) {
    const payload = await parseJson(upstream);
    const detail = isRecord(payload) && typeof payload.detail === "string" ? payload.detail : null;
    const error = upstream.status === 401 ? "Sign in to continue." : detail ?? "An error occurred while processing your post.";
    const response = NextResponse.json({ error }, { status: upstream.status });
    return upstream.status === 401 ? clearSession(response) : response;
  }

  const payload = await parseJson(upstream);
  return NextResponse.json(payload, { status: upstream.status });
}

export async function GET(request: NextRequest, context: RouteContext) {
  return handle(request, context, "GET");
}

export async function POST(request: NextRequest, context: RouteContext) {
  return handle(request, context, "POST");
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  return handle(request, context, "PATCH");
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  return handle(request, context, "DELETE");
}
