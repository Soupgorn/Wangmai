import type pg from "pg";

export const applicationTables = ["user", "account", "session", "verification", "schedule_entry", "schedule_exception", "schedule_preference"] as const;
export function identifier(value: string) {
  if (!/^[a-z][a-z0-9_]{2,62}$/.test(value) || value.startsWith("pg_")) throw new Error("Invalid database role name");
  return `"${value}"`;
}

export async function assertIdentity(pool: pg.Pool | pg.PoolClient, role: string, migration = false) {
  identifier(role);
  const { rows: [row] } = await pool.query(`SELECT current_user = $1 AND session_user = $1 AS identity,
    NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls) AND rolcanlogin AS safe,
    NOT EXISTS (SELECT 1 FROM pg_auth_members WHERE member = r.oid OR roleid = r.oid) AS no_memberships,
    NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = current_database() AND datdba = r.oid) AS not_database_owner,
    has_database_privilege($1, current_database(), 'CREATE') = $2 AND
    NOT has_database_privilege($1, current_database(), 'TEMP') AS no_database_ddl
    FROM pg_roles r WHERE rolname = $1`, [role, migration]);
  if (!row || !Object.values(row).every(Boolean)) throw new Error("Unsafe database role identity or attributes");
}

export async function assertRuntimeRole(pool: pg.Pool | pg.PoolClient, role: string) {
  await assertIdentity(pool, role);
  const { rows: [row] } = await pool.query(`SELECT
    has_database_privilege($1, current_database(), 'CONNECT') AND NOT has_database_privilege($1,current_database(),'CONNECT WITH GRANT OPTION') AS connect,
    has_schema_privilege($1, 'public', 'USAGE') AND NOT has_schema_privilege($1, 'public', 'CREATE,USAGE WITH GRANT OPTION') AS public_usage_only,
    NOT has_schema_privilege($1, 'drizzle', 'USAGE') AND NOT has_schema_privilege($1, 'drizzle', 'CREATE') AS no_journal_schema,
    NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspowner = (SELECT oid FROM pg_roles WHERE rolname = $1)) AS no_schema_ownership,
    NOT EXISTS (SELECT 1 FROM pg_class WHERE relowner = (SELECT oid FROM pg_roles WHERE rolname = $1)) AS no_relation_ownership,
    NOT EXISTS (SELECT 1 FROM pg_proc WHERE proowner = (SELECT oid FROM pg_roles WHERE rolname = $1)) AS no_function_ownership,
    NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname <> 'information_schema'
      AND has_schema_privilege($1,oid,'CREATE')) AS no_schema_create,
    NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema' AND has_function_privilege($1,p.oid,'EXECUTE')) AS no_custom_function_access,
    NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema' AND c.relkind IN ('r','p','v','m','S','f')
      AND (CASE WHEN c.relkind = 'S' THEN has_sequence_privilege($1,c.oid,'USAGE,SELECT,UPDATE')
        WHEN n.nspname = 'public' AND c.relname = ANY($2::text[]) THEN
          NOT (has_table_privilege($1,c.oid,'SELECT') AND has_table_privilege($1,c.oid,'INSERT') AND
            has_table_privilege($1,c.oid,'UPDATE') AND has_table_privilege($1,c.oid,'DELETE')) OR
          has_table_privilege($1,c.oid,'TRUNCATE,REFERENCES,TRIGGER,MAINTAIN,SELECT WITH GRANT OPTION,INSERT WITH GRANT OPTION,UPDATE WITH GRANT OPTION,DELETE WITH GRANT OPTION') OR
          has_any_column_privilege($1,c.oid,'REFERENCES,SELECT WITH GRANT OPTION,INSERT WITH GRANT OPTION,UPDATE WITH GRANT OPTION,REFERENCES WITH GRANT OPTION')
        ELSE has_table_privilege($1,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') OR
          has_any_column_privilege($1,c.oid,'SELECT,INSERT,UPDATE,REFERENCES') END)) AS exact_table_permissions,
    (SELECT count(*) = 7 FROM pg_tables WHERE schemaname = 'public' AND tablename = ANY($2::text[])) AS all_tables
    `, [role, [...applicationTables]]);
  if (!Object.values(row).every(Boolean)) throw new Error("Runtime database privilege contract failed");
}

export async function assertMigrationRole(pool: pg.Pool | pg.PoolClient, role: string) {
  await assertIdentity(pool, role, true);
  const result = await pool.query(`SELECT count(*) = 2 AS owned FROM pg_namespace
    WHERE nspname IN ('public','drizzle') AND nspowner = (SELECT oid FROM pg_roles WHERE rolname = $1)`, [role]);
  if (!result.rows[0].owned) throw new Error("Migration schema ownership contract failed");
}

export async function grantRuntimeTables(client: pg.Pool | pg.PoolClient, runtime: string) {
  const role = identifier(runtime);
  for (const table of applicationTables) {
    await client.query(`REVOKE ALL ON TABLE public."${table}" FROM PUBLIC, ${role}`);
    await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."${table}" TO ${role}`);
  }
  // No application sequences exist: UUID/text identifiers require no grants.
  // No blanket table/sequence defaults: future objects require explicit review.
}
