# Unified Who’s Free? calendar selection

## Changes

Removed the Single Day / Date Range segmented control and its explicit search-mode state. The calendar now determines the query from one atomic selection containing a start date, end date, and optional anchor.

- The page initially shows today as a one-day query, retaining the established preview default.
- First calendar click/tap selects a single date and updates results immediately. There is no completion button or delay.
- Second click/tap completes an inclusive range. Selecting the earlier date second automatically orders the boundaries.
- Repeating the same date keeps one day selected and leaves it available as a range anchor.
- After a completed multi-day range, the next click starts a new single-day selection.
- Clear dates empties the selection and result cards, removes calendar highlights, and presents a distinct choose-dates state. It retains times and timezone. Clear is disabled while empty.
- The live summary displays a long date or range plus the inclusive day count. Contextual hints explain single-day, pending-range, completed-range, and empty states.
- Direct date entry remains under Edit dates directly. It shares the same selection state; changing a single date updates both boundaries. Invalid native input remains editable with clear validation.

One selected day automatically uses the existing single-day result presentation. Multiple days automatically enable the existing person/date exploration and Any/Every matching. The requested half-open time interval is evaluated separately on each local calendar date. No continuous multi-day timestamp interval is introduced.

## Design, motion, and accessibility

Read the installed frontend-design and Impeccable SKILL.md files. Applied the Impeccable distill, animate, craft-floor, and polish workflows to remove the extra decision, emphasize the selected-date summary, retain secondary native input access, and refine the complete interaction path. The existing session context and Wangmai palette, Manrope type, rounded controls, semantic status colors, and shared motion tokens remain authoritative.

The summary sits directly above the calendar with a labelled Clear dates control. Native date entry is progressively disclosed. The range uses connected soft-green highlighting and stronger endpoint markers. Selected-day feedback, range color transitions, animated summary changes, and the existing result transitions remain visible. Reduced motion removes spatial movement while retaining selection colors, text, and operability.

The summary is a stable polite live region with atomic announcements. Date buttons retain full date labels, `aria-pressed`, Today indication, roving keyboard focus, arrow/Home/End/PageUp/PageDown navigation, and Enter/Space selection. Focus movement previews a pending range without committing it. Touch uses the same two-activation model.

Inspected actual Chromium renders before editing and after implementation. Reviewed desktop, tablet, and narrow mobile layouts. Corrected tablet filter ordering after removing the old toggle. All five measured widths (1440, 1024, 768, 390, 320) have zero horizontal document overflow. Calendar day cells retain 44px height, with compact widths on the smallest screen. Tests synthesize touch; physical devices and assistive-technology applications were not exercised.

Browser testing also found a rapid Arrow → Enter focus race caused by waiting for an animation frame. Keyboard focus now restores in a layout effect immediately after the relevant calendar render, so selection uses the current focus. Touch-target assertions round subpixel browser measurements. The invalid-input test distinguishes clearing both boundaries from leaving only one invalid boundary.

The Impeccable source detector returned no findings in the changed UI.

## Verification

- `npm run typecheck`: passed across all workspaces.
- `npm run lint`: passed across all workspaces, zero warnings.
- `npm run build`: passed for shared, frontend, and backend, using `NEXT_DIST_DIR=.next-build` to isolate build output.
- `npm test`: 4 backend and 30 frontend unit tests passed.
- `npm run test:integration`: 25 PostgreSQL/auth/schedule tests passed.
- Focused picker/design browser verification: all 13 tests passed after the keyboard-focus correction.
- Full browser suite: all 50 tests passed in 3.2 minutes. See [browser-tests.log](../artifacts/unified-dates/browser-tests.log).
- `git diff --check`: passed.

Focused coverage includes one-click single-day queries, inclusive ranges, reverse order across a year boundary, same-date activation, fresh selection after a completed range, live date/count summaries, clearing without implicit today fallback, native entry, untouched time/timezone values, immediate results, touch at all five widths, keyboard focus, actual summary animation, and reduced-motion feedback. Existing availability aggregation, privacy, DST, month scheduling, persistence, recurrence, sessions, and browser tests remain in place. Tests that used the removed toggle now use the unified calendar or the native date disclosure.

## Files changed for this follow-up

- `frontend/src/features/core/availability-range-picker.tsx`
- `frontend/src/features/core/availability-page.tsx`
- `frontend/src/features/core/finder.module.css`
- `frontend/src/features/core/calendar-selection.ts` (new)
- `frontend/src/features/core/__tests__/calendar-selection.test.ts` (new)
- `frontend/tests/e2e/finder.spec.ts`
- `frontend/tests/e2e/core.spec.ts`
- `frontend/tests/e2e/design.spec.ts`
- `frontend/tests/e2e/month-range.spec.ts`
- This report and `artifacts/unified-dates/` evidence.

Unrelated pre-existing working-tree changes to the authenticated workspace, schedule page, block editor, core stylesheet, and schedule persistence browser tests were compared against the saved baseline and preserved. No branch change, commit, push, merge, deployment, dependency, backend API, or database schema changes were made.

## Evidence

- [Before](../artifacts/unified-dates/before.png)
- [Single day](../artifacts/unified-dates/single.png)
- [Cleared state](../artifacts/unified-dates/empty.png)
- [Range, 1440px](../artifacts/unified-dates/range-1440.png)
- [Range, 1024px](../artifacts/unified-dates/range-1024.png)
- [Range, 768px](../artifacts/unified-dates/range-768.png)
- [Range, 390px](../artifacts/unified-dates/range-390.png)
- [Range, 320px](../artifacts/unified-dates/range-320.png)
- [Selection recording](../artifacts/unified-dates/unified-selection.webm)
- [Viewport and summary measurements](../artifacts/unified-dates/viewport-checks.json)
- [Typecheck](../artifacts/unified-dates/typecheck.log), [lint](../artifacts/unified-dates/lint.log), [build](../artifacts/unified-dates/build.log), [integration](../artifacts/unified-dates/integration.log), [browser tests](../artifacts/unified-dates/browser-tests.log)
- [Unit tests](../artifacts/unified-dates/unit-tests.log), [focused browser tests](../artifacts/unified-dates/focused-browser-tests.log)

## Remaining limitations

The maximum search range remains 31 inclusive calendar days. Existing same-day/overnight and DST validation remain in effect. The independent preview still uses fictional people and schedules; authenticated real-user availability remains explicitly unavailable pending Phase 5. No Phase 5 work was started. Browser evidence uses Chromium with emulated viewport/touch behavior; Safari, Firefox, physical devices, and live screen readers were not tested. OAuth/session regression coverage does not exercise live Google consent.
