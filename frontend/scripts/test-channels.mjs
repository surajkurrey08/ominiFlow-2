import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("..", import.meta.url));
const outDir = mkdtempSync(join(tmpdir(), "omniflow-channels-"));
const source = readFileSync(join(root, "src/lib/channels/proxy-utils.ts"), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
writeFileSync(join(outDir, "proxy-utils.mjs"), outputText);
const { buildChannelProxyTarget } = await import(pathToFileURL(join(outDir, "proxy-utils.mjs")).href);
const pairingSource = readFileSync(join(root, "src/lib/channels/website-pairing.ts"), "utf8");
writeFileSync(join(outDir, "website-pairing.mjs"), ts.transpileModule(pairingSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText);
const { websiteOrigin, connectorEvent } = await import(pathToFileURL(join(outDir, "website-pairing.mjs")).href);
after(() => rmSync(outDir, { recursive: true, force: true }));

const id = "123e4567-e89b-42d3-a456-426614174000";
const params = (q = "") => new URLSearchParams(q);

describe("Channel proxy allowlist", () => {
  it("reads manual widget settings without allowing writes or tenant overrides", () => {
    const segments = [id, "web-chat", "widget-settings"];
    assert.equal(buildChannelProxyTarget("GET", segments, params()).backendPath, `/channels/${id}/web-chat/widget-settings`);
    for (const method of ["POST", "PATCH", "DELETE"]) assert.equal(buildChannelProxyTarget(method, segments, params(), {}), null);
    assert.equal(buildChannelProxyTarget("GET", segments, params("tenant_id=other")), null);
    assert.equal(buildChannelProxyTarget("GET", ["not-a-uuid", "web-chat", "widget-settings"], params()), null);
    assert.equal(buildChannelProxyTarget("GET", [...segments, "private"], params()), null);
  });
  it("allows website setup, pairing and status without forwarding private extras", () => {
    const setup = { name: "BookMyVilla", website_url: "https://bookmyvilla.online" };
    assert.equal(buildChannelProxyTarget("POST", ["web-chat", "setup"], params(), setup).backendPath, "/channels/web-chat/setup");
    assert.equal(buildChannelProxyTarget("POST", ["web-chat", "setup"], params(), { ...setup, tenant_id: id }), null);
    assert.equal(buildChannelProxyTarget("PATCH", [id, "web-chat", "website"], params(), setup).method, "PATCH");
    assert.equal(buildChannelProxyTarget("POST", [id, "web-chat", "pairing"], params(), { opener_origin: "https://chat.bookmyvilla.online" }).backendPath, `/channels/${id}/web-chat/pairing`);
    assert.equal(buildChannelProxyTarget("POST", [id, "web-chat", "pairing"], params(), { opener_origin: "https://chat.bookmyvilla.online", token: "do-not-forward" }), null);
    assert.equal(buildChannelProxyTarget("GET", [id, "web-chat", "installation"], params()).method, "GET");
    assert.equal(buildChannelProxyTarget("GET", [id, "web-chat", "installation"], params("tenant_id=other")), null);
    assert.equal(buildChannelProxyTarget("POST", [id, "web-chat", "pairing", "cancel"], params(), { pairing_id: id }).method, "POST");
    assert.equal(buildChannelProxyTarget("POST", [id, "web-chat", "pairing", "cancel"], params()), null);
    assert.equal(buildChannelProxyTarget("POST", ["web-chat", "pairings", id, "complete"], params(), {}), null);
  });

  it("accepts website origins and rejects unsafe addresses", () => {
    assert.equal(websiteOrigin("https://bookmyvilla.online/"), "https://bookmyvilla.online");
    assert.equal(websiteOrigin("http://localhost:5173"), "http://localhost:5173");
    for (const value of ["javascript:alert(1)", "https://user:pass@site.com", "https://site.com/admin", "https://site.com?key=secret", "http://site.com"]) assert.equal(websiteOrigin(value), null);
  });

  it("rejects unsolicited window messages and mismatched pairing IDs", () => {
    const popup = {};
    const data = { type: "ready", protocol: "omniflow-pairing-v1", request_id: id };
    assert.equal(connectorEvent({ source: popup, data }, popup, id), data);
    assert.equal(connectorEvent({ source: {}, data }, popup, id), null);
    assert.equal(connectorEvent({ source: popup, data: { ...data, request_id: "other" } }, popup, id), null);
    assert.equal(connectorEvent({ source: popup, data: { ...data, protocol: "other" } }, popup, id), null);
    assert.equal(connectorEvent({ source: popup, data: null }, popup, id), null);
  });
  it("forwards list filters and rejects unknown ones", () => {
    const target = buildChannelProxyTarget("GET", [], params("page=2&page_size=10&status=connected&channel_type=whatsapp&search=acme"));
    assert.equal(target.backendPath, "/channels");
    assert.equal(target.query.get("page"), "2");
    assert.equal(target.query.get("status"), "connected");
    assert.equal(target.query.get("channel_type"), "whatsapp");
    assert.equal(buildChannelProxyTarget("GET", [], params("status=bogus")), null);
    assert.equal(buildChannelProxyTarget("GET", [], params("channel_type=telegram")), null);
    assert.equal(buildChannelProxyTarget("GET", [], params("evil=1")), null);
    assert.equal(buildChannelProxyTarget("GET", [], params("page_size=101")), null);
  });

  it("validates create bodies", () => {
    const ok = buildChannelProxyTarget("POST", [], params(), { channel_type: "whatsapp", name: "  Support  " });
    assert.equal(ok.backendPath, "/channels");
    assert.equal(ok.body.name, "Support");
    assert.equal(buildChannelProxyTarget("POST", [], params(), { channel_type: "whatsapp", name: "x" }), null);
    assert.equal(buildChannelProxyTarget("POST", [], params(), { channel_type: "telegram", name: "Nope" }), null);
    assert.equal(buildChannelProxyTarget("POST", [], params(), { channel_type: "whatsapp", name: "ok", status: "connected" }), null);
    assert.equal(buildChannelProxyTarget("POST", [], params(), { channel_type: "whatsapp", name: "ok", external_account_id: "has space" }), null);
  });

  it("validates the WhatsApp connect body and never allows extra fields", () => {
    const ok = buildChannelProxyTarget("POST", [id, "whatsapp", "connect"], params(), {
      phone_number_id: "100000000000001",
      waba_id: "200000000000001",
      access_token: "a-secret-token",
    });
    assert.equal(ok.backendPath, `/channels/${id}/whatsapp/connect`);
    assert.deepEqual(Object.keys(ok.body).sort(), ["access_token", "phone_number_id", "waba_id"]);
    const embeddedSignup = buildChannelProxyTarget("POST", [id, "whatsapp", "connect"], params(), {
      phone_number_id: "100000000000001",
      waba_id: "200000000000001",
      code: "authorization-code",
    });
    assert.deepEqual(Object.keys(embeddedSignup.body).sort(), ["code", "phone_number_id", "waba_id"]);
    const codeOnly = buildChannelProxyTarget("POST", [id, "whatsapp", "connect"], params(), {
      code: "authorization-code",
    });
    assert.deepEqual(codeOnly.body, { code: "authorization-code" });
    assert.equal(buildChannelProxyTarget("POST", [id, "whatsapp", "connect"], params(), { phone_number_id: "abc", waba_id: "200000000000001", access_token: "t" }), null);
    assert.equal(buildChannelProxyTarget("POST", [id, "whatsapp", "connect"], params(), { phone_number_id: "1", waba_id: "2", access_token: "t", code: "x" }), null);
    assert.equal(buildChannelProxyTarget("POST", [id, "whatsapp", "connect"], params(), { phone_number_id: "1", waba_id: "2", access_token: "" }), null);
  });

  it("allows test, disconnect, delete, templates and sync on a valid id only", () => {
    assert.equal(buildChannelProxyTarget("GET", ["whatsapp", "embedded-signup", "config"], params()).backendPath, "/channels/whatsapp/embedded-signup/config");
    assert.equal(buildChannelProxyTarget("POST", [id, "whatsapp", "test"], params()).backendPath, `/channels/${id}/whatsapp/test`);
    assert.equal(buildChannelProxyTarget("POST", [id, "disconnect"], params()).backendPath, `/channels/${id}/disconnect`);
    assert.equal(buildChannelProxyTarget("DELETE", [id], params()).expectsNoContent, true);
    assert.equal(buildChannelProxyTarget("GET", [id, "templates"], params("include_inactive=true&status=APPROVED")).backendPath, `/channels/${id}/templates`);
    assert.equal(buildChannelProxyTarget("POST", [id, "templates", "sync"], params()).backendPath, `/channels/${id}/templates/sync`);
    assert.equal(buildChannelProxyTarget("GET", ["not-a-uuid"], params()), null);
    assert.equal(buildChannelProxyTarget("POST", [id, "whatsapp", "test"], params("x=1")), null);
    assert.equal(buildChannelProxyTarget("DELETE", [id, "whatsapp", "connect"], params()), null);
  });

  it("validates PATCH update bodies", () => {
    assert.equal(buildChannelProxyTarget("PATCH", [id], params(), { name: "Renamed" }).body.name, "Renamed");
    assert.equal(buildChannelProxyTarget("PATCH", [id], params(), { is_active: false }).body.is_active, false);
    assert.equal(buildChannelProxyTarget("PATCH", [id], params(), {}), null);
    assert.equal(buildChannelProxyTarget("PATCH", [id], params(), { status: "connected" }), null);
  });

  it("validates Facebook, Instagram and OAuth proxy targets", () => {
    // Facebook
    const fb = buildChannelProxyTarget("POST", [id, "facebook", "connect"], params(), { page_id: "100", access_token: "token" });
    assert.equal(fb.backendPath, `/channels/${id}/facebook/connect`);
    assert.equal(buildChannelProxyTarget("POST", [id, "facebook", "test"], params()).backendPath, `/channels/${id}/facebook/test`);

    // Instagram
    const ig = buildChannelProxyTarget("POST", [id, "instagram", "connect"], params(), { instagram_id: "100", page_id: "200", access_token: "token" });
    assert.equal(ig.backendPath, `/channels/${id}/instagram/connect`);
    assert.equal(buildChannelProxyTarget("POST", [id, "instagram", "test"], params()).backendPath, `/channels/${id}/instagram/test`);

    // OAuth
    assert.equal(buildChannelProxyTarget("POST", ["oauth", "facebook", "start"], params()).backendPath, "/channels/oauth/facebook/start");
    assert.equal(buildChannelProxyTarget("GET", ["oauth", "assets"], params("token=1234567890abc")).backendPath, "/channels/oauth/assets");
    assert.equal(buildChannelProxyTarget("POST", ["oauth", "select"], params(), { token: "1234567890abc", external_account_id: "100" }).backendPath, "/channels/oauth/select");
  });
});
