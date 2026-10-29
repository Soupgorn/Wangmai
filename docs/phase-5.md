# Phase 5 — real multi-user availability

## Baseline and scope

Started from a clean `feat/availability-backend` at `761287d`, the merged PR #4 main baseline. Fetched `origin/main` and verified it was an ancestor of the current branch. Phase 4 persisted schedules, monthly/bulk editing, recurrence exceptions, the unified date selector, and the current result-summary design were present. Existing Better Auth configuration, Drizzle tables, two applied migrations, preference endpoints, preview evaluator and repository adapters were inspected before editing.

The initial local database inspection reported only aggregate counts (5 Google-linked profiles, 5 unexpired sessions, 4 schedule entries); no cookies, tokens, emails, or event titles were printed. A fresh browser context correctly redirected authenticated routes to Login. Existing user data was not reset or removed.

## Database migration

`backend/drizzle/0002_goofy_guardsmen.sql` adds `schedule_preference.share_availability boolean NOT NULL DEFAULT false` and a partial index for shared users. Existing preferences and new users remain OFF unless explicitly enabled. Drizzle generated the SQL, journal entry and snapshot; the two previous migrations remain unchanged. The additive migration was applied to local development PostgreSQL. Deployments must apply it before running the new service; no deployment was performed.

The existing `PATCH /api/v1/me/schedule/preferences` now accepts either or both of `timezone` and `shareAvailability`. It retains session-based ownership, strict Zod input, same-origin checks, required revision matching and transactional writes. Client-supplied ownership fields are rejected. Existing timezone-only callers remain supported. The schedule snapshot includes the authenticated owner's sharing flag so settings survive refresh.

## API contract

`GET /api/v1/availability` requires a verified Better Auth session and these query parameters:

| Parameter | Meaning |
| --- | --- |
| `startDate`, `endDate` | Inclusive local calendar dates, maximum 31 |
| `startTime`, `endTime` | The same half-open wall-time interval evaluated independently on each date |
| `timezone` | IANA timezone for the requested dates and times |

One date uses equal boundaries. Earlier/later click order is normalized by the unchanged picker. The API rejects reversed or invalid typed boundaries, duplicate/unknown parameters, invalid or overnight time intervals, unsupported zones, and nonexistent/ambiguous query times at DST transitions. There is no continuous multi-day timestamp interpretation.

The response contains:

- The validated query.
- Public profiles: `id`, `displayName`, an approved HTTPS Google photo URL or `null`, and exact `availableDates`.
- Each date's status-only rows: `personId` and `available`, `busy`, or `unknown`.
- Accurate `anyDay` and `everyDay` aggregate counts.

Only opted-in, Google-linked users appear. The requesting user is excluded. Unshared profiles are absent from names, dates, states, counts, metadata and error messages. No email, event title, note, raw schedule, OAuth token, recurrence identifier, or owner timezone is returned. Profile images are restricted to HTTPS `lh*.googleusercontent.com` hosts, without credentials or custom ports; failed image loads fall back to initials and use a no-referrer policy.

Query and response schemas are shared and strict. Outbound response validation catches inconsistent dates, identities, aggregates or unexpected fields before serialization. The frontend validates the response again and matches it to the current query. Response consistency checks run linearly over the result rows.

## Calculation and performance

The existing frontend evaluator was moved into `packages/shared/src/availability.ts`. Both the preview and persisted API call it, avoiding divergent recurrence, overlap or timezone rules.

- Available requires confirmed coverage of the whole query, including adjacent available blocks.
- Confirmed overlapping Busy/Personal Time wins over availability. Intervals are half-open.
- Weekly rules, dated blocks, cancellation exclusions and dated replacements are applied in each person's timezone. Restoring an occurrence removes its exclusion through the unchanged Phase 4 API.
- Query dates and schedule-owner local dates may differ. The service loads relevant dated rows with a two-day offset margin and evaluates actual zoned instants.
- Ambiguous/nonexistent recurring times conservatively produce Unknown unless an independent valid Busy conflict already proves unavailability.
- Missing or partial availability remains Unknown. The existing model has no declaration that an availability schedule is complete; gaps are never invented as Busy or Available.
- Any Day requires at least one Available date. Every Day requires Available on every selected date; Unknown never qualifies.

The API uses a repeatable-read, read-only transaction, a 5-second SQL statement timeout, and three set-based profile/entry/exception reads independent of the number of people. Queries select only eligible users and relevant dated rows; private titles and emails are never selected. Blocks are grouped by owner before evaluation. There are no per-user SQL queries. Successful and failed API responses are `no-store`; database failures return sanitized 503 errors, distinct from valid empty results.

## Frontend integration and privacy boundary

The authenticated finder now uses the real API, with no mock fallback. It preserves the unified picker byte-for-byte, selected time inputs, timezone control, Any/Every matching, Person/Date views, exact-date cards, summary metrics, keyboard behavior, current palette, responsive layout and existing motion tokens. The Week/Month schedule components and auth configuration were not edited.

Real-page demo labels were replaced with privacy guidance. The independent `/preview/*` routes retain their labels, fictional people, synchronous evaluation and in-memory settings/schedules. Preview never calls the finder or preference API, even with a signed-in browser cookie.

Live requests debounce for 200ms, abort superseded work, use a 15-second timeout, and guard both late responses and A → B → A query reuse. Input changes immediately mask old results. Loading uses skeletons and an announced checking state; no provisional count or invented availability is displayed. Valid empty results, validation errors, request failures and retry are distinct. An expired-session response redirects to Login.

The finder revalidates on focus/visibility return and every 30 seconds while visible. Turning sharing OFF excludes the user on every subsequent server query; another browser's already-rendered results update on revalidation. This is polling/focus refresh, not push notification or instantaneous revocation of previously viewed information.

Settings now persist sharing, disable controls while saving, report confirmed saves, and offer Reload preferences after a failure or revision conflict. Google identity remains read-only in this UI. The sharing explanation explicitly names what others can see and what stays private.

## Design and browser evidence

Read and applied the installed frontend-design and Impeccable skills. Used the existing session's design context plus Impeccable harden, craft-floor and polish workflows for network/error states, pending controls, profile-image fallback, privacy copy, accessibility and visual consistency. The mechanical detector returned no findings in the modified UI.

Inspected the port-3000 preview before implementation and inspected the connected finder in actual Chromium using automated regression fixtures backed by PostgreSQL. Checked 1440, 1024, 768, 390 and 320px, including per-date navigation and reduced motion. Measurements found no horizontal document overflow. Browser instrumentation verified real card entrance/exit and segmented-control animations. The unified picker and other existing animations remain covered by the full suite.

The synthetic regression accounts are not manual Google acceptance. The browser runner now creates, migrates and removes an invocation-owned temporary `wangmai_browser_test_*` database, keeping fixture profiles out of the normal port-3000 app. New live tests refuse to run outside this isolation. Existing tests retain their verified Better Auth fixtures; no test login endpoint, app auth bypass or fabricated state was added to the product.

Artifacts explicitly show fixture names:

- [Before preview](../artifacts/phase-5/before-preview.png)
- [Connected finder, 1440px](../artifacts/phase-5/automated/live-1440.png)
- [1024px](../artifacts/phase-5/automated/live-1024.png), [768px](../artifacts/phase-5/automated/live-768.png), [390px](../artifacts/phase-5/automated/live-390.png), [320px](../artifacts/phase-5/automated/live-320.png)
- [Automated interaction recording](../artifacts/phase-5/automated/video.webm)

## Automated verification

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed across all workspaces |
| `npm run lint` | Passed across all workspaces, zero warnings |
| `npm run build` | Passed for shared, frontend and backend; isolated `.next-build` output |
| `npm test` | 4 backend + 34 frontend unit tests passed |
| `npm run test:integration` | 38 tests passed, using temporary databases |
| Full browser suite | All 53 tests passed in 3.4 minutes in an isolated database |
| Final live-finder browser run after response-contract hardening | All 3 tests passed in 34.8 seconds |
| New live browser cases | Sharing persistence/privacy, real Any/Every/date results, retry, debounce, late/reused-query protection, preview isolation, real motion, five widths and reduced motion passed |
| `git diff --check` | Passed |

No existing tests were removed. Phase 4 expectations that sharing was disabled and the real finder unavailable were updated to assert the new persistent setting and connected UI. Existing OAuth, sessions, ownership, weekly/monthly CRUD, idempotent saves, partial bulk failures, recurring overrides and preview behavior remain exercised.

Logs: [typecheck](../artifacts/phase-5/typecheck.log), [lint](../artifacts/phase-5/lint.log), [build](../artifacts/phase-5/build.log), [unit](../artifacts/phase-5/unit-tests.log), [integration](../artifacts/phase-5/integration-tests.log), [full browser suite](../artifacts/phase-5/browser-tests.log), [isolated focused browser suite](../artifacts/phase-5/isolated-focused-browser-tests.log), [final browser check](../artifacts/phase-5/final-browser-tests.log).

## Real two-account manual acceptance

The user completed the port-3000 checklist with two real Google accounts and explicitly reported: **“All steps passed; B’s finder is open.”** These are user-confirmed manual acceptance results, not claims that the agent operated or independently witnessed the Google consent flow. Automated fixtures above do not count toward this checklist.

| Step | Status |
| --- | --- |
| A signs in with real Google OAuth | PASS — user confirmed |
| A creates a persistent schedule | PASS — user confirmed |
| A enables sharing and saves | PASS — user confirmed |
| B signs in with a different real Google account | PASS — user confirmed |
| B selects the date/time range | PASS — user confirmed |
| A appears on the correct dates | PASS — user confirmed |
| Any/Every matching behaves correctly | PASS — user confirmed |
| A disables sharing and saves | PASS — user confirmed |
| A disappears after B revalidates | PASS — user confirmed |
| No private event details or email appear | PASS — user confirmed; current finder accessibility content also inspected |

For the proposed check, A adds Available on all three dates and Busy on Nov 1. B should see A available on two of three dates under Any Day, absent under Every Day, and Busy on Nov 1 under By Date. After A saves sharing OFF, returning focus to B triggers revalidation.

The computer-use skill was read and applied for a read-only inspection of the actual Opera private window at `http://localhost:3000/availability`. The accessibility tree independently showed the authenticated live finder, unified selection, 13:00–15:00 Asia/Bangkok filters, date navigation and status-only result content. Its current post-check selection was Oct 30–31. No Google authentication or sharing controls were automated. A native screenshot attempt failed (`foreground window did not report a process id`); a refreshed window inventory no longer exposed that finder window. Saved visual evidence therefore remains explicitly labelled automated PostgreSQL fixtures rather than a fabricated manual screenshot.

## Changed files

Added:

- `packages/shared/src/availability.ts`
- `backend/drizzle/0002_goofy_guardsmen.sql`
- `backend/drizzle/meta/0002_snapshot.json`
- `backend/src/modules/availability/routes.ts`
- `backend/tests/availability.integration.test.ts`
- `backend/tests/run-browser-tests.ts`
- `frontend/src/features/core/availability-client.ts`
- `frontend/src/features/core/use-live-availability.ts`
- `frontend/src/features/core/__tests__/availability-client.test.ts`
- `frontend/tests/e2e/availability-live.spec.ts`
- This report and `artifacts/phase-5/` evidence.

Modified:

- `README.md`
- `backend/drizzle/meta/_journal.json`
- `backend/src/app.ts`
- `backend/src/db/schema.ts`
- `backend/src/modules/schedule/routes.ts`
- `backend/tests/schedule.integration.test.ts`
- `packages/shared/src/index.ts`
- `packages/shared/src/schedule.ts`
- `frontend/package.json`
- `frontend/src/features/core/availability-page.tsx`
- `frontend/src/features/core/availability-person-card.tsx`
- `frontend/src/features/core/availability-summary.ts`
- `frontend/src/features/core/availability.ts`
- `frontend/src/features/core/database-repository.ts`
- `frontend/src/features/core/date-range.ts`
- `frontend/src/features/core/finder.module.css`
- `frontend/src/features/core/settings-page.tsx`
- `frontend/src/features/core/time.ts`
- `frontend/src/features/core/types.ts`
- `frontend/tests/e2e/schedule.spec.ts`

## Review readiness and limits

The implementation is ready for a reviewed Phase 5 PR, with passing automated verification and user-confirmed real two-account acceptance. It is not a deployment or production-readiness claim. The migration must accompany the code. No commit, push, merge or deployment was performed.

Remaining limits: at most 31 same-day query intervals; split overnight searches; conservative Unknown during ambiguous recurring DST occurrences; no complete-schedule declaration; focus/30-second revalidation rather than push; all opted-in profiles are returned without pagination; no production-scale load test; Google photo hosting may fail and uses initials as fallback. Visual automation used Chromium/emulated viewports and touch, not physical devices, Safari, Firefox, or a live screen reader. Real Google acceptance is user-confirmed as recorded above. No Admin, Google Calendar, notifications, group planning, analytics, CI/CD, or CloudStack work was introduced.
