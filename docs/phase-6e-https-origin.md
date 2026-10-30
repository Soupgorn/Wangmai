# Phase 6E — Provisioned HTTPS origin behind NaCl

This is implementation and local test evidence, **not production activation
authorization**. No SSH, production env/database change, deployment, public traffic
switch, certificate issuance for production, or approved-image rebuild was performed.

## Facts and unresolved evidence

The owner identifies `0fc18230fdf4126b8570f784a45f9e650471c1e0` as the approved
release, reports its isolated production smoke passed on the Ubuntu VM, and reports
NaCl currently targets `https://10.60.2.22:80`. Those VM/gateway facts were not
independently checked in this phase. Git inspection confirms that release is the
current main baseline. Its existing HTTP-origin listener is incompatible with that
HTTPS upstream URL. The intended new endpoint is `https://10.60.2.22:443`.

An HTTPS selection in a UI proves neither certificate-chain nor identity validation.
Production remains **BLOCKED** until NaCl administrators establish all of:

- Exact gateway TCP peer CIDRs, including NAT/failover behavior as observed by Caddy.
  Do not use the destination VM IP or a shared subnet as a guessed source allowlist.
- Actual upstream verification enabled, accepted trust anchors, chain/depth policy,
  and rejection of an untrusted, expired or wrong-identity origin certificate.
- Exact verification identity and SNI (including whether SNI is absent). If the
  identity is `10.60.2.22`, the leaf must contain **IP SAN `10.60.2.22`**. A textual
  DNS SAN containing that number, or a matching CN alone, is insufficient.
- If a DNS identity is proposed, explicit support for selecting it for verification/
  SNI while connecting to the private IP and preserving the public HTTP Host.
  Neither a custom hostname nor a custom CA is assumed supported.
- The existing header sanitization, public Host/scheme, source restrictions,
  origin confidentiality/integrity and secret-safe gateway logging contracts.

Publicly trusted CAs cannot issue certificates containing reserved/private IPs under
the [CA/Browser Forum requirements, section 4.2.2](https://cabforum.org/working-groups/server/baseline-requirements/requirements/).
Thus, if NaCl requires this private IP identity and accepts only public trust roots,
the proposed contract cannot be satisfied. Stop and obtain an administrator-supported
verified identity/trust arrangement. Do not substitute `tls internal`, self-sign a
production certificate, disable verification, or silently fall back to HTTP.

## Configuration and boundaries

| Mode | Override | Origin | Certificates |
| --- | --- | --- | --- |
| `direct-https` | `compose.direct-https.yaml` | Existing public 80/443 behavior | Existing public ACME |
| `shared-gateway` | `compose.shared-gateway.yaml` | Verified private IPv4 TCP 80 | None; existing encrypted-underlay contract still required |
| `shared-gateway-https` | `compose.shared-gateway-https.yaml` | Verified private IPv4 TCP 443 only | Explicit provisioned leaf/intermediate chain and matching key |

Select exactly one override and matching env mode. Base-only, mixed modes and wrong
selectors fail preflight/startup. HTTPS mode does not publish HTTP, UDP/HTTP3, app,
database or admin ports. The Caddy container listens on its own 443; the host mapping
binds the reviewed private interface, never `0.0.0.0`. Startup also rejects wildcard,
loopback, non-private or malformed bind values. Firewall/Docker-aware source ACLs
remain required and cannot be established by preflight alone.

`Caddyfile.shared-gateway-https` has `auto_https off`, explicit file TLS and a default
SNI used only for clients sending none. This selects a provisioned certificate; it
does not control or replace gateway-side verification. HTTP Host remains the public
application domain and is checked separately from the origin TLS identity. See
[Caddy global options](https://caddyserver.com/docs/caddyfile/options) and
[manual TLS](https://caddyserver.com/docs/caddyfile/directives/tls).

The actual TCP peer matcher, strict trusted proxy parsing, public Host, single HTTPS
forwarded scheme/host checks, forwarding-header removal and normalized upstream
headers are preserved. `/api` and `/api/*` go intact to Hono; all other paths go to
Next. OAuth callback path/query and cookies are not rewritten. Better Auth, CSRF,
session/cookie settings, business logic, database roles and all three migrations are
unchanged. Caddy is still the application router; no new production proxy is added.

Use the production example's additional fields:

```dotenv
WANGMAI_INGRESS_MODE=shared-gateway-https
# Populate only from administrator evidence, not from this example:
WANGMAI_ORIGIN_BIND_IP=
WANGMAI_GATEWAY_CIDRS=
WANGMAI_GATEWAY_TLS_VERIFICATION_VERIFIED=unverified
WANGMAI_GATEWAY_TLS_CONTRACT_REFERENCE=
WANGMAI_ORIGIN_TLS_IDENTITY=
WANGMAI_ORIGIN_TLS_CERT_FILE=/CHANGE_ME/origin/fullchain.pem
WANGMAI_ORIGIN_TLS_KEY_FILE=/CHANGE_ME/origin/private.key
WANGMAI_ORIGIN_TLS_CA_FILE=/CHANGE_ME/origin/trust.pem
```

The three existing gateway verification flags and gateway contract reference remain
mandatory. No production flag is automatically set to `verified` by selecting TLS.
The trust file must represent the trust anchors actually used by NaCl, not a locally
invented CA which happens to make preflight pass.

## Operator sequence — future authorized work only

1. **Obtain the NaCl contract first.** Record the above evidence, exact TLS identity,
   SNI, accepted CA roots, source CIDRs, preserved public Host/headers, and source ACLs.
   Resolve the private-IP/public-trust incompatibility before certificate procurement.
2. **Provision origin TLS securely.** Obtain the approved leaf with correct SAN and
   `serverAuth` usage, intermediates, matching unencrypted PEM key and accepted roots.
   Store regular non-symlink files outside the checkout, e.g. a root-owned directory
   `/srv/wangmai-origin-tls` mode 700; key mode 600, chain/trust mode 644 or 600,
   with no group/world-writable parent directory. Do not put CA private keys here.
   Use an approved secure transfer/provisioning mechanism; do not paste key material
   into shell history, env files, Git, tickets or logs. Windows development ACLs do
   not establish Ubuntu production permissions. Set the three paths in the protected
   operator env file. Only Caddy receives the read-only mounts; missing sources are
   not auto-created. This phase supplies no production certificate issuance command.
3. **Configure verified sources and restrictions.** Bind the confirmed private VM
   interface; apply reviewed CloudStack/host/Docker-aware rules allowing TCP 443 only
   from the actual gateway peers. Exclude public, other-tenant and alternate-interface
   bypasses. Keep 3000/4000/5432/2019 private. Record all required reviewed attestations
   and references explicitly. No rule or flag is changed by this implementation.
4. **Run production preflight with the new reviewed infrastructure checkout.**
   Preserve the approved release images/artifacts and set `WANGMAI_IMAGE_TAG` to the
   approved application SHA above; app source/Dockerfiles are unchanged by Phase 6E.
   Pin the tested Caddy/PostgreSQL digests. Install/verify Python 3.12+, OpenSSL 3+
   and the supported Docker Compose version through the separate VM-preparation
   process. Keep deployment files at the reviewed Phase 6E commit and record both
   that infrastructure SHA and the application image SHA.

   ```bash
   INGRESS_MODE=shared-gateway-https
   dc() { docker compose --project-name wangmai --env-file .env.production -f compose.yaml -f compose.shared-gateway-https.yaml "$@"; }
   dc config --quiet
   python3 -B infra/deployment/ops.py preflight --ingress-mode "$INGRESS_MODE" --env-file .env.production
   dc run --rm --no-deps --pull never caddy caddy validate --config /etc/caddy/Caddyfile.shared-gateway-https --adapter caddyfile
   ```

   Offline preflight verifies protected regular files, read-only binds, private
   mapping, key pairing, explicit trusted roots/intermediates, SAN identity, current
   chain validity/server purpose, modern key/signature security and at least 24 hours
   remaining on the leaf. Host OpenSSL output is captured; secrets/errors are not
   printed. It never contacts the VM/gateway or runs ACME. Startup validates file
   presence/readability and Caddy certificate/key provisioning before serving. It
   does not continuously validate expiry or independently prove the gateway contract.
5. **Initialize production DB only after gates pass and separate authorization.**
   Follow [database role security](postgresql-role-security.md): verify an empty new
   volume before using the explicit init override; provision admin/migrator/runtime
   roles, run the one-shot migrator, then live runtime-role checks. Existing data must
   never be reset or initialized again. Require tested backups/recovery before changes.
   `ops.py preflight-db` and `preflight-runtime` accept this explicit ingress mode.
6. **Deploy only the reviewed configuration and retained approved images**, after
   release/backup/rollback and deployment approval. Do not rebuild the approved app
   tag or use `dc build`. Verify retained image IDs against the approved manifest.

   ```bash
   dc up -d --wait --no-build --pull never
   dc ps
   ```

   Obtain a direct origin TLS test from an administrator-controlled allowed peer
   using the actual verification identity/CA before changing public traffic. Do not
   whitelist a laptop or broaden gateway CIDRs merely to run a test.
7. **Change NaCl only after origin acceptance:** an authorized administrator changes
   the backend to `https://10.60.2.22:443` with the reviewed verification and SNI
   settings, preserving the public HTTP Host and sanitized forwarding headers.
   The currently reported `https://10.60.2.22:80` is not a valid target for this mode.
   This repository never changes that mapping automatically.
8. **Verify externally and from the permitted gateway peer.** Check valid public TLS,
   `/api/health`, `/api/ready`, `/health/ready`, protected-route authorization, legitimate
   Google login/callback/logout and persistent sessions. Verify source rejection,
   wrong-certificate/identity rejection at NaCl, private ports, spoofed headers,
   multiple cookies and secret-safe gateway/origin logs. Perform functional/capacity
   acceptance. A public 200 alone is not security evidence. Real Google/NaCl behavior
   remains untested in this phase. No `curl -k` or equivalent verification bypass.

If any gate fails, stop activation. Keep the gateway away from an unaccepted origin;
do not switch automatically to HTTP or direct public HTTPS. Reverting to HTTP still
requires its original confidential/authenticated transport contract. Schema and data
are unchanged here; preserve backups and approved image archives throughout recovery.

For renewal, monitor leaf/chain expiry and assign an owner. Securely stage the new
pair, rerun preflight and Caddy validation, then recreate/reload the reviewed Caddy
service in an approved window and verify the certificate actually served. File bind
mounts retain inodes: atomic host-file replacement requires container recreation to
rebind new files. There is no automatic ACME or self-signed fallback. A gateway that
validates expiry must reject an expired origin even if Caddy is still running.

## Disposable verification

Use local existing approved application images read-only; the tests never build,
retag, load or overwrite them. All generated certificates/keys are disposable test
fixtures outside Git and are removed with their unique test resources. No test ports
are published by the TLS-origin smoke or either full production simulation.

```bash
npm ci
npm run lint
npm run typecheck
npm run build
npm test
python3 -B -m unittest discover -s infra/deployment -p 'test_*.py' -v
APP_SHA=0fc18230fdf4126b8570f784a45f9e650471c1e0
python3 -u -B infra/deployment/origin_tls_smoke.py --node-image "wangmai-backend:$APP_SHA"
python3 -u -B infra/deployment/proxy_smoke.py --node-image "wangmai-backend:$APP_SHA" --frontend-image "wangmai-frontend:$APP_SHA"
python3 -u -B infra/deployment/production_smoke.py --backend-image "wangmai-backend:$APP_SHA" --frontend-image "wangmai-frontend:$APP_SHA"
python3 -u -B infra/deployment/production_smoke.py --ingress-mode shared-gateway-https --backend-image "wangmai-backend:$APP_SHA" --frontend-image "wangmai-frontend:$APP_SHA"
python3 -u -B infra/deployment/role_smoke.py --backend-image "wangmai-backend:$APP_SHA"
```

TLS smoke provisions a root/intermediate/leaf for the actual isolated origin IP and
an explicit test DNS SAN. Clients verify the chain, IP SAN without SNI, and DNS SAN.
It rejects unknown CA/wrong DNS/wrong IP, HTTP to TLS, untrusted TCP peers, header
spoofing and missing/malformed/mismatched keys; routing/callback/cookies are preserved.
The full HTTPS simulation uses a test-only gateway with explicit DNS verification
and test CA trust. This does not imply NaCl supports either capability. Its real
OAuth state/PKCE/JWT/session, CRUD/sharing/availability, outage/recovery and graceful
shutdown checks run over verified gateway→origin TLS. The original HTTP simulation
and direct/HTTP ingress smokes remain supported. CI runs the same checks with fresh
CI-only tags; it does not rebuild an approved release tag or publish/deploy images.

## Scope and evidence limits

Executed locally in this phase: ESLint, workspace typechecks, native production
builds and 50 unit tests passed. Deployment/TLS/release guards: 36 passed, one POSIX
permission test skipped on Windows (required in Linux CI). Seven role tests and
38 integration tests passed, including fresh/repeated migrations and exact
backup/restore fingerprints/grants. Existing direct/HTTP ingress smokes, provisioned
TLS-origin smoke, and both full production Compose simulations passed using the
existing approved-SHA local images. No approved image was built or retagged.
The TLS smoke additionally rejected wildcard startup binding, unverified/mixed
modes, and empty/malformed/mismatched keys. Local documentation links and Git
whitespace checks passed. CI status is reported separately against the feature SHA.

No application source, database migration, database privilege, auth/cookie policy or
Dockerfile changed. Application hosting independence and future Vercel compatibility
are preserved. Existing backups, historical reports, local env and generated files
are excluded from the feature commits. Main and approved release artifacts are not
rewritten. Live certificate provisioning, NaCl verification evidence, production
initialization, public acceptance and traffic activation require separate authorization.
