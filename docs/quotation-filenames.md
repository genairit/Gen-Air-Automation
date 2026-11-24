# Quotation filename revision QA

Card: https://trello.com/c/SV7Lxf6q. This is targeted feature coverage; full regression belongs only to frontend dev → test.

Run the existing PDF tests and filename-specific publication tests together:

```bash
GEN_AIR_PDF_QA=true CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium \
GEN_AIR_ARTIFACTS_DIR=/tmp/unique-filename-run \
npx playwright test tests/quotations/quotation-pdf.spec.ts \
  tests/quotations/quotation-filenames.spec.ts --project=chromium --retries=0
```

The scope is eight feature tests plus the existing authentication setup. Use the normal actual Backend, Nest Worker, Chromium, disposable PostgreSQL and isolated loopback RabbitMQ stack described in quotation-publication.md. Google Drive/Places are faked and SMTP is local. No company credentials or resources participate.

| Requirement                                                                 | Maintained evidence                                                                                                                                                                              | Boundary                                                                                 |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Exact six-field order, saved number/brand order and omitted optional fields | Existing one-click PDF download test asserts server UTF-8 header, actual suggested filename and bytes in quotation/order states                                                                  | Actual HTTP/rendering/browser; fake Drive effect ledger                                  |
| Canonical project name and actual parent/apartment                          | Existing apartment PDF test; filename publication test shares the order with a child and still exports the primary building name                                                                 | Actual API/PG/renderer/download, no route-derived context                                |
| Safe readable Unicode and deterministic length                              | Existing unsafe-customer test plus long emoji browser test; Backend filename utility cases cover NFC, normalized deduplication, controls and 240-byte grapheme edges                             | Actual suggested filenames; focused pure algorithm checks                                |
| Frozen naming input and same-file order/archive                             | Publication test edits customer/project after captured review, checks unchanged snapshot/hash, same file ID with actual new order bytes/name/folder, then exact archived name and retained bytes | Actual Worker/Rabbit/result adoption/executor; fake Google effects                       |
| Previously persisted v1 jobs                                                | Legacy retry test inserts a separate failed v1 cycle/operation with coherent next quotation/source/render revision before acceptance, then retries through actual HTTP and Worker                | Disposable PG fixture only; guards stay enabled and existing snapshots are never changed |
| Export authorization, failures and no manual publication                    | Existing PDF grant/UI, review/cancelled export and failure tests; publication test verifies manual export adds no file                                                                           | Actual authorization/browser with one explicit 503 presentation mock                     |
| Existing attachment names                                                   | Backend execution email service/transport tests assert exactly selected plan.pdf and plans.zip names; no quotation attachment path is added                                                      | Maintained component tests with transport mocks                                          |

The legacy fixture reuses the reviewed canonical hash serializer only to seed a valid protocol envelope. Expected filenames are literal requirement strings, never produced by the naming algorithm under test. Final evidence records immutable four-repository refs, clean trees, commands, counts, inspected screenshots and sanitized artifacts. A diagnostic failure is retained and classified; it is not a passing gate.
