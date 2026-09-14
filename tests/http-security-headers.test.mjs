import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";

async function bundle(environment) {
  const result = await build({
    stdin: {
      contents: `export { applySecurityHeaders } from './src/lib/http/security-headers.ts';
        export { proxy, config } from './src/proxy.ts';
        export { NextRequest } from 'next/server';`,
      resolveDir: process.cwd(), loader: "ts",
    },
    alias: { "next/server": "vinext/shims/server" },
    define: { "process.env.NODE_ENV": JSON.stringify(environment) },
    bundle: true, format: "esm", platform: "node", write: false, logLevel: "silent",
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
}

const production = await bundle("production");
const development = await bundle("development");

test("production policy supports inline rendering and local Swagger assets while restricting browser capabilities", () => {
  const response = production.applySecurityHeaders(new Response(), new Request("https://crm.test/docs"));
  const directives = response.headers.get("content-security-policy").split("; ");
  for (const expected of ["default-src 'self'", "script-src 'self' 'unsafe-inline'", "style-src 'self' 'unsafe-inline'", "font-src 'self'", "img-src 'self' data:", "connect-src 'self'", "object-src 'none'", "frame-src 'none'", "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'"]) {
    assert.ok(directives.includes(expected), expected);
  }
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(response.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
  assert.equal(response.headers.get("permissions-policy"), "camera=(), microphone=(), geolocation=()");
  assert.ok(!response.headers.get("content-security-policy").includes("unsafe-eval"));
});

test("HSTS follows the request URL, ignoring untrusted forwarded protocol headers", () => {
  for (const policy of [production, development]) {
    const secure = policy.applySecurityHeaders(new Response(), new Request("https://crm.test/"));
    assert.equal(secure.headers.get("strict-transport-security"), "max-age=31536000");
    const local = policy.applySecurityHeaders(new Response(null, { headers: { "strict-transport-security": "max-age=31536000; includeSubDomains" } }), new Request("http://localhost:3000/", { headers: { "x-forwarded-proto": "https" } }));
    assert.equal(local.headers.has("strict-transport-security"), false);
  }
});

test("only development permits HMR websocket connections, without permitting eval", () => {
  const response = development.applySecurityHeaders(new Response(), new Request("http://localhost:3000/"));
  assert.ok(response.headers.get("content-security-policy").split("; ").includes("connect-src 'self' ws: wss:"));
  assert.ok(!response.headers.get("content-security-policy").includes("unsafe-eval"));
});

test("finalizing a streaming response preserves cookies, pagination, status and body without consuming either stream", async () => {
  const request = new Request("https://crm.test/api/companies", { method: "POST", body: '{"name":"test"}' });
  const headers = new Headers({ "cache-control": "no-store", "x-total-count": "25", "content-type": "application/json" });
  headers.append("set-cookie", "session=one; Path=/; HttpOnly; Secure");
  headers.append("set-cookie", "state=two; Expires=Wed, 21 Oct 2030 07:28:00 GMT; Path=/; Secure");
  const original = new Response('{"id":"created"}', { status: 201, statusText: "Created", headers });
  const response = production.applySecurityHeaders(original, request);
  assert.equal(response, original);
  assert.equal(request.bodyUsed, false);
  assert.equal(response.bodyUsed, false);
  assert.equal(response.status, 201);
  assert.equal(response.statusText, "Created");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-total-count"), "25");
  assert.deepEqual(response.headers.getSetCookie(), headers.getSetCookie());
  assert.deepEqual(await response.json(), { id: "created" });
});

test("immutable redirect headers are safely copied with the status and location intact", () => {
  const original = Response.redirect("https://crm.test/sign-in", 303);
  assert.throws(() => original.headers.set("x-test", "test"), TypeError);
  const response = production.applySecurityHeaders(original, new Request("https://crm.test/"));
  assert.notEqual(response, original);
  assert.equal(response.status, 303);
  assert.equal(response.statusText, original.statusText);
  assert.equal(response.headers.get("location"), "https://crm.test/sign-in");
  assert.equal(response.body, null);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
});

test("immutable fetch responses retain their unread body and content headers", async () => {
  const original = await fetch("data:application/json,%7B%22ok%22%3Atrue%7D");
  assert.throws(() => original.headers.set("x-test", "test"), TypeError);
  const response = production.applySecurityHeaders(original, new Request("https://crm.test/api/example"));
  assert.equal(original.bodyUsed, false);
  assert.equal(response.bodyUsed, false);
  assert.equal(response.body, original.body);
  assert.equal(response.status, original.status);
  assert.equal(response.headers.get("content-type"), "application/json");
  assert.deepEqual(await response.json(), { ok: true });
});

test("proxy covers every route and preserves path overwriting and the request body", async () => {
  assert.deepEqual(production.config.matcher, ["/:path*"]);
  for (const path of ["/", "/sign-in?returnTo=%2Fdocs", "/docs", "/companies", "/contacts", "/deals", "/settings/roles", "/api/companies", "/api/auth/sign-in/email", "/api/openapi"]) {
    const request = new production.NextRequest(`https://crm.test${path}`, { method: "POST", body: "body", headers: { "x-workspace-return-to": "//evil.test", "x-preserved-header": "present" } });
    const response = production.proxy(request);
    assert.equal(response.headers.get("x-middleware-next"), "1", path);
    assert.equal(response.headers.get("x-middleware-request-x-workspace-return-to"), path, path);
    assert.equal(response.headers.get("x-middleware-request-x-preserved-header"), "present", path);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff", path);
    assert.equal(request.bodyUsed, false, path);
    assert.equal(await request.text(), "body", path);
  }
});
