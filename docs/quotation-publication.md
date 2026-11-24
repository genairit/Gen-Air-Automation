# Revision-bound quotation publication QA

Card: https://trello.com/c/qNLiPCwN. Feature verification is targeted; the full suite remains exclusively
in the frontend dev → test release gate. Record exact Backend, Frontend, Worker and Automation refs
and working-tree fingerprints before and after each publishable run.

Enable `GEN_AIR_PDF_QA=true`, set `CHROMIUM_EXECUTABLE_PATH`, and allocate a new
`GEN_AIR_ARTIFACTS_DIR` under the OS temporary directory. The real candidate Nest Worker runs from
an isolated directory containing only links to its reviewed assets/dependencies. Backend and Worker
use one run-specific queue prefix and a disposable loopback RabbitMQ 4.1 broker. The normal stack
uses real disposable PostgreSQL, fake Google Places/Drive and local SMTP. No Google credentials,
company broker, production database or real mail delivery participates.

```bash
GEN_AIR_PDF_QA=true CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium \
GEN_AIR_ARTIFACTS_DIR=/tmp/unique-publication-run \
npx playwright test \
  tests/quotations/quotation-publication-api.spec.ts \
  tests/quotations/quotation-publication-browser.spec.ts \
  tests/quotations/quotation-publication-recovery.spec.ts \
  tests/quotations/quotation-pdf.spec.ts \
  tests/quotations/quotation-lifecycle-api.spec.ts \
  tests/quotations/quotation-lifecycle-browser.spec.ts \
  tests/quotations/quotation-rejection.spec.ts \
  tests/quotations/quotation-cancellation-api.spec.ts \
  tests/quotations/quotation-cancellation-browser.spec.ts \
  tests/projects/existing-drive-folder-api.spec.ts \
  tests/projects/apartment-drive-provision.spec.ts \
  --project=chromium --retries=0
```

| Design group                   | Maintained evidence                                                                                                                                                                                             | Boundary                                                                                                                                                                                                                                                                                                                  |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Draft/save/export/CSV       | Publication API unpublished/no-project checks; PDF browser downloads in draft/review/order/cancelled; Worker real Rabbit CSV/PDF integration                                                                    | Real HTTP/PG/Chromium/broker; fake Drive records every publication effect and legacy upload                                                                                                                                                                                                                               |
| 2. Saved revision/order        | Publication API positive original customer/project capture, retained proposal revision, same-ID order replacement/move; real browser saved quantity/version/frozen renderer payload and accepted artifact hash  | Full Backend publisher → real Worker/Chromium → result adoption → fake Drive                                                                                                                                                                                                                                              |
| 3. Transition/result/UI races  | Ordinary approval/return API convergence across scheduler interleavings; account-switch browser; deterministic Backend before-render/prepare-effect and transport races                                         | Exact before-render proof: publication-review-regressions "waits for order-owned bytes..." BEFORE_RENDER/BETWEEN_EFFECTS and "creates no obsolete proposal..." RETURN/DELETE; publication.integration "supersedes unused rendering...". Real PG/controlled executor/fake Drive; ordinary HTTP is not an ordering barrier. |
| 4. Withdrawal/history/cycles   | Return/reject/cancel/restore API cases preserve exact original bytes/ID and fresh resubmission IDs; actual authorized and read-only existing history Timeline browser; Backend old-root/soft-delete regressions | Real ordinary flow; real PG with fake Drive for controlled interleavings                                                                                                                                                                                                                                                  |
| 5. Broker recovery/adoption    | Dedicated recovery spec: business commit while broker unreachable, actual Backend restart, actual Worker recovery, first-adoption PG failure and real Rabbit result redelivery; Backend/Worker transport checks | Separate disposable PG/loopback proxy/ports/prefix; management metrics prove one render, two result deliveries with one redelivery and a drained queue; browser is inapplicable                                                                                                                                           |
| 6. Uncertain external effects  | Backend lost-create/readback/move recovery, prepared-plan fencing, committed role reservation and executor recreation regressions                                                                               | Real PG, mocked Google transport; no cross-system exactly-once claim                                                                                                                                                                                                                                                      |
| 7. Foreign/missing/hidden/hash | Backend publication integration/review regressions and Google publication-drive wrapper specs                                                                                                                   | Real PG/SDK mocks; no company Google operations                                                                                                                                                                                                                                                                           |
| 8. Project/folder policy       | Linked incomplete→explicit completion→same-cycle retry API; exact thirteen-folder apartment template/provision/repair checks; Backend original-root/physical ownership/tag/ambiguity regressions                | Real PG/fake Drive; canonical multi-project/apartment authority checked at maintained application layer                                                                                                                                                                                                                   |
| 9. Failure/limits/retry        | Browser failed/read-error/neutral refresh and unavailable retry; Worker PDF contract/timeout/size checks; Backend transport failure tests                                                                       | UI mocks prove presentation; actual successful rendering is separately verified above                                                                                                                                                                                                                                     |
| 10. Permissions/objects        | Publication API distinct disposable engineer, live admin grant revocation, read/export/retry, guessed IDs, expected cycle/generation, redacted Drive/project history                                            | Real authenticated HTTP; existing quotation read policy is respected without inventing ownership restrictions                                                                                                                                                                                                             |
| 11. Responsive/accessibility   | Desktop1440/tablet768/390 RTL, long destination, reduced motion, focused/unavailable retry, terminal focus, user movement, positive read-only state/history, actual project quotation details, polling cadence  | Browser assertions; screenshots require human/agent image inspection before an overall pass                                                                                                                                                                                                                               |

The Backend's maintained `publication.integration`, `publication-review-regressions`,
`publication-transport`, `publication-shutdown` and Google `publication-drive` specs must have valid
results at the recorded Backend revision. Broader unchanged lifecycle/root-writer checks may retain
reviewed evidence with exact provenance. Worker unit and real Rabbit/Chromium integration results
must name their exact revision. A workflow pin-only Frontend commit does not require duplicate
unchanged unit/build runs, but the complete targeted browser/API scope runs against the final refs.

Browser mocks never count as evidence that broker publishing, Drive transport or database adoption
worked. Fake Drive stores current media/revisions and an effect ledger beneath the private temporary
artifact directory; inspect PDF bytes and hashes there. Keep raw DB/auth/mail/trace/log data private.
Publish only a sanitized report, screenshot proofs and ref manifest. Preserve original failures with
cause/owner and later corrective evidence. Zero required skips/retries/flakes and a clean independent
review of the entire Automation change are prerequisites to publishing its PR.
