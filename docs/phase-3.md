# Phase 3 implementation and verification

Phase 3 code is implemented. Final acceptance of live Google OAuth is pending valid
Google credentials and a manual sign-in/callback test. No production system was accessed.

## Baseline and changed files

Initial branch: `feat/auth-database`, clean at
`d72fd7f356b8e23de33e973d01b3d7bac35267c7` (Phase 1).
The completed Phase 2 frontend was present on local `feat/core-user-pages` at
`87ae567`; its files were recovered into this working tree without a merge or commit.
This explains why the diff against HEAD includes the existing approved frontend.
Landing, root layout, global styles and schedule/availability implementation match
that baseline; auth and routing additions are scoped to Phase 3.

[Full file inventory](phase-3-files.md) distinguishes recovered Phase 2 files from
Phase 3 additions/edits. Main areas:

- Database: `backend/src/db/{schema,client,migrate,check}.ts`, Drizzle config,
  generated SQL and snapshot/journal metadata.
- Authentication: `backend/src/auth/auth.ts`, Hono application, validated env,
  server startup/shutdown and shared profile contract.
- Frontend: Better Auth browser client, server Hono session lookup, route boundaries,
  Login actions, logout, real account display, explicit public preview routes.
- Tests: backend environment/integration suites, auth browser suite and preserved
  Phase 2 tests adjusted to public preview paths.
- Configuration/docs: workspace manifests and lockfile, environment example,
  production Compose auth variables, backend Docker migration artifacts, isolated
  browser test output, README and this report. Caddy and development Compose unchanged.
- Ignored local `.env`: generated a real random auth secret where the placeholder
  was present; placeholder Google credentials were cleared. No real Google credentials
  were created or exposed. Existing database credentials were preserved.

## Database and endpoints

Created `user`, `account`, `session`, `verification`; migration tracking uses
`drizzle.__drizzle_migrations`. No role or scheduling tables were added.

Hono mounts Better Auth under `/api/auth/*`, including Google social sign-in,
Google callback, get-session and sign-out. `/api/v1/me` returns only the currently
authenticated user's basic profile and ignores client-supplied user IDs.
Account linking/unlinking and provider-token endpoints are disabled.
Google permissions are limited to `openid email profile`, with client-added scopes
and direct ID-token sign-in rejected. Production uses Secure/HttpOnly/SameSite=Lax
cookies, exact trusted origin and database session validation.

## Observed checks

| Check | Result |
| --- | --- |
| Existing local PostgreSQL 18 development container | Healthy, loopback port 5432 |
| `npm run db:check` | Passed against the development database |
| `npm run db:generate` | Generated the four-table initial SQL migration |
| `npm run db:migrate` | Passed against the development database |
| Fresh migration plus repeat application | Passed in an isolated temporary database |
| Installed Better Auth schema compatibility | All core fields matched the typed Drizzle schema |
| `npm run typecheck` | Passed across all workspaces; backend tests also checked |
| `npm run lint` | Passed with zero warnings |
| `npm run build` | Passed; NEXT_DIST_DIR=.next-build isolated output from the running dev app |
| `npm test` | 4 backend environment tests and 11 existing frontend unit tests passed |
| `npm run test:integration` | 12 reported tests passed, including the parent test and 11 subtests |
| `npm run test:e2e --workspace=@wangmai/frontend` | All 12 browser tests passed: 5 auth and 7 existing Core MVP tests |
| Production and development Compose config syntax | Both passed using `.env.example` |
| `npm ci --dry-run --ignore-scripts --no-audit --no-fund` | Passed; lockfile/manifests consistent |
| `git diff --check` | Passed |
| Frontend browser artifact secret check | Local auth secret absent from all 29 emitted browser artifacts |
| Test cleanup | Zero remaining synthetic browser users and zero temporary integration databases |
| Browser visual checks | No horizontal overflow at 320, 390, 768, 1024 and 1440px; desktop Login and mobile Schedule screenshots inspected |

Backend integration checks cover public health, auth mounting, unauthenticated and
tampered cookies, supplied user ID rejection, persisted sessions across auth-instance
recreation, provider/account identity lookup, expiry, renewal/cookie forwarding,
sanitized database failure, absent Google configuration, invalid callbacks, scope
restrictions, production cookie attributes, CSRF rejection and sign-out revocation.

Browser auth checks use actual PostgreSQL-backed Better Auth fixtures, not a
development login bypass. They verify protected routes, Login redirects, real profile,
reload persistence, logout revocation and retryable errors. The Google-button error
response and failure UI are intercepted for deterministic tests; no successful Google
consent or code exchange is claimed.

Early test failures were corrected: expiry fixtures needed a persisted expired date;
browser alert assertions needed to exclude Next's route announcer. The final runs
listed above passed. No unrelated dependency upgrades or forced audit fixes were made.

## Required environment and commands

Set `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, and the local PostgreSQL
initialization variables. Configure both `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
for real login. See [README environment table](../README.md#environment-variables).

```sh
npm install
npm run db:up
npm run db:migrate
npm run db:check
npm run dev
```

Future schema edits use `npm run db:generate` and a reviewed, version-controlled
migration. Runtime never auto-migrates. No schedule CRUD or Phase 4 work was started.

## Remaining configuration and limits

1. Real Google credentials are unavailable. Complete the manual setup below, then
   verify first sign-in, repeat sign-in without duplicate accounts, callback/state,
   reload/restart, denied consent and logout using an actual Google account.
2. Production domain, credentials, Caddy HTTPS cookies and deployment were not tested.
   Compose syntax validation does not establish production readiness.
3. npm audit reports 4 moderate findings in the Drizzle Kit / esbuild tooling chain
   and 3 low findings in shadcn's registry/deepmerge chain; no high/critical findings.
   npm's proposed forced Drizzle downgrade is incompatible with this integration and
   was not applied. These are observed dependency findings, not claimed exploit tests.
4. Schedules, people and editable preferences intentionally remain in-memory fiction.
   Real Google profile fields are displayed separately; no preview change is stored
   as an authenticated record.

## Manual Google Cloud Console setup

1. Select/create a project and configure Google Auth Platform branding and audience.
   Add test users if the external app is in Testing.
2. Create an OAuth client of type **Web application**. Request only
   `openid`, `email`, `profile`; no Calendar API or Calendar permissions.
3. Add JavaScript origin `http://localhost:3000` and exact redirect URI
   `http://localhost:3000/api/auth/callback/google`.
4. Put the actual client ID and secret in the root backend `.env`; set
   `BETTER_AUTH_URL=http://localhost:3000` and restart Hono.
5. For a separately prepared production environment, use the actual HTTPS origin
   and `https://YOUR_DOMAIN/api/auth/callback/google`; no domain is assumed here.
6. Run the live account lifecycle checks above before accepting Google OAuth end to end.

Sources: [Better Auth Google provider](https://better-auth.com/docs/authentication/google),
[Google OpenID Connect setup](https://developers.google.com/identity/openid-connect/openid-connect),
[Better Auth Hono integration](https://better-auth.com/docs/integrations/hono),
[Better Auth Drizzle adapter](https://better-auth.com/docs/adapters/drizzle).

**Status:** implementation complete; live Google OAuth acceptance pending manual
credentials/configuration and testing. No commit, push, merge, deployment, CI/CD,
CloudStack, Admin or other post-Phase-3 feature work was performed.

## Owner-confirmed live acceptance update - 2026-10-29

The project owner has manually confirmed all local live OAuth acceptance criteria:

- Successful Google login and redirect to My Schedule.
- Real Google profile information and authenticated profile API access.
- Session persistence after refresh.
- Successful logout and protected-route enforcement.
- Repeat login without duplicate users.

These live results are attributed to the project owner's manual verification.
They supersede the earlier pending-credentials/pending-live-acceptance status in
this historical implementation report. Automated verification remains separate:
the browser suite uses real database-backed test sessions and deterministic
failure responses, without claiming to automate Google consent or code exchange.

**Updated local status:** Phase 3 acceptance complete, ready for final commit/PR
preparation after the final checks pass. This is not a production deployment
readiness claim. No commit, push, merge, deployment or Phase 4 work is authorized
by this acceptance update.
