Drizzle schema and node-postgres pool for Better Auth core tables and private schedules.
Version-controlled SQL and metadata are in `backend/drizzle/`.
From the root: `npm run db:generate`, `npm run db:migrate`, `npm run db:check`.
Generation is offline; connections and migrations enforce the local development
database guard. Runtime startup checks connectivity and shutdown drains the pool.
`/api/health` remains a process check. Schedule entries, dated occurrence overrides
and timezone/revision preferences are added by migration 0001; auth tables are unchanged.
See `docs/phase-4.md` at the repository root for local-time and API semantics.
