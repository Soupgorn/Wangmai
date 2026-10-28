Better Auth 1.7.14 lives exclusively in Hono under `/api/auth/*`.
`auth.ts` configures the PostgreSQL Drizzle adapter, Google basic login,
database-backed sessions, trusted public origin and secure production cookies.
Google credentials and the signing secret are backend-only.
See the root README for Google Cloud Console setup and verification limits.
