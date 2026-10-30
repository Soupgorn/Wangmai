# CloudStack manual deployment runbook — Phase 6C.2

This is a preparation runbook, not deployment authorization. Phases 6C.1 and 6C.2 are local code
and configuration work only. The owner reports an existing NaCl HTTPS gateway and
private VM (details below); no VM connection or public endpoint verification was
performed in this phase. Google production credentials, storage/backup readiness,
and the gateway security contract remain unverified. **Production activation is BLOCKED.**
Direct Caddy startup requests public certificates; shared-gateway startup never does.

## Architecture and release gates

Direct mode: Internet → Caddy :80/:443 → Next.js :3000 / Hono :4000 → PostgreSQL :5432.
Shared mode: Internet HTTPS → NaCl openresty → protected HTTP origin Caddy :80 → same apps/DB.
Only Caddy publishes ports. The database network is internal. Application containers
run as `node`, drop Linux capabilities, and cannot gain privileges. Backend outbound
access remains available for Google OAuth. Do not publish Docker's socket or admin API.

The Phase 5 schema and its three committed migrations are retained. No schema,
authentication architecture, localhost OAuth configuration, or product UI changes
are needed. Sharing remains OFF by default; only opted-in Google-linked users are
selected server-side. Public preview data stays separate from authenticated results.

Before deployment, record owner approval for the reviewed commit, domain, actual
VM/network topology, Google client, off-VM backup location, recovery objectives,
and a maintenance window. Keep a previous image archive and its exact environment.
This is a single-VM deployment with downtime during updates, not high availability.

## 0. Select ingress explicitly and verify the gateway contract

The two production modes use the same images, business logic, auth settings and
database. `compose.yaml` alone publishes no ports and refuses to start ingress.
Always select **exactly one** override, with the matching `WANGMAI_INGRESS_MODE`
in the protected env file. A mismatch, unknown mode or both overrides fails the
startup guard and preflight. There is no automatic HTTP fallback or mode detection.
Compose >=2.24.4 is required for both modes (`!override` replaces port lists).

| Setting | `direct-https` | `shared-gateway` |
| --- | --- | --- |
| Additional Compose file | `compose.direct-https.yaml` | `compose.shared-gateway.yaml` |
| Caddy config | `infra/caddy/Caddyfile` | `infra/caddy/Caddyfile.shared-gateway` |
| TLS termination | Public Caddy; ACME and HTTP→HTTPS redirect | Existing gateway; `auto_https off`, explicit HTTP listener, no origin redirect |
| Host publication | TCP 80/443, UDP 443 | Only verified private IPv4 interface TCP 80 |
| Trusted proxies | None | Only administrator-verified TCP peer CIDRs; strict right-to-left XFF parsing |
| Public auth origin | `https://WANGMAI_DOMAIN` | Same public HTTPS origin, never HTTP/private IP |
| Additional security gates | Direct DNS/ACME reachability | Gateway sources, headers, access controls, origin confidentiality and evidence reference |

Owner-provided infrastructure snapshot (30 October 2026):

- Public origin: `https://wangmai.public.cloud.ce-nacl.com`; shared openresty gateway
  already has a valid public certificate.
- Active upstream mapping: `http://10.60.2.22:80`. This is an origin destination,
  **not** a gateway source address and must never be used as a guessed trusted proxy.
- VM: Ubuntu 26.04.1 LTS, 2 vCPU, 3.8 GiB RAM, Docker not installed yet.
- Public response is reported as 502 while no application is running on port 80.
  Connection refusal, timeout, firewall or another exact upstream failure is **not
  confirmed**. Request sanitized gateway error classification/timestamp and operator
  listener/routing evidence; never attach OAuth URLs, cookies or credentials.

The existing mapping selects the shared architecture for planning, but does not
authorize activation. Before filling shared-mode settings, obtain written evidence
from the NaCl gateway/network administrators for **all** of the following:

1. Exact, narrow source IPv4/IPv6 CIDRs as actually observed at Caddy's TCP socket,
   including all gateway failover nodes, NAT/SNAT and Docker forwarding effects.
   Do not trust all RFC1918 ranges, the VM destination IP, or Docker bridge ranges
   merely because they are private. If Docker masks multiple tenants behind a
   common peer, the allowlist cannot authenticate the gateway: block activation.
2. The public vhost accepts only the approved Host; HTTP clients redirect to HTTPS
   **at the gateway**, before forwarding auth/cookies. HTTPS requests preserve the
   original public `Host`, method, `/api` prefix, full encoded query, cookies and
   multiple `Set-Cookie` headers. No upstream redirect rewriting to private origins.
3. Gateway configuration strips client-provided `Forwarded` and all `X-Forwarded-*`
   identity/scheme headers, then sets a **single** `X-Forwarded-Proto: https`, a
   **single** `X-Forwarded-Host` equal to the public hostname, and an authoritative
   client `X-Forwarded-For`. Overwrite XFF at this public edge; if additional proxies
   exist, provide their complete sanitization/trust chain for review. Reject duplicate
   or ambiguous inputs. Do not rely on blindly appending a client-supplied XFF value.
4. CloudStack/host/Docker-aware ingress controls permit origin TCP 80 only from those
   gateway peers, with no public bypass, tenant path, alternate NIC/IPv6 listener or
   access to 3000/4000/5432/2019/Docker API. Caddy's `remote_ip` check is a second layer.
5. Confidentiality **and integrity** of the entire gateway→origin hop against other
   tenants and on-path attackers. Plain HTTP exposes authorization codes, cookies,
   tokens and user data on that hop. A private address, ACL, VLAN or shared network
   alone does not prove confidentiality. Require evidence of an authenticated,
   encrypted transport/underlay covering the complete path and its trust boundaries.
   If that cannot be verified, **HTTP-origin production remains BLOCKED**; plan a
   separately reviewed encrypted origin/tunnel or supported HTTPS architecture.
   Never accept the risk by automatically switching modes or trusting the subnet.
6. Gateway access/error/debug logging and monitoring omit/redact query strings,
   Authorization/Cookie/Set-Cookie and bodies that contain OAuth/session secrets;
   owners, retention, renewal responsibility and change notification are recorded.

Only after review, set `WANGMAI_GATEWAY_CIDRS` to space-separated canonical CIDRs,
`WANGMAI_ORIGIN_BIND_IP` to the verified private origin interface, and set each of
`WANGMAI_GATEWAY_HEADERS_VERIFIED`, `WANGMAI_ORIGIN_CONFIDENTIALITY_VERIFIED` and
`WANGMAI_ORIGIN_SOURCE_RESTRICTION_VERIFIED` to exactly `verified`. Record a durable
review/ticket reference in `WANGMAI_GATEWAY_CONTRACT_REFERENCE`. These values are
operator attestations, **not proof**: preflight cannot inspect the gateway, firewall
or encryption. Keep the template `unverified` until evidence exists. Production
preflight still rejects placeholders, weak secrets, non-SHA release tags and unpinned
images. A passing preflight alone never authorizes startup.

Both modes import `routes.caddy`: `/api` and `/api/*` go to Hono :4000; every other
path goes to Next :3000. There is no path stripping or query rewriting. The origin
rejects untrusted TCP peers (403), incorrect public Host (421), and incorrect/missing
gateway scheme or forwarded host (400); it never redirects those requests.
Caddy removes incoming forwarding/alternate-IP headers and sends normalized Host,
X-Forwarded-Host, HTTPS X-Forwarded-Proto and a single resolved X-Forwarded-For.
Direct mode resolves the TCP peer; gateway mode uses only the verified trust list.
This follows Caddy's [forwarded-header behavior](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy#defaults)
and [peer matcher semantics](https://caddyserver.com/docs/caddyfile/matchers#remote_ip).

No access log is enabled. Caddy's request-bearing error logger is also excluded to
prevent callback query leakage on upstream failures; use health checks, status codes
and sanitized operator diagnostics. Do not enable debug/request logging in production.
Better Auth retains the fixed environment-driven `baseURL`, sole trusted origin,
disabled forwarded-host inference (installed default), and production Secure,
HttpOnly, SameSite=Lax host-scoped cookies. Caddy supplies one normalized XFF address
for the installed auth IP/rate-limit reader. Application ports must remain private.

Future Vercel/other-provider deployment can supply its own same-origin API routing,
trusted ingress normalization and environment values. No NaCl domain, IP, API or
ingress-mode dependency is added to Next/Hono/shared application source; Caddy is
an infrastructure choice. Server-only `API_INTERNAL_ORIGIN`, public `BETTER_AUTH_URL`
and database credentials remain environment-driven. This preserves application-level
portability; it is **not** a tested Vercel deployment or a provider runtime adapter.

For subsequent **future authorized** commands, select the reviewed mode in Bash
without sourcing the env file; ensure its `WANGMAI_INGRESS_MODE` agrees:

```bash
read -r -p 'Reviewed ingress mode (direct-https or shared-gateway): ' INGRESS_MODE
case "$INGRESS_MODE" in
  direct-https) CADDY_CONFIG=/etc/caddy/Caddyfile ;;
  shared-gateway) CADDY_CONFIG=/etc/caddy/Caddyfile.shared-gateway ;;
  *) echo 'STOP: explicitly select a supported mode.' >&2; exit 1 ;;
esac
dc() { docker compose --project-name wangmai --env-file .env.production -f compose.yaml -f "compose.$INGRESS_MODE.yaml" "$@"; }
```

Sections 1–3 describe future operator work; direct public NAT/DNS/UFW/ACME examples
apply **only to direct-https**. For the existing shared gateway, retain its public
DNS/TLS mapping, use gateway-only origin rules, and never open origin 80/443 publicly.
The historical Phase 6B local report (`docs/phase-6b-readiness.md`, preserved outside this PR) is preserved as recorded;
its single-file Compose commands predate this explicit mode selection and must not
be used for a Phase 6C release.

## 1. VM and storage

Recommended OS: Ubuntu Server 24.04 LTS, amd64. Docker also documents support for
26.04 LTS; use an OS image maintained by your CloudStack operator. See
[Docker's supported Ubuntu releases](https://docs.docker.com/engine/install/ubuntu/).

Planning minimum for this small MVP: 2 vCPU, 4 GiB RAM, 40 GiB persistent SSD.
Prefer 4 vCPU, 8 GiB RAM, and 80 GiB when building images on the VM. These are
engineering starting points, not measured capacity guarantees. Allow additional
space for database growth, retained images, backup archives, and restore drills.
Monitor free space and memory; stop an update before exhausting disk.

Confirm with the operator whether the VM has a public address, private-only address,
VPN access, or CloudStack NAT/port forwarding. A private guest address does not imply
public reachability. Do not publish an unroutable address in public DNS.

Docker data (`/var/lib/docker`, including named volumes) must live on persistent
storage that survives reboot and VM maintenance. Confirm CloudStack root/data disk
retention rules. Snapshots of a running database are not a replacement for tested
PostgreSQL backups. Protect the disk, env files, Caddy private keys, and backups at rest.

Use an unprivileged SSH administrator with keys. Verify a second SSH connection and
CloudStack console recovery before disabling password/root login or enabling UFW.
Validate changes with `sudo sshd -t`, then reload SSH; retain the original connection.
Do not install applications as root. Docker administrators are effectively root;
limit access to the Docker group/socket. Use `sudo docker` if group access is not approved.

## 2. Install Docker on a fresh Ubuntu host

The following Bash commands are for a new, approved VM. Inventory existing Docker,
containers and packages first; do not remove an existing runtime hosting other apps.
Use the official repository, not the convenience installer. These instructions follow
[Docker's Ubuntu installation guide](https://docs.docker.com/engine/install/ubuntu/).

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git python3
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo docker version
sudo docker compose version
```

Use the Compose plugin (`docker compose`), not legacy `docker-compose`. The ingress-mode and local
smoke overrides require Compose ≥2.24.4 for `!override`, which replaces rather than
appends public ports. See [Compose merge rules](https://docs.docker.com/reference/compose-file/merge/).
No host Node/npm is required in production; Python ≥3.11 runs the operator tools.
The remaining commands assume approved Docker access as the deployment user.

## 3. CloudStack ingress, firewall, and DNS

Ask the operator to configure security groups and, where applicable, virtual-router
firewall/NAT/port-forwarding rules. Required inbound rules:

| Destination | Source | Purpose |
| --- | --- | --- |
| SSH (actual configured port) | Administrator IP/CIDR or VPN only | Administration |
| TCP 80 and 443 | Public clients and ACME validators | HTTP redirect and HTTPS |
| UDP 443 (optional) | Public clients | HTTP/3; TCP HTTPS works without it |
| 3000, 4000, 5432, 2019, Docker API | No public access | Never forward or publish |

Allow outbound DNS, HTTPS to Google/ACME/package registries, and the host's configured
time synchronization. Restrict egress only after identifying repository/mirror needs.
Check IPv6 separately; publish AAAA only if its route and firewall work.
Docker-published ports can bypass UFW: use CloudStack controls and keep the Compose
port contract intact. See [Docker firewall limitations](https://docs.docker.com/engine/network/packet-filtering-firewalls/).

Optional host firewall example, only after confirming the actual SSH port and
testing console recovery (change `22` if needed):

```bash
read -r -p 'Trusted administrator CIDR: ' ADMIN_CIDR
sudo ufw allow from "$ADMIN_CIDR" to any port 22 proto tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp
sudo ufw status verbose
# Recheck the trusted CIDR and a second SSH session before this command:
sudo ufw enable
```

Manually create A (and only working AAAA) records pointing to the verified public
VM/NAT edge address. Allow DNS propagation; check from outside the CloudStack network.
HTTP/HTTPS must reach this Caddy instance for automatic TLS. No wildcard DNS is needed.
See [Caddy HTTPS requirements](https://caddyserver.com/docs/automatic-https).

## 4. Checkout and environment

Use a clean release checkout. Never reset a dirty working tree or reuse local dev
credentials/volumes. These commands do not create a branch or publish code:

```bash
set -euo pipefail
umask 077
sudo install -d -o "$(id -un)" -g "$(id -gn)" /srv/wangmai
git clone https://github.com/Soupgorn/Wangmai.git /srv/wangmai/app
cd /srv/wangmai/app
git fetch origin
read -r -p 'Full reviewed release commit SHA: ' RELEASE_SHA
test "${#RELEASE_SHA}" -eq 40
git switch --detach "$RELEASE_SHA"
test "$(git rev-parse HEAD)" = "$RELEASE_SHA"
test -z "$(git status --porcelain)"
test ! -e .env.production
cp .env.production.example .env.production
chmod 600 .env.production
${EDITOR:-nano} .env.production
```

Fill every placeholder. Generate secrets locally using an approved password manager
or `openssl rand -hex 32`; this runbook does not generate or store production secrets.
Use different database and auth secrets. URL-encode the database password in its URI.
Do not source the env file as a shell script. Protect backups of it outside Git.

| Variable | Required production value |
| --- | --- |
| WANGMAI_INGRESS_MODE | Explicit `direct-https` or `shared-gateway`, matching the override |
| WANGMAI_DOMAIN | One real DNS hostname, no scheme, path, or port |
| BETTER_AUTH_URL | Exactly `https://YOUR_DOMAIN`, no trailing slash |
| BETTER_AUTH_SECRET | Stable, random 32+ characters; also encrypts OAuth tokens |
| GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET | Google OAuth Web application credentials |
| POSTGRES_USER / POSTGRES_DB | Initialization administrator and dedicated database; not the runtime identity |
| POSTGRES_RUNTIME_USER / POSTGRES_MIGRATION_USER | Distinct nonadministrative runtime and migration roles |
| DATABASE_URL | Runtime identity only: `postgresql://RUNTIME:URL_ENCODED_PASSWORD@postgres:5432/DB` |
| POSTGRES_ADMIN_PASSWORD_FILE / POSTGRES_RUNTIME_PASSWORD_FILE / POSTGRES_MIGRATION_PASSWORD_FILE | Protected files for explicit operator bootstrap only |
| MIGRATION_DATABASE_URL_FILE | Protected migration connection file for one-shot migrator only |
| WANGMAI_IMAGE_TAG | Full reviewed commit SHA, equal to RELEASE_SHA |
| POSTGRES_IMAGE / CADDY_IMAGE | Tested official repository digests from the next step |

Compose fixes `NODE_ENV=production`, backend `HOST=0.0.0.0`, backend `PORT=4000`,
frontend `HOSTNAME=0.0.0.0`, frontend `PORT=3000`, and
`API_INTERNAL_ORIGIN=http://backend:4000`. These bind ports stay inside Docker.
`API_PROXY_ORIGIN`, `POSTGRES_PORT`, and `NEXT_PUBLIC_*` secrets are not needed.
The frontend receives no database, Google, or signing credentials.

Keep `BETTER_AUTH_SECRET` during recovery: changing it invalidates signatures and
can make stored encrypted OAuth tokens unreadable. Bootstrap refuses changed credentials; it does not rotate passwords. Plan credential rotation separately.

## 5. Google OAuth production setup — manual console action

Use a Web application OAuth client, preferably separate from localhost development.
In Google Cloud Console, configure the consent screen, approved domain/links,
audience/publication status, and permitted test users if the app is still in Testing.
Complete any Google-required verification before opening access to the intended audience.

- Authorized JavaScript origin: `https://YOUR_DOMAIN`.
- Exact authorized redirect URI: `https://YOUR_DOMAIN/api/auth/callback/google`.
- Preserve any working localhost client/redirects; do not replace them unnecessarily.
- Copy the correct client ID/secret to the protected production env file.
- Only `openid`, `email`, and `profile` are requested. No Calendar permissions.

Google requires redirect URI matching; see [Google's server OAuth guide](https://developers.google.com/identity/protocols/oauth2/web-server).
Better Auth already uses the fixed public URL as its sole trusted origin and secure,
HttpOnly, host-scoped SameSite=Lax cookies in production. Caddy preserves `/api` and
forwards requests to Hono; the callback is never rewritten to Next or a private hostname.
Do not enable wildcard trusted origins or trust arbitrary forwarded host headers.

## 6. Pin infrastructure images and build once

Run on the approved host, before starting any service:

```bash
docker context show
# Confirm this context is the intended local VM daemon, not a remote environment.
docker pull postgres:18-alpine
docker pull caddy:2-alpine
docker image inspect --format '{{index .RepoDigests 0}}' postgres:18-alpine
docker image inspect --format '{{index .RepoDigests 0}}' caddy:2-alpine
# Put those exact postgres@sha256:... and caddy@sha256:... values in .env.production.
${EDITOR:-nano} .env.production
# Use dc() and CADDY_CONFIG from the explicit mode selection in section 0.
dc config --quiet
python3 infra/deployment/ops.py preflight --ingress-mode "$INGRESS_MODE" --env-file .env.production
dc run --rm --no-deps caddy caddy validate --config "$CADDY_CONFIG" --adapter caddyfile
install -d -m 700 /srv/wangmai/releases
# Build in a clean approved checkout on the approved build host, without secrets.
# Select a reviewed Node 24 bookworm-slim digest, never a mutable tag here.
read -r -p 'Approved node:24-bookworm-slim@sha256:... reference: ' NODE_IMAGE
python3 -B infra/deployment/release.py build --commit "$RELEASE_SHA" --node-image "$NODE_IMAGE" --output "/srv/wangmai/releases/$RELEASE_SHA"
python3 -B infra/deployment/release.py verify "/srv/wangmai/releases/$RELEASE_SHA"
```

`caddy validate` checks configuration without starting the HTTPS server or obtaining
certificates. Do not use `caddy run` for validation. Release tags must never be rebuilt
or overwritten after acceptance. The helper refuses dirty source and existing release
tags/output, builds a tracked-only Git archive, and records source/base/lockfile/migration
hashes, local image IDs, platform and OCI source labels in `release.json`. Local builds
have no registry RepoDigest; do not invent one. Retain `source.tar`, `images.tar` and
the reviewed manifest outside the checkout; protect them against modification.
Checksums detect corruption, not a malicious replacement of both archive and manifest.
Retain protected env files separately, never in images or public release artifacts.
Pinned build inputs support repeatability; exact byte-for-byte rebuilds are not claimed.
Retained image content, rather than a later rebuild, is the rollback artifact.
Scan/approve the resulting images under the operator's vulnerability policy.

## 7. Database bootstrap, least privilege, backup and migration

Use the complete [PostgreSQL role security procedure](postgresql-role-security.md)
for actual initialization, bootstrap, one-shot migration, runtime validation and
backup commands. It supersedes the Phase 6A/6B shared-superuser workflow.

The initialization administrator owns the database. A separate non-superuser
migrator owns the application/journal schemas and objects, with only the DDL powers
required by Drizzle. The long-running API receives only runtime DATABASE_URL and
its role name: CONNECT, public USAGE and CRUD on exactly seven application tables;
no sequences, ownership, database/schema CREATE/TEMP or journal access. The API
checks the live role contract before starting. No auth/schema migration files were
rewritten, and startup never migrates or seeds.

The base PostgreSQL service intentionally has no initialization password. On an
approved confirmed-empty persistent volume, use the explicit `compose.database-init.yaml`
override, then recreate only PostgreSQL from normal config to remove its secret
mount/env. Run the explicit `bootstrap` and `migrator` tools from
`compose.database-ops.yaml`; never run production migrations with `dc run backend`.
Do not include either database override in the steady-state `dc()` wrapper.

Before touching an existing database, freeze writes and take a verified encrypted
off-VM backup. Bootstrap refuses existing admin-owned application tables or unsafe
roles rather than silently reassigning/demoting them. Rehearse the fresh-volume
restore/cutover below. Do not delete/reset data, rotate credentials implicitly,
run down -v/prune/schema push, or use an empty volume to hide an old installation.
Keep the PostgreSQL 18 volume mounted at `/var/lib/postgresql` and protect its storage.

The helper still provides exclusive binary-safe custom dumps, checksums and an
isolated restore drill. Restore now creates objects as the migration owner, reapplies
only reviewed runtime grants and verifies live roles. Roles are not included in a
database dump; initialize/bootstrap them before recovery. Retain independent auth
secrets and release artifacts, assign off-VM backup ownership/retention and approved
RPO/RTO, and compare source/restore counts during the same write freeze.

## 8. Start production — separate, explicitly authorized operation

Only after DNS, external ingress, Google configuration, backups, and release approval
are complete, an operator may run:

```bash
python3 infra/deployment/ops.py preflight --ingress-mode "$INGRESS_MODE" --env-file .env.production
dc up -d --wait --no-build --pull never
dc ps
dc logs --tail=100 frontend backend postgres caddy
read -r -p 'Verified public hostname: ' PUBLIC_DOMAIN
curl --fail --silent --show-error "https://$PUBLIC_DOMAIN/api/health"
curl --fail --silent --show-error "https://$PUBLIC_DOMAIN/api/ready"
curl --fail --silent --show-error "https://$PUBLIC_DOMAIN/health/ready"
curl --silent --show-error --output /dev/null --write-out '%{http_code}\n' "https://$PUBLIC_DOMAIN/api/v1/me"
curl --silent --show-error --head "http://$PUBLIC_DOMAIN/"
```

Expect health 200, unauthenticated me 401, public HTTP→HTTPS redirect (at the
gateway in shared mode, at Caddy in direct mode), and a valid public certificate without `curl -k`. Check from an external network and inspect browser TLS.
Only Caddy's ports should appear in `docker ps` / `docker inspect`; independently scan
the public address for unintended 3000/4000/5432/2019 listeners.

`/api/health` is process liveness and survives database outages. Docker uses
`/api/ready` (bounded DB probe, 503 on failure) and frontend `/health/ready`
(checks the internal API readiness without cookies). Frontend `/` is an existing
public process/rendering check. Readiness returns only status, with no cache.
Caddy's loopback admin check does not prove public TLS reachability. The DB check,
migration journal, API authorization tests, and manual account checks remain required.
`depends_on` gates initial startup, not automatic recovery on later health failures.
Restart policies restart exited processes; they do not restart merely unhealthy ones.

## 9. Production acceptance

Use legitimate Google accounts in separate browser profiles. No fabricated sessions.
All of these are **NOT TESTED on production** until a future authorized deployment:

1. Sign in and return through `/api/auth/callback/google` over HTTPS. Inspect Secure,
   HttpOnly, SameSite=Lax cookies and no internal-host redirects. Check logout/relogin.
2. Create weekly and date-specific schedules, a single-occurrence override, and monthly
   multi-date edits. Refresh and recreate app containers; confirm persistence.
3. A enables sharing. B selects Oct 30–Nov 1, 13:00–15:00, Asia/Bangkok. With A available
   on the first two days and Busy on the last, confirm 2/3 Any Day, no Every Day match,
   and Busy on Nov 1 under By Date. Confirm one-day searches as well.
4. A disables sharing; B refocuses/retries. A must disappear from all results and counts.
   Unknown never counts as Available. No titles, notes, raw schedules, or email leaks.
5. Public preview remains fictional and cannot change real schedules/settings.
6. Verify desktop/mobile layout, reduced motion, loading/retry states, and rapid changes.

The earlier user-reported local two-account pass is not evidence for production OAuth,
proxy, DNS, or TLS. Repeat this checklist on the actual deployment.

## 10. Logs and operations

```bash
dc ps
dc logs --since=15m --tail=200 backend frontend caddy postgres
docker stats --no-stream
df -h
docker system df
dc exec -T backend node backend/dist/db/check.js
```

Logs rotate at 10 MiB ×3 per service. Do not enable request access logs that include
OAuth callback query strings, cookies, bodies, or authorization headers. Redact logs
before sharing. Investigate sanitized 503s with connectivity/schema checks, rather than
turning on verbose credential logging. Keep host time synchronization working.

## 11. Updates and application rollback

For each update, review code/lockfile/migrations and test images before the window.
Never `git pull` into a dirty release checkout. Stop if unexpected changes appear.

1. Record current commit, env file (encrypted/private copy), infrastructure digests and
   frontend/backend image IDs. Retain the old release directory and its manifest off the VM.
2. Fetch and detach at the approved new SHA using the checkout checks above. Set
   `WANGMAI_IMAGE_TAG` to that SHA; keep the existing auth/database secrets and domain.
3. Build/pin/validate as in step 6. Do not move infrastructure major versions implicitly.
4. Stop writes, create and test a backup, and migrate exactly once as in step 7.
5. Start with `--no-build --pull never`, run steps 8–9, and retain the prior artifacts.

If code rollback is compatible with the migrated schema, stop the app services,
load the retained archive, and restore the old code/config and image tag. Do not rebuild:

```bash
dc stop caddy frontend backend
read -r -p 'Previous reviewed full commit SHA: ' OLD_SHA
test "${#OLD_SHA}" -eq 40
# Independently compare images.tar/source.tar hashes with the approved manifest.
# Loading is an explicit future operator action; the release helper never loads.
docker image load -i "/srv/wangmai/releases/$OLD_SHA/images.tar"
python3 -B infra/deployment/release.py verify "/srv/wangmai/releases/$OLD_SHA"
git switch --detach "$OLD_SHA"
# Restore that release's protected env file; preserve the same DB and auth secrets.
${EDITOR:-nano} .env.production
# Re-define dc if that release used a different Compose file.
dc config --quiet
dc up -d --wait --no-build --pull never
```

Only roll back code when compatibility has been reviewed. Drizzle has no automatic
down-migration here. An incompatible schema requires restoring a pre-update archive
to a fresh volume, or a reviewed forward fix. Never run guessed reverse SQL.

## 12. Database recovery into a fresh volume

This is a later, separately authorized incident/cutover procedure. Preserve the
original volume, select a trusted verified backup and schema-compatible retained
release, and approve any loss of writes after the backup. Never restore over data.

Use these gates before the **complete** [owner-safe restore procedure](postgresql-role-security.md#backup-and-owner-safe-restore):

```bash
dc stop caddy frontend backend
read -r -p 'Absolute trusted dump archive: ' BACKUP_ARCHIVE
read -r -p 'Unique NEW volume name (e.g. wangmai_recovery_20261030_1): ' RECOVERY_VOLUME
[[ "$RECOVERY_VOLUME" =~ ^wangmai_recovery_[a-zA-Z0-9_]+$ ]]
if docker volume inspect "$RECOVERY_VOLUME" >/dev/null 2>&1; then
  echo 'STOP: recovery volume already exists; choose a new name.' >&2
  exit 1
fi
test ! -e compose.recovery.yaml
cat > compose.recovery.yaml <<EOF
volumes:
  postgres_data:
    name: $RECOVERY_VOLUME
EOF
chmod 600 compose.recovery.yaml
```

Do not start the empty target with base Compose or use the old raw administrative
pg_restore block. The linked procedure supplies `rinit`, `rc` and `ro` wrappers:
initialize the new volume, remove its initialization mount, bootstrap target roles,
run the guarded `ops.py restore` as migration owner, apply `--grant-only`, then
verify runtime permissions and data/journal. Startup is a separate approval gate.
Every subsequent command (including backup/helper commands) must keep the selected
ingress and recovery overrides. Preserve both volumes and a protected off-VM copy
of the exact mapping; helpers require `--recovery-file compose.recovery.yaml`.

## 13. Local verification without ACME

For the Phase 6C.1 proxy contract smoke, first confirm a **local** Docker socket
context (`npipe://` on Windows or `unix://` on Linux) and existing local images.
This smoke never pulls/builds an image, joins an application network, publishes a
host port, mounts a database volume or connects to a production endpoint. Substitute
an existing local Node 24 image if `wangmai-backend:phase6a-smoke` is unavailable:

```bash
docker context show
docker context inspect --format '{{.Endpoints.docker.Host}}'
docker image inspect caddy:2-alpine wangmai-backend:phase6a-smoke --format '{{.Id}}'
python3 -B -m unittest discover -s infra/deployment -p 'test_*.py' -v
python3 -B infra/deployment/proxy_smoke.py --caddy-image caddy:2-alpine --node-image wangmai-backend:phase6a-smoke
# Optional: current role-aware backend/frontend images and fixture-only migrations.
# Build these local smoke tags first; never use them as production release tags.
python3 -B infra/deployment/proxy_smoke.py --node-image wangmai-backend:phase6c-smoke --frontend-image wangmai-frontend:phase6c-smoke
```

The tool creates a uniquely named **internal** Docker network, synthetic upstreams
on 3000/4000, a gateway client and two Caddy instances. It derives trust **only for
that disposable test peer**, never a production default. It validates both exact
production configs without starting them; shared mode runs its actual config and
startup guard, while direct mode uses the same routes with a local certificate issuer.
The client verifies the generated local CA (no TLS verification bypass). Tests cover
routes, callback/query preservation, cookies, no origin redirects, direct HTTPS
redirects, header spoofing and untrusted peer rejection, blocked startup modes,
and upstream failure logs. Only its own disposable containers/anonymous Caddy test
volumes/network are removed afterward. It reads no production env file or user data.
The optional application pass requires the compiled Wangmai backend image as
`--node-image`, the frontend standalone image, and an existing `postgres:18-alpine`
(or `--postgres-image`). It starts an empty, uniquely isolated PostgreSQL container
with public fixture credentials and its own anonymous disposable volume, then checks
real health/session routes, login redirects and fixed auth/cookie options. It explicitly
bootstraps separate fixture roles and runs local migrations before API startup; it
performs no Google exchange. All test containers and their own
anonymous volumes are removed; no existing or named database volume is attached.

For current database/app validation use the disposable [Phase 6C.2 role rehearsal](postgresql-role-security.md#local-rehearsal-and-remaining-gates).
It never loads a production environment, runs existing integration tests in its
own cluster, and proves runtime permissions plus backup/restore ownership. Historical
`infra/smoke/verify.mjs` and the Phase 6A stack are retained as evidence for their old
images; their shared-superuser initialization/migration commands must not be used
with current production images. Do not reuse existing smoke volumes to bypass the
role model or weaken checks to make them start.

## Remaining launch blockers

See [Phase 6D.2 application readiness](phase-6d2-app-readiness.md) for current
health, auth verification, release and isolated production simulation commands.

- Shared-gateway security contract: exact sources, sanitized headers, source restrictions and confidential/authenticated origin transport are NOT VERIFIED.
- Approved mode/domain and verified ingress/IPv6 routing, CloudStack rules, durable storage.
- Least-privilege implementation is locally verified; live VM provisioning/cutover and production runtime verification remain pending.
- Approved production Google OAuth client/consent settings and manually entered secrets.
- Reviewed immutable release, image vulnerability approval, and pinned infrastructure digests.
- Encrypted off-VM backup destination, retention/operator ownership, restore evidence and RPO/RTO approval.
- Actual VM capacity/OS verification, public HTTPS checks, and legitimate multi-account production acceptance.

No CloudStack connection, deployment, DNS/OAuth changes, public certificate request,
or automatic deployment is performed by Phase 6C.2.
