# Gen-Air-Automation

End-to-end Playwright suite for Gen-Air-Frontend and Gen-Air-Backend. Feature → dev requires
code review, relevant unit checks and targeted QA that maintains coverage for new features.
The full Playwright suite runs only for frontend dev → test. Test → main runs no automated QA,
smoke checks or backend compatibility gate. Normal application deployment is unchanged.

## Run it locally

The suite expects the three repos side by side:

```
Git Repos/
├── Gen-Air-Automation
├── Gen-Air-Backend
└── Gen-Air-Frontend
```

```bash
npm ci --prefix ../Gen-Air-Backend
npm ci --prefix ../Gen-Air-Frontend
npm ci
npx playwright install chromium
npm test
```

Point the suite at other checkouts with `GEN_AIR_BACKEND_DIR` and `GEN_AIR_FRONTEND_DIR`.
For parallel isolated stacks, override ports with `GEN_AIR_BACKEND_PORT`,
`GEN_AIR_FRONTEND_PORT`, `GEN_AIR_DATABASE_PORT`, `GEN_AIR_FAKE_PLACES_PORT`, and
`GEN_AIR_SMTP_PORT`. Each explicit override takes precedence over `GEN_AIR_QA_PORT_OFFSET`;
otherwise the offset shifts the established default port. Every resolved port is validated.
Set `GEN_AIR_ARTIFACTS_DIR` to a unique OS temporary directory for each run; database, authentication,
JSON/HTML reports, screenshots and traces stay beneath that directory.
For targeted checks against an app revision that predates a newly added role, set
`GEN_AIR_QA_SETUP_ROLES` to a comma-separated list of roles needed by those checks (for example,
`system_admin`). This scopes disposable user seeding and authentication setup. The default runs all
roles; full regression must leave this unset.

Card 98's [multiple-role coverage matrix](docs/multiple-roles-coverage.md) documents the targeted
feature and affected regression checks, including real and simulated boundaries.

Staged sprint migrations run once in the disposable database, with one commit per stage.
The combined role/payment stages are hash-pinned. Destructive cleanup remains commented unless
`GEN_AIR_TEST_SPRINT_ALMON_CLEANUP=true` explicitly enables the reviewed payment drops.
A changed combined sprint SQL revision fails closed until its fingerprint is reviewed.

| Command                                       | What it does                                                 |
| --------------------------------------------- | ------------------------------------------------------------ |
| `npm test`                                    | Start the whole stack, run every spec, stop the stack        |
| `npm run test:ui`                             | Playwright UI mode for writing and debugging specs           |
| `npm run report -- <artifact-directory>/html` | Open the HTML report of that run                             |
| `npm run stack`                               | Start only the stack, to explore the app on `localhost:5180` |

No Docker, database or Google credentials are needed.

## How the stack works

`npm test` starts everything through Playwright's `webServer`:

1. **Throwaway Postgres 17** (`embedded-postgres`) on port `54329`, wiped on every start.
2. **Schema**: root SQL migrations, then sorted sprint directories' before/after stages.
3. **Seed**: one user per role (`src/constants/test-users.constant.ts`).
4. **Fake Google Places** on port `4100`, so project addresses can be verified without a key.
5. **Gen-Air-Backend** is built and runs on port `3100`. It runs from an empty working directory so
   a developer's `.env` (which points at Supabase) is never read.
6. **Gen-Air-Frontend** (Vite) runs on port `5180`, proxied to the backend.

Each spec creates its own data through the API (`src/api/seed-data.ts`) with unique names, so specs
never depend on each other. The isolated stack uses a test Drive adapter and local SMTP sink by
default; the Drive-unavailable banner is tested with a 503 response. Folder, file and upload flows
mock Drive endpoints in the browser (`src/mocks/drive.mock.ts`).

For card100's reviewed sprint cleanup, explicitly set
`GEN_AIR_TEST_SPRINT_ALMON_CLEANUP=true`. Only the embedded disposable database startup
uses this opt-in; it enables the reviewed `sprint-almon/after_deploy.sql` drops.
The staged loader owns each stage's commit and applies the combined constraints even with
destructive cleanup disabled. Both combined migration SHA-256 values are pinned; changed SQL
requires renewed review. Other sprint directories retain the ordered, unchanged stage policy. See
[payment ownership coverage](docs/payment-term-ownership.md) for the targeted commands.
The combined backend also requires the explicitly hash-pinned sprint-almon role prerequisite
`before_deploy.sql`. Disposable startup applies it exactly once before the combined after stage
and test-user seeding, even when payment cleanup is disabled. Neither prerequisite nor cleanup is executed
against an external database.

## Merge gate

The frontend calls `.github/workflows/e2e.yml` at an immutable Automation commit. The workflow has
only `workflow_call`; there are no Automation PR, push, schedule, or manual-dispatch triggers.

| Frontend PR | Backend revision               |
| ----------- | ------------------------------ |
| dev → test  | latest test, resolved to a SHA |

The promotion candidate merge commit is tested, including its destination branch. Unsupported
promotion directions and fork callers fail before installing dependencies or running Playwright.
Merge or promote backend dependencies into the matching destination first. A missing API/schema
contract fails the integration suite; merge the backend dependency and rerun the frontend gate.
The summary records immutable frontend, backend and Automation revisions. Existing coverage,
isolated seeded Postgres, faked integrations and report/trace retention remain in use.

Backend test pushes run a lightweight notifier, which marks eligible open frontend PRs pending
and reruns their latest completed merge-gate run. It never checks out the apps or runs Playwright.
If the gate is already active, it fails freshness verification and requires an explicit rerun.
The suite also checks backend/head/base freshness before publishing success. GitHub events are
asynchronous: the notifier cannot provide an atomic lock between repositories. Do not merge a
frontend PR while its backend promotion or notifier is still running.

See [release-gate rollout](docs/release-gate-rollout.md) for credentials, required checks, coordinated
activation and rollback. Do not remove the old required check before the replacement is available.

Workflow policy tests (adjacent backend checkout must contain this task's notifier):

```bash
node --test tests/workflows/*.test.mjs
```

## Layout

```
src/
├── api/          API client and seed helpers
├── constants/    routes, UI copy, ports, test users, fake places
├── environment/  database, fake Places server, backend process, stack entry
├── fixtures/     the extended `test` with an admin `api` fixture
├── mocks/        browser-level mocks (Google Drive)
├── pages/        page objects and shared tab, table, field and layout components
└── utilities/    test data, auth state, routes, guards
tests/            one folder per area of the app
```

## Coverage

| Area              | Spec                                            | Flows                                                                                                                                                                |
| ----------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth              | `tests/auth/login.spec.ts`                      | login, invalid login, disabled submit, session guard, logout                                                                                                         |
| Feature grants    | `tests/auth/feature-permissions-*.spec.ts`      | migration/data preservation and private tables, six-role grant parity, live grants without re-login, independent actions, session revocation/restore/account changes |
| Roles             | `tests/auth/role-access.spec.ts`                | what each of the six roles sees and can use, denied project, task and customer routes                                                                                |
| Role API          | `tests/auth/role-api-permissions.spec.ts`       | every role against every guarded project, customer and task action (2xx or 403)                                                                                      |
| Role rules        | `tests/auth/role-contract.spec.ts`              | six roles, retired `lead_installer`, member-slot roles, engineer-only task assignees                                                                                 |
| Role migration    | `tests/auth/role-migration.spec.ts`             | new roles, `lead_installer` rename, system-admin member slots removed                                                                                                |
| Board             | `tests/projects/board.spec.ts`                  | status counts, search, buildings without apartments, status change, mobile                                                                                           |
| Projects          | `tests/projects/project-form.spec.ts`           | create with verified address, validation, edit, delete, four member slots, drafts                                                                                    |
| Project drafts    | `tests/projects/project-form-draft.spec.ts`     | pending address verification, draft restore/privacy/discard, success cleanup, edit isolation                                                                         |
| Project page      | `tests/projects/project-page.spec.ts`           | standalone and building views, edit entry, not found                                                                                                                 |
| Priority fields   | `tests/projects/priority-fields.spec.ts`        | renamed API fields, preserved sync date and nullable unsynced caption                                                                                                |
| Migration         | `tests/projects/priority-migration.spec.ts`     | populated/null preservation, staged read compatibility, final types and column cleanup                                                                               |
| Apartments        | `tests/projects/apartments.spec.ts`             | add, details, independent stage, notes, next apartment, open from building                                                                                           |
| Drive             | `tests/projects/drive.spec.ts`                  | unavailable banner, folder status and files, upload, blocked file                                                                                                    |
| Tasks             | `tests/tasks/tasks.spec.ts`                     | create, validation, engineer-only pickers, counts, status, urgency, reassign, claim, legacy assignee                                                                 |
| Quotation email   | `tests/tasks/quotation-execution-email.spec.ts` | optional completion, recipients, nested files, preview, delivery, failure and authorization                                                                          |
| Task links        | `tests/tasks/task-link.spec.ts`                 | customer or project choice, cleared-link undo, picker and selection states, chips, legacy display                                                                    |
| Task link API     | `tests/tasks/task-link-api.spec.ts`             | exactly-one-link validation, 404s, edit replacement, legacy links, customer filter/search/counts                                                                     |
| Customers         | `tests/customers/customers.spec.ts`             | header button, form layout, validation, create, duplicate, cancel, mobile, pagination overflow                                                                       |
| Customer projects | `tests/customers/customer-projects*.spec.ts`    | customer-ID grouping, scoped search/status/paging, permissions, inherited teams, desktop/mobile navigation, errors/retry, cached reassignment refresh                |
| Employees         | `tests/employees/employees.spec.ts`             | add each of the six roles, role picker, role filters, new employee login, delete, search                                                                             |
| Settings          | `tests/settings/settings.spec.ts`               | fixed statuses, password mismatch, change password                                                                                                                   |
| Hosted            | `tests/hosted/deployment.spec.ts`               | HTTPS, client-route fallback, missing assets, `/api` proxy, auth rejection                                                                                           |

Every new page or flow in the app gets a spec here as part of the same task.

## Hosted smoke checks

`tests/hosted` runs against a deployed environment instead of the local stack, so `npm test` skips
it. Its checks only read: unauthenticated pages, unknown-credential login and a protected route
without a session. They create no data, so they are safe against every environment.

```bash
GEN_AIR_HOSTED_URL=https://gen-air-frontend-development.up.railway.app npm run test:hosted
```

## Feature QA handoff

The development QA agent owns tests in this repository and reads application branches without
editing them. Its existing canonical instructions live in Spec-Development-Component
`agents/qa-agent.md`; app repositories install Claude, Codex and Copilot copies. After clean code
review, QA maintains feature coverage, runs targeted tests and relevant unit checks against
exact feature revisions, and returns PASSED/FAILED before feature PR publication. Failures return
to development or QA according to ownership; application fixes require another clean review.

For frontend feature → dev, use a developer-prepared isolated candidate with current frontend dev
and latest backend dev after backend dependencies merge. Recheck candidate/base, backend and
Automation revisions before feature merge; changed revisions require renewed QA. GitHub does not
run this feature suite again. Dev → test uses the automatic full-suite frontend gate, without an additional QA-agent run.
Test → main has no automated QA/compatibility gate and backend main does not refresh checks.
When coverage changes, update both frontend workflow pins to the reviewed Automation test commit.

Set up adjacent checkouts at the exact backend and frontend feature commits (or set
`GEN_AIR_BACKEND_DIR` and `GEN_AIR_FRONTEND_DIR`). Record their SHAs and working-tree fingerprints;
do not reuse an unidentified running stack. Create a unique temporary evidence directory per run:

```bash
export GEN_AIR_ARTIFACTS_DIR="$(mktemp -d /tmp/gen-air-qa.XXXXXX)"
npx playwright test tests/customers/customers.spec.ts
npm run report -- "$GEN_AIR_ARTIFACTS_DIR/html"
```

Use separate directories for each failure and targeted rerun so reruns preserve the
original failure. Authentication state and the disposable database also live in that directory;
keep those private. Only publish sanitized `html`, `test-results`, and `results.json` artifacts.
When the variable is omitted, paths default to an OS-temp directory namespaced by checkout.
No reports, traces, login state, or test database are written into the repository.

For quotation execution email QA, the isolated stack enables its test Drive adapter and local SMTP
sink by default. Set `GEN_AIR_EMAIL_QA=false` to disable them for a targeted check. The backend
runs with test-only allowlisted addresses, empty Drive credentials, and no SMTP credentials. Raw
test messages remain under the private artifact directory and must not be uploaded.
`GEN_AIR_QA_PORT_OFFSET` shifts the app, database, Places, and SMTP ports when another local stack
is active.

Quotation PDF QA uses the real renderer from an adjacent Gen-Air-Worker checkout. Set
`GEN_AIR_PDF_QA=true` and provide a local Chromium executable through
`CHROMIUM_EXECUTABLE_PATH`; `GEN_AIR_WORKER_DIR` overrides the adjacent checkout path.
The suite starts an isolated authenticated HTTP harness around the renderer because the
Worker's queue process requires RabbitMQ. The Nest Worker HTTP controller and RabbitMQ
consumer are covered separately by Worker tests. The main backend, disposable Postgres,
and fake Google Drive run in the normal Automation stack. Generated PDF evidence stays
under `GEN_AIR_ARTIFACTS_DIR`.

```bash
export GEN_AIR_PDF_QA=true
export CHROMIUM_EXECUTABLE_PATH=/absolute/path/to/chromium
export GEN_AIR_ARTIFACTS_DIR="$(mktemp -d /tmp/genair-pdf-qa.XXXXXX)"
npx playwright test tests/quotations/quotation-pdf.spec.ts --project=chromium --retries=0
```

```bash
export GEN_AIR_BACKEND_DIR=/absolute/path/to/reviewed/backend
export GEN_AIR_FRONTEND_DIR=/absolute/path/to/reviewed/frontend
export GEN_AIR_ARTIFACTS_DIR="$(mktemp -d /tmp/genair-email-qa.XXXXXX)"
GEN_AIR_QA_PORT_OFFSET=100 npx playwright test tests/tasks/quotation-execution-email.spec.ts --project=chromium --retries=0
```

The JSON report supplies machine-readable outcomes; HTML and retained traces/screenshots explain
failed steps. Return the canonical structured `QA_RESULT: PASSED | FAILED` report with the card,
coverage mapping, exact application/Automation refs, commands/counts, integration state, artifacts, and the Automation
PR into `dev`. Before a feature PR exists, link its real branch compare URL and backfill the PR link
later. New test changes require clean code review; unchanged coverage can reference its tested
commit with an explicit no-PR justification.

Automatic full-suite GitHub runs belong only to frontend dev → test PRs, including freshness
reruns after backend test advances. There is no Automation PR/push/manual-dispatch suite, backend-PR
suite, feature → dev suite or test → main gate. Before feature PRs, QA owns targeted tests and
relevant unit checks; it never adds a full run to feature verification. Use explicit spec paths or
filters and record the executed scope. The full-suite local command above is for reproducing the
dev → test integration gate, not a feature requirement.

### Targeted apartment import and contacts API checks

With the disposable local stack running, run `npx playwright test --config playwright.import-api.config.ts` for API-only import and customer-contact checks. This configuration uses explicit API login and does not launch a browser or run browser authentication setup. The four feature browser tests remain in the standard configuration and require a permitted browser environment.

The embedded test database explicitly uses UTF-8 regardless of the host locale, and TCP loopback without Unix-domain sockets. A clean locale-less environment otherwise initialized PostgreSQL 17 as `SQL_ASCII`: `SHOW server_encoding` returned `SQL_ASCII` and `length('אמ')` returned 4, causing the existing two-initial Hebrew project-code constraint to reject valid fixture names. Explicit `--encoding=UTF8` fixes the test infrastructure rather than weakening application constraints or replacing Hebrew fixtures.

## Independent questionnaire feature QA

The public questionnaire is a separate service in `Gen-Air-Backend/apps/questionnaire`, not a CRM route. Its tests use a dedicated configuration, without browser-login setup. They are excluded from the CRM-only default configuration.

```sh
export GEN_AIR_BACKEND_DIR=/absolute/path/to/exact/backend/feature/checkout
export GEN_AIR_ARTIFACTS_DIR="$(mktemp -d /tmp/genair-questionnaire-qa.XXXXXX)"
npx playwright test --config playwright.questionnaire.config.ts
```

This starts the existing isolated stack (ephemeral UTF-8 PostgreSQL, all migrations, fake Places, backend port3100) and the independent questionnaire client on port5181. Tests activate the seeded questionnaire **only in the disposable database**, submit self-reported test identities, and assert original answers and duplicate prevention directly in that database. No live Railway database, employee account, Google Drive data or deployment is used. The lost-response test lets the real backend commit before dropping only the browser response; it does not mock persistence.

If the same isolated stack is already running in the same execution environment, API-only verification can run without a browser using `npx playwright test --config playwright.questionnaire-api.config.ts`. A passing API run does not satisfy the browser/mobile criteria or the feature QA gate. Keep the exact app/Automation refs and artifacts in the handoff. The client port is fixed at5181 to avoid the CRM Vite port5180.
