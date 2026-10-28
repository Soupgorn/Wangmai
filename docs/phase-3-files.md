# Phase 3 file inventory

Paths are relative to the repository root. Created/modified status is relative to initial
HEAD `d72fd7f`; this branch initially lacked the completed Phase 2 frontend.
Recovered baseline is `feat/core-user-pages` at `87ae567`. No files were staged.

## Phase 3 additions and edits

| File | Working-tree status | Baseline comparison |
| --- | --- | --- |
| [backend/Dockerfile](../backend/Dockerfile) | Modified | Edited for Phase 3 |
| [backend/drizzle/0000_majestic_albert_cleary.sql](../backend/drizzle/0000_majestic_albert_cleary.sql) | Created | Added in Phase 3 |
| [backend/drizzle.config.ts](../backend/drizzle.config.ts) | Created | Added in Phase 3 |
| [backend/drizzle/meta/0000_snapshot.json](../backend/drizzle/meta/0000_snapshot.json) | Created | Added in Phase 3 |
| [backend/drizzle/meta/_journal.json](../backend/drizzle/meta/_journal.json) | Created | Added in Phase 3 |
| [backend/package.json](../backend/package.json) | Modified | Edited for Phase 3 |
| [backend/src/app.ts](../backend/src/app.ts) | Modified | Edited for Phase 3 |
| [backend/src/auth/auth.ts](../backend/src/auth/auth.ts) | Created | Added in Phase 3 |
| [backend/src/auth/README.md](../backend/src/auth/README.md) | Modified | Edited for Phase 3 |
| [backend/src/config/env.ts](../backend/src/config/env.ts) | Modified | Edited for Phase 3 |
| [backend/src/db/check.ts](../backend/src/db/check.ts) | Created | Added in Phase 3 |
| [backend/src/db/client.ts](../backend/src/db/client.ts) | Created | Added in Phase 3 |
| [backend/src/db/migrate.ts](../backend/src/db/migrate.ts) | Created | Added in Phase 3 |
| [backend/src/db/README.md](../backend/src/db/README.md) | Modified | Edited for Phase 3 |
| [backend/src/db/schema.ts](../backend/src/db/schema.ts) | Created | Added in Phase 3 |
| [backend/src/index.ts](../backend/src/index.ts) | Modified | Edited for Phase 3 |
| [backend/tests/auth.integration.test.ts](../backend/tests/auth.integration.test.ts) | Created | Added in Phase 3 |
| [backend/tests/helpers.ts](../backend/tests/helpers.ts) | Created | Added in Phase 3 |
| [backend/tests/unit.test.ts](../backend/tests/unit.test.ts) | Created | Added in Phase 3 |
| [backend/tsconfig.tests.json](../backend/tsconfig.tests.json) | Created | Added in Phase 3 |
| [compose.yaml](../compose.yaml) | Modified | Edited for Phase 3 |
| [docs/phase-3-files.md](../docs/phase-3-files.md) | Created | Added in Phase 3 |
| [docs/phase-3.md](../docs/phase-3.md) | Created | Added in Phase 3 |
| [.env.example](../.env.example) | Modified | Edited for Phase 3 |
| [frontend/eslint.config.mjs](../frontend/eslint.config.mjs) | Modified | Edited for Phase 3 |
| [frontend/next.config.ts](../frontend/next.config.ts) | Modified | Edited for Phase 3 |
| [frontend/package.json](../frontend/package.json) | Modified | Edited for Phase 3 |
| [frontend/playwright.config.ts](../frontend/playwright.config.ts) | Created | Edited for Phase 3 |
| [frontend/src/app/(core)/error.tsx](../frontend/src/app/(core)/error.tsx) | Created | Added in Phase 3 |
| [frontend/src/app/(core)/layout.tsx](../frontend/src/app/(core)/layout.tsx) | Created | Edited for Phase 3 |
| [frontend/src/app/(core)/loading.tsx](../frontend/src/app/(core)/loading.tsx) | Created | Added in Phase 3 |
| [frontend/src/app/error.tsx](../frontend/src/app/error.tsx) | Created | Added in Phase 3 |
| [frontend/src/app/login/page.tsx](../frontend/src/app/login/page.tsx) | Created | Edited for Phase 3 |
| [frontend/src/app/preview/availability/page.tsx](../frontend/src/app/preview/availability/page.tsx) | Created | Added in Phase 3 |
| [frontend/src/app/preview/layout.tsx](../frontend/src/app/preview/layout.tsx) | Created | Added in Phase 3 |
| [frontend/src/app/preview/schedule/page.tsx](../frontend/src/app/preview/schedule/page.tsx) | Created | Added in Phase 3 |
| [frontend/src/app/preview/settings/page.tsx](../frontend/src/app/preview/settings/page.tsx) | Created | Added in Phase 3 |
| [frontend/src/components/layout/application-shell.tsx](../frontend/src/components/layout/application-shell.tsx) | Created | Edited for Phase 3 |
| [frontend/src/components/layout/workspace-shells.tsx](../frontend/src/components/layout/workspace-shells.tsx) | Created | Edited for Phase 3 |
| [frontend/src/features/auth/auth-boundary.tsx](../frontend/src/features/auth/auth-boundary.tsx) | Created | Added in Phase 3 |
| [frontend/src/features/auth/login-actions.tsx](../frontend/src/features/auth/login-actions.tsx) | Created | Added in Phase 3 |
| [frontend/src/features/auth/logout-button.tsx](../frontend/src/features/auth/logout-button.tsx) | Created | Added in Phase 3 |
| [frontend/src/features/core/settings-page.tsx](../frontend/src/features/core/settings-page.tsx) | Created | Edited for Phase 3 |
| [frontend/src/features/core/workspace.tsx](../frontend/src/features/core/workspace.tsx) | Created | Edited for Phase 3 |
| [frontend/src/lib/auth-client.ts](../frontend/src/lib/auth-client.ts) | Created | Added in Phase 3 |
| [frontend/src/lib/session.ts](../frontend/src/lib/session.ts) | Created | Added in Phase 3 |
| [frontend/tests/e2e/auth.spec.ts](../frontend/tests/e2e/auth.spec.ts) | Created | Added in Phase 3 |
| [frontend/tests/e2e/core.spec.ts](../frontend/tests/e2e/core.spec.ts) | Created | Edited for Phase 3 |
| [.gitignore](../.gitignore) | Modified | Edited for Phase 3 |
| [package.json](../package.json) | Modified | Edited for Phase 3 |
| [package-lock.json](../package-lock.json) | Modified | Edited for Phase 3 |
| [packages/shared/src/index.ts](../packages/shared/src/index.ts) | Modified | Edited for Phase 3 |
| [README.md](../README.md) | Modified | Edited for Phase 3 |

## Recovered Phase 2 files with unchanged content

| File | Working-tree status | Baseline comparison |
| --- | --- | --- |
| [frontend/docs/core-mvp.md](../frontend/docs/core-mvp.md) | Created | Phase 2 content unchanged |
| [frontend/docs/design-system.md](../frontend/docs/design-system.md) | Created | Phase 2 content unchanged |
| [frontend/docs/phase-2a-verification.md](../frontend/docs/phase-2a-verification.md) | Created | Phase 2 content unchanged |
| [frontend/docs/phase-2b-verification.md](../frontend/docs/phase-2b-verification.md) | Created | Phase 2 content unchanged |
| [frontend/public/favicon.svg](../frontend/public/favicon.svg) | Created | Phase 2 content unchanged |
| [frontend/src/app/(core)/availability/page.tsx](../frontend/src/app/(core)/availability/page.tsx) | Created | Phase 2 content unchanged |
| [frontend/src/app/(core)/schedule/page.tsx](../frontend/src/app/(core)/schedule/page.tsx) | Created | Phase 2 content unchanged |
| [frontend/src/app/(core)/settings/page.tsx](../frontend/src/app/(core)/settings/page.tsx) | Created | Phase 2 content unchanged |
| [frontend/src/app/globals.css](../frontend/src/app/globals.css) | Modified | Phase 2 content unchanged |
| [frontend/src/app/layout.tsx](../frontend/src/app/layout.tsx) | Modified | Phase 2 content unchanged |
| [frontend/src/app/page.tsx](../frontend/src/app/page.tsx) | Modified | Phase 2 content unchanged |
| [frontend/src/assets/fonts/Manrope-OFL.txt](../frontend/src/assets/fonts/Manrope-OFL.txt) | Created | Phase 2 content unchanged |
| [frontend/src/assets/fonts/manrope-variable.ttf](../frontend/src/assets/fonts/manrope-variable.ttf) | Created | Phase 2 content unchanged |
| [frontend/src/assets/fonts/NotoSansThai-OFL.txt](../frontend/src/assets/fonts/NotoSansThai-OFL.txt) | Created | Phase 2 content unchanged |
| [frontend/src/assets/fonts/noto-sans-thai-variable.ttf](../frontend/src/assets/fonts/noto-sans-thai-variable.ttf) | Created | Phase 2 content unchanged |
| [frontend/src/components/layout/page-container.tsx](../frontend/src/components/layout/page-container.tsx) | Created | Phase 2 content unchanged |
| [frontend/src/components/layout/site-footer.tsx](../frontend/src/components/layout/site-footer.tsx) | Created | Phase 2 content unchanged |
| [frontend/src/components/layout/site-header.tsx](../frontend/src/components/layout/site-header.tsx) | Created | Phase 2 content unchanged |
| [frontend/src/components/marketing/availability-preview.tsx](../frontend/src/components/marketing/availability-preview.tsx) | Created | Phase 2 content unchanged |
| [frontend/src/components/marketing/public-pages.module.css](../frontend/src/components/marketing/public-pages.module.css) | Created | Phase 2 content unchanged |
| [frontend/src/components/shared/brand.tsx](../frontend/src/components/shared/brand.tsx) | Created | Phase 2 content unchanged |
| [frontend/src/components/shared/policy-links.tsx](../frontend/src/components/shared/policy-links.tsx) | Created | Phase 2 content unchanged |
| [frontend/src/components/shared/section-heading.tsx](../frontend/src/components/shared/section-heading.tsx) | Created | Phase 2 content unchanged |
| [frontend/src/components/shared/user-avatar.tsx](../frontend/src/components/shared/user-avatar.tsx) | Created | Phase 2 content unchanged |
| [frontend/src/components/ui/button.tsx](../frontend/src/components/ui/button.tsx) | Created | Phase 2 content unchanged |
| [frontend/src/components/ui/card.tsx](../frontend/src/components/ui/card.tsx) | Created | Phase 2 content unchanged |
| [frontend/src/components/ui/modal.tsx](../frontend/src/components/ui/modal.tsx) | Created | Phase 2 content unchanged |
| [frontend/src/features/core/availability-page.tsx](../frontend/src/features/core/availability-page.tsx) | Created | Phase 2 content unchanged |
| [frontend/src/features/core/availability.ts](../frontend/src/features/core/availability.ts) | Created | Phase 2 content unchanged |
| [frontend/src/features/core/block-editor.tsx](../frontend/src/features/core/block-editor.tsx) | Created | Phase 2 content unchanged |
| [frontend/src/features/core/calendar-layout.ts](../frontend/src/features/core/calendar-layout.ts) | Created | Phase 2 content unchanged |
| [frontend/src/features/core/core.module.css](../frontend/src/features/core/core.module.css) | Created | Phase 2 content unchanged |
| [frontend/src/features/core/core-provider.tsx](../frontend/src/features/core/core-provider.tsx) | Created | Phase 2 content unchanged |
| [frontend/src/features/core/core-ui.tsx](../frontend/src/features/core/core-ui.tsx) | Created | Phase 2 content unchanged |
| [frontend/src/features/core/mock-data.ts](../frontend/src/features/core/mock-data.ts) | Created | Phase 2 content unchanged |
| [frontend/src/features/core/mock-repository.ts](../frontend/src/features/core/mock-repository.ts) | Created | Phase 2 content unchanged |
| [frontend/src/features/core/schedule-page.tsx](../frontend/src/features/core/schedule-page.tsx) | Created | Phase 2 content unchanged |
| [frontend/src/features/core/__tests__/availability.test.ts](../frontend/src/features/core/__tests__/availability.test.ts) | Created | Phase 2 content unchanged |
| [frontend/src/features/core/time.ts](../frontend/src/features/core/time.ts) | Created | Phase 2 content unchanged |
| [frontend/src/features/core/types.ts](../frontend/src/features/core/types.ts) | Created | Phase 2 content unchanged |
| [frontend/src/features/README.md](../frontend/src/features/README.md) | Modified | Phase 2 content unchanged |

## Ignored local files and generated output

The root `.env` was updated only to generate a real local auth signing secret and clear
placeholder Google credentials. Existing database credentials were preserved.
It is ignored and must never be published. Build/test output is ignored.
`frontend/next-env.d.ts` was restored to its initial content after verification.
Caddy, `compose.dev.yaml`, CI configuration and Git history were not changed.
