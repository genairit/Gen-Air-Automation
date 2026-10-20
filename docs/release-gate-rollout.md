# Frontend release gates

Task: https://trello.com/c/4pOHzuqA/90-run-full-playwright-only-from-dev-to-test

## Pipeline

| Stage               | Verification                                                               |
| ------------------- | -------------------------------------------------------------------------- |
| Feature → dev       | Clean code review, relevant unit checks and maintained targeted feature QA |
| Frontend dev → test | Full Playwright suite and backend test compatibility/freshness             |
| Test → main         | No automated QA, full suite, smoke checks or backend compatibility gate    |

Normal application deployments remain unchanged. Backend and Automation PRs never trigger the
full suite. Feature QA maintains Automation specs for every new feature and records its exact
scope and revisions. It does not run full regression before feature PRs.

## Credentials

Keep the existing Gen-Air-Backend Actions secret `FRONTEND_GATE_TOKEN` for backend **test** pushes.
Use a GitHub App installation token or fine-grained token scoped to Gen-Air-Frontend with Pull
requests read, Actions read/write, Commit statuses read/write and Metadata read. A static token
needs expiry monitoring and rotation. Never put its value in code, app envs, logs or Trello.
Missing/revoked credentials fail the test notifier; fix them before relying on freshness protection.
No Google Drive, Supabase or Railway credentials are required.

## Coordinated activation

Pause promotions while installing these changes; do not trigger full suites to validate this task.
The implementation uses focused workflow contract tests, formatting/type checks and targeted QA,
as explicitly requested on the card. These tests do not claim a live GitHub dispatch or browser run.

1. Merge the reviewed Automation PR into dev. Both frontend workflow references must pin that exact
   immutable Automation commit. Do not use a moving branch. Old callers pointing at the previous
   commit retain the previous gate behavior until the frontend change is installed.
2. Merge the backend notifier changes and frontend caller into dev, along with the matching existing
   QA/development instructions from Spec-Development-Component and the installed Claude/Codex/Copilot
   adapters. This implementation opens feature PRs only: do not create or rerun promotion PRs
   during this task. Coordinate the subsequent normal release separately; it will run dev → test
   full regression once, using the new caller/pin. Backend test/main activation follows that release.
3. Frontend ruleset **25315803** currently requires `End-to-end / Playwright` on **main**. Move this
   status-check rule's target to **test only**, requiring `End-to-end / Playwright` (Actions issuer 15368) and `Backend compatibility` (no issuer restriction). Preserve unrelated rules, existing
   review requirements and bypass policies. Keep required statuses off dev and main. If a shared
   ruleset mixes test and main protections, split its status-check rule from unrelated protections.
   Require fresh checks on test; do not impose an automatic test/QA/compatibility check on main.
4. Preserve ordinary PR/review protections on main. Backend main must not require its retired E2E
   check or any replacement QA/compatibility gate. Do not add a smoke or "lightweight" substitute.
5. Verify live settings and record the rule IDs/results on the card. Do not claim rollout complete
   while main still requires a status that its workflow no longer produces. Source PRs alone do
   not alter live GitHub rulesets; report any permission/setup blocker explicitly.

The first subsequent normal dev → test release runs the full suite against the backend test SHA.
That release is outside this task's explicitly limited validation. Test → main creates no suite,
notifier or compatibility check. Deployments can still publish their normal deployment statuses;
they are not test gates introduced by this policy.

## Test-gate freshness and recovery

The frontend dev → test gate pins its candidate merge, backend test SHA and Automation SHA. It
rejects wrong directions, forks, conflicts, unavailable candidates and moving head/base revisions.
A failed suite or changed backend/head/base cannot publish successful compatibility.

Backend test pushes invalidate eligible frontend dev → test results before rerunning their latest
completed gate. No active/absent run is replaced with fake success: wait and explicitly rerun.
The notifier observes neither backend dev nor main. Keep frontend test merges paused while backend
test promotion/notifier processing is active; GitHub events provide no atomic cross-repo lock.

Merge backend dependencies into test before running the frontend gate. Fix infrastructure/token
failures and rerun only the affected dev → test gate. Feature failures instead require a fix,
review and targeted QA against the changed revisions, without a full suite. Never reuse stale QA.
Never reset hosted databases for CI or publish credentials/artifacts containing tokens.

## Rollback

Pause promotions and restore the previous matching workflow pins, notifier triggers, instructions
and branch-check scopes as a coordinated set. Do not leave a required check without a producer.
Restoring the old policy would re-enable main/feature full runs, so obtain explicit authorization
before doing that while the user's no-full-suite instruction for this task remains in force.
