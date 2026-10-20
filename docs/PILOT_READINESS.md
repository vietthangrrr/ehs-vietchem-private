# Internal pilot readiness

Checkpoint 4 is suitable for a **controlled internal pilot**, not production.

Recommended pilot setup:

1. Use a dedicated pilot machine/user account and a dedicated `EHS_DATA_DIR` / `EHS_UPLOAD_DIR`.
2. Run `node scripts/preflight.mjs` before first start.
3. Set a strong bootstrap password using `EHS_BOOTSTRAP_PASSWORD`, log in once, then change it immediately.
4. Keep Legal Watch enabled. If the machine has no internet access, set `EHS_ENABLE_LEGAL_WATCH=0` and use manual review instead.
5. Create one EHS Manager, one EHS Staff, one Warehouse and one Manager test account; do not share the admin account.
6. Make a backup before importing large document batches or reconciling equipment master data.
7. Treat all 16 photo-staged equipment records as `needs_review` until checked against source/master evidence.
8. For OCR, correct fields in the Review Queue before Accept; never use extracted text as a substitute for the source document.
9. Payment Tracker is not accounting software. “Paid” is a tracking status only and must not replace accounting/ERP records.
10. Run a restore drill on a non-production folder before trusting backup operations.
