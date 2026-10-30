# Phase 6C.1 reverse proxy compatibility report

30 October 2026, Asia/Bangkok. **Implementation and local validation complete;
production activation remains BLOCKED.** No VM connection, deployment, Docker
installation on the VM, DNS/CloudStack/OAuth edits, production migrations/role changes,
public ACME issuance, commit, push or merge was performed.

## Baseline and preservation

- Branch `infra/cloudstack-launch`, HEAD `59a763d4ea8a0f6fdcae368b6bcf7857670dcc25`.
- Initial tracked working tree was clean; `docs/phase-6b-readiness.md` was already
  untracked. It remains unmodified (SHA-256
  `1BBA7B6B67448FBFF842A2B8567900E0560DBF320B36E6112281B5A5F562D6E9`).
- Existing `backups/`, local `.env`, database and other data were preserved.
- An unrelated generated `frontend/next-env.d.ts` change appeared during the
  session (`.next/types` → `.next/dev/types`). It was not edited or reverted by
  this implementation and remains outside the phase's changes.

## Files changed by this phase

| File | Change |
| --- | --- |
| `compose.yaml` | Require explicit ingress mode; base ingress cannot start or publish ports; mount infra configs |
| `compose.direct-https.yaml` (new) | Existing public HTTPS/ACME option and its three port bindings |
| `compose.shared-gateway.yaml` (new) | HTTP-only private-interface origin and required gateway contract settings |
| `infra/caddy/Caddyfile` | Direct mode, shared routes, request-bearing error log exclusion |
| `infra/caddy/Caddyfile.shared-gateway` (new) | No automatic HTTPS; exact gateway peer trust and origin request gates |
| `infra/caddy/routes.caddy` (new) | Same API/page routing and normalized forwarding headers for both modes |
| `infra/caddy/start.sh` (new) | Reject missing/mismatched/combined modes and unverified gateway contracts |
| `.env.production.example` | Explicit mode and deliberately unverified gateway placeholders |
| `infra/deployment/ops.py` | Explicit mode for production helpers; mode-aware ports, CIDRs and contract guards |
| `infra/deployment/test_ops.py` | Expanded fail-closed and application portability guard tests |
| `infra/deployment/test_compose.py` (new) | Actual Compose rendering, missing-tag/mode rejection, security-control preservation |
| `infra/deployment/proxy_smoke.py` (new) | Isolated, disposable runtime smoke; optional existing app-image validation |
| `infra/smoke/proxy-fixture.mjs` (new) | Synthetic frontend/backend upstreams, without request logging |
| `infra/smoke/proxy-check.mjs` (new) | HTTP/TLS routing, spoofing, callback/query/cookie and auth redirect assertions |
| `infra/smoke/compose.yaml`, `infra/smoke/.env.example` | Retain separate loopback-only historical app smoke after mode split |
| `.github/workflows/ci.yaml` | Explicit direct-mode config rendering and deployment guard tests; no deployment job |
| `docs/cloudstack-deployment.md` | Two-mode runbook, updated helpers/recovery commands and precise gateway prerequisites |
| `docs/phase-6c1-readiness.md` (new) | This report |

## Architecture decisions

Both modes route exact `/api` plus `/api/*` to Hono :4000 and all other paths to
Next.js :3000. `/api/auth/callback/google`, method, complete encoded/repeated query
parameters, cookies and multiple response cookies survive unchanged. App and DB
ports remain unpublished; existing non-root app images, capability restrictions,
restart/health/log rotation policies, internal DB network and named volumes remain.
The full-SHA app image guard and pinned infrastructure-image guards still apply.

The base Compose configuration has no ingress default. Environment mode, selected
override and startup guard must agree. Combining both overrides is rejected in
either order. Direct mode retains automatic public TLS and HTTP→HTTPS redirects;
shared mode disables automatic HTTPS entirely and binds only private IPv4 TCP 80.
Public HTTP→HTTPS redirects must happen at the shared gateway, never the origin.

Shared mode accepts only verified TCP peers (`remote_ip`), the approved public Host,
and sanitized HTTPS/forwarded-host values. Only explicit gateway CIDRs participate
in strict right-to-left client-IP parsing. Caddy strips inbound forwarding/alternate
IP headers and supplies canonical public scheme/host plus one resolved client IP.
Direct mode trusts no proxy chain. Neither mode adds request logging; request-bearing
proxy error logs are excluded and a synthetic upstream-failure test checks for leaks.
See the runbook's linked [Caddy forwarding reference](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy#defaults).

Auth/business logic is unchanged. Installed Better Auth 1.7.14 uses the fixed public
`BETTER_AUTH_URL`, one trusted origin, default disabled forwarded-host inference,
Secure/HttpOnly/SameSite=Lax host-scoped production cookies and a single XFF IP reader.
No NaCl domain, VM address, CloudStack API or mode flag was added to application code.
Next.js/Hono/shared code, environment-driven auth/database settings and server-side
`API_INTERNAL_ORIGIN` remain independent of Caddy. This preserves **Vercel compatibility
at the application-architecture level**; no Vercel deployment/runtime adaptation was
implemented or tested.

## Executed validation and results

Local Docker context: `desktop-linux`, Windows named pipe to Docker Desktop's Linux
daemon. Docker Engine 29.9.2, Compose v5.6.1, Caddy 2.11.7. Docker Desktop was started
locally for testing; no VM packages were installed. Smoke uses an internal network
and no published host ports or production environment file.

| Command/check | Final result |
| --- | --- |
| `python -B -m unittest discover -s infra/deployment -p 'test_*.py' -v` | **23 passed**, including all original 11 guards |
| `python -B infra/deployment/proxy_smoke.py` | Synthetic shared/direct TLS routes, callback/query/cookies, spoof resistance, peer denial, startup modes and secret-safe 502 logs passed |
| `python -u -B infra/deployment/proxy_smoke.py --frontend-image wangmai-frontend:phase6a-smoke` | Same proxy tests plus actual app-image health, unauthenticated session, HTTPS login/callback redirects and auth/cookie options passed |
| `npm test` | **4 backend + 34 frontend unit tests passed** |
| `node --check infra/smoke/proxy-check.mjs` and `node --check infra/smoke/proxy-fixture.mjs` | Passed |
| Exact production `caddy validate` in network-isolated containers | Both direct and shared configurations valid; no public certificate issuance |
| Actual Compose fixture rendering | Both modes pass complete production guards with synthetic reviewed-contract fixtures; missing mode/tag, combined modes, unverified contract and base-alone ingress rejected |
| `ops.py preflight --ingress-mode direct-https --env-file .env.production.example` | Expected rejection: placeholder mode disagrees; template cannot activate production |
| Same template preflight with `--ingress-mode shared-gateway` | Expected rejection: missing required gateway settings |
| Local Markdown-link resolution, runbook `bash -n`, startup `sh -n` | Passed in isolated local validation containers; runbook commands were not executed |
| `git diff --check` | Passed |

Direct runtime smoke uses a local certificate issuer and verifies that CA; it never
disables TLS verification or contacts public ACME. Shared runtime config has only
`:80`, `automatic_https.disable=true`, and no TLS app. Test peer CIDRs are derived
from the disposable client only, with no production defaults. All created containers,
their own anonymous test volumes and the temporary network were removed. Existing
`wangmai-dev-postgres-1` was not modified. No named volume, backup or existing data
was deleted, migrated or reset.

The application pass reuses existing local `phase6a-smoke` images, **not newly built
release images**. Their configured users are `node`:

- Backend: `sha256:9aadf2726b48635cb0901757ca2cd189debfc6d87ad3162a389fe0aed44d41be`.
- Frontend: `sha256:b3856e1b14c785767a415a8abc8fab97fe9867b4d1a75b54058fb3a3fa738113`.

Test development caught an accepted `unverified` evidence reference; it is now
rejected by preflight/startup and covered by tests. The optional app harness initially
failed because actual backend startup requires PostgreSQL; it now uses a fresh,
isolated empty DB with public fixtures. No production validation was weakened.
The checks do not establish real Google token exchange, persisted sessions/schema,
production data recovery, capacity, public gateway headers or actual origin security.
No build, production-account login or full DB integration suite was run this phase.

## Remaining security blockers and administrator information

**NaCl public production activation is BLOCKED** until administrators provide a
reviewed, durable evidence reference covering:

1. Actual narrow gateway source CIDRs as seen by Caddy, including failover/SNAT and
   Docker forwarding. `10.60.2.22` is the destination, not a verified proxy source.
2. Public-vhost Host validation and HTTPS enforcement; overwrite/sanitization of
   client forwarding headers; canonical single HTTPS/host values and authoritative
   XFF; unchanged API paths, encoded queries, method and cookies.
3. Docker-aware source-restricted origin ingress, no public/tenant/IPv6 bypass,
   and no exposed application/database/admin/Docker API ports.
4. Confidentiality and integrity across the entire HTTP origin hop against other
   tenants/on-path attackers, with authenticated encrypted transport evidence.
   Private addressing, shared networking or an ACL alone is insufficient. If this
   cannot be verified, plan a separately reviewed encrypted origin/tunnel or HTTPS
   architecture; **do not activate the current HTTP origin**.
5. Gateway secret-safe logging, retention/owners, certificate renewal ownership and
   change notification, plus sanitized classification of the reported 502 failure.

The owner reports a valid public gateway certificate and active HTTP mapping to
`10.60.2.22:80`, with no app listening yet. This phase did not independently verify
that endpoint or the exact upstream failure. No trusted production CIDRs were invented.

The Phase 6B local report (`docs/phase-6b-readiness.md`, preserved outside this PR) also leaves database runtime superuser
privilege, durable storage/capacity, production OAuth/secrets, immutable image/security
review, off-VM backups/restore evidence and RPO/RTO unresolved. This phase changes no
database roles or credential lifecycle and grants no deployment approval.

## Recommended Phase 6C.2

Collect and review the administrator contract and remaining Phase 6B evidence first,
including an authorized read-only diagnosis of the 502/listener/network path. Decide
whether the HTTP origin confidentiality gate can actually pass. Then prepare a
concrete, separate operator-reviewed VM/bootstrap/release plan with exact approved
CIDRs/interface/mode, retained full-SHA images and pinned digests, production OAuth
readiness, database privilege decision and tested backup/recovery. VM changes and
production startup require their own authorization; no activation is part of 6C.1.
