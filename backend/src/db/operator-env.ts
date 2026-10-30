import { readFileSync } from "node:fs";
import { identifier } from "./role-model.js";

export function secret(source: NodeJS.ProcessEnv, key: string) {
  const file = source[`${key}_FILE`];
  if (file && source[key]) throw new Error("Ambiguous database secret source");
  const value = file ? readFileSync(file, "utf8").replace(/\r?\n$/, "") : source[key];
  if (!value || /[\r\n\0]/.test(value)) throw new Error("Missing or invalid database secret");
  return value;
}

export function migrationEnvironment(source: NodeJS.ProcessEnv = process.env) {
  const production = source.NODE_ENV === "production";
  const connectionString = production || source.MIGRATION_DATABASE_URL || source.MIGRATION_DATABASE_URL_FILE
    ? secret(source, "MIGRATION_DATABASE_URL") : secret(source, "DATABASE_URL");
  const url = new URL(connectionString);
  if (!["postgresql:", "postgres:"].includes(url.protocol) || !url.username || !url.password || url.search || url.hash) throw new Error("Invalid migration target");
  const migrationRole = source.DATABASE_MIGRATION_ROLE;
  const runtimeRole = source.DATABASE_RUNTIME_ROLE;
  if (production) {
    if (!migrationRole || !runtimeRole || migrationRole === runtimeRole || decodeURIComponent(url.username) !== migrationRole) throw new Error("Invalid migration identity");
    identifier(migrationRole); identifier(runtimeRole);
  } else if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      decodeURIComponent(url.pathname.slice(1)) !== (source.POSTGRES_DB ?? "wangmai") ||
      Number(url.port || 5432) !== Number(source.POSTGRES_PORT ?? 5432)) throw new Error("Unsafe development migration target");
  return { connectionString, production, migrationRole, runtimeRole };
}
