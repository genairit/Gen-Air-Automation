# Payment-term ownership — card100

[Card](https://trello.com/c/x3xrMuLP/100-move-payment-terms-from-projects-to-customers-and-quotations)

Run against explicitly selected backend/frontend revisions, never an unidentified existing server.
Allocate a unique OS temporary directory as `GEN_AIR_ARTIFACTS_DIR`; all auth, database, JSON,
HTML, screenshots, traces and videos already use that directory. The cleanup opt-in below
only affects the embedded disposable database, not an external database connection.

```bash
GEN_AIR_BACKEND_DIR=<candidate-backend> GEN_AIR_FRONTEND_DIR=<candidate-frontend> \
GEN_AIR_ARTIFACTS_DIR=<unique-temporary-directory> GEN_AIR_TEST_SPRINT_ALMON_CLEANUP=true \
npm test -- tests/customers/payment-defaults.spec.ts \
  tests/quotations/payment-term-ownership-api.spec.ts \
  tests/quotations/payment-term-ownership-browser.spec.ts \
  tests/projects/payment-terms-cleanup.spec.ts \
  tests/projects/project-form.spec.ts tests/projects/project-form-draft.spec.ts \
  tests/projects/project-constraints.spec.ts tests/customers/contact-design.spec.ts \
  tests/projects/apartment-backend-contract.spec.ts tests/projects/apartment-design.spec.ts
```

Relevant existing quotation regressions can be selected by title from
`quotation-api.spec.ts` (customer defaults) and `quotation-browser.spec.ts`
(customer-first creation). Do not run full regression at feature stage.

| Criterion                                                            | Flow / maintained spec                                                                                                                                         | Boundary                                                                                               |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Optional customer default, explicit unset, no customer note          | `customers/payment-defaults.spec.ts`: creation with unset/other, all edit options and durable clear                                                            | Real browser/API/Postgres                                                                              |
| Existing permissions                                                 | Same spec: read-only customer viewers cannot edit through UI or API                                                                                            | Real role grants                                                                                       |
| Require a customer and immediately persist its snapshot, empty note  | `quotations/payment-term-ownership-api.spec.ts`: server creation for every option and unset; invalid customer requests                                         | Real API/Postgres, direct durable snapshot read                                                        |
| Overrides and notes belong only to quotation                         | Same API spec: updates never mutate customer/sibling snapshots; browser ownership spec                                                                         | Real API/browser/Postgres                                                                              |
| Future defaults never rewrite previous quotes                        | Same API spec: changed/cleared defaults affect future quotes; browser ownership spec reloads old quote                                                         | Real API/browser/Postgres                                                                              |
| Draft customer changes preserve explicit quote-local fields and null | API ownership spec: draft customer switch; browser ownership spec: switch with override and note                                                               | Real API/browser/Postgres                                                                              |
| No project/apartment payment storage, DTOs or inheritance            | `projects/payment-terms-cleanup.spec.ts`, apartment backend contract spec: retired inputs rejected, fields absent                                              | Real API/embedded Postgres                                                                             |
| No project/apartment controls/display                                | Project form spec: create/edit/detail; apartment design spec: create/detail omit payment controls                                                              | Real browser/API/Postgres                                                                              |
| Drafts, contacts, teams, constraints still work                      | Existing project draft, contact design, project constraints, apartment design/backend specs                                                                    | Real behavior; existing explicit transport-error tests mock only error boundaries                      |
| Legacy values discarded, no customer/quote backfill                  | Cleanup spec: populated legacy rows, new connection verifies commit and preserved snapshots; actual application schema checked separately                      | Disposable embedded Postgres only                                                                      |
| Safe opt-in cleanup infrastructure                                   | `node --test tests/workflows/payment-terms-cleanup.test.mjs`; cleanup spec: disposable migration databases are dropped after successful and rejected callbacks | Executed contract checks and real embedded Postgres teardown; no UI exists for test-run infrastructure |

Google Places is faked locally. The integrated shared baseline uses a test Drive adapter and
local SMTP sink by default; existing Drive-display checks also use browser mocks. Set
`GEN_AIR_EMAIL_QA=false` to leave Drive unconfigured and disable the email fixture. Payment
behavior is never mocked. No shared Supabase, Google credentials or customer documents are needed.

The backend cleanup remains operator-gated in the application repository. Automation enabling
it on disposable data does not approve execution in a shared environment. Paired feature
verification does not replace the required dependency merge and renewed revision verification.
