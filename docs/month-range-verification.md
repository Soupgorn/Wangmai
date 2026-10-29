# Monthly scheduling and range availability

Work is on `ui/improvement`, fast-forwarded to `034f91e` (latest fetched `origin/main`). The initial working tree was clean. No commit, push, merge publication, migration, or deployment was performed.

## Behavior

- My Schedule retains Week and Day and adds Month, month navigation, Today, and date jumping.
- The seven-column month uses real owner blocks, recurrence exclusions, dated replacements, and timezone-valid occurrences. Dots describe time blocks, never all-day availability. Personal Time uses the existing `busy` kind and the title `Personal Time`; there is no new schema status.
- Explicit One date, Date range, and Multiple dates modes work with touch, mouse, and keyboard. Selections survive month navigation. Clear selection resets the range anchor.
- The selected-day agenda opens the existing editor. In authenticated Month view a recurring block defaults to this occurrence only; the existing series option and override restoration remain available.
- Bulk editing adds a dated block on each selected date, without changing weekly entries. All dates validate before any request. Sequential requests retain revision protection and create idempotency. Processing stops at the first failure; confirmed dates are cleared and unfinished/unconfirmed dates remain selected. Feedback reports counts and the error. A response lost after commit remains unconfirmed: retry the same block or reload before changing it.
- The range preview evaluates the same half-open wall-time interval separately on each inclusive local date. Maximum 31 days. Dates crossing month/year and DST transitions use the existing Temporal/shared validators. Missing data and unshared schedules remain Unknown. Every-day intersection requires confirmed availability on every date.
- Results by Day provides a date selector; Available Every Day provides the intersection. Filters update immediately without a Search button. Evaluation is synchronous, so no asynchronous response can replace newer filters. Invalid input clears results and displays validation, separately from a valid empty result.

## Data boundaries and Phase 5

`/schedule` and `/settings` continue using `DatabaseCoreRepository`. Authenticated `/availability` now also remains inside the persistent provider and explicitly states that the real-user service is unavailable. It does not instantiate mock people. The independent `/preview/*` routes use their existing mock provider, with explicit preview labels on the finder. No backend API, shared schema, auth configuration, or database schema changed.

`date-range.ts` exports `RangeQuery`, `RangeResults`, `inclusiveDates`, and `evaluateRange`. Phase 5 must supply an authorized, status-only multi-user service for this query shape: `startDate`, `endDate`, `start`, `end`, `timezone`. The response groups eligible users and status per date; every-day results must intersect confirmed Available statuses. The server must enforce eligibility and sharing, hide titles/private blocks, validate all dates/times and the 31-day limit, apply recurring exceptions, and distinguish valid empty results from request failure. A future asynchronous adapter needs cancellation or request-generation checks, loading and retry states, and response validation before the authenticated finder is enabled. These services are not implemented here.

## Design and browser verification

The installed frontend-design and Impeccable skills were read. The incumbent palette, Manrope typography, components, and motion tokens were retained. Month transitions use `motion-week`; result transitions use the existing result-motion hook. Selection feedback uses existing micro timing; global reduced-motion rules disable spatial animation. The Impeccable detector found one pre-existing weekly-event accent border; it was preserved as unrelated approved styling.

The interactive browser host was unavailable. Actual Chromium inspection and interaction used the installed Playwright runtime. Evidence includes five widths (1440, 1024, 768, 390, 320), mobile control bounds, keyboard selection, reduced motion, persistent monthly saves after refresh, partial write failure/retry, recurring occurrence edits, preview isolation, and range validation. Screenshots and supported recordings are copied to `artifacts/month-range` after verification.

## Verification results

- `npm run typecheck`: passed across all workspaces.
- `npm run lint`: passed across all workspaces, zero warnings.
- `npm run build`: passed for shared, Next.js frontend, and backend. Used `NEXT_DIST_DIR=.next-build` to keep production output separate from browser artifacts.
- `npm test`: 4 backend unit tests and 21 frontend unit tests passed (25 total).
- `npm run test:integration`: 25 tests passed, including real PostgreSQL, ownership, sessions, CRUD, idempotency, recurring exceptions, and timezone validation.
- `npm run test:e2e --workspace=@wangmai/frontend`: all 40 browser tests passed in 2.8 minutes.
- `git diff --check`: passed.

Earlier attempts exposed a build-output collision, API-watch restarts from concurrent shared compilation, and ambiguous test selectors. The final full browser run was isolated from builds, and the selectors were corrected. The existing authenticated-finder expectation was updated to assert the explicit unavailable-service message rather than a demo inside the account route. Live Google consent was not exercised; existing OAuth routing/configuration and persisted Better Auth session tests passed.

A final defensive catch makes an oversized monthly range (over 366 dates) a visible validation message instead of an unhandled selection error. The seven month/range browser checks were rerun after this small guard. This scheduling-selection limit is independent of the 31-day finder limit.

## Source files

- `frontend/src/features/core/authenticated-workspace.tsx`
- `frontend/src/features/core/schedule-page.tsx`
- `frontend/src/features/core/month-calendar.tsx` (new)
- `frontend/src/features/core/block-editor.tsx`
- `frontend/src/features/core/core.module.css`
- `frontend/src/features/core/availability-page.tsx`
- `frontend/src/features/core/date-range.ts` (new)
- `frontend/src/features/core/__tests__/date-range.test.ts` (new)
- `frontend/tests/e2e/month-range.spec.ts` (new)
- `frontend/tests/e2e/schedule.spec.ts`
- This verification document and local browser artifacts.
