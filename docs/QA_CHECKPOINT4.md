# QA — Checkpoint 4

Status: **INTERNAL PILOT CANDIDATE / HOLD FOR PRODUCTION**

## Automated regression

- 29 tests total, 29 pass, 0 fail.
- Node syntax checks pass for server, frontend and document intelligence modules.
- SQLite uses WAL + 5 second busy timeout.
- Parallel QA creates 12 independent task writes and verifies all 12 persisted.

## New checkpoint-4 coverage

1. **Legal Watch**
   - Daily scheduler enabled by default; `EHS_ENABLE_LEGAL_WATCH=0` disables it.
   - Official-source pages are fetched with conditional ETag / Last-Modified headers when available.
   - Stable fingerprint strips scripts, styles and comments before SHA-256 hashing.
   - First successful fetch establishes a baseline; later content change creates a `needs_review` legal update.
   - Test uses a local HTTP source, changes content at the same URL, confirms a change is detected, and confirms obligations are not modified automatically.

2. **Human-correctable OCR**
   - Extraction fields may be edited before Accept.
   - Original extraction JSON is preserved the first time a human edit occurs.
   - Edited values are marked confidence=1 / `edited=true` and the actor/time are audited.
   - Suggested payment matches are recomputed after edits.
   - Accepted extraction is locked against silent post-acceptance edits.

3. **Equipment source reconciliation**
   - Source reference remains immutable while selected master fields can be corrected.
   - Every reconciliation stores before/after JSON, reviewer, note and finalize flag.
   - Finalize moves source-review state to `reviewed`.

4. **Alerts / escalation**
   - Generates alerts for overdue obligations, equipment inspection expiry / T-30, contractual payment overdue, overdue tasks, and pending legal updates.
   - Severity + target role are stored.
   - Read state survives refresh; resolved conditions are automatically dismissed.
   - This is in-app escalation only; email/Teams/Slack delivery is not part of checkpoint 4.

5. **System health / concurrency baseline**
   - Health endpoint reports app version, WAL mode, busy timeout, active users, document count and unread alerts.
   - Business transactions use `BEGIN IMMEDIATE` for serialized writes in the supported single-service deployment.

6. **Backup / restore regression**
   - Checksum-valid `.tar.gz` backup and offline restore from checkpoint 3 remain passing after schema additions.

## Real OCR regression samples

Re-run on supplied files:
- `Urenco 30.09.26.pdf`: invoice, confidence 0.89; invoice 4348; 30/09/2026; 7,155,000 VND; 2,450 kg.
- `HỢP ĐỒNG URENCO11.pdf`: contract, confidence 0.88; OCR contract no. `0512/2025/HDCN/U11-TT`; date 05/12/2025; payment term 10 days.
- Payment-request screenshot: confidence 0.86; request 803; date 12/10/2026; required payment 16/10/2026; 7,155,000 VND; NV02089; invoice 4348.

## Upgrade-path validation

- Created a clean Checkpoint-3 database, then started Checkpoint 4 against the same `EHS_DATA_DIR`. Migration completed without data loss: 430 employees and 16 equipment rows remained; new legal-watch, reconciliation and notification tables plus OCR edit columns were present.

## Environment limitation during this build

- The build container cannot resolve `vanban.chinhphu.vn`, so Checkpoint-4 Legal Watch could not be live-tested against the Vietnamese government site from this runtime. The fetch/ETag/hash/change-detection pipeline was instead tested end-to-end with a local HTTP source at a stable URL. Pilot deployment still needs one successful official-source run on the target network.

## Remaining production blockers

- Source-photo equipment rows still require human comparison with the original master workbook/chứng thư before treating all 16 as verified.
- Real BBNT and real weigh-slip scans are still needed for OCR calibration beyond parser/integration fixtures.
- Windows package does not yet bundle Poppler/Tesseract/ImageMagick; preflight reports missing OCR runtime instead of pretending it is available.
- Reverse proxy/TLS, storage-at-rest policy, automated off-device backup retention, vulnerability scanning and restore-drill operations remain deployment decisions.
- Current concurrency assurance is for one Node service + SQLite WAL. Multi-process/multi-server deployment is not approved.
