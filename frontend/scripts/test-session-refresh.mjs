import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, beforeEach, describe, it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("..", import.meta.url));
const out = mkdtempSync(join(tmpdir(), "omniflow-refresh-"));
const url = (path) => pathToFileURL(path).href;
const aliases = {
  "next/server": url(join(root, "node_modules/next/server.js")),
  "@/lib/auth/session-utils": url(join(out, "session-utils.mjs")),
  "@/lib/auth/refresh": url(join(out, "refresh.mjs")),
  "@/lib/auth/backend": url(join(out, "backend.mjs")),
  "@/lib/auth/validation": url(join(out, "validation.mjs")),
  "@/lib/auth/session": url(join(out, "session.mjs")),
};
// Keep real Next request/response cookies and the real auth code. Only the
// backend URL boundary is substituted; fetch is controlled per test.
writeFileSync(join(out, "backend.mjs"), `
  export const backendApiUrl = path => new URL('/api/v1' + path, 'https://backend.example.test');
  export const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  export const parseJson = response => response.json().catch(() => null);
`);
writeFileSync(join(out, "session.mjs"), "export const getSessionAccessToken = async () => null;");
for (const [source, target] of [
  ["src/lib/auth/session-utils.ts", "session-utils.mjs"],
  ["src/lib/auth/validation.ts", "validation.mjs"],
  ["src/lib/auth/refresh.ts", "refresh.mjs"],
  ["src/proxy.ts", "proxy.mjs"],
  ["src/app/api/auth/refresh/route.ts", "route.mjs"],
  ["src/app/api/auth/login/route.ts", "login.mjs"],
  ["src/app/api/auth/logout/route.ts", "logout.mjs"],
]) {
  let text = readFileSync(join(root, source), "utf8");
  for (const [from, to] of Object.entries(aliases)) text = text.replaceAll(`"${from}"`, JSON.stringify(to));
  writeFileSync(join(out, target), ts.transpileModule(text, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText);
}
const { NextRequest, NextResponse } = await import(aliases["next/server"]);
const auth = await import(url(join(out, "refresh.mjs")));
const session = await import(url(join(out, "session-utils.mjs")));
const { proxy } = await import(url(join(out, "proxy.mjs")));
const { POST } = await import(url(join(out, "route.mjs")));
const { POST: login } = await import(url(join(out, "login.mjs")));
const { POST: logout } = await import(url(join(out, "logout.mjs")));
const originalFetch = globalThis.fetch;
after(() => { globalThis.fetch = originalFetch; rmSync(out, { recursive: true, force: true }); });
beforeEach(() => { globalThis.fetch = async () => { throw new Error("Unexpected backend call"); }; });

function token(seconds = 900) {
  return `e30.${Buffer.from(JSON.stringify({ sub: "123e4567-e89b-42d3-a456-426614174000", exp: Math.floor(Date.now() / 1000) + seconds })).toString("base64url")}.signature`;
}
const raw = "synthetic-refresh-token-with-at-least-32-characters";
function payload() {
  return { access_token: token(), token_type: "bearer", refresh_token: raw + "-rotated", refresh_expires_at: new Date(Date.now() + 86400000).toISOString() };
}
function request(path = "/dashboard", access, extraHeaders = {}) {
  return new NextRequest(`https://app.example.test${path}`, {
    headers: { cookie: `${session.REFRESH_COOKIE_NAME}=${raw}${access ? `; ${session.SESSION_COOKIE_NAME}=${access}` : ""}`, ...extraHeaders },
  });
}

describe("login session renewal", () => {
  it("refreshes before expiry and supplies fresh cookies to SSR and the browser", async () => {
    const next = payload();
    globalThis.fetch = async (url, options) => {
      assert.equal(url.pathname, "/api/v1/auth/refresh");
      assert.equal(JSON.parse(options.body).refresh_token, raw);
      assert.equal(options.cache, "no-store");
      return Response.json(next);
    };
    const response = await proxy(request("/dashboard", token(30)));
    assert.match(response.headers.get("x-middleware-request-cookie"), new RegExp(next.refresh_token));
    assert.equal(response.cookies.get(session.SESSION_COOKIE_NAME).value, next.access_token);
    assert.equal(response.cookies.get(session.REFRESH_COOKIE_NAME).value, next.refresh_token);
    assert.match(response.headers.get("set-cookie"), /HttpOnly/);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
  });

  it("recovers when the short access cookie has already expired or disappeared", async () => {
    globalThis.fetch = async () => Response.json(payload());
    for (const access of [undefined, token(-1)]) {
      const response = await proxy(request("/api/inbox/conversations", access));
      assert.ok(response.cookies.get(session.SESSION_COOKIE_NAME)?.value);
    }
  });

  it("preserves valid access and legacy sessions without refreshing", async () => {
    assert.equal((await proxy(request("/dashboard", token(900)))).cookies.getAll().length, 0);
    const legacy = new NextRequest("https://app.example.test/dashboard", { headers: { cookie: `omniflow_session=${token()}` } });
    assert.equal((await proxy(legacy)).cookies.getAll().length, 0);
  });

  it("retains cookies during network and upstream failures", async () => {
    for (const backend of [async () => { throw new Error("offline"); }, async () => Response.json({}, { status: 503 }), async () => Response.json({})]) {
      globalThis.fetch = backend;
      const response = await proxy(request());
      assert.equal(response.status, 503);
      assert.equal(response.cookies.getAll().length, 0);
    }
  });

  it("clears both cookies only when refresh credentials are rejected", async () => {
    globalThis.fetch = async () => Response.json({}, { status: 401 });
    const response = await proxy(request());
    assert.equal(response.cookies.get(session.SESSION_COOKIE_NAME).maxAge, 0);
    assert.equal(response.cookies.get(session.REFRESH_COOKIE_NAME).maxAge, 0);
    assert.equal(response.headers.get("x-middleware-request-cookie"), "");
  });

  it("rejects cross-origin renewal and bypasses logout/login interception", async () => {
    assert.equal((await proxy(request("/api/inbox/conversations", undefined, { origin: "https://attacker.example", "sec-fetch-site": "cross-site" }))).status, 403);
    for (const path of ["/api/auth/login", "/api/auth/logout", "/api/auth/refresh", "/", "/privacy", "/form/public-id"]) {
      assert.equal((await proxy(request(path))).cookies.getAll().length, 0);
    }
  });

  it("refresh endpoint returns no raw tokens to browser JavaScript", async () => {
    globalThis.fetch = async () => Response.json(payload());
    const response = await POST(request("/api/auth/refresh"));
    assert.deepEqual(await response.json(), { success: true });
    assert.ok(response.cookies.get(session.REFRESH_COOKIE_NAME));
    assert.equal((await POST(request("/api/auth/refresh", undefined, { origin: "https://attacker.example" }))).status, 403);
  });

  it("rejects invalid expiry metadata and clears the full cookie pair", () => {
    assert.equal(auth.parseSessionTokens({ ...payload(), refresh_expires_at: "invalid" }), null);
    assert.equal(auth.parseSessionTokens({ ...payload(), access_token: token(-1) }), null);
    const response = NextResponse.json({});
    auth.clearSessionCookies(response);
    assert.equal(response.cookies.get(session.REFRESH_COOKIE_NAME).maxAge, 0);
  });

  it("login establishes the HttpOnly cookie pair without exposing tokens", async () => {
    globalThis.fetch = async () => Response.json(payload());
    const response = await login(new NextRequest("https://app.example.test/api/auth/login", {
      method: "POST", headers: { "Content-Type": "application/json", origin: "https://app.example.test" },
      body: JSON.stringify({ email: "owner@example.com", password: "Synthetic-password!" }),
    }));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true });
    assert.equal(response.cookies.get(session.REFRESH_COOKIE_NAME).httpOnly, true);
    assert.equal(response.cookies.get(session.SESSION_COOKIE_NAME).httpOnly, true);
  });

  it("logout revokes refresh credentials even without a valid access cookie", async () => {
    globalThis.fetch = async (url, options) => {
      assert.equal(url.pathname, "/api/v1/auth/revoke");
      assert.equal(JSON.parse(options.body).refresh_token, raw);
      return new Response(null, { status: 204 });
    };
    const response = await logout(request("/api/auth/logout"));
    assert.deepEqual(await response.json(), { success: true, server_session_revoked: true });
    assert.equal(response.cookies.get(session.REFRESH_COOKIE_NAME).maxAge, 0);
    assert.equal(response.cookies.get(session.SESSION_COOKIE_NAME).maxAge, 0);
  });
});
