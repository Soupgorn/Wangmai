# Production domain cutover: wangmai.snowballwy.com

Target architecture: browser HTTPS -> NaCl reverse proxy -> protected HTTP
`10.60.2.22:3000` -> Next.js -> Hono `backend:4000` -> PostgreSQL `postgres:5432`.
No Caddy or Vercel is introduced. This target supersedes `wangmai.ce-nacl.com`.
This document prepares a migration; it does not attest that production is secure
or authorize bypassing the existing provider ingress guards.

## Runtime values and image requirements

The non-secret changes to the existing private `/etc/wangmai/.env.production` are:

```dotenv
WANGMAI_DOMAIN=wangmai.snowballwy.com
BETTER_AUTH_URL=https://wangmai.snowballwy.com
```

Apply these two changes only after the prerequisites below are ready. Preserve
every existing auth/Google/database secret, role, database name, digest, image tag
and volume mapping. Do not copy the example file over the private production file.
Do not display the full environment or rendered Compose configuration.

Changing the hostname alone does **not** require a Docker image rebuild:

- `infra/next-ingress/register.cjs` calls the socket guard using runtime
  `process.env`; the guard reads `WANGMAI_DOMAIN` at process startup.
- Hono loads `BETTER_AUTH_URL` at runtime. Better Auth uses it for its fixed
  `baseURL`, sole trusted origin, error URL and Google callback base.
- Browser API requests are same-origin. The production Next rewrite is baked to
  the unchanged internal `http://backend:4000`, not the public domain. There is
  no public-domain `NEXT_PUBLIC_*` build argument to replace.

Both frontend and backend need a controlled recreation to consume changed runtime
values; editing the env file alone does not update existing containers. Reuse only
reviewed immutable images with the correct guard entrypoint. Never rebuild/retag
an existing approved SHA. An application-code change or image discrepancy needs
its own reviewed release; this domain-only preparation does not repair it.

## DNS and NaCl prerequisites

1. Ask NaCl to confirm custom-hostname support for `wangmai.snowballwy.com` and
   provide the exact DNS target, ownership-validation records and certificate
   issuance/renewal procedure. Do not infer support from an existing platform
   wildcard certificate or from a successful response behind another edge.
2. In the `snowballwy.com` authoritative DNS zone, prepare a `wangmai` **CNAME**
   only if NaCl supplies a hostname; otherwise use **A** (and **AAAA** only if
   supported) with provider-confirmed public ingress addresses. Never publish
   `10.60.2.22` in public DNS. The old hostname's CNAME/A records are observations,
   not approval to reuse those targets for the custom hostname.
3. The zone uses Cloudflare nameservers at the inspection below. Confirm whether
   the `wangmai` record is DNS-only or proxied. A proxied record adds Cloudflare
   to the requested architecture and can hide its origin target. Do not toggle
   proxy mode or change the existing record during preparation. A Cloudflare
   edge certificate does not verify NaCl's own custom-hostname certificate.
4. Add the new hostname alongside the current provider mapping, preserving the
   current domain until acceptance. NaCl must terminate trusted HTTPS with SAN
   coverage for `wangmai.snowballwy.com`, a valid chain/validity period, TLS 1.2+
   and HTTP-to-HTTPS redirection for the new hostname.
5. Keep upstream **HTTP `10.60.2.22:3000`**, all paths through Next, no `/api`
   prefix stripping. Upstream Host and replaced `X-Forwarded-Host` must be exactly
   `wangmai.snowballwy.com`; replaced `X-Forwarded-Proto` must be `https`.
   Retain the full single-client-IP sanitation, cookie, caching, timeout and
   transport contract in [the Phase 7 runbook](cloudstack-deployment.md).
6. Confirm real gateway TCP peers, Docker-aware source restriction, protected
   authenticated encryption/integrity for the HTTP hop and actual container
   socket source mapping. Leave every `*_VERIFIED` flag unverified until the
   corresponding operator evidence exists. A domain change is not such evidence.

## Manual Google Cloud Console changes

Use the **existing production Web application OAuth client**, preserving its
client ID and secret. In Google Auth Platform -> Clients, add (do not initially
remove the old entries):

| Field | Exact addition |
| --- | --- |
| Authorized JavaScript origins | `https://wangmai.snowballwy.com` |
| Authorized redirect URIs | `https://wangmai.snowballwy.com/api/auth/callback/google` |

In Google Auth Platform -> Branding, review/add the authorized domain
`snowballwy.com` and update any homepage/privacy-policy/terms URLs that refer to
the previous hostname. Verify domain ownership when requested and complete any
required brand review. Do not change requested scopes, audience/test-user access,
credentials or consent publication state as a side effect of this migration.
Google requires exact redirect URI matching; see the official
[Web Server OAuth guide](https://developers.google.com/identity/protocols/oauth2/web-server)
and [OAuth policies](https://developers.google.com/identity/protocols/oauth2/policies).

## Staging, cutover and rollback

1. Record the actual running container origins, image IDs, guarded startup command,
   Compose project/files, private env path and existing database volume identity.
   Do not assume the env file and running containers currently agree. Retain a
   protected previous env/config copy, approved images and verified backup/restore
   evidence. Do not initialize, migrate, reset or restore the existing database
   as part of a domain-only change.
2. Prepare DNS, valid custom-hostname TLS, NaCl routing/security evidence and both
   Google client additions while retaining the old domain. Verify provider TLS
   directly using the provider-confirmed endpoint and correct SNI if DNS is not
   propagated yet; never disable certificate validation. Public edge success
   alone does not prove the NaCl origin TLS or upstream contract.
3. The guard permits one public hostname and Better Auth one trusted origin.
   Do not broaden either allowlist just to make both hosts work. Obtain an
   approved maintenance window for the coordinated change; if uninterrupted
   parallel acceptance is required, design a separately reviewed staged origin
   rather than altering security guards. Keep existing mappings available for
   rollback, without claiming both hosts will work simultaneously on one origin.
4. After evidence and approval, change only the two runtime domain values and
   the approved NaCl host/header mapping, then run static preflight:

```sh
cd /srv/wangmai/app
sudo -n python3 -B infra/deployment/ops.py preflight \
  --env-file /etc/wangmai/.env.production --ingress-mode provider-proxy-next
sudo -n docker compose --project-name wangmai \
  --env-file /etc/wangmai/.env.production \
  -f compose.yaml -f compose.provider-proxy-next.yaml config --quiet
```

Stop on any failure. Do not use synthetic verification flags or fixture CIDRs.
`preflight-runtime` creates a one-shot container; for an already running backend,
the following rechecks database privileges without starting another container:

```sh
sudo -n docker exec wangmai-backend-1 node backend/dist/db/check.js
```

5. Only in the approved cutover, after confirming image IDs, guards, source
   restrictions and the unchanged DB volume mapping, recreate **only** the app
   services with the existing reviewed image tag:

```sh
sudo -n docker compose --project-name wangmai \
  --env-file /etc/wangmai/.env.production \
  -f compose.yaml -f compose.provider-proxy-next.yaml \
  up -d --wait --no-deps --no-build --pull never frontend backend
```

This is a future mutating command, not a diagnostic. PostgreSQL must remain
running and must not be recreated by the domain cutover.

6. From external clients, verify all three HTTPS paths below, redirects, static
   assets and `/api` forwarding without `-k`. Perform a real Google
   consent/login/callback, session reload and logout. Confirm the callback uses
   the exact new URI, no private/old-domain redirects occur, and session cookies
   are Secure, HttpOnly, SameSite=Lax and host-only. Do not record codes, state,
   tokens or cookie values. Old-domain host-only cookies do not transfer to the
   new host; users should expect to sign in again.
7. Recheck frontend/backend/PostgreSQL health and runtime DB privileges, denied
   unauthorized origin access and unchanged data/volume identities. Retire old
   DNS/provider/OAuth entries only after acceptance and the rollback window.
   On failure, coordinate restoration of the previous runtime domain values,
   app containers and provider mapping using the retained approved configuration;
   do not rotate secrets, alter roles or restore the database.

## Inspection snapshot: 2026-10-31 Asia/Bangkok

This snapshot is observation, not provider verification or deployment approval.

- VM source HEAD: `05face0613132a5d3c3dfd8e345b123a00637b99`. PostgreSQL,
  backend and frontend were healthy; only frontend published `10.60.2.22:3000`.
  Runtime DB privilege check passed in the existing backend.
- On-disk `/etc/wangmai/.env.production`: domain/auth URL were
  `wangmai.ce-nacl.com` / `https://wangmai.ce-nacl.com`; all four gateway
  verification flags were `unverified`. The running backend still used
  `https://wangmai.public.cloud.ce-nacl.com`. These values were **not changed**.
- The running frontend used `node frontend/server.js` without the release
  Dockerfile's guard preload or a `NODE_OPTIONS` guard, and `WANGMAI_DOMAIN` was
  absent from its runtime env.
  Reconcile this discrepancy before considering it an approved Phase 7 origin.
  No command/guard was changed during this inspection.
- Windows DNS returned NXDOMAIN for the new domain. Google public DNS returned
  `104.21.79.237` and `172.67.172.1` (Cloudflare edge answers), with authoritative
  nameservers `macy.ns.cloudflare.com` / `keaton.ns.cloudflare.com`. These are
  **not recommended NaCl DNS targets**. The underlying configured origin/CNAME
  remained unverified. The operator reported that a custom mapping for
  `wangmai.snowballwy.com` on port 3000 exists; this is operator-reported evidence,
  not an independent inspection of NaCl settings or its certificate.
- Around 01:03 Bangkok time, tests using those public DNS answers with normal
  SNI/certificate validation returned HTTP 200 for `/` (Wangmai Next HTML),
  `/health/ready` and `/api/ready` (JSON status `ok`). Responses reported
  `Server: cloudflare`. Local DNS still failed, so general client reachability
  was not yet consistent. NaCl's own certificate was not verified by this test.
  The public TLS handshake negotiated TLS 1.3 and validated a Let's Encrypt YE1
  certificate with SANs `*.snowballwy.com` and `snowballwy.com`, valid from
  2026-10-04 12:50:30 UTC to 2027-01-02 12:50:29 UTC.
- An anonymous Google sign-in initiation with the new origin and post-login
  `callbackURL`
  `https://wangmai.snowballwy.com/schedule` returned **403
  INVALID_CALLBACK_URL**, with no OAuth URL returned. This is consistent with
  the old running Better Auth origin. No redirect was followed and no auth
  codes, state, tokens or cookie values were displayed. The actual Google
  callback and authenticated session-cookie acceptance remain unverified.
- Static production preflight using `/etc/wangmai/.env.production` failed during
  Compose configuration rendering. The env-file SHA-256 was unchanged before
  and after inspection; no VM configuration or container was modified.
- The accessible NaCl Console session stopped at its login page; custom-domain
  settings/certificate could not be read. Existing Google Console client settings
  could not be reliably read through the available browser connection. The
  manual actions above remain to be confirmed by the operator.
