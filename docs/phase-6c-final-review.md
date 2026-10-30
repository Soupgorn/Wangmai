# Phase 6C final review and publication handoff

Reviewed 30 October 2026 (Asia/Bangkok). **Ready for code review; production
activation remains BLOCKED.** This review authorizes feature-branch publication and
a Pull Request only. No VM connection, deployment, production migration/role change,
DNS/CloudStack/OAuth change, merge or automatic deployment was performed.

## Git scope and commit organization

- Starting branch: `infra/cloudstack-launch`.
- Starting HEAD and fetched `origin/main`: `59a763d4ea8a0f6fdcae368b6bcf7857670dcc25`.
- Local `main` was older (`698704f…`) and was left untouched. No dirty-tree merge,
  rebase, history rewrite, forced push, reset or cleanup was used.
- Phase 6C.1 and 6C.2 were both uncommitted. They share Compose, CI, env examples,
  deployment validation/tests and runbook lines. Use one cohesive commit,
  `feat(infra): harden production ingress and database security`, to avoid
  reconstructing intermediate versions of user work solely to split history.
- Include only the 6C configuration, backend security/tools, tests and documentation
  shown in the PR diff. The phase-specific readiness documents record historical
  implementation-time evidence; this document records the new final-review checks.
- Exclude `frontend/next-env.d.ts` (unrelated user-generated change) and
  `docs/phase-6b-readiness.md` (historical local report). Both retain their starting
  hashes. Links to the excluded report now identify it as a local historical artifact.
- Existing backups, ignored local `.env`/credentials, node_modules/build outputs,
  previous test artifacts and unrelated working data remain outside the commit.

## Review findings and corrections

Ingress modes remain explicit and mutually exclusive. Direct Caddy HTTPS/ACME is
retained; shared gateway mode disables origin HTTPS/redirects, accepts only the
verified peer allowlist/Host/header contract, and normalizes forwarding headers.
API/callback paths, encoded/repeated queries and cookies are preserved. No app/DB
ports are published. Request-bearing Caddy access/error logs remain disabled.
Gateway attestations are not external verification; no source CIDRs were invented.

Database initialization/admin, non-superuser migrator and non-superuser runtime
identities remain separate. Runtime has CONNECT, public USAGE and CRUD on the
seven allowlisted app tables, with no ownership, sequence/journal access, DDL,
TRUNCATE, grant options or memberships. The migrator's database CREATE is required
by the installed Drizzle schema command; it is not CREATEDB. Admin/migration secrets
remain confined to explicit one-shot workflows. Bootstrap refuses unsafe existing
state; restore uses a new empty target, migration ownership and explicit grants.

Corrections made during final review:

1. The live runtime guard checked table-level excess privileges but missed column
   REFERENCES and column-level grant options. It now checks both, with real PostgreSQL
   regression cases proving each excess grant blocks the runtime check.
2. The optional proxy application smoke still assumed the pre-6C.2 shared admin
   identity. It now bootstraps separate fixture roles, runs local migrations and starts
   the current API with runtime-only credentials. Both current app images were tested.
3. The database-init comment incorrectly prohibited its use for an approved fresh
   recovery volume. It now distinguishes first initialization from steady state.
4. Documentation no longer depends on committing the historical Phase 6B local report;
   optional proxy smoke instructions reflect the role-aware fixture workflow.

Existing migrations, schema definitions, product UI and auth business logic are
unchanged. Hosting-specific ingress/TLS remains in infrastructure; environment-driven
Next.js/Hono/auth/database architecture remains compatible with future Vercel/provider
adaptation. No Vercel deployment or runtime adapter is implemented or claimed tested.

## Fresh validation executed

Frontend commands ran in an isolated source copy with `npm ci`, the current reviewed
files overlaid, and no local env/user data. This allowed Next typegen/build to generate
its files without touching the excluded original `frontend/next-env.d.ts`.

| Category / executed command | Actual result |
| --- | --- |
| `npm ci --no-audit --no-fund` in isolated copy | Passed |
| `npm run lint` | All workspace ESLint checks passed |
| `npm run typecheck` | Frontend/backend/shared checks passed |
| `npm run build` | Frontend/backend/shared production builds passed |
| `npm test` | 7 backend + 34 frontend unit tests passed |
| `python -B -m unittest discover -s infra/deployment -p 'test_*.py' -v` | All 26 deployment/Compose guards passed |
| Backend and frontend Docker builds, local `phase6c-final-smoke` tags | Passed; both runtime users are `node` |
| `python -u -B infra/deployment/role_smoke.py --backend-image wangmai-backend:phase6c-final-smoke` | 7 role tests and all 38 existing backend integration tests passed; startup, excess-grant regression, migration replay and exact restore fingerprints passed |
| `python -u -B infra/deployment/proxy_smoke.py --node-image wangmai-backend:phase6c-final-smoke --frontend-image wangmai-frontend:phase6c-final-smoke` | Both exact production Caddy configs validate; direct/shared routing, callbacks/queries/cookies, spoof resistance, mode guards, secret-safe 502 logs and current app-image/auth smoke passed |
| Actual Compose rendering | Both ingress modes and DB init/operations overrides passed; incompatible/base-only modes and unsafe credentials are rejected |
| Production-template preflight, each ingress mode | Expected rejection; no security requirement relaxed |
| `node --check` for proxy fixtures/checks | Passed |
| Local documentation-link checks and runbook `bash -n` | Passed; runbook commands were not executed |
| `git diff --check`, excluded-file hash comparison | Passed |

Only disposable, uniquely named local fixtures were used. No production credentials,
accounts or user records were read. All new smoke containers/networks/fixture volumes
were removed; existing local workloads/backups were preserved. Smoke image tags are
local review artifacts, not approved full-SHA release artifacts or vulnerability
acceptance. Remote CI status must be checked separately on the actual published head.

## Remaining blockers and Phase 6D

Code readiness does not establish production readiness. Still required:

- NaCl gateway TCP source CIDRs/failover/SNAT evidence, header sanitization and
  vhost/HTTPS behavior, Docker-aware origin restrictions, and authenticated confidential
  transport covering the entire HTTP origin hop. Private addressing/ACLs alone do
  not establish confidentiality. The reported 502 cause remains unconfirmed.
- Read-only Ubuntu VM resource/storage/network/firewall inventory, console recovery,
  durable encrypted storage, safe Docker preparation and approved operator access.
- Real protected independent secrets, Linux secret-file UID/readability verification,
  approved Google OAuth/client/consent settings and live database role initialization.
- Reviewed immutable release images/security approval; encrypted off-VM backup and
  restore acceptance, retention/operator ownership and approved RPO/RTO.
- Production Google login, persistence/privacy/multi-user acceptance and capacity checks.

Phase 6D should collect the missing evidence and review a concrete Ubuntu preparation
plan for storage, Docker, firewall/source rules, secret ownership, backups and retained
release artifacts. VM mutations, database initialization/migrations and later launch
require separate authorization after those gates; PR publication/CI does not authorize
any deployment. Do not merge automatically or enable automatic CD.
