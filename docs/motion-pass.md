# Wangmai Phase 4 UI integration and motion pass

> Historical motion-worktree report. The combined implementation has now been assembled on `ui/improvement` in `D:/Project/Wangmai`; see [the final branch integration report](phase-4-integration.md) for the current location, merge state and fresh verification. The original worktree preservation statements below describe the earlier motion task, before the user requested this integration.

## Location and scope

- Worktree: `D:/Project/Wangmai-phase4-motion`
- Branch: `ui/motion-phase4`, based on Phase 4 commit `1c54e6f7b0ed1adfda24156d142c7458b4645cca`.
- Running frontend: `http://localhost:3000`; Hono: `http://localhost:4000`.
- The user requested Phase 4 as the baseline, then explicitly requested integration of the `ui/improvement` work. Its branch tip is an ancestor of Phase 4; Git reports “Already up to date.” Its UI work was uncommitted, so those working files were integrated separately using a common-base comparison and manual overlap resolution. No merge commit or other commit was created.
- The original `D:/Project/Wangmai` working tree remains on `ui/improvement`, with all 36 snapshotted files byte-for-byte unchanged. The environment was reused locally without printing credentials. Source environment files were not deleted or altered.
- No backend, shared API contract, database schema, migration, OAuth configuration, Docker/Caddy architecture, package manifest or lockfile changes were introduced.

## Existing animation audit and root cause

The prior UI pass chiefly supplied color/border feedback, a short backdrop fade and a toggle transition. It did not implement hero choreography, scroll reveals, block presence motion, editor exit presence, result transitions or page continuity. The Phase 4 baseline likewise had no running entrance animations on the inspected public/preview pages. The previous report overstated the visible motion.

An un-emulated Microsoft Edge context reported `prefers-reduced-motion: reduce` as false. The Playwright configuration does not globally disable animations; only explicit reduced-motion tests enable reduction. Date-clock fixtures are not animation-disabling settings. The static appearance was therefore an implementation limitation in the tested baseline, not a reduction preference being bypassed.

The installed frontend-design and Impeccable 4.7.0 animate/polish/audit/adapt guidance informed the pass. The approved six-color green identity, Manrope/Noto typography, layouts, data meanings and existing components remain. No animation library was added.

## Motion architecture and implemented behavior

`frontend/src/app/motion.css` owns duration/easing/stagger/movement tokens and CSS entrances/feedback. `frontend/src/lib/motion.ts` handles interruptible Web Animations effects tied to committed content. Browser-normalized time tokens may be serialized in seconds; the helper converts seconds to milliseconds correctly. Tests assert actual 320ms/240ms/160ms effects, not only class names.

- Landing: 580ms heading/description/actions/product-preview reveals, staggered 80ms between major elements with a 240ms maximum delay. The existing feature section reveals once over 460ms on viewport entry. SSR and failed scripts leave content available.
- Login: 460ms content entrance; 160ms button lift/press feedback; visible pending spinner during the real Better Auth client request; finite error entrance on failure. No successful authentication is simulated.
- Calendar: immediate pointer-range background and live time-range label; a 160ms initial range acknowledgement; no height/top transition during pointer movement. Lost pointer capture clears selection.
- Confirmed blocks: 320ms scale/opacity arrival or update after repository snapshots commit. Deleted blocks leave over 160ms using inert, aria-hidden visual copies only after successful deletion. No write success is shown while a response is pending, lost, failed or conflicted.
- Editor: 240ms entrance and 160ms exit with Radix focus management. Closing content is inert and form controls are disabled. Instance keys and stale-close guards protect rapid keyboard creation from an earlier exit callback; pending/closing guards prevent repeated submissions.
- Week/day navigation: a 240ms reveal of newly committed date headers and events together. Previous-week events are not retained under new headings, and no deletion ghosts cross view boundaries.
- Availability: latest synchronous demo results commit immediately; current cards reveal over 240ms with capped 35ms sibling stagger. Count/error/empty state changes have finite feedback. Unmatched results are removed immediately rather than retaining outdated people or statuses. No artificial network spinner or real multi-user claim was added.
- Settings: 240ms preview toggle thumb travel and track feedback; real timezone saves show a pending indicator and confirmation only after the backend succeeds. Preview settings retain preview-only acknowledgements. Account names/emails remain read-only in persistent settings; sharing remains disabled there until its backend exists.
- Navigation: a 240ms moving active marker, restrained icon feedback, an accessible mobile show/hide control with 240ms collapse/opacity transition, and 380ms route-content entrances. Collapsed navigation is inert.
- Only interactive controls receive hover elevation. Static result/marketing cards do not imply clickability. Busy indicators loop only while the corresponding operation is pending.

## Reduced motion and correctness

Spatial keyframes, transforms, spinner rotation and Web Animations are disabled for reduce. Short color/border/shadow feedback remains, and all final content/actions remain available. Changing the preference while a result reveal is running cancels that reveal and leaves the latest result visible. User/browser accessibility preferences were not changed.

Real `/schedule` and schedule timezone preferences continue using the Phase 4 database repository; `/preview/*` remains in-memory. Authenticated `/availability` is still the separate fictional finder. PostgreSQL ownership, revision checking, idempotency, recurring rules, dated exceptions and timezone/DST validation remain unchanged.

During implementation, timeline inspection caught sub-millisecond effects caused by time-unit normalization, and an existing browser test caught a rapid keyboard-create race during editor exit. Both were corrected. The initial failure and later passing runs were retained as verification history; no tests were skipped or deleted and no timeout was raised to hide the regression.

## Acceptance matrix

PASS refers to observed browser timelines/recordings or the stated automated interaction, not merely CSS declarations.

| Page | Trigger | Expected motion | Verified |
| --- | --- | --- | --- |
| Landing | Initial load | 580ms hero reveal with 80ms stagger | PASS: five widths, running animation/frame samples and recordings |
| Landing | Scroll | Once-only 460ms feature reveal | PASS: recorded below-fold entry; replay prevention/no-JS tests |
| Landing | CTA hover/press | 160ms lift/shadow/press response | PASS: running transform transitions and video |
| Login | Initial load | 460ms entrance | PASS: all five widths |
| Login | Google click | Real pending-state spinner/error feedback | PASS: controlled 503 browser test/recording; real initiation endpoint separately returned 200 |
| Schedule | Create block | Server-confirmed 320ms entrance | PASS: gated real PostgreSQL request and recorded fixture session |
| Schedule | Drag | Immediate range plus 160ms acknowledgement | PASS: recorded mouse gesture; preview and persistent drag/keyboard tests |
| Schedule | Change week | 240ms current-content transition | PASS: outgoing dated entry absent immediately; five-width walkthroughs |
| Schedule | Edit block | Editor entrance/exit and confirmed update | PASS: recordings, focus tests, real CRUD and exceptions |
| Availability | Change filters | Current cards/count transition | PASS: running 240ms effects and correct latest people/states |
| Settings | Toggle | 240ms thumb/track response | PASS: preview toggle timelines and recordings; persistent sharing correctly remains disabled |
| Mobile | Open navigation | 240ms expand/fade, accessible links | PASS: 768/390/320 recordings and inert/focus checks |
| All | Reduced-motion preference | Immediate spatial changes, retained state feedback | PASS: reduced walkthrough plus static/live preference regression tests |

## Verification results and test-count reconciliation

| Check | Result |
| --- | --- |
| Backend unit tests | PASS: 4 |
| Frontend unit tests | PASS: 15 |
| PostgreSQL/auth/schedule integration | PASS: 25 reported tests, including two parent suites and 23 subtests |
| Complete Edge browser suite after UI integration | PASS: 31 |
| Complete Chromium browser suite after UI integration | PASS: 31 |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS with isolated `.next-build` output |
| Local PostgreSQL connectivity and existing schedule tables | PASS; no development migration/schema change required |
| OAuth initiation | PASS: 200, accounts.google.com, callback `http://localhost:3000/api/auth/callback/google`, only openid/email/profile scopes |
| Full live Google authorization handshake | NOT REPEATED; no new live OAuth success claimed |
| Final normal-motion walkthroughs | PASS at 1440/1024/768/390/320px; explicit no-preference, no page errors, no document overflow, measured CLS 0 in the captured workflows |
| Reduced-motion walkthrough | PASS at 390px; reduction true, no spatial effects, controls remain functional |
| Git whitespace/source boundaries | Checked; backend/contracts/infrastructure unchanged |

The earlier UI audit ran on the Phase 3 UI branch: 11 frontend unit tests and 12 integration tests. Phase 4 adds four recurrence/time unit tests and the schedule integration suite, giving 15 and 25. The Phase 4 report's earlier 16-browser count predates two origin regression tests; the committed baseline has 18. This pass adds nine motion/persistence regressions and carries over four UI browser regressions, giving 31. Every existing test file is retained.

A single Impeccable detector pass returned two warnings: Arial in the pre-existing Google letter mark, and the existing calendar's colored status border. Both were reviewed as intentional incumbent details; body typography remains Manrope and the border retains availability meaning. The scan is not represented as warning-free or as proof of visual quality.

## Recordings and visual evidence

Local artifact directory: `D:/Project/Wangmai-motion-1793223519424`.

- `recordings.html`: browser-playable gallery with before and final videos.
- `normal-1440.webm`, `normal-1024.webm`, `normal-768.webm`, `normal-390.webm`, `normal-320.webm`: final combined UI/motion walkthroughs.
- `reduced-390.webm`: accessible reduced-motion counterpart.
- `scroll-reveal.webm`: below-fold scroll trigger.
- `login-pending-error-simulation.webm`: deliberately controlled request failure, not live Google acceptance.
- `server-confirmed-schedule.webm`, `persistent-crud.webm`: successful real API/PostgreSQL recordings using isolated automated test accounts, not fabricated live Google acceptance.
- `motion-evidence.json`, `additional-evidence.json`, `baseline.json`: measured browser timelines/preferences, layout observations and baseline audit.

Temporal frames extracted from the recordings were visually inspected alongside actual animation timelines. The recordings demonstrate the complete transitions; screenshots alone are not used as motion evidence. Earlier pre-integration recordings are kept separately. Original approved reference image files were unavailable; the starting repository UI and the explicitly requested `ui/improvement` work were the visual authority.

## Manual review and remaining limits

Visit `http://localhost:3000` while the development process runs from this worktree. Refresh Landing, hover/press its CTA, enter the public preview, add/edit/delete a temporary preview block, drag a range, navigate a week, filter Unknown, toggle sharing in preview settings, and show/hide mobile navigation. Confirm the preview-only notices. For a real account, sign in manually; create/edit/delete a temporary saved entry and verify refresh persistence. Automated fixtures already exercise real persistence and logout/new-session behavior.

Native live-session visual review is NOT TESTED in this pass: the Windows desktop was locked at the final handoff, so computer-use actions stopped and the user was asked to unlock it. No live-account schedule rows were created or deleted by the agent. Physical iOS/Android, Safari/Firefox and a production FPS/performance benchmark were not run. Mouse drag, keyboard and responsive layouts are covered; touch continues using tap-to-edit and scrolling. Availability remains a demo and no Phase 5 backend was introduced.

## Files created or modified

- `frontend/docs/ui-refinement-audit.md`
- `frontend/src/app/(core)/error.tsx`
- `frontend/src/app/(core)/loading.tsx`
- `frontend/src/app/error.tsx`
- `frontend/src/app/globals.css`
- `frontend/src/app/login/page.tsx`
- `frontend/src/app/motion.css`
- `frontend/src/app/not-found.tsx`
- `frontend/src/app/page.tsx`
- `frontend/src/components/layout/application-shell.tsx`
- `frontend/src/components/layout/site-footer.tsx`
- `frontend/src/components/layout/site-header.tsx`
- `frontend/src/components/layout/workspace-navigation.tsx`
- `frontend/src/components/marketing/availability-preview.tsx`
- `frontend/src/components/marketing/public-pages.module.css`
- `frontend/src/components/shared/brand.tsx`
- `frontend/src/components/shared/busy-indicator.tsx`
- `frontend/src/components/shared/page-recovery.tsx`
- `frontend/src/components/shared/policy-links.tsx`
- `frontend/src/components/shared/scroll-reveal.tsx`
- `frontend/src/components/shared/section-heading.tsx`
- `frontend/src/components/shared/workspace-loading.tsx`
- `frontend/src/components/ui/button.tsx`
- `frontend/src/components/ui/modal.tsx`
- `frontend/src/features/auth/auth-boundary.tsx`
- `frontend/src/features/auth/login-actions.tsx`
- `frontend/src/features/auth/logout-button.tsx`
- `frontend/src/features/core/availability-page.tsx`
- `frontend/src/features/core/availability.ts`
- `frontend/src/features/core/block-editor.tsx`
- `frontend/src/features/core/block-labels.ts`
- `frontend/src/features/core/core-ui.tsx`
- `frontend/src/features/core/core.module.css`
- `frontend/src/features/core/schedule-page.tsx`
- `frontend/src/features/core/settings-page.tsx`
- `frontend/src/features/core/workspace.tsx`
- `frontend/src/lib/motion.ts`
- `frontend/tests/e2e/auth.spec.ts`
- `frontend/tests/e2e/core.spec.ts`
- `frontend/tests/e2e/design.spec.ts`
- `frontend/tests/e2e/motion.spec.ts`
- `frontend/tests/e2e/schedule.spec.ts`
- `docs/motion-pass.md`

No commit, push, deployment or Phase 5 work was performed. The combined source remains uncommitted for review.
