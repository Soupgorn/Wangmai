import assert from "node:assert/strict";
import https from "node:https";
import http from "node:http";
import tls from "node:tls";
import { readFileSync } from "node:fs";
const address = process.argv[2];
const ca = readFileSync("/fixtures/root.crt");
const request = (options) => new Promise((resolve, reject) => {
  const req = https.get({ hostname: address, port: 443, servername: "", agent: false, headers: { host: "wangmai.invalid", "x-forwarded-proto": "https", "x-forwarded-host": "wangmai.invalid" }, timeout: 5000, ...options }, response => {
    response.resume(); response.once("end", () => resolve(response.statusCode));
  }); req.once("error", error => reject(Object.assign(new Error(`TLS test request rejected: ${error.reason ?? error.code}`), { code: error.code }))); req.once("timeout", () => req.destroy(new Error("TLS test timed out")));
});
assert.equal(await request({ ca }), 200, "IP SAN is verified against the actual origin address without DNS SNI");
assert.equal(await request({ ca, servername: "origin.invalid" }), 200, "Explicit supported DNS identity is verified");
await assert.rejects(request({}), error => /CERT|ISSUER|VERIFY/.test(error.code), "Untrusted chain is rejected");
await assert.rejects(request({ ca, servername: "wrong.invalid" }), error => /CERT|ALTNAME|TLS|EPROTO/.test(error.code), "Mismatched identity is rejected");
await assert.rejects(request({ ca, checkServerIdentity: (_host, cert) => tls.checkServerIdentity("192.0.2.99", cert) }), { code: "ERR_TLS_CERT_ALTNAME_INVALID" });
const plain = await new Promise((resolve, reject) => {
  const req = http.get({ hostname: address, port: 443, path: "/api/auth/callback/google?code=synthetic-oauth-marker", timeout: 5000 }, response => {
    response.resume(); response.once("end", () => resolve(response.statusCode));
  }); req.once("error", reject); req.once("timeout", () => req.destroy(new Error("Plain HTTP test timed out")));
});
assert.equal(plain, 400, "HTTP on the TLS port must not reach upstreams or redirect");
console.log("PASS: trusted chain, DNS/IP SAN verification, unknown CA, wrong DNS/IP and HTTP-on-TLS rejection");
