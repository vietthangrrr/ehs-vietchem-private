# QA Report — Checkpoint 3

Date: 2026-10-15
Verdict: **HOLD / development checkpoint**

## Automated integration result

`npm test` → **24/24 passing** (23 subtests + parent suite).

Verified flows:
- unauthenticated API rejection + security headers;
- forced first-login password change;
- 430 employee / 70 PPE / 345 obligation data foundation;
- 16 equipment photo-staging rows + 8 legal-source records;
- Legal Update Inbox review action;
- PPE issue below zero stock without blocking, with ledger state;
- deadline extension justification and immutable original deadline;
- obligation Legal Review Queue;
- duplicate-document detection;
- invoice extraction + reviewed linkage to the URENCO payment case;
- OCR-normalized contract identifier matching;
- payment-request field parser;
- multi-document weigh-slip aggregation and BBNT tracking;
- payment weight tolerance guard;
- late internal payment-plan justification;
- equipment review state, inspection history and reminder generation;
- backup creation, checksum validation and offline restore of SQLite + uploaded evidence;
- five-failure login lockout;
- Warehouse and EHS Staff permission boundaries;
- authenticated audit actor and Checkpoint 3 action logging.

## Bugs found and fixed during this QA round

1. **Weigh-slip parser missed `Gross Weight / Tare Weight / Net Weight`.** Root cause: parser handled `Gross/Tare/Net` but not the common `... Weight` labels. Fixed and regression-tested.
2. **Offline restore failed for files located at the root of the uploads directory.** Root cause: restore recreated only the parent directory, not the uploads directory itself. Fixed and tested by restoring a backup containing imported evidence.
3. **Scanned contract number could be misread as a legal-reference number.** Root cause: OCR selected a preprocessed candidate where `Số` became `S6`; parser then fell through to a later legal citation. Fixed by prioritizing contract-heading proximity and common OCR variants.
4. **Contract OCR `Đ`→`D` prevented evidence-to-payment suggestions.** Fixed with a normalization key used only for candidate matching; no source/extracted field is overwritten.
5. **High-quality preprocessing was too slow for multi-page scanned PDFs.** Checkpoint 3 now uses bounded PDF preprocessing (180%, one enhanced pass) while retaining a 300% enhanced pass for single images. The supplied 6-page contract is processed from the first three pages in roughly tens of seconds in the current runtime rather than timing out.
6. **Payment-request OCR could read `tháng` as `thing` and `Số` as `Sé`.** Parser tolerance was extended; the supplied screenshot now recovers date 12/10/2026, required-payment date 16/10/2026, request no. 803, amount 7,155,000, employee code NV02089 and invoice 4348.

## Real supplied-document results

See `REAL_DOCUMENT_OCR_EVIDENCE.json` for machine-readable evidence. OCR spelling artifacts remain intentionally visible. Acceptance remains human-controlled.

## Equipment source-photo staging

16 rows were staged from the supplied equipment-list image. All use `source_ref=photo:equipment-list-2026-10-15` and start as `needs_review`. Values that look internally inconsistent in the image are preserved with warning notes instead of being guessed/corrected. Legal classification remains review-controlled.

## Red-team / release blockers

- Legal Engine currently has a verified baseline + review workflow, not a scheduled official-source crawler.
- Real BBNT/weigh-slip OCR calibration has not been completed because those samples have not yet been supplied.
- Windows OCR packaging remains unverified.
- Production TLS, reverse proxy, file-at-rest controls and backup retention are environment-dependent and unverified.
- Multi-user concurrency/load and longer-running fault-injection tests remain outstanding.

**Release Gate: HOLD.** Internal pilot preparation may continue after source review; do not represent this checkpoint as a production compliance system.
