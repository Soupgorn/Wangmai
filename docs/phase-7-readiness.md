# Phase 7 provider -> Next implementation and local evidence

Base: latest origin/main `9ba72321f7a3561c599cc0bb509a917b13de02d3`.
Branch: `feat/provider-proxy-next`. Worktree: `D:/Project/Wangmai-phase7`.
The original checkout and its pre-existing local edits were preserved and hash checked.
No VM, production database, credentials, real Google account, gateway or DNS was changed.
No approved SHA release image tag was overwritten; only local phase7-test* images were built.

## Result

The active production selection is `compose.yaml` plus `compose.provider-proxy-next.yaml`.
It contains exactly frontend, backend and PostgreSQL 18. Only frontend publishes
`${WANGMAI_ORIGIN_BIND_IP}:3000:3000/tcp`, with the intended bind `10.60.2.22`.
The fixed public auth origin is `https://wangmai.public.cloud.ce-nacl.com`.
Next's production rewrites are baked to backend:4000 at build time. A socket guard
rejects untrusted peers/headers before the standalone handler, and a narrow final HTTP
adapter preserves the exact API URI bytes through Next's native rewrite. Native
streaming preserves methods, bodies, cookies and separate Set-Cookie headers.
Better Auth trusts only the guard-generated client IP for provider-mode tracking.

Historical Caddy configuration, its named volumes and rollback modes remain available
through the separate `compose.caddy-rollback.yaml`. Previous approved frontend images
are required for historical rollback. New provider images fail startup unless their
explicit provider configuration/security gates are satisfied.

## Verification performed locally

| Command / check | Result |
| --- | --- |
| `npm ci --no-audit --no-fund` | PASS |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm run build` | PASS; Next standalone and Hono production builds |
| `npm test` | PASS; ingress, backend operations/config and frontend application units |
| Python deployment/release/Compose suite | 43 tests: 42 PASS, 1 Windows POSIX-permission test skipped (Linux CI runs it) |
| `infra/deployment/role_smoke.py` | PASS; 7 role/lifecycle tests, 38 application integration tests, excess-grant detection, migration replay, backup/restore fingerprint and nonempty restore refusal |
| Docker backend/frontend production builds | PASS, fixture-only tags |
| `infra/deployment/provider_smoke.py` | PASS; actual production images/Compose, synthetic TLS gateway and Google provider |
| Actual Docker host port bindings | Only Next loopback ephemeral TCP 3000 target; backend and PostgreSQL have no host bindings |
| Production mode rendered bindings | Exactly `10.60.2.22:3000:3000/tcp`; only three steady-state services |
| Pre-existing local edits | SHA-256 hashes unchanged |

The full-stack smoke checked missing/unverified shipped-image startup rejection;
trusted/untrusted real socket peers; duplicate/forged forwarding headers; IPv4/IPv6 client
address validation; frontend HTML/static assets and auth redirects; `/api`, `/api/`,
interleaved/encoded/repeated query fields; GET/HEAD/POST/PUT/PATCH/DELETE/OPTIONS;
exact bodies and cookies; two separate Secure/HttpOnly/SameSite cookies; invalid Google
state/PKCE/audience/issuer/expiry/signature; successful mock Google callback and replay
refusal; session IP sourced from the sanitized client despite forged browser headers;
CSRF; schedule CRUD, ownership/privacy, readiness outage/recovery, persisted data through
app/database recreation; an in-flight request draining during SIGTERM; callback/query
and credential exclusion from logs. Test database volumes were retained.

CI is configured to repeat these checks on Linux using test-only tags. See the PR's
latest Actions result for the authoritative remote status; local evidence alone does
not imply CI passed. Historical Caddy behavior has static regression coverage and is
outside the active three-service smoke.

## Changed files

- Production selection: `compose.yaml`, `compose.provider-proxy-next.yaml`,
  `.env.production.example`; development hostname comment in `.env.example`.
- Next transport: `frontend/next.config.ts`, `frontend/Dockerfile`,
  `infra/next-ingress/guard.cjs`, `register.cjs`, `guard.test.cjs`.
- Auth IP source: `backend/src/config/env.ts`, `backend/src/auth/auth.ts`.
- Preflight: `infra/deployment/ops.py`, `provider_proxy.py`, `test_provider_proxy.py`,
  `test_compose.py`, `test_release.py` (existing-image overwrite regression).
- CI/smokes: `.github/workflows/ci.yaml`, `package.json`,
  `infra/deployment/provider_smoke.py`, `role_smoke.py`, `production_smoke.py`,
  `infra/smoke/provider-gateway.mjs`, `provider-echo.mjs`, `provider-routing-check.mjs`,
  `production-check.mjs`.
- Rollback: `compose.caddy-rollback.yaml`, three historical ingress override banners,
  `infra/caddy/.env.production.example`, `docs/historical-caddy-deployment.md`.
- Handoff: `README.md`, `docs/cloudstack-deployment.md`, this report.

## Remaining production gates

Production is NO-GO until administrators verify gateway TCP source CIDRs, Docker-aware
source restrictions, single-client-IP header replacement and sanitation, and authenticated
encryption plus integrity protection of the HTTP gateway-to-VM hop. All example verification
flags remain unverified. Synthetic flags in an isolated test are not NaCl verification.
A private network or allowlist alone is insufficient. If NaCl cannot provide those
properties, do not activate the requested HTTP ingress mode.

Public TLS, real Google consent/callbacks, two-account browser acceptance, VM firewall and
capacity, backup operations and release artifact approval remain operator work. No live
checks, deployment, merge or gateway changes are authorized by this report.

[Release build, manual VM steps and exact NaCl settings](cloudstack-deployment.md)
are the deployment handoff. The existing archive-based release tool refuses existing SHA
tags and dirty checkouts. Keep the prior app images, Caddy resources and every database
volume. No new release artifact was built under an approved tag during this implementation.
