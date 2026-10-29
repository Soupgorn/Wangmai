# Phase 4 restoration into ui/improvement

## Result and Git state

The final source is assembled in `D:/Project/Wangmai` on `ui/improvement`.
The merge is resolved and staged, but intentionally **not committed**. It is ready
for final review and a manual merge commit before a Pull Request can include it.
Neither worktree was deleted. Nothing was pushed or deployed.

The starting worktree was clean on `main`. The relevant refs after fetching were:

- `main` / `origin/main`: `0274d286eac95b4dd24d647f95ac94950c050ae9`
- `ui/improvement` / `origin/ui/improvement`: `3107bd088a044dd2366ccae4ea520fa0093b10e3`
- `feat/schedule-api` / `origin/feat/schedule-api` / `ui/motion-phase4`: `1c54e6f7b0ed1adfda24156d142c7458b4645cca`

`3107bd0` has only the Phase 3 commit `0274d28` as its parent. Despite its commit
message, its tree lacks the Phase 4 schema, migration, routes, repository and tests.
The separate motion worktree contains the combined Phase 4/UI/motion source as
uncommitted work. This was a real code-content integration gap.

## Safety and integration

New local safety references preserve each starting branch:

- `safety/ui-improvement-restore-phase4-1793269707`
- `safety/schedule-api-restore-phase4-1793269707`
- `safety/motion-phase4-restore-phase4-1793269707`

External backup: `D:/Project/Wangmai-integration-safety-1793269707`.
It holds a binary tracked patch, all 43 changed/untracked motion files, SHA-256
manifests, verification scripts/logs, and an index representing the combined source.
Local environment files were hash-checked without exposing their contents.

`git merge --no-commit --no-ff feat/schedule-api` preserved the original Phase 4
commit as `MERGE_HEAD`. Five overlapping files required intentional resolution:

- `frontend/src/features/core/block-editor.tsx`
- `frontend/src/features/core/schedule-page.tsx`
- `frontend/src/features/core/settings-page.tsx`
- `frontend/src/features/core/workspace.tsx`
- `frontend/tests/e2e/auth.spec.ts`

They use the previously combined behavior: saved schedules and occurrence controls,
read-only Google profile plus real timezone preference, explicit preview boundaries,
approved visual refinements, and committed-write motion. The other UI/motion files
were integrated from their verified snapshot. No blanket ours/theirs resolution or
wholesale Phase 4 frontend replacement was used.

Before adding this integration report, the complete staged tree exactly matched
the canonical Phase 4 motion worktree tree: `fd7c6543f04de864d7c694b394ecdc38308de0a7`.
The original 43 motion files and both `.env` files remained byte-for-byte unchanged.

## Restored functionality and data boundaries

- Phase 4 Hono routes, schema, validation, user ownership, revision/idempotency
  handling and transactions match `feat/schedule-api` exactly.
- All original migrations and metadata, shared schedule contracts, package and
  lockfile changes, database repository, recurrence/time logic, and Phase 4 tests
  are restored. The existing `0001` migration was not regenerated or edited.
- Authenticated `/schedule` and schedule timezone settings use PostgreSQL.
  Weekly rules, one-time blocks, dated replacement/cancellation/restoration,
  overlaps, midnight and DST behavior retain the Phase 4 implementation.
- Better Auth and Google provider configuration are unchanged. The original
  localhost canonicalization fix and both `auth-origin.spec.ts` regressions are
  restored exactly.
- `/preview/*` remains in-memory. Authenticated `/availability` remains a clearly
  labelled fictional finder with a separate provider. No Phase 5 API was added.
- Docker, Caddy, credentials and the existing real Google-linked user data were
  not changed. Test fixture users are removed by the existing test teardown.

## Motion preservation

The shared CSS tokens, Web Animations helpers, scroll-reveal observer, navigation
indicator and mobile menu, busy indicators, calendar block effects and editor
presence behavior are preserved. No animation dependency was added.

| Interaction | Preserved implementation |
| --- | --- |
| Hero | 580ms entrance, 80ms stagger |
| Scroll | Once-only 460ms reveal; content available without JavaScript |
| Login | 460ms entrance, genuine request pending/error feedback |
| Calendar drag | Immediate range and label; no animated geometry during dragging |
| Saved blocks | 320ms arrival/update and 160ms deletion after server confirmation |
| Week navigation | New dates and events transition together over 240ms |
| Modal | 240ms open / 160ms close; focus and repeated-submit guards |
| Availability | Latest demo results appear immediately with restrained transitions |
| Settings | Toggle travel and honest pending/confirmed save states |
| Mobile navigation | 240ms collapse/expand; hidden links inert |
| Reduced motion | Spatial effects removed, current content/actions preserved |

The fresh browser suite checks actual motion timelines, pending writes without
false success, all five viewport widths (1440/1024/768/390/320), keyboard/focus,
preview isolation and static/live reduced-motion preferences.
Earlier before/after videos remain in `D:/Project/Wangmai-motion-1793223519424`.
Fresh recordings from the integrated worktree are available in
`D:/Project/Wangmai-integration-safety-1793269707/recordings.html`: 30 videos from
the successful Edge run. The request-only test does not create a browser video.

## Verification

Fresh checks run from the final `D:/Project/Wangmai` worktree:

| Check | Result |
| --- | --- |
| Backend unit tests | PASS: 4 |
| Frontend unit tests | PASS: 15 |
| Auth/schedule integration tests | PASS: 25 reported, including two parent tests and 23 subtests |
| Typecheck | PASS |
| Lint | PASS |
| Production build | PASS using isolated `.next-build` output |
| Local database connectivity | PASS |
| Applied migration history | PASS: 2 matching SQL hashes/journal timestamps; no pending migrations |
| Required database tables | PASS: 4 auth and 3 schedule tables |
| Complete Chromium browser suite | PASS: 31 |
| Complete Edge browser suite | PASS: 31, with recordings |

The initial browser run had 30 passes and one protected-route failure with a
temporary `ECONNREFUSED` to the test backend while shared builds/dev startup
overlapped. The full Chromium rerun and the subsequent Edge run each passed all 31
tests with startup settled. The failed trace is
preserved externally; no test was removed, skipped, or given a larger timeout.

Live local HTTP checks: health 200; anonymous get-session 200/null; anonymous
profile and schedule APIs 401; protected page redirects to `/login`; numeric
loopback Login redirects to localhost. Cookie-bearing Google initiation returns
200 and targets Google with callback `http://localhost:3000/api/auth/callback/google`
and only email/openid/profile scopes. A denied-consent callback returns to Login.
No authorization URL, state, session token, client secret or database credential
was printed. A complete live Google consent/sign-in flow was **not repeated**;
fixture-based session tests are not described as live Google acceptance.

Phase 4 coverage is retained: 15 frontend unit tests and 25 reported integration
tests. The committed Phase 4 baseline has 18 browser tests; nine motion tests and
four UI tests bring the combined suite to 31.

## Final review and manual completion

The index contains source, migrations, tests and documentation only. No deletions
are intended relative to either `origin/main` or `feat/schedule-api`. Environment
files, build outputs, videos, temporary configs, backup files and dependencies stay
outside the index. The unchanged tracked `.env.example` retains its existing
development sample defaults; configured OAuth/auth secrets are absent from the
indexed source.

The assembled review currently contains 53 staged paths relative to `3107bd0`,
and 72 changed paths relative to `origin/main`, with zero deleted paths against
either main or Phase 4 and zero unresolved index entries. Complete path inventories
are saved in the external backup as `final-vs-main-files.txt` and
`final-vs-phase4-files.txt`. Compared with the canonical combined motion tree,
only this report and the historical-report handoff note differ.

Review the assembled result while the merge is uncommitted:

```powershell
git branch --show-current
git status
git diff --cached --stat
git diff --cached origin/main
git diff --cached --name-status feat/schedule-api
git diff --cached --check
```

Branch-to-branch diffs still compare committed tips until the merge is committed.
After reviewing the staged result, manually create the merge commit:

```powershell
git commit -m "feat: combine persistent schedules with UI refinements and motion"
```

That commit will retain both `3107bd0` and `1c54e6f` as parents. No rebase or force
push is required. Then branch-to-branch review can use:

```powershell
git merge-base --is-ancestor feat/schedule-api ui/improvement
git diff --name-status feat/schedule-api ui/improvement
git diff --stat origin/main...ui/improvement
```

Development is running from `D:/Project/Wangmai` at `http://localhost:3000` and
Hono at `http://localhost:4000`. A manual real-account smoke should confirm Google
login, a temporary schedule edit surviving refresh, logout, and the same saved
schedule on repeat login. No production deployment or Phase 5 work was performed.
