# Wangmai UI refinement audit

Branch: `ui/improvement`. Baseline: `0274d286eac95b4dd24d647f95ac94950c050ae9`.

## Scope and data truth

This is a refinement of the existing lime, forest, chalk, rounded-card identity. Manrope and Noto Sans Thai remain self-hosted. No dependency, backend, database schema, OAuth configuration, routing infrastructure, or deployment changes were made.

The user explicitly approved continuing on this branch after inspection showed Phase 4 schedule persistence is absent here. Better Auth and Google account information are real; schedules, availability results, and editable preferences remain fictional in-memory previews. They reset on refresh and do not write to PostgreSQL. The authenticated account is separate from the editable preview profile. Existing preview logic, recurrence, privacy states, drag-to-create and keyboard editing are retained.

Existing uncommitted work was snapshotted outside the repository before editing. The original `.env` was hash-compared with that snapshot and is unchanged. Generated `next-env.d.ts` is restored from the snapshot after checks.

## Direction and audit

The incumbent public composition remains a left-aligned headline and shared-time illustration; Login retains its pale introduction panel and sign-in form. Workspace pages retain their sidebar, calendar, filters, and settings sections. Shared fixes come before local adjustments. The intentional changes are larger supporting text and controls, readable mobile previews, compact demo disclosure, and restrained control feedback.

| Priority | Finding | Resolution |
| --- | --- | --- |
| P1 Major | Mock workspace content had no visible disclosure after existing local edits | Compact disclosure distinguishes demo schedules/preferences from the real Google account |
| P1 Major | Session and workspace loading rendered blank | Static, screen-reader-announced skeletons; no account data shown before validation |
| P2 Minor | Preview breadcrumb navigated into the authenticated workspace | Breadcrumb keeps `/preview` navigation within the demo |
| P2 Minor | Supporting copy and actions often used 9–11px type and small targets | Increased shared supporting scale and primary control targets; input borders/focus contrast improved |
| P2 Minor | Navigation wrapped to uneven rows at 320px | Three equal navigation columns, stacked icon/label below 360px |
| P2 Minor | Native time fields became cramped in narrow tablet panels | Container query stacks time inputs when the panel is narrow |
| P2 Minor | Error/404 screens did not match the product or offer clear recovery | Shared recovery presentation and branded 404 with useful navigation |
| P3 Polish | Feedback and numeric presentation varied | Shared 180ms feedback, tabular calendar numerals, local block feedback, reduced-motion alternatives |

Provisional technical score for the public/preview surfaces: accessibility 3/4, performance 3/4, theming 3/4, responsiveness 3/4, implementation integrity 3/4: **15/20**. This is a scoped design assessment, not a WCAG certification, performance benchmark, or authenticated/live OAuth acceptance result.

## Page checklist

All public and preview pages were rendered in Chromium before changes and Microsoft Edge after changes at 1440, 1024, 768, 390, and 320 CSS pixels. The three authenticated routes were also visually inspected at all five widths in the user-signed-in native Edge browser. Full-page public/preview captures and overflow metrics are saved outside the repository. Native authenticated screenshots are in the tool conversation. Edge responsive emulation uses touch input mode; native date controls therefore replace the compact pointer-oriented month grid at all emulated widths.

| Route | Review and refinement |
| --- | --- |
| `/` | Preserve hero/features; improve supporting copy scale, shared actions, footer targets, and mobile preview readability |
| `/login` | Preserve split composition; refine Google action, reserved status area, callback errors, legal dialogs, and preview explanation |
| `/preview/schedule` | Preserve calendar editing/recurrence; refine toolbar, paired navigation arrows, date field, keyboard feedback and preview status |
| `/preview/availability` | Preserve immediate filtering and available/busy/unknown meanings; readable status cards, touch-appropriate native date input, responsive time fields |
| `/preview/settings` | Preserve in-memory profile/privacy/timezone; clearer preview scope, field hierarchy, 44px switch hit area and save status |
| `/schedule` | Shared schedule refinements applied. Automated authenticated rendering passes using existing isolated test fixtures. Native live-session visual inspection completed in the user-signed-in Edge browser at all five widths |
| `/availability` | Shared availability refinements applied. Protected-route enforcement passes. Native live-session visual inspection completed in the user-signed-in Edge browser at all five widths |
| `/settings` | Real account and preview preferences remain separate. Automated profile/session/logout/recovery passes. Native live-session visual inspection completed in the user-signed-in Edge browser at all five widths |
| Unknown path / 404 | Branded recovery page, working home/preview links, genuine 404 response, five-width screenshots |
| Error/loading boundaries | Shared recovery and static skeletons; session error recovery covered by existing browser tests; no deliberate live backend outage induced |

## Shared system, motion and accessibility

- Brand colors and established 8px control, 12px card, 20px preview radii remain.
- Body/supporting tokens are 15/13/12px; local dense calendar text remains compact and retains full accessible names.
- Primary/default/icon controls have at least 44px targets; large actions are 48px. Calendar half-hour slots remain 32px, and the pointer-oriented month grid stays compact. Phones/coarse pointers use native date controls instead.
- Inputs gain a darker semantic border, 16px mobile text, a visible focus ring, and a distinct read-only surface.
- Navigation has clear current-page state, keyboard focus, consistent icons and continuous demo routing.
- Fields retain labels; validation alerts describe the form; forms/actions expose busy state. Broken `aria-labelledby` on the profile section is replaced with a valid accessible name.
- Dialog focus trapping, Escape and return focus remain intact. Small viewport dialogs scroll within their bounds.
- Feedback uses 180ms color/border/shadow transitions. The only added animation is a short user-triggered editor backdrop dim. Reduced motion removes animation and switch travel while retaining short color changes.
- No floating effects, page entrance sequences, new icon set, animation library or nonfunctional actions were added.

## Verification

| Check | Result |
| --- | --- |
| `npm run test` | PASS: 4 backend unit tests, 11 frontend unit tests |
| `npm run test:integration` | PASS: 12 database/auth integration tests |
| `npm run db:check` | PASS: PostgreSQL connection OK |
| `npm run typecheck` | PASS after final UI changes |
| `npm run lint` | PASS after final UI changes |
| `npm run build` with `NEXT_DIST_DIR=.next-build` | PASS: shared/frontend/backend; isolated build output preserves the running dev server |
| Existing browser suite plus 3 design regressions, Microsoft Edge | PASS: 16 tests, using an external temporary Playwright config selecting the installed Edge executable |
| Layout matrix | PASS: no document-level horizontal overflow across 30 final Edge captures; public/preview routes 200 and unknown path 404 |
| Runtime errors | No uncaught page errors on inspected public/preview routes; console resource errors limited to deliberate 404 requests |
| Rendered text contrast | Sampled visible text across five public/preview routes at 390px: no failures below applicable 4.5:1 / 3:1 thresholds; not a complete accessibility certification |
| Keyboard | Browser tests cover slot navigation, editor entry, validation, trapping, Escape and focus restoration |
| Synthesized touch, Microsoft Edge | Tap opened the correct 18:00 slot; swipe moved calendar scrollTop 918 to 961 without opening an accidental editor |
| Preview isolation/privacy | Existing tests confirm no API mutations from preview, reset on refresh, private titles hidden, and sharing off produces unknown |
| OAuth/session regression | Integration and fixture-based browser checks pass. User completed Google sign-in in normal Edge; the agent observed the resulting legitimate account/session across authenticated pages and repeated page loads. The complete authorization handshake and live logout were not repeated |

The first Chromium run had 15 passes and one newly added test sampled an intermediate reduced-motion color transition. The assertion now polls for the settled state. Subsequent Edge runs passed all 16 tests. No app behavior was changed to satisfy the timing assertion.

Impeccable 4.7.0 was used with frontend-design and the audit/polish/adapt/animate playbooks. The requested 4.8.0 update was deferred. The single manual detector pass returned two warnings: Arial in the existing one-letter Google mark, and the existing 3px semantic schedule-event border. Both were reviewed and retained as narrow intentional exceptions: body/display type remains Manrope, and the calendar strip is an established status cue. Detector exit 2 is not reported as a clean scan.

## Evidence and limitations

Local evidence directory: `D:/Project/Wangmai-audit-1793221491526`. `gallery.html` compares every before/final pair. Original captures use Chromium; final captures use installed Microsoft Edge. Raw metrics, contrast results, synthesized-touch results, detector output and browser test artifacts are local-only and are not committed.

The supplied conversation had no original approval screenshot attachments, and the reference images named by the historical design notes were not found. Comparison was against the current rendered baseline and repository visual contract, not unseen reference screenshots. Intentional composition differences are the single-column phone preview and roomier controls/type. Native date/time appearance varies by browser.

No physical iOS/Android, Safari/Firefox, screen-reader or production performance run was performed. Touch drag-to-select remains mouse-oriented as in the baseline; touch users can tap slots or use Add time while swiping scrolls. No schedule persistence or multi-user backend acceptance can be claimed for this branch. Published legal policies remain unavailable; the existing notices now say so honestly.

Native Edge session inspection is complete. After the user selected the active Wangmai tab, computer-use access succeeded. The authenticated Schedule, Availability and Settings screens were inspected at 1440, 1024, 768, 390 and 320px using Edge responsive emulation. The real Google profile and separate demo preferences were observed, the mobile editor was opened without saving, and the Unknown filter was exercised and restored. Navigation and repeated page loads retained the legitimate session. DevTools was closed, the original window size restored, and Edge was left signed in on `/schedule`. Native screenshots appear in the tool conversation; their image payloads were not copied into the repository. The complete Google authorization handshake and live logout were not repeated or claimed; fixture-based tests cover logout and protection. Never treat those test fixtures as live Google authorization evidence.

## Files in this pass

Existing edited files refined further:

- `frontend/src/app/(core)/loading.tsx`
- `frontend/src/components/layout/application-shell.tsx`
- `frontend/src/components/layout/site-footer.tsx`
- `frontend/src/components/layout/site-header.tsx`
- `frontend/src/features/auth/auth-boundary.tsx`
- `frontend/src/features/auth/login-actions.tsx`
- `frontend/src/features/core/availability-page.tsx`
- `frontend/src/features/core/block-editor.tsx`
- `frontend/src/features/core/core.module.css`
- `frontend/src/features/core/schedule-page.tsx`
- `frontend/src/features/core/settings-page.tsx`
- `frontend/src/features/core/workspace.tsx`

Files added or modified from the previously clean baseline:

- `frontend/src/app/(core)/error.tsx`
- `frontend/src/app/error.tsx`
- `frontend/src/app/globals.css`
- `frontend/src/app/login/page.tsx`
- `frontend/src/app/not-found.tsx`
- `frontend/src/components/marketing/availability-preview.tsx`
- `frontend/src/components/marketing/public-pages.module.css`
- `frontend/src/components/shared/page-recovery.tsx`
- `frontend/src/components/shared/policy-links.tsx`
- `frontend/src/components/shared/section-heading.tsx`
- `frontend/src/components/shared/workspace-loading.tsx`
- `frontend/src/components/ui/button.tsx`
- `frontend/src/components/ui/modal.tsx`
- `frontend/tests/e2e/design.spec.ts`
- `frontend/docs/ui-refinement-audit.md`

Pre-existing edits left byte-for-byte unchanged:

- `frontend/src/components/shared/brand.tsx`
- `frontend/src/features/auth/logout-button.tsx`
- `frontend/src/features/core/availability.ts`
- `frontend/src/features/core/block-labels.ts`
- `frontend/src/features/core/core-ui.tsx`
- `frontend/tests/e2e/auth.spec.ts`
- `frontend/tests/e2e/core.spec.ts`

No commit, push, merge, deployment, or Phase 5 work was performed.
