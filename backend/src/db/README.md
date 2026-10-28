Drizzle schema and node-postgres pool for Better Auth core tables only.
Version-controlled SQL and metadata are in `backend/drizzle/`.
From the root: `npm run db:generate`, `npm run db:migrate`, `npm run db:check`.
Generation is offline; connections and migrations enforce the local development
database guard. Runtime startup checks connectivity and shutdown drains the pool.
`/api/health` remains a process check. No schedule persistence is implemented.
