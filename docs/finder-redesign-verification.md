# Who’s Free? design and verification

## Scope and preserved work

Implemented on the existing `ui/improvement` branch at `034f91e`. The checkout already contained uncommitted monthly scheduling work. A baseline was saved outside the repository before editing. Existing changes to the authenticated provider, schedule page, block editor, core stylesheet, schedule browser tests, and `date-range.ts` were compared against that baseline and preserved. No backend, schema, dependency, auth configuration, commit, push, merge, or deployment changes were made.

Open the experience at [the independent availability preview](http://localhost:3000/preview/availability). Authenticated `/availability` continues to show an explicit unavailable-service state and links to the separate preview. It never displays fictional people as account users.

## Skills and audit

Read and applied the installed `frontend-design` skill at `C:/Users/supakorn/.agents/skills/frontend-design/SKILL.md` and Impeccable 4.7.0 at `C:/Work/soupgorn-portfolio-web/.agents/skills/impeccable/SKILL.md`. Used Impeccable’s actual `context --target` command, `audit.md`, `operate.md`, `animate.md`, `craft-floor.md`, and `polish.md` workflows. The required source detector ran once over the new finder UI and returned `[]`.

The incumbent implementation and design tokens were the design authority. Retained lime `#8BC34A`, forest `#26382E`, chalk `#F7F9F3`, white surfaces, apricot Busy indicators, Manrope typography, shared inputs/buttons/status tags, and existing motion tokens. No speculative design-system setup or unrelated visual changes were introduced.

Browser inspection before implementation found:

| Priority | Finding | Change |
| --- | --- | --- |
| P1 | Range mode hid the calendar and required typed dates | Visible calendar with endpoint and connected-range highlighting, including on touch screens |
| P1 | A person’s availability across the range was not summarized | Exact confirmed dates, available-day counts, and Any/Every matching |
| P2 | Results exposed one day or an intersection without a person/date presentation choice | Separate By Person / By Date controls and date navigation |
| P2 | Tall mobile filters pushed results far below the fold | Paired time fields, tablet two-column filter layout, mobile View matches shortcut |
| P2 | Result reveals had no exit/position continuity | Interruptible entry, exit, and list-position animations |
| P2 | Validation was distant from the mobile inputs | Inline announced validation beside filters, with an explanatory results state |

The source audit retained the existing privacy model and semantic tokens. Observational audit scores: accessibility 3/4, performance 3/4, theming 4/4, responsiveness 3/4, integrity 4/4 (17/20). These are design-review judgments, not a WCAG certification. Physical devices and assistive-technology applications were not tested.

## Interaction and result behavior

- Single Day retains the established instant status filters and shared-status preview.
- Date Range defaults to By Person and Available on Any Day. The first calendar activation chooses a start; the second completes an inclusive, ordered range. Earlier second endpoints are ordered automatically. Typed dates and month navigation remain available. A hint announces which endpoint is next.
- Arrow keys move calendar focus without selecting. Enter/Space select; Home/End move within the week; PageUp/PageDown move across months. Focus is retained through keyboard month changes. Selected dates use `aria-pressed`, Today uses `aria-current`, and native date fields remain available.
- The existing evaluator enforces real dates, same-day half-open time intervals, timezone/DST validation, and at most 31 inclusive calendar dates. The requested wall-time interval is evaluated separately on each date. Cross-month and cross-year ranges work.
- Any Day includes only people confirmed Available on at least one date. Every Day requires a confirmed Available result for every date. Missing status, missing dates, unshared availability, and Unknown never qualify as confirmed availability.
- Person summaries collect eligible status-only responses across all dates. Each card lists exact available dates and shows one supplemental status marker per date, with an accessible text equivalent. Selecting an available date opens By Date for that day.
- By Date shows Available, Unavailable, and Unknown independently for each date, with previous/next navigation and a native date selector. Matching criteria remain a person-summary choice; per-date exploration exposes the complete eligible status list.
- Invalid filters immediately remove result cards and show validation. A valid query with no matches has a distinct empty state. No Search button, artificial latency, or simulated live network search was added. Synchronous preview evaluation cannot commit an older asynchronous response.
- Initial loading and repository failure/retry continue through the existing provider/workspace. Loaded content and empty/error states use the established state-transition language; there is no fabricated loading state between local filter changes.

## Motion and visual iteration

The focal interaction is the connected calendar range with selected endpoints. Supporting motion explains changes: month replacement, count changes, segmented selection continuity, card arrival, card removal, and movement of retained results. Entrances and filtering use `--motion-state` (240ms); exits use `--motion-exit` (160ms); list staggering is capped at 105ms. Hover and pressed feedback use existing micro timings. No animation package was added.

Exit copies are inert, hidden from accessibility, stripped of result identities, and removed on completion/cancellation. Query/date changes clear outgoing copies immediately. Reduced-motion preferences prevent spatial effects and cancel in-flight Web Animations while preserving visible selection, color feedback, current content, and all actions.

Reviewed real Chromium screenshots before implementation and after the first pass. Refined narrow-card text wrapping, mobile status placement, validation proximity, and result access. Captured the final layout at 1440, 1024, 768, 390, and 320px; measured zero document overflow at all five widths. Touch taps were synthesized in Chromium; keyboard navigation and focus were exercised separately. Calendar cells have a minimum 44px height; compact seven-column cells are narrower on the smallest screen. Native fields and keyboard selection provide alternate input paths.

## Verification

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed across all workspaces |
| `npm run lint` | Passed across all workspaces, zero warnings |
| `npm run build` | Passed; used `NEXT_DIST_DIR=.next-build` to isolate production output from the running dev server |
| `npm test` | 4 backend + 25 frontend unit tests passed |
| `npm run test:integration` | 25 PostgreSQL/auth/schedule integration tests passed |
| `npm run test:e2e --workspace=@wangmai/frontend` | All 49 browser tests passed, 2.9 minutes |
| Final focused finder/design browser run | All 12 tests passed after the last validation/accessibility adjustments, 37.9 seconds |
| Impeccable source detector | No findings in the changed finder UI |
| `git diff --check` | Passed |

New tests cover per-person counts, exact dates, Any/Every matching, missing results, private/Unknown availability, single-day equivalence, daily intervals across a year boundary, calendar click/keyboard selection, invalid ranges, DST errors, per-date status exploration, real animation names/durations, reduced-motion cancellation, preview network isolation, and touch/responsive layouts at all five requested widths.

The first browser run exposed an obsolete assertion that expected the mobile calendar to be hidden and an assertion that counted Next.js’s framework alert region. The former now verifies the intended visible mobile controls and 44px navigation targets; the latter checks the feature’s validation node. Existing tests were retained, including the prior month/range tests, whose navigation expectations were updated for By Person / By Date.

## Evidence

All paths below are relative to this document:

- [Before, desktop](../artifacts/finder-redesign/before-desktop.png)
- [Before, mobile](../artifacts/finder-redesign/before-mobile.png)
- [After, 1440px](../artifacts/finder-redesign/after-1440.png)
- [After, 1024px](../artifacts/finder-redesign/after-1024.png)
- [After, 768px](../artifacts/finder-redesign/after-768.png)
- [After, 390px](../artifacts/finder-redesign/after-390.png)
- [After, 320px](../artifacts/finder-redesign/after-320.png)
- [Every-day results](../artifacts/finder-redesign/after-every-day.png)
- [By-date results](../artifacts/finder-redesign/after-by-date.png)
- [Interaction recording](../artifacts/finder-redesign/range-interaction.webm)
- [Viewport measurements](../artifacts/finder-redesign/viewport-checks.json)
- [Computed style measurements](../artifacts/finder-redesign/style-checks.json)
- [Full browser test log](../artifacts/finder-redesign/browser-tests.log)
- [Final focused browser test log](../artifacts/finder-redesign/final-browser-tests.log)
- [Unit test log](../artifacts/finder-redesign/unit-tests.log)
- [Typecheck log](../artifacts/finder-redesign/typecheck.log)
- [Lint log](../artifacts/finder-redesign/lint.log)
- [Build log](../artifacts/finder-redesign/build.log)

## Files changed in this task

Modified:

- `frontend/src/features/core/availability-page.tsx`
- `frontend/tests/e2e/design.spec.ts`
- `frontend/tests/e2e/month-range.spec.ts` (pre-existing uncommitted file; adapted range-result navigation assertions)

Added:

- `frontend/src/features/core/availability-range-picker.tsx`
- `frontend/src/features/core/availability-person-card.tsx`
- `frontend/src/features/core/availability-summary.ts`
- `frontend/src/features/core/finder-segment.tsx`
- `frontend/src/features/core/finder-motion.ts`
- `frontend/src/features/core/finder.module.css`
- `frontend/src/features/core/__tests__/availability-summary.test.ts`
- `frontend/tests/e2e/finder.spec.ts`
- This report and `artifacts/finder-redesign/` evidence.

## Remaining limits

Multi-user availability remains a fictional preview. Phase 5 still needs an authorized, privacy-filtered status-only service, validated response contracts, eligibility enforcement, and asynchronous loading/error/retry/cancellation behavior before real-user search can be enabled. No Phase 5 backend work was started. Live Google consent was not exercised; the existing OAuth routing, error handling, persisted Better Auth sessions, ownership, and schedule lifecycle tests passed. Browser verification used Chromium and emulated touch/viewports; Safari, Firefox, physical devices, and a live screen reader were not exercised.
