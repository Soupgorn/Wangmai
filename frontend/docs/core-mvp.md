# Phase 2B Core MVP frontend

## Data boundary

`features/core/types.ts` defines `CoreRepository`. `CoreProvider` owns one adapter
instance for the mounted `(core)` layout. `MockCoreRepository` returns cloned
snapshots, validates changes and permits mutations only for the preview owner.
Navigation between the three core routes keeps that instance. Reloading or leaving
the preview discards it. There are no storage writes, auth cookies or API mutations.

Future Hono integration should implement this interface, validate API responses and
enforce ownership and privacy on the server. Client checks provide no authorization.
Fictional block data being private in this preview's UI is not a security boundary.

## Calendar and matching rules

- Weeks start Monday. Weekly blocks repeat on their selected weekday; date blocks
  apply once. Editing or deleting a weekly block changes every occurrence.
- A block has a title, available/busy state, local start/end time and recurrence.
  End must be later than start on the same day. Split overnight periods by date.
- Half-open intervals mean an event ending at 15:00 does not overlap a query starting
  at 15:00. Any busy overlap takes precedence over availability.
- Adjacent available blocks may jointly cover a query. A gap, partial coverage,
  no blocks or disabled sharing produces unknown, never an assumption of free time.
- The finder displays other people’s counts and the preview user's shared status
  separately. It exposes no event titles. Inputs recalculate results immediately.
- Temporal converts each person's IANA timezone before comparing instants. Invalid
  or ambiguous daylight-saving selections are rejected. Ambiguous recurring times
  produce unknown conservatively. Changing the profile timezone preserves the
  preview owner's wall-clock block times; this behavior needs confirmation before
  designing the real database model.

## Accessibility and responsiveness

Desktop defaults to a full week; small screens default to a day. Both modes allow
date navigation and an explicit view switch. Calendar slots support mouse dragging,
touch tapping and arrow-key navigation; Enter opens the editor. Radix Dialog traps
focus and restores it on close, including deletion fallback. Availability uses text
and icons as well as color. Invalid inputs show errors and hide stale results.

## Verification commands

From the repository root:

```sh
npm run typecheck
npm run lint
npm run build
npm run test:unit --workspace=@wangmai/frontend
npm exec --workspace=@wangmai/frontend -- playwright install --only-shell chromium
npm run test:e2e --workspace=@wangmai/frontend
```

Browser tests exercise CRUD, recurrence, validation, keyboard/focus behavior,
dragging, instant counts, timezone/sharing settings, preview reset and logout,
320–1440px layouts, excluded route absence and the real `/api/health` proxy.
The development servers must use ports 3000/4000 for the health check.

## Scope

Five pages only: Landing, Login, My Schedule, Who’s Free? and Settings. Google login
is planned and disabled; preview entry is explicit. No Dashboard, Admin, Google
Calendar, feature flags, reports, analytics, notifications or group planning. The
Phase 1 backend, shared contracts, Docker Compose, Caddy and deployment architecture
are preserved. No real authentication, database integration or backend development
is part of this phase.
