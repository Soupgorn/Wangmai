// Local production-image verification only. No authentication or real user fixtures.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const args = ["compose", "--project-name", "wangmai-smoke", "--env-file", "infra/smoke/.env.example", "-f", "compose.yaml", "-f", "infra/smoke/compose.yaml"];
function dc(...command) {
  const result = spawnSync("docker", [...args, ...command], { encoding: "utf8" });
  assert.equal(result.status, 0, `Smoke command failed: ${command[0]}`);
  return result.stdout;
}
const model = JSON.parse(dc("config", "--format", "json"));
assert.equal(model.name, "wangmai-smoke");
assert.equal(model.services.postgres.environment.POSTGRES_DB, "wangmai_smoke");
assert.deepEqual(model.services.caddy.ports.map(p => [p.host_ip, p.published, p.target]), [["127.0.0.1", "8088", 80]]);
for (const service of ["frontend", "backend", "postgres"]) assert.equal(model.services[service].ports, undefined);
for (const volume of Object.values(model.volumes)) assert.ok(volume.name.startsWith("wangmai-smoke_"));
const caddy = JSON.parse(dc("exec", "-T", "caddy", "wget", "-qO-", "http://127.0.0.1:2019/config/"));
for (const server of Object.values(caddy.apps.http.servers)) {
  assert.equal(server.automatic_https.disable, true);
  assert.deepEqual(server.listen, [":80"]);
}

const origin = "http://127.0.0.1:8088";
const health = await fetch(`${origin}/api/health`);
assert.equal(health.status, 200);
assert.deepEqual(await health.json(), { status: "ok", service: "wangmai-api" });
assert.equal(health.headers.get("cache-control"), "no-store");
assert.equal(health.headers.get("x-content-type-options"), "nosniff");
assert.equal(health.headers.get("server"), null);
for (const path of ["/api/v1/me", "/api/v1/me/schedule", "/api/v1/availability?startDate=2026-10-30&endDate=2026-11-01&startTime=13%3A00&endTime=15%3A00&timezone=Asia%2FBangkok"]) {
  const response = await fetch(origin + path);
  assert.equal(response.status, 401, path);
  assert.equal(response.headers.get("cache-control"), "no-store");
}
for (const path of ["/schedule", "/availability", "/settings"]) {
  const response = await fetch(origin + path, { redirect: "manual" });
  assert.equal(response.status, 307, path);
  assert.equal(new URL(response.headers.get("location"), origin).pathname, "/login");
}
const home = await fetch(origin);
assert.equal(home.status, 200);
const html = await home.text();
const asset = html.match(/(?:src|href)="([^\"]*\/_next\/static\/[^\"]+)"/);
assert.ok(asset, "Production standalone assets are linked");
assert.equal((await fetch(new URL(asset[1].replaceAll("&amp;", "&"), origin))).status, 200);

const sql = query => dc("exec", "-T", "postgres", "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "wangmai_smoke", "-d", "wangmai_smoke", "-Atc", query).trim();
assert.equal(sql("SELECT count(*) FROM drizzle.__drizzle_migrations"), "3");
// Dedicated project/DB guards above prevent these public fixtures reaching real data.
sql(`INSERT INTO public."user" (id, name, email) VALUES ('phase6a-smoke', 'Local persistence fixture', 'phase6a@example.invalid') ON CONFLICT DO NOTHING;
INSERT INTO schedule_preference (user_id) VALUES ('phase6a-smoke') ON CONFLICT DO NOTHING;
INSERT INTO schedule_entry (id,user_id,mutation_id,title,kind,timing,date,start_minute,end_minute)
VALUES ('00000000-0000-4000-8000-000000000006','phase6a-smoke','00000000-0000-4000-8000-000000000006','Local smoke fixture','available','date','2026-10-30',780,900) ON CONFLICT DO NOTHING;`);
assert.equal(sql("SELECT share_availability FROM schedule_preference WHERE user_id='phase6a-smoke'"), "f");
const before = sql("SELECT count(*) FROM schedule_entry");
for (const path of ["/preview/schedule", "/preview/availability", "/preview/settings"]) {
  assert.equal((await fetch(origin + path)).status, 200, path);
}
assert.equal(sql("SELECT count(*) FROM schedule_entry"), before, "Preview reads never persist schedules");
dc("run", "--rm", "--no-deps", "backend", "node", "backend/dist/db/migrate.js");
assert.equal(sql("SELECT count(*) FROM drizzle.__drizzle_migrations"), "3", "Migration replay is idempotent");
dc("up", "-d", "--wait", "--no-deps", "--force-recreate", "postgres");
assert.equal(sql("SELECT title FROM schedule_entry WHERE user_id='phase6a-smoke'"), "Local smoke fixture", "Data survives database container recreation");
dc("up", "-d", "--wait", "--no-build", "--force-recreate", "backend", "frontend", "caddy");
// Recreating the proxy closes previous keep-alive connections. Poll with fresh sockets.
let reconnected = false;
for (let attempt = 0; attempt < 10; attempt++) {
  try {
    const response = await fetch(`${origin}/api/health`, { headers: { Connection: "close" }, signal: AbortSignal.timeout(5000) });
    await response.arrayBuffer();
    if (response.status === 200) { reconnected = true; break; }
  } catch { /* The previous proxy connection may have just closed. */ }
  await new Promise(resolve => setTimeout(resolve, 250));
}
assert.ok(reconnected, "Proxy reconnects after container recreation");
assert.equal(sql("SELECT count(*) FROM schedule_entry"), before);
console.log("PASS: isolated HTTP proxy, production assets, auth gates, preview reads, default privacy, migration replay, DB/app container recreation and persistent schedule.");
