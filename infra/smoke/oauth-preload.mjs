// TEST ONLY: loaded explicitly by the disposable simulation, never an app entrypoint.
// The real auth implementation still verifies state, PKCE and Google JWT claims.
import { generateKeyPairSync, createHash, sign } from "node:crypto";
import { readFileSync } from "node:fs";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const kid = "wangmai-simulation-key";
const used = new Set();
const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
globalThis.fetch = async (input, options) => {
  const url = input instanceof Request ? input.url : String(input);
  if (url === "https://www.googleapis.com/oauth2/v3/certs") {
    return Response.json({ keys: [{ ...publicKey.export({ format: "jwk" }), kid, use: "sig", alg: "RS256" }] });
  }
  if (url !== "https://oauth2.googleapis.com/token") throw new Error("Unmocked outbound request blocked in simulation");
  const form = new URLSearchParams(options?.body?.toString());
  const code = form.get("code");
  const registry = JSON.parse(readFileSync("/fixtures/oauth-control.json", "utf8"));
  const entry = registry[code];
  if (!entry || used.has(code) || form.get("redirect_uri") !== entry.redirectURI ||
      createHash("sha256").update(form.get("code_verifier") ?? "").digest("base64url") !== entry.challenge) {
    return Response.json({ error: "invalid_grant" }, { status: 400 });
  }
  used.add(code);
  const now = Math.floor(Date.now() / 1000);
  const payload = { iss: "https://accounts.google.com", aud: "simulation.apps.googleusercontent.com", sub: entry.subject,
    email: `${entry.subject}@example.invalid`, email_verified: true, name: entry.subject, iat: now, exp: now + 3600,
    ...(entry.nonce ? { nonce: entry.nonce } : {}),
    ...(entry.invalidToken === "audience" ? { aud: "untrusted-client" } : {}),
    ...(entry.invalidToken === "issuer" ? { iss: "https://evil.invalid" } : {}),
    ...(entry.invalidToken === "expired" ? { iat: now - 7200, exp: now - 3600 } : {}) };
  const data = `${encode({ alg: "RS256", kid, typ: "JWT" })}.${encode(payload)}`;
  const signature = entry.invalidToken === "signature" ? Buffer.alloc(256).toString("base64url") : sign("RSA-SHA256", Buffer.from(data), privateKey).toString("base64url");
  const token = `${data}.${signature}`;
  return Response.json({ access_token: "synthetic-private-provider-token", token_type: "Bearer", expires_in: 3600, id_token: token, scope: "openid email profile" });
};
