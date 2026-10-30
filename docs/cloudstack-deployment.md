# Wangmai Phase 7: NaCl provider -> Next ingress

Active architecture: browser HTTPS -> NaCl provider reverse proxy -> protected HTTP
`10.60.2.22:3000` -> Next.js -> `/api` and `/api/*` rewritten internally to
`http://backend:4000` -> PostgreSQL 18 on `postgres:5432`.

Production remains BLOCKED until the actual NaCl source, header and transport contract
is verified. Repository tests are synthetic evidence, never verification of NaCl.
This runbook is a manual handoff; no VM access, deployment or provider change is automated.
Use npm Workspaces, Google OAuth, Better Auth and Drizzle as before. There is no Vercel migration.

The production domain target is `https://wangmai.snowballwy.com`. Follow the
[domain cutover checklist](production-domain-cutover.md) before changing a running
environment; the earlier `wangmai.ce-nacl.com` migration target is superseded.

## Exact NaCl reverse proxy settings

| Setting | Required value |
| --- | --- |
| Public hostname / HTTP Host | `wangmai.snowballwy.com` |
| Public listener | HTTPS TCP 443, valid publicly trusted certificate; TLS 1.2+ |
| Public HTTP listener | Redirect HTTP 80 to the same HTTPS hostname, preserving URI |
| Upstream protocol | HTTP |
| Upstream address | `10.60.2.22` |
| Upstream port | `3000` |
| Upstream Host | `wangmai.snowballwy.com` (no `:3000`) |
| Routing | All paths to Next; no separate `/api` gateway route or prefix stripping |
| URI / query / method / body | Preserve the original request, including OAuth query parameters; no caching or body transformation |
| `X-Forwarded-Host` | Replace with exactly `wangmai.snowballwy.com` |
| `X-Forwarded-Proto` | Replace with exactly `https` |
| `X-Forwarded-For` | Replace with one verified real browser IP (IPv4 or IPv6), never append or pass a supplied chain |
| Other forwarded/client IP headers | Remove incoming `Forwarded`, all other `X-Forwarded-*`, `X-Real-IP`, `CF-Connecting-IP`, `True-Client-IP`, `Fastly-Client-IP`, `Client-IP`, `X-Wangmai-*`, and `X-Middleware-*` |
| Connection headers | Remove hop-by-hop headers; do not nominate forwarding/internal headers in `Connection` |
| Cookies | Forward Cookie; preserve each independent Set-Cookie, attributes and host scope; no domain/path rewriting |
| Auth/API/readiness caching | Disabled, including redirects, errors and Set-Cookie responses |
| Origin health probe | HTTP `GET /health/ready`, same Host and sanitized forwarding headers, from an allowed gateway peer; expect 200; 503 removes origin from service |
| Upstream timeout | At least 35 seconds; app API work is bounded; do not retry unsafe methods |
| Source restriction | Only administrator-confirmed gateway TCP peer IPv4 CIDRs to VM TCP 3000; no public NAT to origin |
| HTTP-hop protection | Administrator-verified IPsec, WireGuard, MACsec, or provider encrypted private network with authenticated integrity |

The exact gateway source addresses, existing protection capability, provider UI field
names, and administrator evidence are unknown. Do not invent these values. If NaCl
cannot replace XFF with the verified single client IP, preserve the peer source, or
provide authenticated encryption/integrity for this HTTP hop, **do not activate this
mode**. A private IP, VLAN, firewall allowlist, or public HTTPS termination alone
cannot protect OAuth codes and session cookies on the origin HTTP connection.
Additional upstream proxies must be covered by the administrator's verified header
sanitation contract; never select a client-supplied leftmost XFF token.

Independently verify CloudStack and Docker-aware host firewall controls (for example
DOCKER-USER/nftables at the correct forwarding hook); a generic host INPUT/UFW rule
alone may not restrict Docker-published ports. Reject origin TCP 3000 from every
non-gateway source and prevent bypass through alternate IPv4/IPv6 paths, host routing,
Docker API access, or access to the application Docker network. Keep 4000 and 5432
unpublished and deny public VM 80/443 after the approved cutover. Record observed peer
IPs as seen at the container socket. Do not trust an entire Docker bridge to work
around unexpected NAT. Confirm the exact source mapping with the operator first.

## Environment and security gates

Prepare a separate private `.env.production` from `.env.production.example`. Preserve
all existing production auth secrets, Google client configuration, three database roles,
password files and database/volume identities. The intended public origin remains:

```dotenv
WANGMAI_INGRESS_MODE=provider-proxy-next
WANGMAI_DOMAIN=wangmai.snowballwy.com
BETTER_AUTH_URL=https://wangmai.snowballwy.com
WANGMAI_ORIGIN_BIND_IP=10.60.2.22
```

`WANGMAI_ORIGIN_BIND_IP` is configurable but must be an explicitly reviewed RFC1918
IPv4 address assigned to the VM. Only it publishes TCP 3000. Set
`WANGMAI_GATEWAY_CIDRS` to space-separated canonical IPv4 peer CIDRs (/16 through /32,
prefer /32; no blanket private ranges). The socket guard accepts IPv4-mapped IPv6
socket peers and IPv4/IPv6 real client IPs. It rejects duplicate, missing or chained
forwarding headers, incorrect Host/protocol, unauthorized peers, and upgrades.

Leave all four `*_VERIFIED` flags unverified until there is actual evidence:
`WANGMAI_GATEWAY_HEADERS_VERIFIED`, `WANGMAI_ORIGIN_SOURCE_RESTRICTION_VERIFIED`,
`WANGMAI_ORIGIN_CONFIDENTIALITY_VERIFIED`, `WANGMAI_ORIGIN_INTEGRITY_VERIFIED`.
Set each to `verified` only following administrator review. Set
`WANGMAI_ORIGIN_LINK_PROTECTION` to the verified mechanism and
`WANGMAI_GATEWAY_CONTRACT_REFERENCE` to a real reviewed evidence reference covering
source restrictions, header sanitation, transport authentication, encryption and integrity.
Both Python preflight and frontend startup reject incomplete attestations. Neither
can remotely prove that a firewall or tunnel is actually configured.

Only frontend, backend and postgres run in steady state. The backend receives only
runtime credentials; frontend receives no auth or database secrets. Database one-shot
tools require the explicit `database-ops` profile. Keep PostgreSQL pinned to a tested
`postgres@sha256:...` digest, database network internal, non-root app users, bounded
logs, dropped capabilities and no-new-privileges.

## Local checks and new release build

Use Node.js 24, npm 11, Python 3, OpenSSL and a local Linux Docker daemon with
Compose >=2.24.4. Run from an isolated feature checkout, preserving other worktrees:

```sh
npm ci
npm run lint
npm run typecheck
npm run build
npm test
python3 -B -m unittest discover -s infra/deployment -p 'test_*.py' -v
docker pull postgres:18-alpine
python3 -u -B infra/deployment/role_smoke.py
docker build -f backend/Dockerfile -t wangmai-backend:phase7-test .
docker build -f frontend/Dockerfile -t wangmai-frontend:phase7-test .
python3 -u -B infra/deployment/provider_smoke.py --backend-image wangmai-backend:phase7-test --frontend-image wangmai-frontend:phase7-test
```

These image tags are local synthetic-test tags only. The smoke creates a unique project,
private fixture credentials and a local test CA; only Next publishes an ephemeral
loopback port. Its synthetic Node TLS gateway is test tooling, not a fourth production
service. The test's mock Google provider is mounted only into the disposable backend.
It exercises Google callback state/PKCE/token validation, secure cookies, CSRF, API
CRUD/ownership, readiness, database restart/recovery, persistence, drain and log privacy.
It does not contact Google or establish production gateway security. Test containers
are removed; all database volumes are retained, including synthetic volumes.

For a release, use the existing archive-based release tool from the clean reviewed
commit; build once with a tested official Node 24 digest and a new output directory
outside the checkout. Replace the two placeholders with reviewed values:

```sh
python3 infra/deployment/release.py build --commit FULL_REVIEWED_COMMIT_SHA --node-image node:24-bookworm-slim@sha256:TESTED_NODE_DIGEST --output /secure/releases/wangmai-NEW_RELEASE
python3 infra/deployment/release.py verify /secure/releases/wangmai-NEW_RELEASE
```

The tool refuses either existing SHA image tag, dirty source, untracked files, remote
Docker endpoints and an existing output directory. It builds from `git archive`,
records source/lockfile/migration hashes, image IDs and archive checksums, and exports
`images.tar`. Retain both previous approved images and manifests for rollback. Never
rebuild under an approved SHA tag. Production rewrites are serialized at build time:
`/api` -> `http://backend:4000/api`, `/api/:path*` ->
`http://backend:4000/api/:path*`. `API_PROXY_ORIGIN` affects development only;
`API_INTERNAL_ORIGIN=http://backend:4000` is required at runtime for SSR/readiness.

## Manual VM cutover steps (operator only)

1. Verify the evidence gates above and obtain release approval. Record current container
   image IDs, exact Compose project name, current database volume name/mount and PostgreSQL
   major/digest. Preserve the prior configuration, credentials, TLS files and all Caddy
   resources. Take a protected custom-format backup using the currently approved operator
   tooling and perform an isolated fresh-volume restore drill. Never initialize, reset
   or restore over the existing production volume. No Phase 7 schema change is required.
2. Transfer the reviewed source/config and release artifacts through the approved channel.
   Check checksums before loading images. Confirm any existing SHA tags match the recorded
   image IDs before `docker image load`; stop on a mismatch so an approved tag is never
   overwritten. Set `WANGMAI_IMAGE_TAG` to the new reviewed SHA. Retain the existing
   `.env.production` secrets; update only ingress metadata after review. Keep permissions
   private and retain a protected previous environment/config copy for rollback.
3. Verify production preflight and the runtime database role using the new configuration:

```sh
python3 infra/deployment/ops.py preflight --env-file .env.production --ingress-mode provider-proxy-next
python3 infra/deployment/ops.py preflight-runtime --env-file .env.production --ingress-mode provider-proxy-next
```

4. Use exactly this Compose selection, same `wangmai` project, and the original existing
   `postgres_data` volume mapping. Confirm rendering internally without printing credentials:

```sh
dc() { docker compose --project-name wangmai --env-file .env.production -f compose.yaml -f compose.provider-proxy-next.yaml "$@"; }
dc config --quiet
# Inspect the reviewed DB volume mapping and loaded image identities before starting.
dc up -d --wait --no-build --pull never frontend backend postgres
```

   Do not use `--remove-orphans`: the previous Caddy container must be retained. Existing
   DB bootstrap and migrations remain explicit operator-only procedures described in
   [database role security](postgresql-role-security.md). If a separately approved release
   needs them, use `compose.database-ops.yaml`, `preflight-db`, and its `bootstrap`/`migrator`
   tools; never give admin/migrator credentials to the backend. Do not use database-init
   for the existing volume. Avoid inadvertently upgrading the retained PostgreSQL image.
5. The operator configures/reviews NaCl using the exact table above and changes the upstream
   to protected HTTP `10.60.2.22:3000`. Confirm unauthorized-origin probes fail and real
   gateway requests succeed. Verify TLS publicly without `-k`, all API/auth paths through
   Next, readiness, real Google consent/callback/logout, secure host-only cookies, CSRF,
   and two-account schedule/privacy acceptance. Confirm no callback or cookie is logged.
6. Independently inspect actual Docker host port bindings: only frontend `10.60.2.22:3000`
   may be bound. Backend 4000 and PostgreSQL 5432 must have no host bindings. Once the new
   path is accepted in the approved maintenance window, stop the retained Caddy container
   using its recorded container ID. Keep its container, configuration, certificates and
   volumes for rollback. Stop it before declaring the cutover complete, and verify VM
   80/443/2019 and all unauthorized 3000 paths are unreachable. Do not remove any volume.

If any gate fails, stop the cutover. Roll back the gateway route and restore the prior
approved app images/configuration; restart the retained Caddy container through the
recorded previous mode. See [historical Caddy rollback](historical-caddy-deployment.md).
Historical modes now additionally require `compose.caddy-rollback.yaml`. New Phase 7
frontend images require the provider guard and cannot substitute for previous Caddy-mode
frontend images. Never run both architectures as a permanent active deployment.
Database recovery is a separate approved action with a fresh named volume and explicit
recovery override; preserve both volumes. Never use `down -v`, volume prune, reset,
automatic image replacement, or an in-place database restore.

## Security implementation notes

The Node preload installs the ingress guard before the generated standalone server creates
its single HTTP listener. It checks the real socket address before Next can process the
request, then normalizes trusted forwarding headers without reading the body or cookies.
A narrow Node HTTP adapter restores the original API URI at the final rewrite send
(the fixed backend:4000 target only), because Next normally normalizes slashes and
query encoding/order. It leaves streaming and all response cookies with Next. Proxy
failure logs omit callback URLs/codes. This intentionally depends on the pinned Next standalone listener behavior and is covered
by the production-image Docker smoke; rerun it for every Next/Node upgrade. Requests with
`Expect` headers and upgrades cannot bypass the guard. Only the exact loopback GET readiness
probe has an exception; it cannot access auth, sessions or arbitrary routes.

The fixed public Better Auth base URL remains authoritative with proxy-host trust disabled,
origin and CSRF checks enabled, encrypted OAuth tokens, database-backed sessions and Secure,
HttpOnly, SameSite=Lax host-scoped cookies. Only the guard-generated `X-Wangmai-Client-IP`
is read for provider-mode IP tracking/rate limiting; backend network access is trusted and
must remain restricted. These follow the installed Next rewrite/standalone behavior and
[Next rewrites documentation](https://nextjs.org/docs/app/api-reference/config/next-config-js/rewrites)
and [Better Auth security guidance](https://better-auth.com/docs/reference/security).
