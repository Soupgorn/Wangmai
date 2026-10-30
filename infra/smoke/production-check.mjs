import assert from "node:assert/strict";
import https from "node:https";
import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const origin = "https://wangmai.invalid";
const phase = process.argv[2];
const stateFile = "/fixtures/session-state.json";
const registryFile = "/fixtures/oauth-control.json";
const jar = () => ({});
const state = phase === "initial" ? { a: jar(), b: jar() } : JSON.parse(readFileSync(stateFile, "utf8"));
function request(path, { actor = {}, method = "GET", body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname: "gateway", port: 443, servername: "wangmai.invalid", ca: readFileSync("/fixtures/root.crt"),
      path, method, headers: { host: "wangmai.invalid", origin, cookie: Object.entries(actor).map(([key, value]) => `${key}=${value}`).join("; "),
        ...(body ? { "content-type": "application/json" } : {}),
        ...(process.env.PROVIDER_SPOOF_HEADERS === "1" ? { "x-forwarded-for": "203.0.113.66, 198.51.100.8", "x-forwarded-host": "evil.invalid",
          "x-forwarded-proto": "http", "x-wangmai-client-ip": "203.0.113.66", forwarded: "for=evil;proto=http;host=evil.invalid" } : {}),
        ...headers } }, res => {
      let text = "";
      res.on("data", chunk => { text += chunk; });
      res.on("end", () => {
        for (const cookie of res.headers["set-cookie"] ?? []) {
          const [pair] = cookie.split(";"); const split = pair.indexOf("=");
          actor[pair.slice(0, split)] = pair.slice(split + 1);
        }
        resolve({ status: res.statusCode, headers: res.headers, text, json: () => JSON.parse(text) });
      });
    });
    req.on("error", reject); req.setTimeout(14000, () => req.destroy(new Error("Simulation request timed out")));
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}
async function signIn(actor, subject, negative) {
  let started;
  for (let attempt = 0; attempt < 3; attempt++) {
    started = await request("/api/auth/sign-in/social", { actor, method: "POST", body: { provider: "google", callbackURL: "/schedule" } });
    if (started.status !== 429) break;
    // Keep the real production limiter enabled; respect its bounded retry window.
    const seconds = Number(started.headers["x-ratelimit-reset"] ?? started.headers["retry-after"] ?? 11);
    await new Promise(resolve => setTimeout(resolve, Math.min(15, Math.max(11, seconds)) * 1000));
  }
  assert.equal(started.status, 200);
  const authorization = new URL(started.json().url);
  assert.equal(authorization.origin, "https://accounts.google.com");
  assert.equal(authorization.searchParams.get("redirect_uri"), `${origin}/api/auth/callback/google`);
  assert.equal(authorization.searchParams.get("code_challenge_method"), "S256");
  const code = `simulation-code-${subject}-${randomUUID()}`;
  const registry = JSON.parse(readFileSync(registryFile, "utf8"));
  registry[code] = { subject, challenge: negative === "pkce" ? "wrong-challenge" : authorization.searchParams.get("code_challenge"),
    nonce: authorization.searchParams.get("nonce"), redirectURI: `${origin}/api/auth/callback/google`, invalidToken: negative };
  writeFileSync(registryFile, JSON.stringify(registry));
  const callback = `/api/auth/callback/google?${new URLSearchParams({ code, state: negative === "state" ? "wrong-state" : authorization.searchParams.get("state") })}`;
  const result = await request(callback, { actor });
  assert.equal(result.status, 302);
  assert.equal(new URL(result.headers.location, origin).origin, origin);
  if (negative) {
    assert.notEqual(new URL(result.headers.location, origin).pathname, "/schedule", `Reject invalid OAuth ${negative}`);
    assert.equal((await request("/api/v1/me", { actor })).status, 401);
  } else {
    assert.equal(new URL(result.headers.location, origin).pathname, "/schedule");
    const cookie = result.headers["set-cookie"].find(value => value.startsWith("__Secure-better-auth.session_token="));
    assert.ok(cookie); assert.match(cookie, /Secure/i); assert.match(cookie, /HttpOnly/i); assert.match(cookie, /SameSite=Lax/i);
    assert.match(cookie, /Path=\//); assert.doesNotMatch(cookie, /Domain=/i);
    assert.equal((await request("/api/v1/me", { actor })).status, 200);
    // Replaying the already-consumed callback must not issue a fresh session.
    const replay = await request(callback, { actor: {} });
    assert.equal(replay.status, 302);
    assert.ok(!replay.headers["set-cookie"]?.some(value => value.startsWith("__Secure-better-auth.session_token=")));
  }
}
const readSchedule = async () => (await request("/api/v1/me/schedule", { actor: state.a })).json();
const write = async (path, method, body) => request(`/api/v1/me${path}`, { actor: state.a, method, body, headers: { "if-match": `"${(await readSchedule()).revision}"` } });
const search = () => request("/api/v1/availability?startDate=2026-12-31&endDate=2027-01-01&startTime=13%3A00&endTime=15%3A00&timezone=Asia%2FBangkok", { actor: state.b });

if (phase === "initial") {
  assert.equal((await request("/api/health")).status, 200);
  assert.equal((await request("/api/ready")).status, 200);
  assert.equal((await request("/health/ready")).status, 200);
  assert.equal((await request("/schedule")).status, 307);
  assert.equal((await request("/api/v1/me")).status, 401);
  const malicious = await request("/api/auth/sign-in/social", { method: "POST", body: { provider: "google", callbackURL: "https://evil.invalid" } });
  assert.equal(malicious.status, 403);
  for (const negative of ["state", "pkce", "audience", "issuer", "expired", "signature"]) await signIn({}, `negative-${negative}`, negative);
  await signIn(state.a, "SimulationA"); await signIn(state.b, "SimulationB");
  state.owner = (await request("/api/v1/me", { actor: state.a })).json().user.id;
  assert.equal((await readSchedule()).shareAvailability, false);
  const weekly = { title: "private-synthetic-weekly-title", kind: "available", start: "13:00", end: "17:00", timing: { type: "weekly", weekday: 4 } };
  assert.equal((await write("/schedule/entries", "POST", { mutationId: randomUUID(), entry: weekly })).status, 201);
  state.recurring = (await readSchedule()).blocks[0].id;
  assert.equal((await write(`/schedule/entries/${state.recurring}`, "PATCH", { end: "16:00" })).status, 200);
  assert.equal((await write("/schedule/preferences", "PATCH", { shareAvailability: true })).status, 200);
  let found = (await search()).json();
  assert.deepEqual(found.counts, { anyDay: 1, everyDay: 0 });
  const dated = { ...weekly, timing: { type: "date", date: "2027-01-01" } };
  assert.equal((await write("/schedule/entries", "POST", { mutationId: randomUUID(), entry: dated })).status, 201);
  assert.deepEqual((await search()).json().counts, { anyDay: 1, everyDay: 1 });
  assert.equal((await write(`/schedule/entries/${state.recurring}/exceptions/2026-12-31`, "PUT", { replacement: null })).status, 200);
  found = (await search()).json(); assert.deepEqual(found.counts, { anyDay: 1, everyDay: 0 });
  assert.ok(!JSON.stringify(found).includes(weekly.title)); assert.ok(!JSON.stringify(found).includes("@example.invalid"));
  assert.equal((await write("/schedule/preferences", "PATCH", { shareAvailability: false })).status, 200);
  assert.deepEqual((await search()).json().people, []);
  assert.equal((await write("/schedule/preferences", "PATCH", { shareAvailability: true })).status, 200);
  const bSchedule = (await request("/api/v1/me/schedule", { actor: state.b })).json();
  assert.equal((await request(`/api/v1/me/schedule/entries/${state.recurring}`, { actor: state.b, method: "PATCH", body: { title: "stolen" }, headers: { "if-match": `"${bSchedule.revision}"` } })).status, 404);
  const removed = (await readSchedule()).blocks.find(value => value.timing.type === "date");
  assert.equal((await write(`/schedule/entries/${removed.id}`, "DELETE")).status, 200);
  const csrf = await request("/api/auth/sign-out", { actor: state.b, method: "POST", body: {}, headers: { origin: "https://evil.invalid" } });
  assert.equal(csrf.status, 403);
  assert.equal((await request("/api/auth/sign-out", { actor: state.b, method: "POST", body: {} })).status, 200);
  assert.equal((await request("/api/v1/me", { actor: state.b })).status, 401);
  writeFileSync(stateFile, JSON.stringify(state));
} else if (phase === "persist" || phase === "slow") {
  assert.equal((await request("/api/v1/me", { actor: state.a })).json().user.id, state.owner);
  const schedule = await request("/api/v1/me/schedule", { actor: state.a });
  assert.equal(schedule.status, 200);
  assert.equal(schedule.json().shareAvailability, true);
  assert.equal(schedule.json().blocks[0].id, state.recurring);
  assert.deepEqual(schedule.json().blocks[0].excludedDates, ["2026-12-31"]);
  if (phase === "persist") {
    const html = await request("/schedule", { actor: state.a }); assert.equal(html.status, 200);
    const asset = html.text.match(/(?:src|href)="([^"]*\/_next\/static\/[^\"]+)"/);
    assert.ok(asset); assert.equal((await request(asset[1].replaceAll("&amp;", "&"))).status, 200);
  }
} else if (phase === "outage") {
  assert.equal((await request("/api/health")).status, 200);
  for (const path of ["/api/ready", "/health/ready"]) {
    const response = await request(path); assert.equal(response.status, 503); assert.deepEqual(response.json(), { status: "unavailable" });
  }
  const me = await request("/api/v1/me", { actor: state.a }); assert.equal(me.status, 503);
  assert.ok(!me.text.includes("postgresql")); assert.match(me.headers["x-request-id"], /^[a-f0-9-]{36}$/);
  assert.equal((await request("/")).status, 200);
} else throw new Error("Unknown simulation phase");
console.log(`PASS: production simulation ${phase}`);
