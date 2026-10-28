# Phase 2B Core MVP verification

Verified locally on 28 October 2026, branch `feat/core-user-pages`.
No commit, push, merge or deployment was performed.

## Implementation

The starting checkout was the Phase 1 commit. The existing approved Landing, Login,
self-hosted fonts, tokens and reusable public components were carried forward from
the local `feat/frontend-design-foundation` branch without merging or committing.
Schedule, finder and Settings follow the supplied `wangmai-lime-ui` references.

- `/schedule`: weekly/day calendar, weekly and date-specific available/busy blocks,
  validated add/edit/delete, deletion confirmation, overlap lanes, mouse dragging,
  keyboard slot navigation and dialog focus restoration.
- `/availability`: instant date/time filtering, counts, available/busy/unknown states,
  privacy-safe result copy and timezone conversion. No Search button.
- `/settings`: fictional basic profile, display name, timezone, sharing switch and
  leaving the preview. No account is authenticated.
- `/login`: Google OAuth stays disabled and explicitly planned. A separate preview
  link opens My Schedule without pretending that sign-in succeeded.
- Workspace navigation contains only My Schedule, Who’s Free? and Settings. Admin,
  Dashboard and all excluded feature controls are absent.

All changes use an asynchronous repository abstraction over cloned in-memory mock
data. Refreshing or leaving the core layout clears changes. There is no database
integration, auth configuration, storage persistence or business API implementation.

## Executed checks

| Check | Result | Evidence |
| --- | --- | --- |
| `npm run typecheck` | PASS | Frontend, backend and shared; Next route types generated |
| `npm run lint` | PASS | All workspaces, zero lint warnings |
| `npm run build` | PASS | Five frontend routes prerendered; backend and shared compiled |
| Frontend unit suite | PASS | 11 tests: coverage, busy precedence, privacy, exceptions, timezone/DST, recurrence boundaries, overlap layout, CRUD and reset |
| Frontend Playwright suite | PASS | 7 tests; calendar CRUD, recurrence, invalid ranges, drag/keyboard entry, focus, instant filtering, settings, privacy, reset and API proxy |
| Responsive layouts | PASS | All five pages at 320, 390, 768, 1024 and 1440px; no document horizontal overflow |
| Standalone production smoke | PASS | Actual standalone output on temporary loopback port 3100; all five routes HTTP 200 at 390/1440px |
| Production interactions | PASS | Explicit preview entry, add block, finder, settings update and reload reset; no browser/runtime/resource failures |
| Backend health | PASS | `localhost:4000/api/health` returns the expected JSON |
| Frontend health proxy | PASS | `localhost:3000/api/health` returns the same JSON |
| Excluded routes | PASS | Dashboard and seven Admin routes return 404; no navigation/control placeholders |
| Shared workspace | PASS | `npm ls` confirms both apps resolve local `@wangmai/shared@0.1.0` |
| Source preservation | PASS | No diff in backend, shared package, root scripts, workflows, Compose, Caddy or Next proxy configuration |
| `git diff --check` | PASS | No tracked diff whitespace errors |

Screenshot review covered the calendar, finder, Settings and public pages on desktop
and mobile. Browser evidence is ignored under `.next/phase-2b-results/` and
`.next/phase-2b-production/`, relative to `frontend/`. The temporary production process
was stopped; the previously running development servers were left running.

## Files and dependencies

- Core routes: `src/app/(core)/`; preserved public pages: `src/app/page.tsx` and
  `src/app/login/page.tsx`, shared root layout/styles, branding and licensed fonts.
- Feature code: `src/features/core/` holds views, styles, timezone/matching functions,
  calendar layout, editor, provider, contracts, fixtures, adapter and unit tests.
- Reusable UI: public layout/marketing/shared components, core workspace shell,
  `Button`, `Card` and accessible `Modal`. Admin shell/navigation was removed.
- Verification: `playwright.config.ts`, `tests/e2e/core.spec.ts`, frontend test scripts.
- Documentation: root README, feature ownership README, design system, historical
  Phase 2A report clarification and Core MVP implementation notes.
- Runtime dependency added: `@js-temporal/polyfill@0.5.1`.
- Frontend development dependencies added: `@playwright/test@1.64.1`,
  `tsx@4.23.15` (already used by the backend). One root npm lockfile updated.

## Limits and handoff

Phase 2B is complete as a frontend mock preview. Google OAuth, real sessions,
server-enforced privacy, database persistence and Hono business endpoints are future
work. Overnight intervals must be split; timezone changes currently retain local
wall-clock block times. The proposed database/API model must confirm that rule.
Final legal policies are still unpublished, as clearly labeled in the existing notices.

Docker containers, Caddy TLS and CloudStack deployment were not rebuilt or redeployed
in Phase 2B. Their existing source was preserved. Production API routing remains
Caddy-owned; the standalone-only smoke check does not claim to test Caddy or OAuth.
The test runner emits an environment `NO_COLOR`/`FORCE_COLOR` warning; no application
build, TypeScript or lint warning remains.

Stop here. Do not start backend development without a separate request.
