# QA — Checkpoint 5.2 Usability

Release status: INTERNAL PILOT / PRODUCTION HOLD.

## Changes validated
- PPE layout: KPI overview, visible synchronized top horizontal scrollbar, internal table scroll, collapsible ledger, responsive single-column fallback.
- PPE issue recipient: name-only by default; department shown only for duplicate names; selected employee metadata appears below.
- Payment Type workflow based on supplied `Checklist Bộ hồ sơ thanh toán(1).xlsx`:
  - Đề nghị tạm ứng khác
  - Đề nghị tạm ứng NCC
  - Quyết toán tạm ứng
  - Quyết toán tạm ứng NCC
  - Đề nghị thanh toán khác: Hạng mục 3/đối ngoại, rác thải, QTMT, hạng mục bình thường, khác.
- Conditional/optional payment documents retained in checklist metadata.
- VIETCHEM background watermark added with low opacity and pointer-events disabled.
- Excel export regression retained.

## Automated test result
- `npm test`: 36 tests, 36 PASS, 0 FAIL.
- Node syntax checks: PASS for `server.mjs` and `public/app.js`.

## Source rule note
Payment checklist structure was transcribed from the user-supplied internal workbook. The application does not infer additional accounting requirements and remains a tracking tool only.
