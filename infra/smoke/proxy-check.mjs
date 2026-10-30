import assert from "node:assert/strict";
import http from "node:http";
import https from "node:https";
import { readFileSync } from "node:fs";

const [mode, peerIP] = process.argv.slice(2);
const domain = "wangmai.invalid";
const query = "?code=synthetic-oauth-marker&state=fixture%2Bstate&scope=openid%20email&state=second";
const callback = "/api/auth/callback/google" + query;
const originTLS = mode === "gateway-https" || mode === "untrusted-https";
function request(path, headers = {}, { tls = false, target = "shared", method = "GET" } = {}) {
  if (originTLS) { tls = true; target = peerIP; }
  return new Promise((resolve, reject) => {
    const req = (tls ? https : http).request({
      hostname: target, port: tls ? 443 : 80, path, method,
      servername: originTLS ? "" : domain, ...(tls ? { ca: readFileSync("/fixtures/root.crt") } : {}),
      headers: { Host: domain, ...headers },
    }, res => {
      let body = "";
      res.on("data", chunk => { body += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on("error", reject);
    req.setTimeout(5000, () => req.destroy(new Error("Local proxy request timed out")));
    req.end();
  });
}
const gatewayHeaders = { "X-Forwarded-Proto": "https", "X-Forwarded-Host": domain, "X-Forwarded-For": "203.0.113.66, 198.51.100.8" };
if (mode === "untrusted" || mode === "untrusted-https") {
  const response = await request(callback, gatewayHeaders);
  assert.equal(response.status, 403, "Untrusted peer cannot spoof gateway headers");
} else if (mode === "gateway" || mode === "gateway-https") {
  for (const [path, service] of [["/", "frontend"], ["/schedule", "frontend"], ["/apiary", "frontend"], ["/api", "backend"], ["/api/", "backend"], [callback, "backend"]]) {
    const response = await request(path, { ...gatewayHeaders, Cookie: "session=synthetic-cookie", Forwarded: "for=evil;proto=http;host=evil.invalid", "X-Real-IP": "203.0.113.66", "X-Forwarded-Port": "1234", "CF-Connecting-IP": "203.0.113.66", "True-Client-IP": "203.0.113.66" });
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.location, undefined, "HTTP origin does not redirect HTTPS gateway traffic");
    const upstream = JSON.parse(response.body);
    assert.equal(upstream.service, service);
    assert.equal(upstream.url, path, "Full URI including encoded/repeated query parameters survives");
    assert.equal(upstream.headers.host, domain);
    assert.equal(upstream.headers["x-forwarded-host"], domain);
    assert.equal(upstream.headers["x-forwarded-proto"], "https");
    assert.equal(upstream.headers["x-forwarded-for"], "198.51.100.8", "Right-to-left parsing ignores a spoofed leftmost address");
    assert.equal(upstream.headers.cookie, "session=synthetic-cookie");
    for (const name of ["forwarded", "x-real-ip", "x-forwarded-port", "cf-connecting-ip", "true-client-ip"]) assert.equal(upstream.headers[name], undefined, name);
    assert.equal(response.headers["set-cookie"].length, 2, "Multiple cookies survive with security attributes");
    assert.match(response.headers["set-cookie"][0], /Secure; HttpOnly; SameSite=Lax/);
  }
  for (const [header, value, status] of [["Host", "evil.invalid", 421], ["X-Forwarded-Host", "evil.invalid", 400], ["X-Forwarded-Proto", "http", 400], ["X-Forwarded-Proto", "https, http", 400], ["X-Forwarded-Proto", "", 400]]) {
    assert.equal((await request(callback, { ...gatewayHeaders, [header]: value })).status, status);
  }
  const post = await request("/api/auth/sign-in/social", gatewayHeaders, { method: "POST" });
  assert.equal(JSON.parse(post.body).method, "POST");
} else if (mode === "direct") {
  const redirect = await request(callback, gatewayHeaders, { target: "direct" });
  assert.equal(redirect.status, 308);
  assert.equal(redirect.headers.location, `https://${domain}${callback}`);
  for (const [path, service] of [["/", "frontend"], ["/api", "backend"], [callback, "backend"]]) {
    const response = await request(path, { "X-Forwarded-Proto": "http", "X-Forwarded-Host": "evil.invalid", "X-Forwarded-For": "203.0.113.66" }, { tls: true, target: "direct" });
    assert.equal(response.status, 200);
    const upstream = JSON.parse(response.body);
    assert.equal(upstream.service, service);
    assert.equal(upstream.url, path);
    assert.equal(upstream.headers.host, domain);
    assert.equal(upstream.headers["x-forwarded-proto"], "https");
    assert.equal(upstream.headers["x-forwarded-host"], domain);
    assert.equal(upstream.headers["x-forwarded-for"], peerIP, "Direct mode ignores every client-supplied proxy IP");
  }
} else if (mode === "failure") {
  assert.equal((await request(callback, gatewayHeaders)).status, 502);
} else if (mode === "application") {
  const health = await request("/api/health", gatewayHeaders);
  assert.equal(health.status, 200);
  assert.deepEqual(JSON.parse(health.body), { status: "ok", service: "wangmai-api" });
  assert.equal((await request("/api/v1/me", gatewayHeaders)).status, 401);
  assert.equal((await request("/api/auth/get-session", gatewayHeaders)).body, "null");
  for (const path of ["/", "/login"]) assert.equal((await request(path, gatewayHeaders)).status, 200);
  for (const path of ["/schedule", "/availability", "/settings"]) {
    const response = await request(path, gatewayHeaders);
    assert.equal(response.status, 307);
    assert.equal(new URL(response.headers.location, `https://${domain}`).href, `https://${domain}/login`);
  }
  const denied = await request("/api/auth/callback/google?error=access_denied", gatewayHeaders);
  assert.equal(denied.status, 302);
  assert.equal(new URL(denied.headers.location).origin, `https://${domain}`);
} else throw new Error("Unknown smoke mode");
console.log(`PASS: ${mode} proxy checks`);
