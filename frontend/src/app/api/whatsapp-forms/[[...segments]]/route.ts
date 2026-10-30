import { NextRequest, NextResponse } from "next/server";
import { backendApiUrl, isRecord, parseJson } from "@/lib/auth/backend";
import { getSessionAccessToken } from "@/lib/auth/session";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session-utils";

export const runtime = "nodejs";
type Context = { params: Promise<{ segments?: string[] }> };
const FAIL = "The forms service is temporarily unavailable.";

async function handle(request: NextRequest, context: Context, method: string) {
  const { segments = [] } = await context.params;
  const isPublic = segments.length > 0 && segments[0] === "public";
  const token = await getSessionAccessToken();
  if (!token && !isPublic) return clear(NextResponse.json({ error: "Sign in to continue." }, { status: 401 }));
  
  const pathParams = segments.length > 0 ? `/${segments.join('/')}` : '';
  
  const contentType = request.headers.get("content-type") || "";
  let body: any = undefined;

  if (!["GET", "DELETE"].includes(method)) {
    if (contentType.includes("multipart/form-data")) {
      body = await request.arrayBuffer();
    } else {
      const raw = await request.text();
      if (raw.length > 2_000_000) return NextResponse.json({ error: "Request body is too large." }, { status: 413 });
      try { JSON.parse(raw); } catch { return NextResponse.json({ error: "Invalid JSON request." }, { status: 400 }); }
      body = raw;
    }
  }
  
  const url = backendApiUrl(`/api/v1/whatsapp-forms${pathParams}`);
  url.search = request.nextUrl.search;
  
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (contentType.includes("multipart/form-data")) {
    headers["Content-Type"] = contentType;
  } else if (body) {
    headers["Content-Type"] = "application/json";
    headers["Accept"] = "application/json";
  }

  let upstream: Response;
  try { 
    upstream = await fetch(url, { 
      method, 
      headers, 
      body, 
      cache: "no-store", 
      signal: request.signal 
    }); 
  }
  catch { return NextResponse.json({ error: FAIL }, { status: 503 }); }
  
  if (upstream.status === 204) return new NextResponse(null, { status: 204 });

  if (pathParams.startsWith("/public/files/")) {
    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("content-type") || "application/octet-stream",
        "Cache-Control": "public, max-age=86400",
      },
    });
  }
  
  if (!upstream.ok) {
    const payload = await parseJson(upstream);
    const status = [400, 401, 403, 404, 409, 413, 422, 502, 503].includes(upstream.status) ? upstream.status : 503;
    const detail = isRecord(payload) && typeof payload.detail === "string" ? payload.detail : FAIL;
    const response = NextResponse.json({ error: upstream.status === 401 ? "Your session has expired. Sign in again." : detail }, { status });
    return upstream.status === 401 ? clear(response) : response;
  }
  
  const payload = await parseJson(upstream);
  return payload === null ? NextResponse.json({ error: "Invalid service response." }, { status: 502 }) : NextResponse.json(payload, { status: upstream.status });
}

function clear(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE_NAME, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
  return response;
}

export const GET = (r: NextRequest, c: Context) => handle(r, c, "GET");
export const POST = (r: NextRequest, c: Context) => handle(r, c, "POST");
export const PATCH = (r: NextRequest, c: Context) => handle(r, c, "PATCH");
export const PUT = (r: NextRequest, c: Context) => handle(r, c, "PUT");
export const DELETE = (r: NextRequest, c: Context) => handle(r, c, "DELETE");
