# Frontend release gates

Task: https://trello.com/c/OdmZMmFp/87-restrict-automatic-e2e-to-frontend-release-prs

## Configure before activation

In Gen-Air-Backend, add the Actions secret `FRONTEND_GATE_TOKEN`. Use a GitHub App installation
token issued for each run, or a fine-grained token with access only to Gen-Air-Frontend. The current
workflow accepts a token secret; a static token needs expiry monitoring and rotation. Required
frontend repository permissions: Pull requests read, Actions read/write, Commit statuses read/write,
and Metadata read. Never put the token in code, application envs, logs or Trello.

A backend `GITHUB_TOKEN` cannot invalidate checks in a different repository. Missing or revoked
credentials fail the notifier; they must be fixed before relying on freshness protection.
The notifier requires no Google Drive, Supabase or Railway credentials.

## Activate in order

1. Review and merge the Automation change into dev, then promote it to main. This removes its
   independent PR/manual triggers. Old frontend/backend callers are incompatible with the new
   interface until the following steps; coordinate this maintenance window and pause releases.
2. Pin both frontend `uses:` and `automation-ref` to the exact reviewed Automation commit containing
   this workflow. Both references must match. Do not replace them with a moving branch.
3. Remove backend ruleset 25315801's obsolete `End-to-end / Playwright` requirement while installing
   the backend notifier and removing its merge-gate workflow. Preserve any other rules. Promote
   backend to test and main first so future pushes to all three destinations can notify frontend.
4. Install the frontend caller on dev, then promote through test and main. Run one eligible PR per
   destination and verify the actual GitHub check context is `End-to-end / Playwright`.
5. Update frontend ruleset 25315803 to include `refs/heads/dev`, `refs/heads/test`, `refs/heads/main`.
   Require `End-to-end / Playwright` (GitHub Actions integration 15368) and `Backend compatibility`
   (no integration restriction, because the notifier and workflow use different issuers). Enable
   strict required checks so frontend destination changes require a refreshed branch/check.
   Preserve other rules, bypass policies and review requirements. Require PRs, preventing direct
   branch pushes from bypassing release checks. Do not activate missing contexts.
6. Demonstrate a frontend contract failing before its backend dependency is promoted; promote the
   dependency, verify notifier invalidation/rerun, then obtain a green frontend integration check.
   Also verify a subsequent backend promotion marks a previous pass pending. Check notifier health
   and do not merge frontend during backend promotion or notifier processing.

The implementation PRs do not themselves change live rulesets. Changing rules before these
workflows are installed would leave required contexts without a producer or disable protection.
Record live checks and rule IDs on the task when rollout is complete. Local contract tests use
controlled API responses; they do not claim a live GitHub dispatch or real API-dependency rollout.

## Failures and recovery

- Missing dependency: merge backend into the target branch first, then rerun the frontend gate.
- Changed frontend target/head: update the branch and trigger a new PR run, rather than rerunning
  an obsolete event. Conflicts or unavailable candidate merges fail closed.
- Changed backend: rerun against its latest destination SHA; old results cannot be reused.
- Active gate during backend push: wait for it to finish, then rerun it. Pending status blocks merge.
- Missing token/notifier failure: repair credentials and rerun the backend notifier before frontend
  merge. GitHub notifications are asynchronous, so this design has no atomic cross-repo merge lock.
- Dependency installation/startup failure: the required Playwright check fails, and compatibility
  does not pass. Fix the infrastructure and rerun the frontend PR gate.

## Rollback

Pause releases. Restore the previous required contexts and matching caller/workflow versions as a
coordinated set, keeping the frontend protected throughout. Remove the notifier only after the old
backend gate and its required check have been restored. Never reset hosted databases for CI.
