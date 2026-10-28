# Wangmai Core MVP design system

## Visual contract

Use the approved lime-green consumer UI. Landing follows `wangmai-lime-ui/wangmai-landing.png`. Login preserves the approved Phase 2A pale panel and compact availability card. Schedule, finder and Settings follow the corresponding `wangmai-lime-ui` references, with excluded features removed. No Admin shell or Dashboard is included.

### Compact plan

| Token | Value | Role |
| --- | --- | --- |
| Fresh lime | `#8BC34A` | Primary actions, selected items, availability |
| Chalk | `#F7F9F3` | Page background |
| White | `#FFFFFF` | Cards and content surfaces |
| Forest | `#26382E` | Main text and icons |
| Apricot | `#EDB88B` | Important events / future attention states |
| Mist blue | `#9AB7C6` | Personal events / secondary accents |

Typography is self-hosted variable Manrope, with Noto Sans Thai for Thai text. The display scale follows the references: 58px landing headline, 41px login introduction, and 29px login form title at desktop reference width. Supporting text is kept legible on small screens. Spacing follows a 4px base, 8px controls, 12px cards, and a 20px preview backdrop. Borders and shadows are quiet, forest-tinted values. Focus rings use a darker forest tone, separate from the bright action fill.

```
Landing: brand / links / CTA
         headline + CTA       | availability preview
         three existing feature explanations
         brand / tagline / legal links

Login:   brand                | welcome
         short introduction   | disabled Google action
         shared-time preview  | legal + privacy copy
```

Content is left-aligned; only short preview captions and legal copy are centered. Mobile stacks the hero and preview, and reflows the feature explanations. Login uses a compact brand header, the sign-in action, then its supporting product introduction so the primary action is easy to reach.

### Review before implementation

Retain the bilingual wordmark, actual reference copy, availability cards, and the exact lime primary. Do not add generic metric tiles, gradients, decorative circles, extra marketing sections, or application dashboards. Use one reusable preview with two compositions, rather than duplicate sample data. Keep both pages server-rendered; interactive legal notices and the existing development API checker are small client boundaries.

## Token ownership

`src/app/globals.css` owns brand, semantic/shadcn, spacing, type, radii, shadow and interaction tokens. Tailwind v4 `@theme inline` maps the semantic variables to utilities. Change `--brand-*` to retheme the application. Component tokens (`--auth-panel`, `--preview-surface`, `--button-background`, `--sidebar`) can override individual surfaces without changing the base palette. Light mode is the approved scope; no unapproved dark palette is introduced.

## Reuse and scope

- Public layout: `SiteHeader`, `SiteFooter`, `PageContainer`, `Brand`, `PolicyLinks`.
- UI primitives: `Button` / `buttonVariants`, `Card` and subcomponents, `UserAvatar`, `SectionHeading`; the existing shadcn `Badge` remains compatible.
- Product illustration: `AvailabilityPreview`, with clearly illustrative fixture data and no schedule functionality.
- Workspace layout: `ApplicationShell`, `UserShell`, `ApplicationHeader`, `SidebarNavigation`. These present the preview profile and three core navigation links. They create no authentication session or authorization boundary.
- Core primitives: accessible `Modal`, `Field`, `DatePicker` and `StatusTag`. Feature layout styles live in `features/core/core.module.css` and reuse the same tokens.

Public CTA links go to `/login`, brand links go home, and “Why Wangmai?” goes to the existing feature section. The explicit preview link opens `/schedule`; the workspace also includes `/availability` and `/settings`. Terms and privacy controls explain that final policies are not yet published.

Google sign-in is disabled with an honest explanation that integration is planned. No sessions are created. A separate interactive preview entry never implies successful sign-in. The existing development API checker, same-origin API client and Next.js health proxy remain unchanged. Production has no developer status chrome.

## Phase 2B boundaries

My Schedule, Who’s Free? and Settings use fictional in-memory data, with loading, empty, editing and error states. Available is lime, busy is apricot, and unknown is neutral. Mobile defaults to a day calendar; the full week remains available with scrolling inside its card. Real Google OAuth, account data, Hono business APIs and database integration remain future work. No excluded feature has navigation or placeholder controls.
