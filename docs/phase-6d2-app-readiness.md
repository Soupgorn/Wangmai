# Phase 6D.2 — Application production readiness

Production activation is **BLOCKED**. This phase changes application reliability,
tests and operator-controlled release preparation. It does not deploy, contact the
VM, modify Google settings, issue a public certificate, or push release images.

## Baseline and audit

Started from primary checkout `infra/cloudstack-launch` at
`e3a7c02f0eeb7b8376e54ab7e2d14503cb22ed71`. Fetched and verified Phase 6C in
`origin/main` at `55e147df6f7ead7414a8edb2a136395d224f6506` (merged PR #7).
Used a separate worktree and `infra/phase-6d-app-readiness`; primary checkout's
modified `frontend/next-env.d.ts`, historical untracked Phase 6B report, credentials,
backups and other local files remain outside this change.

| Finding | Classification | Resolution |
| --- | --- | --- |
| Google redirect callback in installed Better Auth decodes ID-token claims without invoking its exported JWT verifier | Critical production blocker | Supported Google provider hook verifies signature, issuer, configured audience, expiry, required claims and maximum age before account linking or persistence; negative simulation exercises each check |
| Existing health route only proves process liveness | High reliability | Preserve it and add dependency readiness; Docker probes readiness |
| Auth JSON clone/parse precedes a body bound | High security | 64 KiB limit before parsing, including streamed bodies |
| Startup exits on a single transient connection failure; short shutdown window | High reliability | Bounded retry of transient errors, mandatory role check before listen, request drain before closing pool |
| Frontend production silently defaults to a localhost backend | High reliability | Explicit validated server-only API origin; failed readiness on missing configuration |
| Runtime accepts some example secret values despite strict operator preflight | High security | Reject placeholders, short runtime DB password and malformed production Google client ID |
| Release artifacts do not bind immutable base/source/image content together | High release reliability | Clean tracked-source build, pinned Node digest, full-SHA tags, OCI revision, checked local artifact manifest |
| Multi-replica rate limits/central operational metrics/capacity tuning | Optional improvements | Preserve existing in-memory Better Auth limiter; assess distribution and capacity before scaling; no new telemetry |

Reviewed Next configuration/session rendering, Hono startup/routes, Better Auth,
database client and role checks, all three unchanged migrations, schedule and
availability authorization/validation, error boundaries, logs, Dockerfiles, Caddy,
Compose and production preflight. No stable feature semantics or schema changed.

## Startup, liveness and readiness

The backend validates environment first, connects with the runtime identity, retries
only transient connection failures up to five times (one-second gaps), and verifies
the Phase 6C runtime privilege contract **before listening**. Authentication errors,
missing schema and unsafe privileges fail closed. It never runs migrations.

| Check | Meaning | Healthy / failure |
| --- | --- | --- |
| `GET /api/health` | Existing Hono liveness | 200 even during a DB outage |
| `GET /api/ready` | Hono can query PostgreSQL after successful startup | 200 / 503, only `status` |
| `GET /health/ready` | Next process can reach the configured internal API readiness | 200 / 503, only `status` |
| `GET /` | Existing public frontend rendering/liveness | Does not require PostgreSQL |

Readiness is uncached. Hono coalesces concurrent probes and uses a 1.5-second SQL
client deadline plus the existing five-second pool acquisition/connection deadline.
Next checks Hono with a seven-second deadline and no user cookies. Docker probe
deadlines exceed these bounds. These checks do not continuously re-audit privileges
or prove a real OAuth exchange, schema compatibility, external TLS or functional
acceptance; run the separate live role check and migration journal inspection.

A runtime DB outage makes readiness unhealthy while the API remains alive. It can
recover without a container restart. Docker restart policies do not restart merely
unhealthy containers. Investigate failures before an operator restarts anything.
SIGTERM/SIGINT stop accepting requests, drain active requests, then close the pool.
The 25-second bound fits Compose's existing 30-second app grace period; exceeding
it forces connection closure and exits nonzero. HTTP headers/uploads are bounded
at 15/30 seconds. Startup and shutdown log event names without configuration values.

## Authentication and privacy assumptions

`BETTER_AUTH_URL` is the environment-provided public HTTPS origin, with no path or
trailing slash. It remains the sole trusted origin. Forwarded host/protocol headers
cannot select an auth origin (`trustedProxyHeaders: false`). Origin and CSRF checks
are explicitly enabled. The existing Caddy peer/CIDR, host and forwarded-header
protections remain unchanged; private backend ingress is a required trust boundary.

The Google authorization-code flow retains state persistence, PKCE and the fixed
`/api/auth/callback/google` path. A narrow supported `getUserInfo` hook calls Better
Auth's exported Google JWT verifier before returning profile claims. Direct client
ID-token sign-in remains disabled. Only `openid email profile` scopes are requested.
The installed Google code flow does not request an OIDC nonce; its state and PKCE
binding remain required. No verification bypass, fabricated production sessions or
custom authentication protocol is introduced.

Production cookies remain Secure, HttpOnly, SameSite=Lax, path `/`, host scoped.
Sessions live in PostgreSQL for seven days with daily refresh and cookie caching
disabled. Logout revokes the database session; expiry and tampering are rejected.
OAuth tokens are encrypted at rest. Keep `BETTER_AUTH_SECRET` stable across app
restarts and compatible releases; rotation needs a separate session/token plan.

Sharing remains OFF by default and owner controlled. Availability returns permitted
profiles and availability states, without schedule titles or emails. Existing tests
cover weekly/date entries, cancellation/replacement, ownership, revisions, competing
writes, timezone/midnight/DST boundaries, empty schedules and any/every-day queries.

Real Google OAuth against the actual production client is **UNTESTED**. Synthetic
provider responses prove local state/PKCE/JWT/cookie/database behavior, not Google
consent configuration, real client credentials, public callback reachability or the
NaCl security contract.

## Environment and container boundaries

Use the existing `.env.production.example` and strict `ops.py preflight`; example
values cannot authorize production. Runtime production also rejects unsafe defaults.
Hono receives only runtime `DATABASE_URL`, `DATABASE_RUNTIME_ROLE`, auth origin,
auth secret and Google credentials. Administrator/migrator secrets remain confined
to explicit one-shot bootstrap/migration workflows. Runtime grants are unchanged.

Next receives no database, Google or Better Auth credentials. Its server-only
`API_INTERNAL_ORIGIN` must be a plain HTTP/HTTPS origin without credentials, query,
fragment or path. Compose supplies `http://backend:4000`; another host must explicitly
supply its own origin. No `NEXT_PUBLIC_*` secret or deployment domain is baked in.
Authenticated rendering reads request cookies before runtime configuration, so image
builds require no backend or secrets. `/api` continues to route directly to Hono.

Both app images retain non-root users, production artifacts, named/private data
volumes and networks, health checks, log rotation, restart and security controls.
Backend omits development dependencies; frontend uses Next standalone output.
Private API failures return generic existing error shapes and server-generated
`X-Request-Id` correlation. Logs omit exceptions, request URLs/queries, cookies,
Authorization headers, OAuth codes/tokens, credentials and schedule contents.

## Local validation commands

Use Node 24, npm 11, Python 3.12+ and a local Docker daemon. No production env file
is loaded by these rehearsals. Commands create only disposable synthetic databases.

```bash
npm ci
npm run lint
npm run typecheck
npm run build
npm test
python3 -B -m unittest discover -s infra/deployment -p 'test_*.py' -v
docker pull postgres:18-alpine
docker pull caddy:2-alpine
docker build -f backend/Dockerfile -t wangmai-backend:phase6d2-test .
docker build -f frontend/Dockerfile -t wangmai-frontend:phase6d2-test .
python3 -u -B infra/deployment/role_smoke.py --backend-image wangmai-backend:phase6d2-test
python3 -u -B infra/deployment/proxy_smoke.py --node-image wangmai-backend:phase6d2-test --frontend-image wangmai-frontend:phase6d2-test
python3 -u -B infra/deployment/production_smoke.py --backend-image wangmai-backend:phase6d2-test --frontend-image wangmai-frontend:phase6d2-test
```

The new simulation composes the actual production base, shared-gateway and DB ops
files with explicit fixture overrides. It verifies no service publishes a host port
and all named volumes belong to a unique test project. A private TLS gateway uses a
local CA; the client verifies it. Trust is derived only from that fixture gateway's
actual container IP. No NaCl address or trust assumption is introduced.

A test-only Node preload intercepts Google token/JWKS requests, refuses other outbound
fetch calls and signs synthetic RSA tokens. It is mounted only into the simulation,
never copied to an application runtime image or selected by production startup.
Real state, PKCE, JWT, CSRF, rate limiting and session checks remain active. Tests
respect rate-limit retry windows. No insecure fallback is added to production preflight.

The test then exercises authenticated Next rendering/static assets, schedule CRUD,
sharing/availability, session persistence after app recreation, PostgreSQL outage and
recovery without restarting the API, volume persistence after DB recreation, and
SIGTERM while a real schedule query is waiting on a temporary fixture lock. It
checks service logs for synthetic credentials/codes/tokens/private schedule titles.
Only its own unique project resources are removed. Existing data volumes are untouched.

CI extends the existing single checks job with both Docker builds, both ingress
smokes and this Compose simulation. It has read-only repository permission, no
production credentials, registry publishing, SSH or CD.

## Immutable release workflow and rollback

After code review/approval, use a clean checkout at the approved full lowercase
40-character SHA. Choose and independently approve the Node 24 bookworm-slim
**digest for the target platform**. Output must be a new directory outside the
checkout. The example variables below are operator selections, not defaults:

```bash
python3 -B infra/deployment/release.py build --commit "$RELEASE_SHA" --node-image "$NODE_IMAGE" --output "$RELEASE_DIRECTORY"
python3 -B infra/deployment/release.py verify "$RELEASE_DIRECTORY"
```

`build` refuses dirty/untracked source, mutable base references, existing SHA tags
and existing output directories. It builds from `git archive`, never local ignored
env/configuration/generated files; npm installs use the lockfile. `release.json`
records source SHA, Node digest, lockfile/migration hashes, image IDs/platform,
available RepoDigests and archive checksums. OCI revision labels must match the SHA;
users must be `node`; baked credential environment keys are rejected. Local images
have content-addressed image IDs and usually no registry RepoDigest. If separately
authorized registry publication happens later, record the resulting RepoDigests in
the release acceptance evidence and verify them independently.

The helper builds/saves/verifies only; it never loads, pushes, starts or deploys
images. A failed build retains partial artifacts for investigation and refuses to
overwrite them on retry. An operator must review partial artifacts before cleanup.
Keep the approved manifest in protected release evidence: checksums alone do not
authenticate a replaced manifest. Byte-identical Next rebuilds are not guaranteed.
Retain the exact tested images for promotion and rollback.

Before any future migration, verify backup/restore acceptance, schema compatibility
of both candidate and rollback app, and the separate migration role. Phase 6D.2
changes no migrations, table grants or business semantics. Do not down-migrate or
restore over nonempty data to roll back. An incompatible future schema requires the
existing fresh-volume recovery procedure and a write freeze/RPO decision. See
[database role security](postgresql-role-security.md) and the
[deployment runbook](cloudstack-deployment.md).

## Evidence and remaining gates

Local results are recorded after execution below. CI evidence belongs to the final
feature commit/workflow run; prior phase reports are not proof for this change.

Executed locally: ESLint, all workspace typechecks and native frontend/backend
production builds passed; 50 unit tests (14 backend, 36 frontend), 31 deployment/
release guards, 7 role tests and 38 backend integration tests passed. Both Caddy
configs and ingress modes passed proxy smokes using current application images.
Both production Dockerfiles built without application credentials. The private
production Compose simulation passed including wrong-state/PKCE and four invalid
JWT cases, real successful mock-provider callbacks, recovery/persistence and request
draining. Backup/restore fingerprints and live restored runtime grants matched.
The existing browser suite passed all 53 tests in its own disposable database,
including real persisted multi-account availability, recurrence edits, calendar
rendering, responsive/reduced-motion behavior and logout. Test-only local env and
database resources were removed; generated `next-env.d.ts` changes are excluded.
The first push CI exposed the pre-existing proxy smoke's Linux temporary-directory
permission mismatch: Node UID 1000 could not traverse a host-owned 0700 fixture
directory. Public fixture directories/files and the test CA now explicitly permit
non-root read access (0755/0644); no production secret-file permissions change.
Follow-up CI results are reported against the final feature commit.

| Status | Evidence / requirement |
| --- | --- |
| Implemented and locally verified | Unit/type/lint/build checks, role and integration suites, both proxy modes, production Compose simulation; exact results in the final review report |
| Implemented; operator approval required | Source/digest release workflow and artifact retention; local artifacts do not constitute production image approval |
| Not tested | Real Google exchange, browser/multi-account production acceptance, target VM capacity, public DNS/TLS/callbacks |
| Requires administrator evidence | Exact NaCl gateway source CIDRs, sanitization/overwrite of all forwarded identity headers, source restrictions and confidential/authenticated origin transport |
| Requires real infrastructure | VM storage/permissions/firewall/access controls, private ports, production secrets, fresh role bootstrap/migrations/live role check, encrypted off-VM backup and restore/RPO/RTO acceptance |
| Requires separate production authorization | Approved image vulnerability review, release/source/platform/digest acceptance, maintenance/rollback window, controlled activation and functional/capacity verification |

Do not treat a shared private network or a test `verified` fixture as launch evidence.
The existing direct-HTTPS option remains supported; production modes never switch
automatically. Both modes stay blocked until their own prerequisites are met.

Hosting independence is preserved: public origin, auth and database settings remain
environment driven; ingress/TLS live in infrastructure. Next and Hono remain separate
applications without CloudStack APIs/addresses/domains in business logic. A future
Vercel deployment still needs provider-specific routing, secrets, connection pooling
and lifecycle adaptation; no Vercel deployment is implemented or claimed tested.

Phase 6E should collect the above administrator/infrastructure evidence, review the
candidate and rollback artifacts, rehearse recovery, then request separate production
activation authorization. No launch or merge is authorized by this report.
