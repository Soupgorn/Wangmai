import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { loadEnv } from "../src/config/env.js";
import { migrationEnvironment } from "../src/db/operator-env.js";

const base = {
  NODE_ENV: "test", DATABASE_URL: "postgresql://local:local@localhost:5432/wangmai",
  BETTER_AUTH_URL: "http://localhost:3000", BETTER_AUTH_SECRET: randomBytes(48).toString("base64url"),
};
test("environment accepts local PostgreSQL without Google credentials", () => {
  assert.equal(loadEnv(base).GOOGLE_CLIENT_ID, undefined);
  assert.equal(loadEnv({ ...base, GOOGLE_CLIENT_ID: "replace-with-google-client-id", GOOGLE_CLIENT_SECRET: "" }).GOOGLE_CLIENT_ID, undefined);
});
test("environment refuses remote databases, unexpected database/port and query host overrides during development", () => {
  for (const DATABASE_URL of ["postgresql://a:b@production.example.com/wangmai", "postgresql://a:b@localhost/production", "postgresql://a:b@localhost:9999/wangmai", "postgresql://a:b@localhost/wangmai?host=production.example.com", "https://localhost/wangmai"]) {
    assert.throws(() => loadEnv({ ...base, DATABASE_URL }), /DATABASE_URL/);
  }
});
test("environment rejects weak secrets, malformed origins and incomplete credentials without leaking values", () => {
  for (const override of [{ BETTER_AUTH_SECRET: "replace-with-secret-that-is-at-least-32-characters" }, { BETTER_AUTH_URL: "invalid-url" }, { BETTER_AUTH_URL: "http://localhost:3000/path" }, { GOOGLE_CLIENT_ID: "sensitive-value" }]) {
    assert.throws(() => loadEnv({ ...base, ...override }), (error: Error) => !error.message.includes("sensitive-value") && !error.message.includes(base.BETTER_AUTH_SECRET));
  }
});
test("production requires HTTPS and real configuration", () => {
  assert.throws(() => loadEnv({ ...base, NODE_ENV: "production" }), /BETTER_AUTH_URL|GOOGLE_CLIENT_ID/);
});
test("production runtime requires its own explicit identity and refuses URL overrides", () => {
  const production = { ...base, NODE_ENV: "production", DATABASE_RUNTIME_ROLE: "app_runtime", DATABASE_URL: "postgresql://app_runtime:testing-only@postgres/wangmai",
    BETTER_AUTH_URL: "https://calendar.invalid", GOOGLE_CLIENT_ID: "test-client", GOOGLE_CLIENT_SECRET: "test-secret" };
  assert.equal(loadEnv(production).DATABASE_RUNTIME_ROLE, "app_runtime");
  for (const override of [{ DATABASE_RUNTIME_ROLE: undefined }, { DATABASE_RUNTIME_ROLE: "admin" }, { DATABASE_URL: production.DATABASE_URL + "?user=admin" }]) {
    assert.throws(() => loadEnv({ ...production, ...override }), /DATABASE_URL/);
  }
});
test("production migration never falls back to runtime or needs Google/auth secrets", () => {
  const source = { NODE_ENV: "production", DATABASE_URL: "postgresql://app_runtime:sensitive-runtime@postgres/wangmai",
    DATABASE_RUNTIME_ROLE: "app_runtime", DATABASE_MIGRATION_ROLE: "app_migrator" };
  assert.throws(() => migrationEnvironment(source), /Missing/);
  const valid = { ...source, MIGRATION_DATABASE_URL: "postgresql://app_migrator:sensitive-migrator@postgres/wangmai" };
  assert.equal(migrationEnvironment(valid).migrationRole, "app_migrator");
  for (const override of [{ DATABASE_MIGRATION_ROLE: "app_runtime" }, { MIGRATION_DATABASE_URL: source.DATABASE_URL },
    { MIGRATION_DATABASE_URL: valid.MIGRATION_DATABASE_URL + "?host=remote" }, { MIGRATION_DATABASE_URL_FILE: "not-read-when-ambiguous" }]) {
    assert.throws(() => migrationEnvironment({ ...valid, ...override }), (error: Error) => !error.message.includes("sensitive-"));
  }
});
test("native development migrations retain guarded local DATABASE_URL compatibility", () => {
  assert.equal(migrationEnvironment(base).production, false);
  assert.throws(() => migrationEnvironment({ ...base, DATABASE_URL: "postgresql://test:test@remote/wangmai" }), /Unsafe/);
});
