# Busy-only availability

For a Google-linked profile that has explicitly enabled sharing, the selected
interval is **Available** unless one of that person's Busy/unavailable blocks
overlaps it. An empty shared schedule is Available. Busy overlap uses half-open
intervals: a block ending at the query start or starting at its end does not
conflict. Even a partial overlap makes the entire query Unavailable.

Sharing is still off by default. Private and non-Google profiles do not enter the
authenticated finder, and the viewer is excluded. Names/photos and status-only
results remain the public surface for signed-in viewers; emails, event titles,
notes and raw schedules remain private. Turning sharing off removes the profile
on the next query/focus refresh. Query/DB/auth failures remain errors and must
never be converted into Available. Ambiguous recurring Busy occurrences at DST
transitions remain Unknown rather than implying that the person is free.

## Scheduling and existing data

New week/day/editor entries default to Busy and cannot create Available markers
through the UI. Monthly bulk creation offers Busy and Personal Time, both stored
as Busy. Unrecorded time is available only when sharing is enabled.

Existing Available entries are retained, visible to their owner, and ignored by
the finder. Owners can retain/edit an existing legacy marker, explicitly convert
it to Unavailable, or delete it. The API/schema retain the legacy kind for backward
compatibility; legacy weekly-availability endpoints do not declare free time in
the new finder. No automatic conversion, sharing update, deletion, migration or
database reset is part of this change.

Weekly Busy rules apply in the owner's stored IANA timezone. Dated cancellation
removes that occurrence and leaves it available unless another Busy block overlaps.
Replacement Busy entries affect only that date. Historical Available replacements
remove their parent occurrence but do not add a new restriction. Each date of a
multi-day search uses its own same-day interval; overnight searches remain split.
Any Day means at least one Available day; Every Day requires all selected days.
Missing/inconsistent response data is never inferred as Available by the client.

## Validation and rollout

Regression coverage includes shared empty schedules, legacy Available markers,
Busy boundaries, timezone/date changes, recurring exceptions, unsafe DST, distinct
users, sharing off, self-exclusion, API response privacy and a full UI flow from
creating Busy time to another account's finder. Tests use isolated synthetic users.

Both Hono and Next consume the shared classifier, so deploy new reviewed images
for both app services together. Retain existing secrets, DB roles, PostgreSQL
image/volume mapping and rollback artifacts; no migration is required. Keep the
new sharing explanation visible because enabled profiles now share gaps as free.

Use the [Phase 7 deployment runbook](cloudstack-deployment.md). Production ingress
preflight and genuine gateway/header/source/encryption/integrity evidence remain
mandatory. Do not use synthetic test flags, skip the image's guard, or change
unverified values to verified merely to activate this feature.
