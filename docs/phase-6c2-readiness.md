# Phase 6C.2 PostgreSQL least-privilege report

30 October 2026, Asia/Bangkok. **Code/configuration implemented and locally tested.
Production deployment remains BLOCKED.** No VM connection, Docker installation,
production database/role/migration change, DNS/CloudStack/OAuth edit, commit, push,
merge or automatic deployment was performed.

## Baseline and preserved work

Branch `infra/cloudstack-launch`, HEAD `59a763d4ea8a0f6fdcae368b6bcf7857670dcc25`.
Phase 6C.1 is reviewed and present in the **uncommitted working baseline**, not a
merged/committed release. Its direct/shared ingress overrides and Caddy files were
reviewed and retained unchanged. Existing untracked files/backups were preserved.
No reset/clean or unrelated-file overwrite was used. The three Drizzle migrations
and application schema definitions were not changed.

Protected file hashes remained unchanged during this phase:

- `frontend/next-env.d.ts`: `0F70629890B72A0A82E91972CC032C04B658B26C265373CB711CF576BFBF8FCC`.
- `docs/phase-6b-readiness.md`: `1BBA7B6B67448FBFF842A2B8567900E0560DBF320B36E6112281B5A5F562D6E9`.
- `docs/phase-6c1-readiness.md`: `9B37D7FDB4FEE47C43588AEE7657FD3F2B07ED08C41EDD270894E2D190EC8DDA`.

Existing development PostgreSQL and prior backup/restore artifacts were not used by
the rehearsal. Only uniquely named test clusters, their newly created volumes,
temporary fixture files and test networks were removed. The local smoke backend
image is retained for review; it is not a reviewed production image/tag.

## Files changed in Phase 6C.2

| File | Purpose |
| --- | --- |
| `backend/src/config/env.ts` | Require explicit production runtime identity, prevent URI role/target overrides |
| `backend/src/db/bootstrap.ts` (new) | Operator-only transactional role/schema bootstrap, SCRAM passwords, conservative idempotency/refusal rules |
| `backend/src/db/operator-env.ts` (new) | Separate migration env/file loading; no production runtime fallback |
| `backend/src/db/role-model.ts` (new) | Explicit seven-table grants and live runtime/migration role checks |
| `backend/src/db/migrate.ts` | Separate non-superuser migration pool, serialization, reviewed grants and restore-only grant mode |
| `backend/src/db/check.ts`, `backend/src/index.ts` | Live runtime privilege checks, including API startup refusal |
| `backend/tests/unit.test.ts` | Role/env separation and native-development compatibility regressions |
| `backend/tests/database-roles.test.ts` (new) | Real runtime auth/schedule/availability operations and forbidden-privilege tests |
| `compose.yaml` | Runtime-only backend credentials, no steady-state PG init password, distinct role metadata and final-TCP readiness |
| `compose.database-init.yaml` (new) | Explicit first-init-only admin password file |
| `compose.database-ops.yaml` (new) | Isolated one-shot bootstrap/migration services and minimal file secrets |
| `.env.production.example` | Three identities, runtime URI and protected operator-file paths |
| `infra/deployment/ops.py` | Static/operator/live preflight, owner-safe empty-target restore and role-aware isolated restore drill |
| `infra/deployment/test_ops.py`, `infra/deployment/test_compose.py` | Guard actual role/credential/service boundaries and retain ingress/release protections |
| `infra/deployment/role_smoke.py` (new) | Fresh disposable cluster, API/integration/privilege/recovery rehearsal |
| `infra/smoke/.env.example` | Required nonsecret role metadata; historical Phase 6A image fixture remains explicitly legacy |
| `.github/workflows/ci.yaml` | Unit/role rehearsal checks; no deployment or publication job |
| `README.md`, `docs/cloudstack-deployment.md` | Replace the shared-credential production procedure with role-separated commands |
| `docs/postgresql-role-security.md` (new) | Exact model, secret delivery, init/migration/backup/recovery runbook |
| `docs/phase-6c2-readiness.md` (new) | This evidence and limitation report |

## Database architecture and exact grants

See the complete [role/bootstrap/recovery runbook](postgresql-role-security.md).
Names are environment-driven; the production example uses:

| Identity | Exact operational privileges |
| --- | --- |
| `wangmai_admin` | Explicit initialization/administrative identity, database owner/superuser; never supplied to API/frontend; password file only in initial PostgreSQL and one-shot bootstrap |
| `wangmai_migrator` | Non-superuser LOGIN/NOINHERIT, no CREATEDB/CREATEROLE/REPLICATION/BYPASSRLS or role memberships; CONNECT and CREATE on the app database, no TEMP; owns public/drizzle schemas, app objects, migration journal and its sequence |
| `wangmai_runtime` | Non-superuser LOGIN/NOINHERIT, same forbidden flags/no memberships; CONNECT without grant option, public USAGE without grant option; SELECT/INSERT/UPDATE/DELETE without grant options on exactly seven application tables |

Runtime tables: `user`, `account`, `session`, `verification`, `schedule_entry`,
`schedule_exception`, `schedule_preference`. No application sequences exist, so
runtime has **zero sequence grants**. Runtime has no schema/database/relation/function
ownership, CREATE/TEMP/DDL/TRUNCATE/REFERENCES/TRIGGER/MAINTAIN privileges, journal
access, inherited privileges or ability to SET ROLE to admin/migrator. Ordinary
PostgreSQL catalog visibility/built-in functions remain available. User privacy and
authorization still depend on the existing Hono logic; no RLS change was introduced.

Drizzle's actual `CREATE SCHEMA IF NOT EXISTS` requires database CREATE even with
an existing journal schema. The live rehearsal initially caught this requirement;
CREATE was granted **only to the controlled migration identity**, not runtime, and
not as the CREATEDB attribute. The migration identity remains powerful within the
application database (including DDL and eligible trusted extensions); its credential
must remain outside all long-running application services.

No blanket runtime default grants are used. Migrator defaults deny PUBLIC/runtime
tables/sequences/functions; per-schema defaults are also constrained. Each migration
explicitly reapplies only the reviewed seven-table CRUD manifest. Future schema or
function additions require an intentional manifest/permission review.

## Configuration, bootstrap and migration behavior

`DATABASE_URL` remains the backend-only runtime URI. Compose passes the configured
`DATABASE_RUNTIME_ROLE`; production validation rejects another URI username, query
overrides and missing identity. API startup checks catalog attributes, membership,
ownership and exact privileges before listening. A separate migration env parser
accepts `MIGRATION_DATABASE_URL_FILE` (or an inline protected provider secret), plus
`DATABASE_MIGRATION_ROLE`/runtime role metadata; it requires no runtime/admin/auth
credential. Production migration never falls back to DATABASE_URL. Native local
development keeps its prior guarded localhost migration workflow.

Base PostgreSQL has no initialization password or secret mount. Fresh PGDATA requires
the explicit database-init override; after initialization, recreate only PostgreSQL
from base config to remove that mount/env while retaining its named volume. TCP health
checking avoids mistaking the image's temporary socket-only initialization server
for final readiness. Bootstrap/migrator use the reviewed backend image as non-root,
on only the internal DB network, with no host ports, dropped capabilities, bounded
logs, no-new-privileges and restart `no`. Existing app health/restart/log restrictions,
named volumes, database network and full-SHA/pinned-image guards remain.

Bootstrap creates missing roles safely and serializes its transaction. It verifies
existing role attributes, memberships, password verifiers, cross-database dependencies,
schema/object owners and the actual object allowlist. It refuses unexpected objects,
custom functions/types, unsafe existing roles or changed passwords without automatic
demotion, reassignment, credential rotation or data deletion. Role passwords use
independent 24+ printable ASCII characters and SCRAM verifiers; generic errors never
print password/URI values. Protected operator secret files stay outside the build
context and are never passed to frontend/backend steady-state configuration.

`preflight` checks strict steady-state settings; `preflight-db` adds operator service
and secret-file checks; explicit `preflight-runtime` validates settings and invokes
a runtime-only one-shot live privilege check without starting dependencies/building/
pulling images. This action is prepared for future authorized operator use; its live
checker and invalid-credential refusal were verified locally. Startup repeats the
same role check. Filesystem ownership/readability on the eventual Linux VM remains
an operator gate; Windows local tests do not establish Linux secret-file permissions.

The three existing migrations are unchanged. The production migrator checks its
identity/schema ownership, serializes runs with a session advisory lock, invokes
Drizzle, then applies exact grants transactionally. Reruns are safe. `--grant-only`
reapplies ACLs after restore without applying pending migrations. No API startup
bootstrap, migration, seed, automatic cutover or automatic deployment was added.

## Executed commands and final results

| Command/check | Result |
| --- | --- |
| `npm run build --workspace=@wangmai/shared` | Passed |
| `npm test` | **7 backend + 34 frontend unit tests passed** |
| `npm run lint --workspace=@wangmai/backend` | Passed |
| `npm run typecheck --workspace=@wangmai/backend` | Passed, including test types |
| `npm run build --workspace=@wangmai/backend` | Passed |
| `python -B -m unittest discover -s infra/deployment -p 'test_*.py' -v` | **26 passed**; includes preserved original guards and new role/secret/live-preflight checks |
| `python -u -B infra/deployment/role_smoke.py` | Fresh/repeated bootstrap, migrations/replay, runtime privileges, app operations and owner-safe restore passed |
| `docker build -f backend/Dockerfile -t wangmai-backend:phase6c2-roles-smoke .` | Passed; runtime configured as `node` |
| `python -u -B infra/deployment/role_smoke.py --backend-image wangmai-backend:phase6c2-roles-smoke` | **7 production-role checks + all 38 existing backend integration tests passed**; runtime-only API starts, admin API credentials fail, extra grants/grant options/membership detected; real-image restore helper also passed |
| `python -u -B infra/deployment/proxy_smoke.py` | Existing direct/shared routing/header/callback/cookie/TLS/secret-safe failure tests passed |
| Actual Compose rendering | Both ingress modes and explicit DB tools/init rendered; normal services exclude operator credentials; init config is rejected as steady state |
| Local Markdown-link checks and all runbook Bash blocks with `bash -n` | Passed; procedure commands were not executed |
| `git diff --check`, protected-file hashes, empty staging check | Passed |

Current local smoke image ID:
`sha256:4c14c86360da4c2cb9d0400d5ae45a69a543e4c009a7cba43256f0a1307b33da`.
This is a local dirty-checkout smoke artifact, **not** a full-SHA release image or
vulnerability approval. It was neither pushed nor used on the VM.

The test runner never loads `.env`, strips database/provider secret environment
variables, requires a local Docker socket, and creates uniquely named source/restore
clusters. Native tests use only ephemeral 127.0.0.1 ports on a new bridge with
inter-container communication disabled. Operator files are private temporary public
fixtures. The independent restore drill uses network none/shared isolated loopback.
New test resources are removed afterward; existing user data/artifacts are preserved.

The production-role test runs with production library behavior and includes CSRF
rejection. The legacy integration suite is run in its intended development process
mode while its env parser uses test database targets: Better Auth's global NODE_ENV
test default disables origin checks. No application security option was disabled
to make these tests pass. The rehearsal also exposed a temporary-server readiness
race; health/readiness probes now explicitly use TCP. Early harness failures were
corrected without weakening runtime or production credential validation.

## Backup/restore findings

The binary-safe backup helper remains administrative and separate from backend
credentials. The fixture archive and SHA-256 sidecar were checked and restored into
a **new empty bootstrapped database** under the migration identity using no-owner,
no-privileges, single-transaction restore and a filtered schema TOC list. No archive,
source data or journal was rewritten. Runtime ACLs were deliberately reapplied.

Exact source/target row-content fingerprints matched for **all seven application
tables plus the Drizzle journal**, including synthetic account/session/verification,
schedule, recurrence-exception and sharing-preference data. Restored migration
ownership/live runtime checks passed. A second restore into that nonempty target
was rejected before changing data. The standalone isolated restore helper also
passed with the newly built backend image.

Database dumps do not carry cluster role/password provisioning. Replaying old owners
or ACLs, or restoring as the admin without a migration owner, is not the approved
workflow. New roles/bootstrap and explicit runtime grant application are required.
Keep both original/recovery volumes, use the recovery override in every command,
retain the auth secret and exact release, and validate schema/data/account behavior
before separately authorizing traffic. Production off-VM recovery/RPO/RTO remains
unverified. The legacy superuser-owned database cutover is prepared as a fresh-volume
restore path; it was not performed on any existing database.

## Remaining production blockers and Phase 6D

The Phase 6B database privilege **implementation** finding is resolved locally.
No claim is made about roles/permissions on an actual VM. Production remains blocked
on all applicable launch gates:

- Reviewed/committed release, immutable retained image digests and vulnerability approval.
- NaCl exact gateway sources, header contract, origin source restrictions and full
  authenticated/confidential HTTP-hop transport evidence; reported 502 diagnosis.
- Authorized VM/storage/resource/network/firewall inventory, durable disk/encryption,
  console recovery, Docker readiness and protected operator access.
- Real independent database/auth secrets, Linux secret ownership/readability,
  production OAuth/client/consent readiness, and future live role provisioning checks.
- Encrypted off-VM backups, restore evidence, assigned operations/retention and RPO/RTO.
- Real Google account acceptance, persisted-session/schedule/sharing behavior and
  measured capacity on the approved deployment. No real Google exchange occurred here.

Phase 6D should first collect read-only VM/network/storage evidence and the missing
NaCl contract, review a concrete fresh-VM Docker/firewall/storage/secret preparation
plan, and approve release/backup/recovery prerequisites. Only after separate execution
authorization should operators initialize the approved persistent volume, run the
separate bootstrap/migration tools, validate live runtime permissions and perform
the later launch acceptance. Do not open ingress merely because local tests pass.

Application business logic remains environment-driven and hosting-provider independent.
No NaCl address/domain/API or Caddy dependency was introduced into application source;
Vercel compatibility remains preserved at the application-architecture level, without
implementing or claiming a tested Vercel deployment.
