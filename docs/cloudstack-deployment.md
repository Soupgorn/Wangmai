# CloudStack manual deployment runbook — Phase 6A

This is a preparation runbook, not deployment authorization. No VM, domain, public
IP, CloudStack ingress, Google production client, or production backup destination
has been verified. Complete the release gates below before starting production Caddy:
starting it requests public certificates. Local testing uses a separate HTTP-only stack.

## Architecture and release gates

Internet → Caddy :80/:443 → Next.js :3000 and Hono :4000 → PostgreSQL :5432.
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

Use the Compose plugin (`docker compose`), not legacy `docker-compose`. The local
smoke override requires Compose ≥2.24.4 for `!override`, which replaces rather than
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
| WANGMAI_DOMAIN | One real DNS hostname, no scheme, path, or port |
| BETTER_AUTH_URL | Exactly `https://YOUR_DOMAIN`, no trailing slash |
| BETTER_AUTH_SECRET | Stable, random 32+ characters; also encrypts OAuth tokens |
| GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET | Google OAuth Web application credentials |
| POSTGRES_USER / POSTGRES_PASSWORD / POSTGRES_DB | Database initialization credentials; password 24+ characters |
| DATABASE_URL | `postgresql://USER:URL_ENCODED_PASSWORD@postgres:5432/DB` |
| WANGMAI_IMAGE_TAG | Full reviewed commit SHA, equal to RELEASE_SHA |
| POSTGRES_IMAGE / CADDY_IMAGE | Tested official repository digests from the next step |

Compose fixes `NODE_ENV=production`, backend `HOST=0.0.0.0`, backend `PORT=4000`,
frontend `HOSTNAME=0.0.0.0`, frontend `PORT=3000`, and
`API_INTERNAL_ORIGIN=http://backend:4000`. These bind ports stay inside Docker.
`API_PROXY_ORIGIN`, `POSTGRES_PORT`, and `NEXT_PUBLIC_*` secrets are not needed.
The frontend receives no database, Google, or signing credentials.

Keep `BETTER_AUTH_SECRET` during recovery: changing it invalidates signatures and
can make stored encrypted OAuth tokens unreadable. Initialization env changes do
not rotate credentials in existing PostgreSQL volumes; plan credential rotation separately.

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
dc() { docker compose --project-name wangmai --env-file .env.production -f compose.yaml "$@"; }
dc config --quiet
python3 infra/deployment/ops.py preflight --env-file .env.production
dc run --rm --no-deps caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
dc build --pull frontend backend
docker image inspect --format '{{.Id}} {{.Config.User}}' "wangmai-frontend:$RELEASE_SHA" "wangmai-backend:$RELEASE_SHA"
install -d -m 700 /srv/wangmai/releases
docker image save -o "/srv/wangmai/releases/$RELEASE_SHA.tar" "wangmai-frontend:$RELEASE_SHA" "wangmai-backend:$RELEASE_SHA"
sha256sum "/srv/wangmai/releases/$RELEASE_SHA.tar" > "/srv/wangmai/releases/$RELEASE_SHA.tar.sha256"
```

`caddy validate` checks configuration without starting the HTTPS server or obtaining
certificates. Do not use `caddy run` for validation. Release tags must never be rebuilt
or overwritten after acceptance. Retain archives, recorded image IDs, exact env files,
and the infrastructure digests for rollback. Node 24 base tags receive patches at build
time; retained images, rather than a later rebuild, are the rollback artifact.
Scan/approve the resulting images under the operator's vulnerability policy.

## 7. Database backup and migration

The PostgreSQL 18 image is intentionally mounted at `/var/lib/postgresql`, including
its versioned PGDATA child. Keep that volume and PostgreSQL major version unchanged.
See [the official PostgreSQL image](https://hub.docker.com/_/postgres).
Never run `down -v`, volume prune, `db:generate`, schema push, reset, or seed against production.
The runtime database role currently also owns the schema (the existing architecture);
it is not a separately provisioned least-privilege role. Compensating controls are the
private network, no published DB port, limited host access, and protected credentials.

For first installation:

```bash
dc up -d --wait postgres
dc run --rm --no-deps backend node backend/dist/db/check.js
# Explicit one-shot operation; startup does not run migrations.
dc run --rm --no-deps backend node backend/dist/db/migrate.js
dc exec -T postgres sh -eu -c 'psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT count(*) AS applied_migrations FROM drizzle.__drizzle_migrations"'
```

Expect three migrations for the Phase 5 baseline. Re-running the migrator safely skips
applied migrations. Do not edit old SQL/journal files or run concurrent migration jobs.
For an existing installation, stop writes and back up **before** migrating:

```bash
dc stop caddy frontend backend
install -d -m 700 /srv/wangmai/backups
python3 infra/deployment/ops.py backup --env-file .env.production --destination /srv/wangmai/backups
read -r -p 'Absolute path of the completed .dump archive: ' BACKUP_ARCHIVE
python3 infra/deployment/ops.py verify-backup --env-file .env.production --archive "$BACKUP_ARCHIVE"
# Proceed only after comparing restored counts with the source and protecting an off-VM copy.
dc run --rm --no-deps backend node backend/dist/db/migrate.js
```

The helper uses binary streams, exclusive backup filenames, private file permissions,
a custom-format dump, archive listing, and a SHA-256 sidecar. Failures leave `.partial`
files, never a reported complete backup. `verify-backup` checks the digest, restores
into a **new container and volume with no network or published ports**, checks the
migration journal and table counts, and stops it. It never resets/drops an existing DB.
The test volume uses public fixture credentials: never promote it to production.

Compare source counts during the same write freeze:

```bash
dc exec -T postgres sh -eu -c 'exec psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
SELECT 'migrations', count(*) FROM drizzle.__drizzle_migrations
UNION ALL SELECT 'users', count(*) FROM public."user"
UNION ALL SELECT 'schedules', count(*) FROM public.schedule_entry
UNION ALL SELECT 'exceptions', count(*) FROM public.schedule_exception
UNION ALL SELECT 'preferences', count(*) FROM public.schedule_preference;
SQL
```

For routine MVP backups, run the backup command at an operator-approved interval
(initial recommendation: nightly and before each update), copy the dump/checksum to
an encrypted off-VM destination, verify transfer checksums, and conduct restore drills.
Protect the auth secret/env file separately and back up Caddy data/config volumes using
the storage provider's consistent snapshot procedure. Dumps contain private data and
sessions. Do not attach them to issues or store them in the repository.
Keep the last known-good backup until a replacement has passed a restore drill.
Define retention, responsible operator, alerting, and acceptable RPO/RTO before launch;
nightly dumps imply up to a day of data loss. No automated backup job is installed here.
If that loss window is unacceptable, require managed backups/WAL archiving and PITR
before launch. See [PostgreSQL backup approaches](https://www.postgresql.org/docs/18/backup.html)
and [custom dumps](https://www.postgresql.org/docs/18/app-pgdump.html).

## 8. Start production — separate, explicitly authorized operation

Only after DNS, external ingress, Google configuration, backups, and release approval
are complete, an operator may run:

```bash
python3 infra/deployment/ops.py preflight --env-file .env.production
dc up -d --wait --no-build --pull never
dc ps
dc logs --tail=100 frontend backend postgres caddy
read -r -p 'Verified public hostname: ' PUBLIC_DOMAIN
curl --fail --silent --show-error "https://$PUBLIC_DOMAIN/api/health"
curl --silent --show-error --output /dev/null --write-out '%{http_code}\n' "https://$PUBLIC_DOMAIN/api/v1/me"
curl --silent --show-error --head "http://$PUBLIC_DOMAIN/"
```

Expect health 200, unauthenticated me 401, HTTP→HTTPS redirect, and a valid public
certificate without `curl -k`. Check from an external network and inspect browser TLS.
Only Caddy's ports should appear in `docker ps` / `docker inspect`; independently scan
the public address for unintended 3000/4000/5432/2019 listeners.

Health checks are process checks: `/api/health` does not prove DB/schema readiness,
and Caddy's loopback admin check does not prove public TLS reachability. The DB check,
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
   frontend/backend image IDs. Retain `OLD_SHA.tar` and its checksum off the VM.
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
sha256sum -c "/srv/wangmai/releases/$OLD_SHA.tar.sha256"
docker image load -i "/srv/wangmai/releases/$OLD_SHA.tar"
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

This is an incident procedure for a later explicitly authorized operation. Preserve
the original volume and take a fresh backup if readable. Select a trusted archive
and matching application/env artifacts. A restore loses writes after that snapshot;
obtain owner approval for the loss window. Do not restore over the existing volume.

```bash
dc stop caddy frontend backend
read -r -p 'Absolute path of the trusted .dump archive: ' BACKUP_ARCHIVE
python3 infra/deployment/ops.py verify-backup --env-file .env.production --archive "$BACKUP_ARCHIVE"
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
rc() { docker compose --project-name wangmai --env-file .env.production -f compose.yaml -f compose.recovery.yaml "$@"; }
rc config --quiet
rc up -d --wait --no-deps --force-recreate postgres
rc exec -T postgres sh -eu -c 'exec pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --exit-on-error --single-transaction --no-owner --no-privileges' < "$BACKUP_ARCHIVE"
rc run --rm --no-deps backend node backend/dist/db/check.js
# Verify restored counts/journal. Select the schema-compatible retained application images.
rc up -d --wait --no-build --pull never
```

Keep using the recovery override for **every** subsequent command, backup and update:
the default `dc` without the override would otherwise select the old volume when
recreating PostgreSQL. Record this mapping in the incident/release handoff and redefine
`dc` to use both files. Operator helper commands must include
`--recovery-file compose.recovery.yaml`, for example:

```bash
python3 infra/deployment/ops.py preflight --env-file .env.production --recovery-file compose.recovery.yaml
python3 infra/deployment/ops.py backup --env-file .env.production --recovery-file compose.recovery.yaml --destination /srv/wangmai/backups
```

Never remove either volume during incident response. Repeat full account acceptance
before reopening traffic. The local recovery override is ignored by Git; protect an
off-VM copy with the deployment's env and release records.

## 13. Local verification without ACME

These commands use only public fixture values and the separate `wangmai-smoke` project.
Do not combine the development Compose file with production. Do not use the smoke
credentials, HTTP Caddyfile, or `.invalid` auth origin for real Google login.

```bash
smoke() { docker compose --project-name wangmai-smoke --env-file infra/smoke/.env.example -f compose.yaml -f infra/smoke/compose.yaml "$@"; }
smoke config --quiet
smoke build frontend backend
smoke up -d --wait postgres
smoke run --rm --no-deps backend node backend/dist/db/migrate.js
smoke up -d --wait --no-build
curl --fail http://127.0.0.1:8088/api/health
# On a development checkout with Node 24, exercise routing, privacy and recreation:
node infra/smoke/verify.mjs
python3 infra/deployment/ops.py backup --local-smoke --env-file infra/smoke/.env.example --destination backups/phase6a
# Use the actual archive path printed by backup:
python3 infra/deployment/ops.py verify-backup --local-smoke --env-file infra/smoke/.env.example --archive /ABSOLUTE/PATH/TO/ARCHIVE.dump
smoke stop
```

The override replaces public port bindings with `127.0.0.1:8088:80` and disables
automatic HTTPS. It cannot request public certificates. Containers can be recreated
without losing the project-scoped PostgreSQL volume. Stop it after testing; keep its
volume and backup evidence until reviewed. Use `python3 -m unittest discover -s
infra/deployment -p 'test_*.py' -v` for deployment guard tests.

## Remaining launch blockers

- Approved real domain and verified public/NAT/IPv6 routing, CloudStack rules, storage retention.
- Approved production Google OAuth client/consent settings and manually entered secrets.
- Reviewed immutable release, image vulnerability approval, and pinned infrastructure digests.
- Encrypted off-VM backup destination, retention/operator ownership, restore evidence and RPO/RTO approval.
- Actual VM capacity/OS verification, public HTTPS checks, and legitimate multi-account production acceptance.

No CloudStack connection, deployment, DNS/OAuth changes, public certificate request,
or automatic CI/CD is performed by Phase 6A.
