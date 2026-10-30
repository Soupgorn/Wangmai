# PostgreSQL production role separation — Phase 6C.2

This procedure is preparation only. **No VM access or production changes are
authorized by this document.** Use a dedicated Wangmai PostgreSQL 18 cluster and an
approved maintenance/recovery plan. Keep the Phase 6C.1 ingress security gates.

## Identity and exact permission model

Role names are configurable metadata; the examples use three distinct login roles:

| Identity | Scope and permissions | Credential delivery |
| --- | --- | --- |
| `wangmai_admin` | Initialization superuser and database owner; provisions/validates roles and schemas; explicit administrative backup/recovery | Password file mounted only for first initialization and the one-shot bootstrap tool; never the API/frontend |
| `wangmai_migrator` | NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOREPLICATION, NOBYPASSRLS, NOINHERIT; no memberships; database CONNECT and CREATE, no TEMP; owns `public`, `drizzle`, application tables/indexes/constraints, and Drizzle journal/sequence | Separate connection file mounted only into the one-shot migrator |
| `wangmai_runtime` | Same nonadministrative flags, no memberships, no database/schema/relation/function ownership; database CONNECT, public-schema USAGE, SELECT/INSERT/UPDATE/DELETE on exactly seven tables | Existing backend-only `DATABASE_URL` |

The runtime tables are `public.user`, `account`, `session`, `verification`,
`schedule_entry`, `schedule_exception`, `schedule_preference`. Runtime has no
TRUNCATE, REFERENCES, TRIGGER, MAINTAIN, grant options, DDL, schema CREATE, database
CREATE/TEMP, or access to `drizzle`. Text/UUID identifiers use no application
sequences; **no sequence privileges** are granted to runtime. The serial sequence
`drizzle.__drizzle_migrations_id_seq` belongs only to the migrator. PostgreSQL's
ordinary catalog visibility and built-in functions remain available; this is not
row-level isolation between application users. Hono's existing authorization/privacy
checks still enforce ownership and sharing.

The migrator's database **CREATE privilege is distinct from the CREATEDB role
attribute**. The installed Drizzle migrator issues `CREATE SCHEMA IF NOT EXISTS` on
every run; PostgreSQL requires database CREATE even if that schema exists. This was
verified locally. The migrator therefore has CREATE on this database, but cannot
create databases/roles, bypass RLS, replicate, become admin, or assume another role.
It is a privileged DDL identity and must never run in the API process. Its DDL power
includes creating schemas and eligible trusted extensions inside this database.

Bootstrap revokes PUBLIC CONNECT/TEMP/CREATE on the application database and PUBLIC
schema access, then grants the exact model above. There are no blanket runtime table
or sequence default grants. Migrator-created functions have no default PUBLIC
EXECUTE. Both global and public/drizzle per-schema defaults are constrained. Each
successful production migration explicitly reapplies CRUD to the seven-table
allowlist; future tables/sequences/functions require a reviewed manifest/grant change.
The migration grant transaction removes direct extra privileges on those exact
tables. API startup checks live catalog permissions, ownership, memberships and
role attributes and refuses to start on missing/excess privileges. It also rejects
accessible nonapplication tables/functions and any schema CREATE privilege.

This follows PostgreSQL's [schema security model](https://www.postgresql.org/docs/18/ddl-schemas.html)
and [object/default privilege rules](https://www.postgresql.org/docs/18/sql-alterdefaultprivileges.html).
For a managed/shared cluster, separately review provider/HBA restrictions on access
to other databases. Bootstrap never changes another database or a shared provider's
role policy. The same environment-driven Next.js/Hono architecture remains portable.

## Environment and protected files

Use `.env.production.example`; never overwrite local `.env` or put operator secrets
in frontend variables. All names below are actual configuration, not recommendations:

| Setting | Value |
| --- | --- |
| `POSTGRES_USER` | Initialization/admin login, e.g. `wangmai_admin` |
| `POSTGRES_DB` | Dedicated application database |
| `POSTGRES_RUNTIME_USER` | Dedicated runtime role |
| `POSTGRES_MIGRATION_USER` | Dedicated migration role, distinct from runtime/admin |
| `DATABASE_URL` | Runtime URI to internal `postgres:5432/DB`; URL-encode its password |
| `POSTGRES_ADMIN_PASSWORD_FILE` | Host path containing admin password only |
| `POSTGRES_RUNTIME_PASSWORD_FILE` | Host path containing runtime password only; matches runtime URI |
| `POSTGRES_MIGRATION_PASSWORD_FILE` | Host path containing migration password only |
| `MIGRATION_DATABASE_URL_FILE` | Host path containing the migration URI, same DB/internal host with migration identity |

Compose passes `DATABASE_RUNTIME_ROLE` to the backend from `POSTGRES_RUNTIME_USER`.
Only the migrator receives `DATABASE_MIGRATION_ROLE` and its URL-file path. Migration
configuration does not require Google/auth/runtime credentials and **never falls
back to DATABASE_URL in production**. For another hosting provider, the one-shot
tool can instead receive `MIGRATION_DATABASE_URL` through that provider's protected
secret mechanism. File and inline values together are rejected. Native development
retains its guarded localhost `DATABASE_URL` migration workflow.

Generate three independent printable ASCII passwords without whitespace, each at
least 24 characters; auth secrets stay
independent and at least 32 characters. Prefer generated hexadecimal/URL-safe values.
Store them outside the repository/build context. Files contain one value, with at
most a trailing newline; do not source them. Keep
protected off-VM copies. No password rotation happens implicitly on rerun.

On the future approved Linux host, make the secret directory private and files mode
600, owned by the approved tool UID (currently `node`, UID 1000 in the official Node
image; verify the reviewed image). Compose file secrets are read-only bind mounts,
not an encrypted secret store, and cannot reliably change host-file ownership using
`uid`/`mode`. Ensure the non-root tools can read their files; do not loosen to world
readable. Docker administrators can access all container secrets and are effectively
root. Restrict host access, preserve encryption at rest/in transit, and never dump
full Compose models, service environments, connection strings or query parameters.

`preflight` validates steady-state boundaries, URI/runtime identity, strong runtime
password, distinct role names and all existing release/ingress guards. `preflight-db`
additionally validates tool isolation, secret-file readability/permissions, independent
strong passwords and matching migration target/credentials. Neither proves live
roles: the explicit `preflight-runtime` action runs a one-shot runtime-only catalog
check after bootstrap/migrations or restore, without starting API/dependencies or
building/pulling an image. API startup repeats the same live contract check.

## Explicit future command wrappers

Use the reviewed `INGRESS_MODE`, `dc()` and `CADDY_CONFIG` from the
[deployment runbook](cloudstack-deployment.md#0-select-ingress-explicitly-and-verify-the-gateway-contract).
Do not source the env file. Compose >=2.24.4 and the reviewed local Docker context
are prerequisites. Build/retain the reviewed full-SHA backend image first; the new
bootstrap/guard tools must be present. No application starts while this DB work runs.

```bash
dbo() { docker compose --project-name wangmai --env-file .env.production -f compose.yaml -f "compose.$INGRESS_MODE.yaml" -f compose.database-ops.yaml --profile database-ops "$@"; }
dbinit() { docker compose --project-name wangmai --env-file .env.production -f compose.yaml -f "compose.$INGRESS_MODE.yaml" -f compose.database-init.yaml "$@"; }
python3 infra/deployment/ops.py preflight --ingress-mode "$INGRESS_MODE" --env-file .env.production
python3 infra/deployment/ops.py preflight-db --ingress-mode "$INGRESS_MODE" --env-file .env.production
```

Database tools use the exact backend image tag, non-root image user, dropped
capabilities, `no-new-privileges`, bounded logs, restart `no`, and only the private
database network. The profile is opt-in. No app/database host port is added. Never
add either database override to the normal `dc()` wrapper or start the tools with
an unqualified `up`. All database operations below are future operator actions.

## Fresh database initialization and migrations

First inspect the existing project, named volume, storage mapping and data. **Stop
if anything already exists with unreviewed state.** Do not select a new empty volume
to hide an existing installation or delete/reinitialize a volume. The following is
only for a confirmed first installation on the approved persistent volume:

```bash
dc ps -a
docker volume ls
# First initialization mounts only the administrator password into PostgreSQL.
dbinit up -d --wait --no-build --pull never postgres
# Remove the initialization mount/env by recreating only PostgreSQL from base config.
# Named postgres_data is preserved; no application has started yet.
dc up -d --wait --no-deps --no-build --pull never --force-recreate postgres
# First role setup is explicit, never a docker-entrypoint auto-script.
dbo run --rm --no-deps bootstrap
dbo run --rm --no-deps migrator
# Repeating these is supported with unchanged valid roles/credentials.
dbo run --rm --no-deps bootstrap
dbo run --rm --no-deps migrator
python3 infra/deployment/ops.py preflight-runtime --ingress-mode "$INGRESS_MODE" --env-file .env.production
```

Steady-state PostgreSQL contains no `POSTGRES_PASSWORD`, `POSTGRES_PASSWORD_FILE`
or mounted operator secret. Empty PGDATA fails closed without the first-init
override. PostgreSQL retains its named `/var/lib/postgresql` volume and the normal
restart/health/log policies. Admin password remains a stored SCRAM verifier in the
database; host-controlled local administrative socket access remains available to
the explicit operator backup/recovery workflow.

Bootstrap is transactionally serialized. It creates missing safe roles, makes the
fresh application's schemas migrator-owned, restricts grants/defaults, and validates
existing roles and supplied passwords without replacing them. It refuses unsafe
flags, memberships, cross-database role dependencies, unexpected public/drizzle
objects, another object's owner, or changed credentials. It does not demote an
existing superuser, reset passwords, reassign an existing schema's tables, or delete
data. A fresh default public schema can be assigned to the migrator; existing
admin-owned application data requires the reviewed recovery/cutover procedure.
Bootstrap sends SCRAM verifiers rather than plaintext passwords in role DDL and
suppresses statement/error-parameter logging for its administrative session.

The three existing SQL migrations and their journal are unchanged. The production
migrator checks its live identity/ownership, holds a session advisory lock across
Drizzle and the subsequent grant transaction, applies pending migrations, and
reapplies runtime grants. API startup never migrates/bootstrap/seeds. Do not use
schema push, seed, generation or concurrent unreviewed migration jobs in production.

## Verification and routine updates

```bash
dc run --rm --no-deps backend node backend/dist/db/check.js
dc exec -T postgres sh -eu -c 'exec psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
BEGIN READ ONLY;
SELECT rolname, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls
FROM pg_roles WHERE rolname IN (SELECT tableowner FROM pg_tables WHERE schemaname='public');
SELECT schemaname, tablename, tableowner FROM pg_tables WHERE schemaname IN ('public','drizzle');
SELECT count(*) AS applied_migrations FROM drizzle.__drizzle_migrations;
COMMIT;
SQL
```

The runtime guard itself checks the authenticated `current_user`/`session_user`,
role attributes, memberships, database/schema powers, ownership, all seven table
permissions, journal/sequence denial and nonapplication object access. It emits
only a generic pass/failure. Use the isolated rehearsal below for forbidden-write
tests; do not try destructive DDL against production to prove a negative.

For future updates, freeze writes/stop API and ingress, take and verify an off-VM
backup, run `dbo run --rm --no-deps migrator` with the retained reviewed new image,
then check runtime privileges before separately authorized app startup. Bootstrap
is not a credential-rotation or automatic ownership-cutover tool. Retain the auth
secret and exact application/environment/schema versions for recovery.

## Backup and owner-safe restore

Existing binary-safe `ops.py backup` still uses an explicit Docker administrative
socket operation inside PostgreSQL, never the backend's credentials. It creates an
exclusive custom-format dump, SHA-256 sidecar and private file, preserving partial
files on failure. Protect off-VM copies; dumps contain private data and sessions.

```bash
dc stop caddy frontend backend
python3 infra/deployment/ops.py backup --ingress-mode "$INGRESS_MODE" --env-file .env.production --destination /srv/wangmai/backups
read -r -p 'Completed trusted dump archive: ' BACKUP_ARCHIVE
python3 infra/deployment/ops.py verify-backup --ingress-mode "$INGRESS_MODE" --env-file .env.production --archive "$BACKUP_ARCHIVE"
```

`verify-backup` requires the retained current backend image with the new tools. It
starts a new PostgreSQL container/volume with network `none`; temporary backend
tool containers share only that isolated loopback. It uses **public fixture** roles,
bootstraps them, restores as migrator, reapplies grants, checks live runtime
permissions and reports administrative counts. It never receives production secrets
or joins production networks. The stopped container/volume is retained for operator
review and must never be promoted. Compare counts with the source during a write
freeze and verify off-VM encryption/checksums/RPO/RTO separately.

Roles/passwords are cluster-wide and are **not** restored by a database dump. Source
ownership and ACLs must not be replayed. Bootstrap the target identities first;
`ops.py restore` checks the checksum and refuses a nonempty public/drizzle target,
filters only their already-created schema TOC entries, then runs PostgreSQL restore
with `--role MIGRATOR --no-owner --no-privileges --single-transaction`. The original
archive is unchanged. Use trusted, release-compatible archives: restore can execute
SQL and is not a sandbox for untrusted dumps. See [PostgreSQL restore options](https://www.postgresql.org/docs/18/app-pgrestore.html).

For a future authorized recovery or a legacy superuser-owned installation, preserve
the original volume/data. Use a verified backup, new reviewed recovery volume and
the exact recovery override from the main runbook. Update *all* wrappers, including
database-init/tools, to include that recovery file. Initialize/bootstrap the new
target before restore; **never run the original raw admin-owned restore command**.

```bash
# RECOVERY_VOLUME and compose.recovery.yaml must already have passed the runbook's
# unique-new-volume, source preservation and backup-approval gates.
rc() { docker compose --project-name wangmai --env-file .env.production -f compose.yaml -f "compose.$INGRESS_MODE.yaml" -f compose.recovery.yaml "$@"; }
rinit() { docker compose --project-name wangmai --env-file .env.production -f compose.yaml -f "compose.$INGRESS_MODE.yaml" -f compose.recovery.yaml -f compose.database-init.yaml "$@"; }
ro() { docker compose --project-name wangmai --env-file .env.production -f compose.yaml -f "compose.$INGRESS_MODE.yaml" -f compose.recovery.yaml -f compose.database-ops.yaml --profile database-ops "$@"; }
rinit up -d --wait --no-deps --no-build --pull never --force-recreate postgres
rc up -d --wait --no-deps --no-build --pull never --force-recreate postgres
ro run --rm --no-deps bootstrap
python3 infra/deployment/ops.py restore --ingress-mode "$INGRESS_MODE" --env-file .env.production --recovery-file compose.recovery.yaml --archive "$BACKUP_ARCHIVE" --confirm-empty-restore
# Reapply ACLs without applying pending migrations during restore.
ro run --rm --no-deps migrator node backend/dist/db/migrate.js --grant-only
rc run --rm --no-deps backend node backend/dist/db/check.js
```

Compare source/target data and journal, repeat account/schedule/sharing acceptance,
confirm schema compatibility and obtain startup approval before reopening traffic.
Restore does not start the app. After recovery, keep the recovery override in every
command, including helpers' `--recovery-file`; otherwise Compose can select the old
volume. Never delete either volume, run `down -v`/prune, or perform automatic in-place
role demotion/ownership transfer. Credential rotation needs a separate reviewed plan.

## Local rehearsal and remaining gates

With local Node 24/dependencies and local PostgreSQL image already available:

```bash
npm run build --workspace=@wangmai/shared
python3 -B -m unittest discover -s infra/deployment -p 'test_*.py' -v
npm test
python3 -u -B infra/deployment/role_smoke.py
# Optional current image path also proves ops.py's standalone isolated restore drill.
docker build -f backend/Dockerfile -t wangmai-backend:phase6c2-roles-smoke .
python3 -u -B infra/deployment/role_smoke.py --backend-image wangmai-backend:phase6c2-roles-smoke
```

The runner refuses remote Docker contexts, never loads `.env`/production values,
creates unique source/target clusters, and exposes only ephemeral loopback test
ports on a unique bridge with inter-container traffic disabled. Existing application
networks, databases, backups and volumes are not attached. Public fixtures exercise
bootstrap reruns/refusals, all three migrations/replay, runtime-only API startup,
Google-linked account/session/verification operations, schedule CRUD/recurrence,
sharing/Who's Free, forbidden DDL/escalation, excess-grant detection, exact data/journal
fingerprints after restore, and nonempty-target refusal. It also runs all existing
backend integration tests against its disposable administrator database. Those legacy
tests retain development process mode because Better Auth's global test mode skips
origin checks; the new role tests run in production mode and explicitly test CSRF.
No real Google exchange or production credentials are used.

Local role separation closes the Phase 6B **code/configuration** privilege-design
finding; it does not prove any VM database has been provisioned or cut over. Production
remains BLOCKED on NaCl source/header/confidentiality evidence, VM/storage/Docker and
firewall readiness, protected real credentials/OAuth setup, immutable image/security
approval, encrypted off-VM backups/restore/RPO/RTO and real account/capacity acceptance.
