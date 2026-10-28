# Phase 2A implementation and verification

Date: 28 October 2026 (Asia/Bangkok). Branch: `feat/frontend-design-foundation`.

## Implemented scope

- Landing (`/`): bilingual branding, reference headline/copy, navigation, login CTAs, illustrative availability card, the three reference feature explanations, and footer.
- Login (`/login`): the **approved refined** design, with a pale introduction panel, shared-time preview, welcome copy, disabled Google action, terms/privacy controls, and privacy reminder.
- Design system: six brand colors; semantic shadcn/Tailwind mappings; component-level colors; spacing, font scale, radii, borders, shadows, hover, disabled, focus and reduced-motion states.
- Reusable public components plus presentation-only User/Admin shells. No private route or admin page was added.
- Self-hosted variable Manrope and Noto Sans Thai, with SIL Open Font License files. No dependency or lockfile changes.

## Files modified

| File | Change |
| --- | --- |
| `README.md` | Current Phase 2A scope, local usage, theme ownership and documentation links |
| `frontend/src/app/globals.css` | Brand/semantic/component tokens, Tailwind mapping, base accessibility states |
| `frontend/src/app/layout.tsx` | Self-hosted fonts, metadata, favicon and skip link |
| `frontend/src/app/page.tsx` | Approved Landing page |

## Files created

| Area | Files |
| --- | --- |
| Login | `frontend/src/app/login/page.tsx` |
| Public layout | `frontend/src/components/layout/page-container.tsx`, `site-header.tsx`, `site-footer.tsx` |
| Future workspace layout | `frontend/src/components/layout/application-shell.tsx`, `workspace-shells.tsx` |
| Shared presentation | `frontend/src/components/shared/brand.tsx`, `user-avatar.tsx`, `section-heading.tsx`, `policy-links.tsx` |
| UI primitives | `frontend/src/components/ui/button.tsx`, `card.tsx` |
| Product preview and page styling | `frontend/src/components/marketing/availability-preview.tsx`, `public-pages.module.css` |
| Fonts | `frontend/src/assets/fonts/manrope-variable.ttf`, `noto-sans-thai-variable.ttf`, `Manrope-OFL.txt`, `NotoSansThai-OFL.txt` |
| Branding | `frontend/public/favicon.svg` |
| Documentation | `frontend/docs/design-system.md`, this report |

`ApiStatus`, the API client, the existing Badge, Next.js proxy configuration, all package manifests, npm Workspaces, the lockfile, backend, shared contracts and infrastructure remain unchanged. Next.js regenerates `next-env.d.ts` when switching between development and build; this generated file is not part of the intended source change.

## Reusable components

`Brand`, `Button` / `buttonVariants`, `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`, `UserAvatar`, `SectionHeading`, `PolicyLinks`, `PageContainer`, `SiteHeader`, `SiteFooter`, `AvailabilityPreview`, `SidebarNavigation`, `ApplicationHeader`, `ApplicationShell`, `UserShell`, `AdminShell`.

Shell components require explicit account props. They do not establish a user identity, enforce permissions, create a session, or mount routes. Future navigation entries are disabled until their pages exist.

## Token summary

| Purpose | Token | Default |
| --- | --- | --- |
| Primary | `--brand-lime` | `#8BC34A` |
| Background | `--brand-chalk` | `#F7F9F3` |
| Surface | `--brand-white` | `#FFFFFF` |
| Text | `--brand-forest` | `#26382E` |
| Important events | `--brand-apricot` | `#EDB88B` |
| Personal events / secondary | `--brand-mist` | `#9AB7C6` |

Override `--button-background`, `--preview-surface`, `--preview-backdrop`, `--auth-panel` or `--sidebar` for component-specific colors. Semantic variables remain compatible with shadcn/ui; future components can use `bg-primary`, `bg-card`, `text-foreground` and related Tailwind utilities. Fonts are locally loaded using `next/font/local`. The favicon is a static brand asset.

## Required checks

Run from the monorepo root after implementation:

| Command | Result |
| --- | --- |
| `npm run typecheck` | Passed across frontend, backend and shared |
| `npm run lint` | Passed across all workspaces with zero warnings |
| `npm run build` | Passed; frontend statically prerenders `/` and `/login`, backend and shared compile |
| `git diff --check` | Passed |

## Browser and regression verification

Verified in headless local Chrome with Playwright from the bundled tool runtime (no test dependency was added to the repository).

- Landing and Login returned HTTP 200 in development and after a production build.
- Checked both pages at 320, 390, 768, 1024 and 1440px. No document-level horizontal overflow. Desktop/mobile screenshots were reviewed against the approved design.
- Header CTA and hero CTA navigate to `/login`. Branding returns home. “Why Wangmai?” navigates to the existing feature section.
- Keyboard skip link reaches the main content. Focus styling is visible.
- Terms and privacy notices open, close with their controls, close with Escape, and restore keyboard focus to the trigger.
- Google button is disabled, its coming-soon explanation is visible, and no artificial session cookies are created.
- Button-styled links have a hover state. Changing `--brand-lime` updates component color without changing component source.
- Direct Hono health and the unchanged development Next.js proxy both return `{"status":"ok","service":"wangmai-api"}`. Existing health badge shows success, handles a browser-intercepted 503, then recovers when the real response is restored.
- Production smoke checks at 1024 and 390px: both routes return HTTP 200, no development health badge, no horizontal overflow, no external font/resource requests.
- No browser runtime errors observed.
- `/dashboard`, `/schedule`, `/availability` and `/admin` remain HTTP 404: Phase 2B pages were not implemented.
- Confirmed no source diff in backend, shared package, Compose, Caddy, root/frontend manifests, root lockfile or Next.js proxy config.

Evidence (screenshots and `verification.json`) is saved outside the Git checkout in the chat workspace at `output/wangmai-phase-2a/`. The production smoke check uses the existing frontend start script; it emits Next.js’s existing warning about standalone output. Container/CloudStack runtime and Caddy routing were not redeployed or retested. Their source and architecture are unchanged.

## Intentional differences from the mockup

1. Login uses the later approved refined pale-panel screenshot, not the earlier saturated green panel from `wangmai-lime-ui/wangmai-signin.png`.
2. The Google button is visibly disabled and has a coming-soon explanation, as required by the Phase 2A brief.
3. On mobile, Login puts the sign-in area ahead of the supporting illustration, keeping the primary task easy to reach. Desktop follows the approved side-by-side layout.
4. Terms/privacy controls open clearly labeled unpublished-policy notices instead of dead links or invented legal documents.
5. The Phase 1 API badge is visible only in the development footer; production follows the reference footer.
6. Mockup framing is not duplicated as browser chrome. Responsive widths, slightly larger small-screen text and a capped content width replace the mockup’s fixed presentation canvas.

No automated pixel-difference score or full accessibility certification is claimed; visual review, keyboard checks and responsive checks were performed.

## Remaining work for Phase 2B

- Implement dashboard, weekly/day schedule, availability finder and settings views under `UserShell`, with editing, loading, empty and error states.
- Implement Admin views separately under `AdminShell` when requested, following the supplied Admin references.
- Enable future navigation entries only as routes become available.
- Supply final privacy/terms copy and replace the temporary notices.
- Real Google authentication, session handling, account data, Hono authorization, database/schema changes and schedule/availability APIs remain future separately scoped tasks.

Phase 2B has not started. No commit, push or deployment was performed.
