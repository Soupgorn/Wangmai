# Wangmai (ว่างมั้ย?)

A scheduling and availability discovery application: create personal schedules,
manage availability, and find people who are free during a selected time range.
**Phase 1 establishes the foundation only.** The placeholder page and API health
check work; authentication, database access, and scheduling features are not implemented.

## Stack

| Area | Foundation |
| --- | --- |
| Frontend | Next.js 16 App Router, React 19, strict TypeScript, Tailwind CSS 4, shadcn/ui, Lucide React |
| Backend | Hono on Node.js 24, TypeScript, Zod |
| Shared | `@wangmai/shared` workspace package with one health response schema and inferred type |
| Infrastructure | PostgreSQL 18, Docker Compose, Caddy 2, Ubuntu on an Apache CloudStack VM |
| Planned | Drizzle ORM, Better Auth, Google OAuth; not installed or configured yet |

Exact JavaScript dependency versions and the package manager are pinned in the
manifests and the single root `package-lock.json`. TypeScript 6 is used to stay within the supported
range of the TypeScript ESLint tooling. ESLint 9 is retained because the current
Next.js React, accessibility, and import plugins do not declare ESLint 10 support.

## Repository

```text
.
├── frontend/
│   ├── src/
│   │   ├── app/                # Layout, placeholder page, global styles
│   │   ├── components/ui/      # shadcn/ui components
│   │   ├── features/           # Future feature ownership
│   │   ├── hooks/              # Future reusable hooks
│   │   └── lib/                # Same-origin API client and UI utilities
│   ├── components.json
│   └── Dockerfile
├── backend/
│   ├── src/
│   │   ├── index.ts            # Node server and graceful shutdown
│   │   ├── app.ts              # Hono application and health route
│   │   ├── config/             # Validated runtime environment
│   │   ├── auth/               # Future backend-only auth boundary
│   │   ├── db/                 # Future Drizzle integration
│   │   ├── middleware/         # Future cross-cutting middleware
│   │   └── modules/            # Future users/schedules/availability/admin
│   └── Dockerfile
├── packages/shared/src/        # Shared API schemas and types
├── infra/caddy/Caddyfile
├── .github/workflows/ci.yaml   # Checks only; no deployment
├── compose.yaml               # Production topology
├── compose.dev.yaml           # Standalone local PostgreSQL
├── package-lock.json
├── package.json
├── .env.example
└── README.md
```

Future module folders are created with their first implementation. Directory
README files explain ownership without introducing empty route/service files.

## Prerequisites

- Node.js **24 LTS** (see `.node-version`).
- npm **11.x**, included with Node.js 24. This migration was verified with npm 11.6.2.
- Docker Engine with Docker Compose v2+ (Docker Desktop on Windows) for PostgreSQL
  or container verification. The frontend and health API run without Docker.
- Git. No remote or deployment is created by this foundation.

## Local setup

From the repository root, copy the environment example:

```powershell
# PowerShell
Copy-Item .env.example .env
```

```sh
# macOS / Linux
cp .env.example .env
```

Replace the example PostgreSQL password, then install and start:

```sh
npm install
npm run db:up
npm run dev
```

`db:up` is optional in Phase 1: no application code opens a database connection.
Open [http://localhost:3000](http://localhost:3000). The Hono API listens at
[http://localhost:4000](http://localhost:4000). Both native servers bind to loopback.
The page checks the API through the frontend and displays its actual connection state.
`Ctrl+C` stops the workspace development processes. Backend and shared code restart
or recompile on changes; Next.js provides frontend hot reload.

## Environment configuration

The backend loads the repository-root `.env` through Node's `--env-file-if-exists`.
Compose reads that file for interpolation. Existing process environment values take
precedence. Next.js reads `frontend/.env.local`, **not** the repository-root `.env`;
no frontend environment file is required with the default local ports.

| Variable | Purpose |
| --- | --- |
| `NODE_ENV`, `HOST`, `PORT` | Backend runtime; defaults to development, `127.0.0.1`, `4000` |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | PostgreSQL initialization; choose real credentials before deployment |
| `POSTGRES_PORT` | Local PostgreSQL port; defaults to `5432`, published only on `127.0.0.1` |
| `DATABASE_URL` | Reserved for Drizzle; use `localhost` locally and `postgres` inside Compose |
| `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` | Future auth only; URL is the public frontend origin |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Future Google OAuth only |
| `WANGMAI_DOMAIN` | Caddy hostname; `wangmai.example.com` is a reserved placeholder |
| `API_PROXY_ORIGIN` | Optional in `frontend/.env.local`; local rewrite target defaults to `http://127.0.0.1:4000` |

If you change the backend port, update `API_PROXY_ORIGIN` accordingly and restart
Next.js. Use a URL-encoded password in `DATABASE_URL` if it contains reserved characters.
Keep `.env`, `.env.local`, `.env.production`, private keys, and `secrets/` out of Git.
Never prefix server-side credentials with `NEXT_PUBLIC_`. Environment files are also
excluded from Docker build contexts. Future auth variables are documented but not
passed into containers or consumed until the authentication phase.

## PostgreSQL locally

```sh
npm run db:up
docker compose -f compose.dev.yaml ps
docker compose -f compose.dev.yaml logs postgres
npm run db:down
```

`compose.dev.yaml` is a **standalone** file, not an override; do not combine it with
`compose.yaml`. Local and production stacks have separate project names and persistent
volumes. PostgreSQL 18 stores data under the mounted `/var/lib/postgresql` directory.
Stopping the stack preserves data. Changing initialization credentials in `.env`
does not update an existing database volume; manage existing roles explicitly.

## Commands

| Command | Result |
| --- | --- |
| `npm install` | Install dependencies and link the local workspace packages |
| `npm ci` | Clean, reproducible install from the root lockfile; used by CI and Docker |
| `npm run dev` | Build shared contracts once, then run shared watch, Next.js, and Hono concurrently |
| `npm run build` | Build shared contracts first, then both applications |
| `npm run lint` | ESLint across all workspace packages |
| `npm run typecheck` | Build shared declarations, generate Next route types, and check all packages |
| `npm run db:up` / `npm run db:down` | Start PostgreSQL and wait for health / stop it while keeping data |
| `npm run dev --workspace=@wangmai/frontend` | Run frontend only after shared has been built |
| `npm run dev --workspace=@wangmai/backend` | Run backend only after shared has been built |
| `npm run start --workspace=@wangmai/backend` | Run the compiled backend after `npm run build` |

The shared package exports compiled ESM and declarations from `dist/`. Import it with
`import { healthResponseSchema, type HealthResponse } from "@wangmai/shared"`.
Root commands take care of build ordering; after cloning, run root commands before
starting an individual application. Native npm Workspaces are declared in the root
`package.json` as `frontend`, `backend`, and `packages/*`. Both applications depend
on shared version `0.1.0`, which npm links to the matching local workspace.
Keep one root lockfile and install from the repository root. npm runs workspace
scripts in the specified order rather than sorting dependencies, so root build and
typecheck scripts explicitly build shared first. `concurrently` only coordinates
the development processes and stops the others when one exits.

shadcn/ui uses `frontend/components.json`, CSS variables, and the `@/*` source alias.
Add components only when needed with `npm exec --workspace=@wangmai/frontend -- shadcn add <component>`.

## Health checks and API routing

With `npm run dev` running:

```sh
curl http://localhost:4000/api/health
curl http://localhost:3000/api/health
```

On PowerShell, use `curl.exe` or `Invoke-RestMethod`. Both responses must be:

```json
{"status":"ok","service":"wangmai-api"}
```

The health route is a process check, not a database readiness check. The browser API
client calls the relative `/api/health` URL with same-origin credentials. In development,
Next.js rewrites `/api/:path*` to Hono **with `/api` preserved**. In production, Caddy
owns this routing; a standalone frontend started without Caddy will not proxy API requests.

Hono will remain the only authentication backend. Future Better Auth routes and Google
OAuth callbacks should live under `/api/auth/*` on the same public origin. During the
auth phase, configure trusted origins, forwarded-header handling, secure production
cookies, and Google callback URLs against that public origin. Phase 1 does not claim
to verify session or OAuth behavior.

## Production and CloudStack architecture

```text
Internet -> CloudStack public IP / firewall -> Ubuntu VM :80/:443 -> Caddy
                                                               ├── /api/* -> Hono :4000
                                                               └── /*     -> Next.js :3000
                                                                            Hono -> PostgreSQL :5432
```

Only Caddy publishes application ingress ports. Frontend and backend use Docker DNS;
PostgreSQL is on an internal database network shared only with the backend. Application
containers run as a non-root user. Dockerfiles use separate build/runtime stages, a
root lockfile via `npm ci`, and Next.js standalone output. PostgreSQL, frontend, and backend have
health checks; PostgreSQL data and Caddy certificates/config have persistent volumes.

Before a real deployment, provision the Ubuntu VM and Docker, configure CloudStack
networking/firewall and DNS, replace credentials, set `DATABASE_URL` to use host
`postgres`, and set `WANGMAI_DOMAIN` to the real hostname. Allow TCP 80/443 (UDP 443
is optional HTTP/3); restrict SSH to administrators. Set future `BETTER_AUTH_URL` to
the public HTTPS origin when auth is implemented. Caddy obtains certificates only once
valid DNS and public ingress are available; the placeholder domain cannot do this.

Validate and build manually from the root:

```sh
docker compose --env-file .env -f compose.yaml config --quiet
docker compose --env-file .env -f compose.yaml build
# On the prepared server, with real deployment configuration:
docker compose --env-file .env -f compose.yaml up -d --wait
```

Syntax-only validation can use `--env-file .env.example`. This does not deploy anything
or prove operational readiness. Plan backups and restore checks before storing user
data. Pin deployment image digests during release preparation. CI runs install, lint,
typecheck, build, and Compose validation; it performs no automatic deployment.

## Next phases

1. Design the scheduling data model, time-zone rules, and API contracts; then add
   Drizzle schema, migrations, and database connection management.
2. Integrate Better Auth and Google OAuth in Hono; verify cookies through both proxies.
3. Implement schedules and availability discovery, using the separate visual references.
4. Add authorization and administration, followed by separately scoped integrations.

Google Calendar, notifications, analytics, and complete UI design are deferred.
