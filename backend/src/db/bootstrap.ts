import { createHash, createHmac, pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";
import pg from "pg";
import { applicationTables, identifier } from "./role-model.js";
import { secret } from "./operator-env.js";

function scram(password: string, salt = randomBytes(16), iterations = 4096) {
  const salted = pbkdf2Sync(password, salt, iterations, 32, "sha256");
  const stored = createHash("sha256").update(createHmac("sha256", salted).update("Client Key").digest()).digest("base64");
  const server = createHmac("sha256", salted).update("Server Key").digest("base64");
  return `SCRAM-SHA-256$${iterations}:${salt.toString("base64")}$${stored}:${server}`;
}
function matches(password: string, verifier: string | null) {
  const parts = verifier?.match(/^SCRAM-SHA-256\$(\d+):([^$]+)\$(.+)$/);
  if (!parts || Number(parts[1]) > 1000000) return false;
  const candidate = Buffer.from(scram(password, Buffer.from(parts[2]!, "base64"), Number(parts[1])));
  const existing = Buffer.from(verifier!);
  return candidate.length === existing.length && timingSafeEqual(candidate, existing);
}

export async function bootstrap(source: NodeJS.ProcessEnv = process.env) {
  const admin = source.POSTGRES_USER ?? "";
  const runtime = source.POSTGRES_RUNTIME_USER ?? "";
  const migrator = source.POSTGRES_MIGRATION_USER ?? "";
  for (const role of [admin, runtime, migrator]) identifier(role);
  if (new Set([admin, runtime, migrator]).size !== 3 || !source.POSTGRES_DB) throw new Error("Distinct roles and database are required");
  const adminPassword = secret(source, "POSTGRES_ADMIN_PASSWORD");
  const credentials = [[runtime, secret(source, "POSTGRES_RUNTIME_PASSWORD")], [migrator, secret(source, "POSTGRES_MIGRATION_PASSWORD")]] as const;
  if (new Set([adminPassword, ...credentials.map(([, password]) => password)]).size !== 3 ||
    [adminPassword, ...credentials.map(([, password]) => password)].some((value) => !/^[\x21-\x7e]{24,}$/.test(value) || /change_me|replace-with/i.test(value))) throw new Error("Independent strong ASCII database secrets are required");
  const pool = new pg.Pool({ host: source.PGHOST ?? "postgres", port: Number(source.PGPORT ?? 5432),
    database: source.POSTGRES_DB, user: admin, password: adminPassword, max: 1, connectionTimeoutMillis: 5000, statement_timeout: 10000 });
  pool.on("error", () => console.error("Database bootstrap connection failed"));
  try {
    await pool.query("BEGIN");
    try {
      const { rows: [authority] } = await pool.query(`SELECT current_user = $1 AND rolsuper AND
        EXISTS (SELECT 1 FROM pg_database WHERE datname = current_database() AND datdba = r.oid) AS allowed
        FROM pg_roles r WHERE rolname = $1`, [admin]);
      if (!authority?.allowed) throw new Error("Explicit database initialization administrator is required");
      // Do not let server error/duration statement logging expose credential verifiers.
      await pool.query("SET LOCAL log_statement = 'none'");
      await pool.query("SET LOCAL log_min_error_statement = 'panic'");
      await pool.query("SET LOCAL log_min_duration_statement = -1");
      await pool.query("SET LOCAL log_parameter_max_length = 0");
      await pool.query("SET LOCAL log_parameter_max_length_on_error = 0");
      await pool.query("SELECT pg_advisory_xact_lock(628621001)");
      const { rows: [unexpected] } = await pool.query(`SELECT
        EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','drizzle')) OR
        EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname IN ('public','drizzle') AND t.typtype IN ('d','e','r','m'))
        AS objects`);
      if (unexpected.objects) throw new Error("Existing custom functions/types need a separately reviewed bootstrap");
      const { rows: objects } = await pool.query(`SELECT n.nspname, c.relname, c.relkind, pg_get_userbyid(c.relowner) AS owner
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname IN ('public','drizzle') AND c.relkind IN ('r','p','S','v','m','f')`);
      for (const object of objects) {
        const application = object.nspname === "public" && object.relkind === "r" && applicationTables.includes(object.relname);
        const journal = object.nspname === "drizzle" && ((object.relname === "__drizzle_migrations" && object.relkind === "r") ||
          (object.relname === "__drizzle_migrations_id_seq" && object.relkind === "S"));
        if (object.owner !== migrator || !(application || journal)) {
          throw new Error("Existing database requires a separately reviewed ownership cutover");
        }
      }
      for (const [role, password] of credentials) {
        const { rows: [existing] } = await pool.query(`SELECT r.*, EXISTS (SELECT 1 FROM pg_auth_members WHERE member = r.oid OR roleid = r.oid) AS memberships,
          EXISTS (SELECT 1 FROM pg_database WHERE datdba = r.oid) AS owns_database,
          EXISTS (SELECT 1 FROM pg_shdepend WHERE refclassid = 'pg_authid'::regclass AND refobjid = r.oid
            AND dbid NOT IN (0, (SELECT oid FROM pg_database WHERE datname = current_database()))) AS other_database
          FROM pg_authid r WHERE rolname = $1`, [role]);
        if (existing) {
          if (!existing.rolcanlogin || existing.rolsuper || existing.rolcreatedb || existing.rolcreaterole || existing.rolreplication ||
            existing.rolbypassrls || existing.memberships || existing.owns_database || existing.other_database || !matches(password, existing.rolpassword)) {
            throw new Error("Existing role or secret differs; no automatic demotion, rotation or reassignment");
          }
        } else {
          await pool.query(`CREATE ROLE ${identifier(role)} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT PASSWORD '${scram(password)}'`);
        }
      }
      const schemas = await pool.query("SELECT nspname, pg_get_userbyid(nspowner) AS owner FROM pg_namespace WHERE nspname IN ('public','drizzle')");
      for (const schema of schemas.rows) {
        if (schema.owner !== migrator && !(schema.nspname === 'public' && objects.length === 0 && [admin, 'pg_database_owner'].includes(schema.owner))) {
          throw new Error("Existing schema owner differs; ownership cutover must be reviewed");
        }
      }
      const database = `"${source.POSTGRES_DB.replaceAll('"', '""')}"`;
      await pool.query(`REVOKE ALL ON DATABASE ${database} FROM PUBLIC, ${identifier(runtime)}, ${identifier(migrator)}`);
      await pool.query(`GRANT CONNECT ON DATABASE ${database} TO ${identifier(runtime)}, ${identifier(migrator)}`);
      // Drizzle issues CREATE SCHEMA IF NOT EXISTS on every run; PostgreSQL checks
      // database CREATE even when the journal schema already exists. Runtime never gets it.
      await pool.query(`GRANT CREATE ON DATABASE ${database} TO ${identifier(migrator)}`);
      await pool.query(`ALTER SCHEMA public OWNER TO ${identifier(migrator)}`);
      await pool.query(`CREATE SCHEMA IF NOT EXISTS drizzle AUTHORIZATION ${identifier(migrator)}`);
      await pool.query(`REVOKE ALL ON SCHEMA public FROM PUBLIC, ${identifier(runtime)}`);
      await pool.query(`GRANT USAGE ON SCHEMA public TO ${identifier(runtime)}`);
      await pool.query(`REVOKE ALL ON SCHEMA drizzle FROM PUBLIC, ${identifier(runtime)}`);
      await pool.query(`ALTER DEFAULT PRIVILEGES FOR ROLE ${identifier(migrator)} REVOKE ALL ON TABLES FROM PUBLIC, ${identifier(runtime)}`);
      await pool.query(`ALTER DEFAULT PRIVILEGES FOR ROLE ${identifier(migrator)} REVOKE ALL ON SEQUENCES FROM PUBLIC, ${identifier(runtime)}`);
      await pool.query(`ALTER DEFAULT PRIVILEGES FOR ROLE ${identifier(migrator)} REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, ${identifier(runtime)}`);
      for (const schema of ["public", "drizzle"]) {
        for (const object of ["TABLES", "SEQUENCES", "FUNCTIONS"]) {
          await pool.query(`ALTER DEFAULT PRIVILEGES FOR ROLE ${identifier(migrator)} IN SCHEMA ${schema} REVOKE ALL ON ${object} FROM PUBLIC, ${identifier(runtime)}`);
        }
      }
      await pool.query(`ALTER ROLE ${identifier(runtime)} IN DATABASE ${database} SET search_path = pg_catalog, public`);
      await pool.query(`ALTER ROLE ${identifier(migrator)} IN DATABASE ${database} SET search_path = public, pg_catalog`);
      await pool.query("COMMIT");
    } catch (error) { await pool.query("ROLLBACK"); throw error; }
  } finally { await pool.end(); }
}

bootstrap().then(() => console.info("Database role bootstrap completed; run the separate migrator before API startup"))
  .catch(() => { console.error("Database bootstrap failed. Inspect role, secret and ownership prerequisites privately; existing data was not reset."); process.exitCode = 1; });
