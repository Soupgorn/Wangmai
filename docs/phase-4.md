# Phase 4 - private schedules and PostgreSQL persistence

## Baseline

Implementation started on clean `feat/schedule-api` at
`0274d286eac95b4dd24d647f95ac94950c050ae9`, equal to local main, origin/main
and the live remote main. Merge PR #1 includes the approved Phase 2B frontend and
Phase 3 authentication (`d2985f6`). The calendar, Better Auth, Google provider,
Drizzle schema and initial migration were present. Baseline database connectivity,
unit tests, auth integration tests and typecheck passed before edits.

Existing `.next`, `.next-build`, `.next-e2e`, compiled `dist`, node_modules and
TypeScript cache outputs are ignored. Local environment files were preserved.
No branch reset, commit, push, merge or deployment is part of Phase 4.

## Database model and migration

Migration `backend/drizzle/0001_next_shinko_yamashiro.sql` adds three tables:

| Table | Purpose |
| --- | --- |
| schedule_entry | User-owned available/busy blocks, explicitly discriminated as weekly rules or one-time local dates |
| schedule_exception | Replacement or cancellation of one recurring occurrence on a specific local date |
| schedule_preference | One schedule timezone and concurrency revision per authenticated user |

The four Better Auth tables and original auth migration are unchanged. Schedule
tables reference the existing user and cascade on user deletion. Entries have UUID
IDs, an owner-scoped unique create-mutation ID, local minute bounds, createdAt and
updatedAt instants. SQL checks enforce title, kind, timing shape and valid intervals.
Exceptions use a composite foreign key to the parent entry and its owner, plus a
unique parent/date constraint. This prevents cross-owner exception references even
at the database level.

No fixtures are seeded into saved schedules. A newly authenticated user starts with
an empty calendar and a default timezone of Asia/Bangkok. Only an actual mutation
creates the preference row; initial reads do not create schedule records.

```sh
npm run db:up
npm run db:migrate
npm run db:check
npm run dev
```

The new migration was applied to the existing local development container and run
again successfully. Both migrations also run twice in isolated integration databases.
Generation remains `npm run db:generate`; never edit an applied migration to change
an existing database. No production database was accessed.

## Time and recurrence rules

- Calendar dates are civil ISO dates (`YYYY-MM-DD`), never parsed as UTC timestamps.
  Time is stored as minutes on that local day. Monday=1 through Sunday=7.
- Every saved block uses the user's persisted IANA schedule timezone. Both weekly
  rules and one-time blocks retain their wall-clock dates/times when the timezone
  is changed; their corresponding UTC instants can therefore move. Settings explain
  this behavior. Invalid date-specific times in the proposed zone reject the whole
  timezone change without modifying preferences or entries.
- Intervals are half-open `[start, end)`. Adjacent blocks do not overlap; a partial
  busy overlap takes priority over available coverage. Overlapping blocks are
  intentional and remain separately editable in calendar lanes.
- Start must be 00:00..23:59, and end must be later on the same local day. End 24:00
  means the following local midnight. The editor displays that endpoint as 00:00
  with an explanation. Other overnight blocks must be split into two dates.
- Temporal resolves dated intervals with `disambiguation: reject`: skipped or
  repeated DST wall times fail server validation. A weekly rule is a wall-time
  pattern, not a fixed UTC offset. On an ambiguous/skipped occurrence the calendar
  hides that occurrence and shows a warning, rather than inventing an instant.
  The existing preview classifier conservatively reports unknown for uncertainty.
- A date-specific busy block is an additive interval, overriding overlapping
  availability without deleting the weekly rule. An explicit recurring exception
  instead replaces that entire occurrence, or cancels it when replacement is null.
  It never alters another week. Multiple independent rules remain independent.
- Editing a series preserves dated overrides. Changing its weekday/recurrence
  requires restoring those overrides first. Deleting the series cascades its
  exceptions. Weekly editors offer Restore occurrence buttons for excluded dates;
  replacement editors also offer Restore recurring occurrence.

The 24-hour wall-clock grid does not display both folds of a repeated DST hour.
Such ambiguous dated selections are intentionally rejected; no silent offset choice
is made. Schedule entries are capped at 2,000 per user for individual creates.

References: [Temporal timezone semantics](https://tc39.es/proposal-temporal/docs/zoneddatetime.html),
[Drizzle transactions](https://orm.drizzle.team/docs/transactions),
[Drizzle constraints](https://orm.drizzle.team/docs/indexes-constraints).

## Authenticated API

All paths below are under `/api/v1/me`. Hono derives the owner from the verified
Better Auth session. Supplied user IDs are never used for authorization. Reads and
writes filter by the session user; other users' IDs return the same 404 as missing
records. No admin role or client-assigned ownership is supported.

| Method and path | Behavior |
| --- | --- |
| GET /schedule | Full private schedule, timezone, revision and exception metadata |
| POST /schedule/entries | Create one weekly/date available/busy block |
| PATCH /schedule/entries/:id | Update supplied block fields, validating the merged result |
| DELETE /schedule/entries/:id | Delete one block/series and cascade its exceptions |
| PUT /schedule/entries/:id/exceptions/:date | Replace or cancel one recurring occurrence |
| DELETE /schedule/entries/:id/exceptions/:date | Remove the exception and restore the recurring occurrence |
| GET /availability/weekly | Only the current user's recurring available blocks |
| PUT /availability/weekly | Atomically replace the current user's weekly available rules |
| PATCH /schedule/preferences | Persist the schedule timezone only |

The weekly PUT preserves recurring busy and one-time blocks. Replaced available
rules receive new IDs and their old dated exceptions cascade; this endpoint is an
explicit full replacement, not a merge. The calendar uses individual CRUD endpoints.
It is not a multi-user availability finder endpoint.

GET responses contain `{ timezone, revision, blocks }`. Entry responses carry UUID
IDs, ownerId, ISO createdAt/updatedAt instants, title, kind, start/end and timing.
Weekly blocks carry excludedDates; date replacements identify their parent through
exceptionFor. Every mutation returns the authoritative complete private schedule,
so the UI does not depend on a follow-up GET to confirm a successful save.

Mutation bodies:

```json
{
  "entry": {
    "title": "Reading",
    "kind": "available",
    "start": "18:00",
    "end": "19:00",
    "timing": { "type": "weekly", "weekday": 1 }
  },
  "mutationId": "a-new-client-generated-uuid"
}
```

The mutationId above is illustrative; generate an actual UUID with crypto.randomUUID().
PATCH accepts a nonempty partial entry such as `{ "title": "Quiet reading" }`.
Weekly PUT accepts `{ "entries": [...] }`, with only weekly available drafts.
Exception PUT accepts `{ "replacement": null }` for cancellation, or a complete
date draft whose date matches the occurrence. Preference PATCH accepts only timezone.
Zod rejects unknown ownership/privilege fields, malformed dates and invalid intervals.

Every mutation requires an exact same-origin Origin, JSON Content-Type for bodies,
and `If-Match: "<revision>"` from the last loaded schedule. Revision checks and writes
are serialized with a per-user row lock inside a PostgreSQL transaction. A stale tab
gets 409 and must reload before retrying. The UI supplies a Reload saved schedule
action and never automatically resubmits a stale edit. POST uses the owner-scoped
mutationId to replay the same successful create safely after a lost response.

Responses are no-store. Errors use `{ "error": { "code": "...", "message": "..." } }`:
401 unauthenticated, 403 origin rejection, 400 invalid input, 404 not owned/not found,
409 revision/mutation conflict, 428 missing revision, 413 oversized payload, and 503
sanitized database failure. A request is limited to 128 KiB; weekly replacement to
200 entries. SQL values are parameterized. Credentials, provider tokens and session
tokens never appear in schedule payloads or error messages.

## Frontend boundary and state

- `/schedule` and `/settings` use DatabaseCoreRepository, same-origin fetches and
  actual authenticated profile data. Empty schedules stay empty; there is no mock
  fallback during failures. Loading, saving, retry, conflict and empty states are shown.
- `/settings` persists only the schedule timezone. Google name/email are read-only.
  Sharing stays disabled and the saved schedule stays private. Mock name/privacy
  settings remain available only in the public preview.
- `/availability` remains an explicit fictional finder demo, with a separate provider
  and in-memory adapter. It does not read persisted schedules, even for the signed-in
  user. Switching mode remounts the provider to prevent mixing snapshots.
- `/preview/*` always uses MockCoreRepository. An authenticated cookie does not change
  that choice. Preview edits never call schedule mutation APIs or write preferences.
- The existing calendar design, drag selection, arrow-key navigation, Enter creation,
  overlapping lanes and focus restoration are reused. The editor adds series versus
  this-occurrence scope and restore actions. Saving prevents close/double submission.
  Create retries retain their mutation ID; requests time out with an honest error.

## Verification and acceptance

Observed automated checks:

| Check | Result |
| --- | --- |
| Baseline branch, merged main and clean source | Passed before implementation |
| Local PostgreSQL connectivity and repeat migration | Passed |
| Backend environment unit tests | 4 passed |
| Frontend unit tests | 15 passed, including 11 original tests and 4 recurrence/time tests |
| Integration tests | 25 reported passed: two parent tests and 23 subtests |
| Browser tests | 16 passed: 12 existing tests plus 4 saved-schedule tests |
| npm run typecheck | Passed |
| npm run lint | Passed |
| npm run build | Passed using isolated NEXT_DIST_DIR=.next-build output |

Integration tests cover create/read/partial update/delete, recurrence representation,
dated cancellation/replacement/restore, busy overlap, adjacency and midnight, invalid
ranges/dates/DST, timezone changes, unauthenticated requests, cross-user ownership,
database constraints, stale revisions, competing writes, idempotency, sanitized
failures, atomic weekly replacement and sign-out/new-session persistence. The original
auth suite still verifies cookies, expiry/refresh, protected profile and sign-out.

Browser tests verify real API-backed create/edit/delete, reload persistence,
sign-out/new-session persistence for the same user, drag/keyboard entry, midnight,
restoring exceptions, retry after a committed create whose response was lost,
conflict recovery, persisted timezone, preview isolation and 320/390/1440px saved
schedule/settings overflow checks. Existing public preview responsive coverage
also remains in place. Test fixtures are synthetic users with actual Better Auth
sessions; no application login bypass was added.

The Google provider, callback URL and credentials are preserved. Phase 3 live Google
acceptance remains owner-confirmed. The full Google consent-to-saved-schedule flow
was not manually repeated during Phase 4; automated tests establish persistence
across genuine database-backed sessions without claiming a new Google consent test.

**Status:** Phase 4 implementation and automated acceptance pass. Perform the manual
Google-account smoke below for final human acceptance. Production/HTTPS validation,
multi-user availability, Admin, Calendar, notifications, group scheduling, analytics,
CI/CD and deployment are outside this change. Phase 5 has not begun.

## Manual Google-account smoke

1. Run migrations and `npm run dev`; open http://localhost:3000/login and sign in
   through Google. The saved calendar should start empty unless that user has records.
2. Add a weekly available block and a date-specific busy block. Refresh and verify
   both remain. Edit a title/range, refresh, then delete a block and refresh again.
3. Open a weekly occurrence, choose This occurrence only, change its time and save.
   Verify that date changed and the following week kept the original rule. Restore
   the occurrence from the editor. Try canceling just one occurrence as well.
4. Change the timezone in Settings. Reload and verify that it persists; Google name
   and email remain unchanged. Saved dates/times retain their local wall-clock values.
5. Log out; direct /schedule navigation must redirect to Login and unauthenticated
   GET /api/v1/me/schedule must return 401. Sign in with the same Google account and
   verify the same schedule IDs and content remain.
6. Sign in as another Google user in a separate browser profile; their calendar
   must be independent. Foreign entry mutations must return 404.
7. Edit /preview/schedule and preview settings, refresh, and verify preview changes
   reset while the authenticated schedule stays unchanged. The finder still shows
   its fictional demo rather than real users' schedules.

## Files created or modified

32 files: 10 new and 22 modified; no deleted files.
Generated Next type references were restored to their original tracked content.

| Status | File |
| --- | --- |
| Modified | [README.md](../README.md) |
| Modified | [backend/drizzle/meta/_journal.json](../backend/drizzle/meta/_journal.json) |
| Modified | [backend/package.json](../backend/package.json) |
| Modified | [backend/src/app.ts](../backend/src/app.ts) |
| Modified | [backend/src/db/README.md](../backend/src/db/README.md) |
| Modified | [backend/src/db/schema.ts](../backend/src/db/schema.ts) |
| Modified | [backend/src/index.ts](../backend/src/index.ts) |
| Modified | [backend/src/modules/README.md](../backend/src/modules/README.md) |
| Modified | [backend/tests/auth.integration.test.ts](../backend/tests/auth.integration.test.ts) |
| Modified | [frontend/src/app/(core)/layout.tsx](../frontend/src/app/(core)/layout.tsx) |
| Modified | [frontend/src/components/ui/modal.tsx](../frontend/src/components/ui/modal.tsx) |
| Modified | [frontend/src/features/core/block-editor.tsx](../frontend/src/features/core/block-editor.tsx) |
| Modified | [frontend/src/features/core/core-provider.tsx](../frontend/src/features/core/core-provider.tsx) |
| Modified | [frontend/src/features/core/schedule-page.tsx](../frontend/src/features/core/schedule-page.tsx) |
| Modified | [frontend/src/features/core/settings-page.tsx](../frontend/src/features/core/settings-page.tsx) |
| Modified | [frontend/src/features/core/time.ts](../frontend/src/features/core/time.ts) |
| Modified | [frontend/src/features/core/types.ts](../frontend/src/features/core/types.ts) |
| Modified | [frontend/src/features/core/workspace.tsx](../frontend/src/features/core/workspace.tsx) |
| Modified | [frontend/tests/e2e/auth.spec.ts](../frontend/tests/e2e/auth.spec.ts) |
| Modified | [package-lock.json](../package-lock.json) |
| Modified | [packages/shared/package.json](../packages/shared/package.json) |
| Modified | [packages/shared/src/index.ts](../packages/shared/src/index.ts) |
| Created | [backend/drizzle/0001_next_shinko_yamashiro.sql](../backend/drizzle/0001_next_shinko_yamashiro.sql) |
| Created | [backend/drizzle/meta/0001_snapshot.json](../backend/drizzle/meta/0001_snapshot.json) |
| Created | [backend/src/modules/schedule/routes.ts](../backend/src/modules/schedule/routes.ts) |
| Created | [backend/tests/schedule.integration.test.ts](../backend/tests/schedule.integration.test.ts) |
| Created | [docs/phase-4.md](../docs/phase-4.md) |
| Created | [frontend/src/features/core/__tests__/schedule.test.ts](../frontend/src/features/core/__tests__/schedule.test.ts) |
| Created | [frontend/src/features/core/authenticated-workspace.tsx](../frontend/src/features/core/authenticated-workspace.tsx) |
| Created | [frontend/src/features/core/database-repository.ts](../frontend/src/features/core/database-repository.ts) |
| Created | [frontend/tests/e2e/schedule.spec.ts](../frontend/tests/e2e/schedule.spec.ts) |
| Created | [packages/shared/src/schedule.ts](../packages/shared/src/schedule.ts) |
