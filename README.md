# Gen-Air-Automation

End-to-end Playwright suite for the Gen-Air app (Gen-Air-Frontend + Gen-Air-Backend). Every pull
request into `main` in either app repo runs this suite, and a failing run blocks the merge.

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

| Command           | What it does                                                 |
| ----------------- | ------------------------------------------------------------ |
| `npm test`        | Start the whole stack, run every spec, stop the stack        |
| `npm run test:ui` | Playwright UI mode for writing and debugging specs           |
| `npm run report`  | Open the HTML report of the last run                         |
| `npm run stack`   | Start only the stack, to explore the app on `localhost:5180` |

No Docker, database or Google credentials are needed.

## How the stack works

`npm test` starts everything through Playwright's `webServer`:

1. **Throwaway Postgres 17** (`embedded-postgres`) on port `54329`, wiped on every start.
2. **Schema**: every `Gen-Air-Backend/migrations/*.sql` file, applied in order.
3. **Seed**: one user per role (`src/constants/test-users.constant.ts`).
4. **Fake Google Places** on port `4100`, so project addresses can be verified without a key.
5. **Gen-Air-Backend** is built and runs on port `3100`. It runs from an empty working directory so
   a developer's `.env` (which points at Supabase) is never read.
6. **Gen-Air-Frontend** (Vite) runs on port `5180`, proxied to the backend.

Each spec creates its own data through the API (`src/api/seed-data.ts`) with unique names, so specs
never depend on each other. Google Drive is left unconfigured on the backend, which is how the
"Drive unavailable" banner is tested; folder, file and upload flows mock the Drive endpoints in the
browser (`src/mocks/drive.mock.ts`).

## Merge gate

- `.github/workflows/e2e.yml` is a reusable workflow. It checks out all three repos, runs the suite
  and uploads the HTML report, traces and failure screenshots as the `playwright-report` artifact.
- Gen-Air-Backend and Gen-Air-Frontend each call it from `.github/workflows/merge-gate.yml` on every
  pull request into `main`. The repo under test is checked out at the PR head, the other app at
  `dev`, and this suite at `main`.
- In both app repos, a ruleset on `main` makes the **End-to-end / Playwright** check required, so a
  red run blocks the merge.
- Pull requests in this repo run the same workflow against both apps' `dev`.

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

| Area         | Spec                                  | Flows                                                                      |
| ------------ | ------------------------------------- | -------------------------------------------------------------------------- |
| Auth         | `tests/auth/login.spec.ts`            | login, invalid login, disabled submit, session guard, logout               |
| Roles        | `tests/auth/role-access.spec.ts`      | what each of the four roles can create or manage, denied forms             |
| Board        | `tests/projects/board.spec.ts`        | status counts, search, buildings without apartments, status change, mobile |
| Projects     | `tests/projects/project-form.spec.ts` | create with verified address, validation, edit, delete                     |
| Project page | `tests/projects/project-page.spec.ts` | standalone and building views, edit entry, not found                       |
| Apartments   | `tests/projects/apartments.spec.ts`   | add, details, independent stage, notes, next apartment, open from building |
| Drive        | `tests/projects/drive.spec.ts`        | unavailable banner, folder status and files, upload, blocked file          |
| Tasks        | `tests/tasks/tasks.spec.ts`           | create, validation, counts, status, urgency, reassign, description, claim  |
| Customers    | `tests/customers/customers.spec.ts`   | create, validation, pending count, search, customer page                   |
| Employees    | `tests/employees/employees.spec.ts`   | add, new employee login, delete, search                                    |
| Settings     | `tests/settings/settings.spec.ts`     | fixed statuses, password mismatch, change password                         |

Every new page or flow in the app gets a spec here as part of the same task.
