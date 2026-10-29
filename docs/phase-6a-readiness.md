# Phase 6A readiness and verification

Verified locally on 30 October 2026 (Asia/Bangkok). **Ready for deployment review;
production launch remains gated on infrastructure and account acceptance.** No
deployment, CloudStack connection, DNS/OAuth change, public certificate request,
commit, push, or merge was performed.

Use the [manual deployment runbook](cloudstack-deployment.md) for exact Ubuntu,
Docker, checkout, environment, DNS/OAuth, migration, startup, update and recovery
commands. Do not execute its production startup section without deployment authorization.

## Baseline

- Branch: `infra/cloudstack-deployment`; initially clean.
- HEAD and fetched `origin/main`: `698704fda9dc0a7d438677c3c2ef9f62a2c3ad37`.
- Main ancestry check passed. Phase 5 PR #5, persistent scheduling, monthly editing,
  unified date selection, and real availability are present.
- Existing multi-stage production Dockerfiles already use standalone Next output,
  compiled Hono/shared packages, production dependencies, and `USER node`.
- Existing migration journal contains 0000 auth, 0001 schedules, 0002 availability
  sharing. None were changed. Normal startup never migrates or seeds.
- Better Auth already requires HTTPS and Google configuration in production, uses
  secure cookies and a fixed trusted origin; no auth architecture changes were needed.

## Files added and modified for this phase

| File | Purpose |
| --- | --- |
| `compose.yaml` | Explicit release tags/domain, configurable pinned infrastructure images, bounded logs, app capability restrictions, graceful shutdown, Caddy health check |
| `infra/caddy/Caddyfile` | Explicit hostname, safe response headers, preserved same-origin API/callback routing |
| `.env.production.example` | Placeholder-only production configuration, separate from localhost |
| `.dockerignore` | Exclude all Next build variants, test artifacts, dumps and backup directories |
| `.gitignore` | Exclude dumps, backups, Python caches, local recovery override |
| `infra/deployment/ops.py` | Secret-safe configuration checks, binary-safe backups, checksum verification, isolated restore drills, explicit recovery override support |
| `infra/deployment/test_ops.py` | Deployment guard/failure-path tests |
| `infra/smoke/compose.yaml` | Separate project and replacement loopback-only HTTP port mapping |
| `infra/smoke/Caddyfile` | Explicit HTTP with automatic HTTPS disabled |
| `infra/smoke/.env.example` | Public test fixtures only; never deployment credentials |
| `infra/smoke/verify.mjs` | Actual production-image routing, authorization, migration and persistence checks |
| `docs/cloudstack-deployment.md` | Detailed manual deployment and recovery runbook |
| `docs/phase-6a-readiness.md` | This evidence and limitation report |
| `README.md` | Entry point to production preparation |

Separate title edits appeared during verification in `frontend/src/app/layout.tsx`
and the authenticated schedule, availability and settings page files. They were
preserved and are not part of the deployment implementation. The browser-generated
`next-env.d.ts` path change was returned to its initial value after tests.

## Verification results

| Check | Actual result |
| --- | --- |
| Production/smoke Compose rendering | PASS; configuration renders without printing secrets |
| Placeholder production environment preflight | EXPECTED REJECTION; domain, credentials, image tags and mutable infrastructure references fail safely |
| Production Caddy validation | PASS; validation container had `--network none`, preventing external requests |
| Frontend Docker build | PASS |
| Backend Docker build | PASS |
| Container app identity | PASS; both UID/GID 1000 (`node`) |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS |
| `npm test` | PASS; 4 backend + 34 frontend unit tests |
| `npm run test:integration` | PASS; 38 tests |
| `npm run test:e2e --workspace=@wangmai/frontend` | PASS; all 53 browser tests, 3.5 minutes |
| `python -m unittest discover -s infra/deployment -p 'test_*.py' -v` | PASS; 11 deployment tests |
| Runbook Bash syntax | PASS; all 13 Bash blocks parsed using `bash -n` |
| `git diff --check` | PASS |

The browser suite covers authentication, persisted schedules, ownership, recurrence,
overrides, real multi-user sharing/results, preview isolation, stale request handling,
motion and reduced motion, at 1440/1024/768/390/320px. Automated OAuth fixtures do not
establish live Google login or production acceptance.

### Production-image smoke and recovery

All four services became healthy in the separate `wangmai-smoke` project. Its only
published listener was `127.0.0.1:8088` (HTTP). The actual Caddy configuration had
automatic HTTPS disabled. Hono/database/frontend ports were never published.

Verified through Caddy: homepage and standalone static assets, health/no-store headers,
security headers, 401s on private APIs, unauthenticated protected-page redirects,
public preview pages, sharing OFF by default, repeatable migrations, and a stored
date-specific schedule surviving PostgreSQL and application container recreation.
The HTTP check uses fresh connections after proxy recreation, with bounded retries.

A custom-format dump and checksum were created from public synthetic smoke fixtures.
An isolated network-disabled PostgreSQL container restored it successfully. Its counts
matched the source: 3 migrations, 1 user, 1 schedule, 0 exceptions, 1 preference.
A second test restored into a fresh Compose volume and confirmed the schedule and
backend connectivity. The source volume was retained. No existing records were reset.

The smoke stack and restore containers are stopped. Evidence retained locally:

- `backups/phase6a/wangmai-20261029T182823Z-2b579d5b.dump` and `.dump.sha256`.
- Original volume: `wangmai-smoke_postgres_data`.
- Isolated restore volume: `wangmai-restorecheck-b36d206aff95-data`.
- Final helper recheck volume: `wangmai-restorecheck-105f873872fd-data`.
- Compose recovery volume: `wangmai-smoke-recovery-98bfd30b9a`.
- Local recovery override: `backups/phase6a/wangmai-smoke-recovery-98bfd30b9a.yaml`.

These are test data, excluded from Git; never promote the restore-check volume,
which uses public fixture credentials. The pre-existing development PostgreSQL
container and data were left running and unchanged.

Built local image IDs (not production release artifacts):

```text
wangmai-frontend:phase6a-smoke sha256:b3856e1b14c785767a415a8abc8fab97fe9867b4d1a75b54058fb3a3fa738113
wangmai-backend:phase6a-smoke  sha256:9aadf2726b48635cb0901757ca2cd189debfc6d87ad3162a389fe0aed44d41be
postgres@sha256:10a5c69a83035ab5239f5620d708520e8b28f5aa1f2b20143e6024532edadfb5
caddy@sha256:eb4d35b7452d1ab6171fbdbe8d9275b2301dad6dad92115d91e19fb9b24d510f
```

## Remaining launch gates and limitations

- VM OS/capacity, durable disks, actual public/NAT addressing and CloudStack/firewall
  rules are unverified. Plan at least 2 vCPU/4 GiB/40 GiB; prefer 4 vCPU/8 GiB/80 GiB
  for on-host builds. Confirm actual load and storage growth operationally.
- No real domain, DNS change, production credentials, or Google Console setup was
  performed. Production callback must be `https://YOUR_DOMAIN/api/auth/callback/google`.
- Public HTTPS, secure-cookie behavior through the real edge, and legitimate
  multi-account production acceptance are **NOT TESTED**. Earlier local account
  acceptance does not satisfy those checks.
- Release SHA/images must be reviewed, pinned, retained and approved under the
  operator's vulnerability policy. No image vulnerability scan was performed here.
- Off-VM encrypted backups, retention, ownership, RPO/RTO and restore-drill cadence
  must be approved. No automated backup job or PITR is installed by this phase.
- The existing PostgreSQL initialization role also serves runtime/migration queries;
  it is a schema-owning superuser, not a separately restricted runtime role. This
  remains an explicit hardening consideration for deployment review. No role/schema
  changes were introduced silently.
- Service health checks measure processes, not full database/schema/OAuth/public TLS
  readiness. Compose startup dependencies are not continuous failover management.
- Database rollback uses a reviewed forward fix or restoration into a fresh volume;
  there are no automatic down-migrations. The single VM remains a failure domain.

Phase 6A is complete at local preparation and verification. Production readiness
requires satisfying these launch gates; deployment has not begun.
