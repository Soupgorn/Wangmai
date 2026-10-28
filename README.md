# Wangmai (ว่างมั้ย?)

Wangmai uses Next.js App Router, Hono, PostgreSQL, Drizzle ORM and Better Auth
with Google OAuth, in npm Workspaces. Phase 3 adds database authentication.
Schedule and availability features remain fictional, in-memory previews until Phase 4.

## Repository baseline

The clean branch `feat/auth-database` initially pointed to Phase 1 commit
`d72fd7f`. The completed Phase 2 frontend and tests were recovered into the working
tree from local `feat/core-user-pages` commit `87ae567` before integration.
No commit, merge, push or deployment was performed.

Workspaces are `frontend`, `backend` and `packages/shared`. Keep one root lockfile.
Use Node.js 24 and npm 11. Versions are pinned: Better Auth 1.7.14,
Drizzle ORM 0.45.4, Drizzle Kit 0.31.11 and node-postgres 8.23.1.
The existing palette, typography, layout and core preview interactions are preserved.

## Local setup

Copy `.env.example` to `.env` only for a new checkout; preserve existing credentials.
Choose a PostgreSQL password and update DATABASE_URL with the URL-encoded password.
Generate a signing secret and put the output in BETTER_AUTH_SECRET:

~~~sh
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
npm install
npm run db:up
npm run db:migrate
npm run db:check
npm run dev
~~~

Open http://localhost:3000. Hono binds to 127.0.0.1:4000.
Use localhost consistently for OAuth and cookies.
Google credentials may remain empty during local infrastructure development;
the login button then displays a configuration error. They are required for real login.
No fake Google credentials are generated.

The backend loads the repository-root `.env`. Next.js uses `frontend/.env.local`
only for optional proxy overrides. Secrets never need frontend configuration.
Existing environment variables take precedence over env-file values.

## Environment variables

| Variable | Purpose |
| --- | --- |
| NODE_ENV | development, test or production; defaults to development |
| HOST / PORT | Backend bind address and port; defaults 127.0.0.1 / 4000 |
| POSTGRES_USER / POSTGRES_PASSWORD / POSTGRES_DB | Development PostgreSQL initialization; use a strong password |
| POSTGRES_PORT | Loopback development container port; defaults to 5432 |
| DATABASE_URL | PostgreSQL connection URL; localhost locally, postgres in production Compose |
| BETTER_AUTH_SECRET | Required random signing/encryption secret, at least 32 characters; placeholders rejected |
| BETTER_AUTH_URL | Required public origin, locally http://localhost:3000; no path or trailing slash |
| GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET | Both empty locally or both valid Google Web application credentials; required in production |
| API_PROXY_ORIGIN | Optional Next development rewrite target; defaults to http://127.0.0.1:4000 |
| API_INTERNAL_ORIGIN | Optional Next server-rendering Hono origin; defaults to http://127.0.0.1:4000; production Compose supplies http://backend:4000 |
| WANGMAI_DOMAIN | Production Caddy DNS hostname; placeholder is not a deployment |
| NEXT_DIST_DIR | Optional isolated Next build directory used by browser tests |

Do not prefix secrets with NEXT_PUBLIC_. Env files are excluded from Git and Docker
contexts. Development/test database connections reject non-loopback hosts, different
database names/ports and query options that could override the target. POSTGRES_DB
and POSTGRES_PORT must match the local Compose database. Never point local development
at production or use an SSH tunnel to a production database.
Production requires a public HTTPS auth origin and configured Google credentials.

## Database and migrations

Only Better Auth's core tables exist:

| Table | Purpose |
| --- | --- |
| user | Google-derived name, email, verification and optional image |
| account | Unique provider/account identity and encrypted OAuth tokens |
| session | Persisted expiring, revocable sessions linked to users |
| verification | OAuth state/verification records |

There is no role column, admin plugin, schedule table or schedule API.
Provider/account identities are unique; user deletion cascades to accounts/sessions.
Drizzle additionally keeps its migration journal in `drizzle.__drizzle_migrations`.

The typed schema lives in `backend/src/db/schema.ts`; generated SQL, journal and
snapshot metadata live in `backend/drizzle/` and must be version controlled.

~~~sh
npm run db:generate
npm run db:migrate
npm run db:check
~~~

Generation is offline. Migration and connectivity commands use the guarded pool
and sanitized errors. Migrations are explicit and repeatable; startup never silently
changes the schema. Backend startup checks connectivity and shutdown closes the pool.
The health route remains a process check rather than database readiness.
The existing standalone `compose.dev.yaml` and development volume are unchanged.
`npm run db:down` stops the container without deleting data.
Changing initialization credentials does not change an existing PostgreSQL volume.

## Authentication and routing

Hono owns all authentication under `/api/auth/*`. Next.js has no auth handler,
database adapter, Google secret or separate authentication implementation.

| Endpoint | Behavior |
| --- | --- |
| POST /api/auth/sign-in/social | Basic Google redirect sign-in only |
| GET /api/auth/callback/google | Google code/state callback, automatic account creation or recognition |
| GET /api/auth/get-session | Better Auth session lookup/refresh |
| POST /api/auth/sign-out | Revoke session and expire cookies |
| GET /api/v1/me | Session-validated basic profile; 401 when unauthenticated |
| GET /api/health | Existing public health response |

Better Auth handles additional core session endpoints, such as listing and revoking
a user's sessions. Account linking/unlinking and provider-token retrieval/refresh
endpoints are disabled. Email/password sign-in is not enabled.
Client-added social scopes, alternate providers and direct ID-token login are rejected.
Google permissions are only openid, email and profile. No Calendar permissions or API.

The fixed BETTER_AUTH_URL and exact trusted origin govern redirects and CSRF checks.
Arbitrary forwarded host headers cannot choose the callback origin. Cookies are
HttpOnly, host scoped and SameSite=Lax; production cookies use Secure.
Sessions last seven days and refresh after one day. Cookie caching is disabled so
protected backend requests validate against the database. OAuth state is database
backed and stored provider tokens are encrypted. Logs never include driver errors,
credentials or tokens. `/api/v1/me` ignores client-supplied IDs and returns no session
token or provider token.

Browser requests use the same public origin. Development Next rewrites preserve
`/api`; production Caddy sends `/api/*` directly to Hono. Caddy routing is unchanged.
Production Compose now passes auth variables to Hono and the internal backend
origin to Next. The backend Dockerfile includes migration artifacts, allowing a
manually authorized operator to run `node backend/dist/db/migrate.js` inside the image.
No production environment or deployment was assumed, accessed or started.

## Frontend behavior and preview boundary

- Login keeps the approved design and enables Continue with Google, loading,
  callback-error and retry states. Authenticated visitors redirect to /schedule.
- /schedule, /availability and /settings validate the session through Hono during
  server rendering. A client session boundary handles expiration, focus/refetch and
  cached navigation. Unauthenticated users redirect to /login.
- The workspace account and Settings show the actual Google name and email.
  Logout revokes the backend session and returns to Login; failures remain retryable.
- The schedule, people and editable settings beneath the account remain a clearly
  labelled fictional preview. They never become user-owned database records.
  Editing preview name/privacy/timezone does not update the Google profile.
- /preview/schedule, /preview/availability and /preview/settings preserve the public
  Phase 2 demo, with isolated temporary state and no sign-in requirement.

The asynchronous CoreRepository remains the mock boundary. No schedule persistence,
availability backend, Admin, Calendar integration, notifications or analytics were added.
See [Core MVP notes](frontend/docs/core-mvp.md) and
[design system](frontend/docs/design-system.md) for the approved frontend baseline.

## Google Cloud Console setup

1. Create or select a project in Google Cloud Console.
2. Configure Google Auth Platform branding, support email and audience. If the
   external app is in Testing, add the Google accounts that will test login.
3. Request only the basic openid, email and profile permissions. Do not enable or
   request Google Calendar access.
4. Create an OAuth client ID of type **Web application**.
5. Add the local authorized JavaScript origin: `http://localhost:3000`.
6. Add the exact local authorized redirect URI:
   `http://localhost:3000/api/auth/callback/google`.
7. Put the actual client ID and client secret in the backend root `.env`.
   Keep BETTER_AUTH_URL=http://localhost:3000 and restart Hono.
8. For a separately prepared production environment, configure the actual HTTPS
   origin and exact redirect URI `https://YOUR_DOMAIN/api/auth/callback/google`.
   Set BETTER_AUTH_URL and WANGMAI_DOMAIN to that real domain. No domain is assumed.
9. Manually verify first sign-in, repeat sign-in reusing the same account, reload/
   restart persistence, denied consent, logout and subsequent protected-route denial.

Use the standard redirect flow; Google One Tap and Calendar integration are excluded.
See [Better Auth Google setup](https://better-auth.com/docs/authentication/google)
and [Google OpenID Connect setup](https://developers.google.com/identity/openid-connect/openid-connect).
Schema/session choices follow the installed version and
[Better Auth's Drizzle adapter](https://better-auth.com/docs/adapters/drizzle).

## Commands and verification

| Command | Purpose |
| --- | --- |
| npm run dev | Build shared once, then run shared watch, Next and Hono |
| npm run typecheck | Generate Next types and check frontend, backend, backend tests and shared |
| npm run lint | Check workspaces, including auth tests |
| npm run build | Build shared, Next standalone and Hono |
| npm test | Backend environment tests and existing frontend unit tests |
| npm run test:integration | Real PostgreSQL migration/auth lifecycle tests in a temporary database |
| npm run test:e2e --workspace=@wangmai/frontend | Browser auth/profile/logout and all existing preview tests |
| npm run db:up / npm run db:down | Start/stop only development PostgreSQL |
| npm run db:generate / npm run db:migrate / npm run db:check | Generate/apply migrations and verify connectivity |

Before tests, configure the local root env, start PostgreSQL and apply migrations.
Playwright uses dedicated localhost:3100 and backend:4100 and an isolated Next output
directory so it does not reuse port 3000. It requires Chromium
(`npm exec --workspace=@wangmai/frontend -- playwright install chromium`).
Integration tests create and drop only a random `wangmai_auth_test_*` database;
the local PostgreSQL test role needs CREATEDB. Browser auth fixtures seed uniquely
named synthetic users in the development database and delete them afterward.
They use actual Better Auth sessions with signed cookies. The Google button error
test intercepts the error response; it never claims to authenticate with Google.

See [Phase 3 verification and change inventory](docs/phase-3.md) for observed results
and remaining configuration. Valid Google credentials were unavailable, so live
Google consent/code exchange and production Caddy/HTTPS remain unverified.
Phase 4 business persistence and all deployment work remain outside this change.

## Local Phase 3 acceptance update - 2026-10-29

The project owner has manually confirmed successful live Google login, redirect to
My Schedule, real Google profile display, session persistence after refresh,
authenticated profile API access, logout, protected-route enforcement, and repeat
login without duplicate users. These are owner-confirmed live acceptance results;
the automated browser tests use database-backed test sessions separately.

This update supersedes the earlier implementation-time statements that Google
credentials and live acceptance were pending. Local Phase 3 acceptance is complete.
Production domain setup, Caddy HTTPS operation and deployment remain unverified.
No Phase 4 business APIs or persistence have been implemented.
