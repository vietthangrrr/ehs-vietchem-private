# QA Checkpoint 5.6 — PPE Layout / Scroll / History UX

## Scope
- Removed permanent Stock Ledger side panel from PPE inventory view.
- Full-width PPE inventory table.
- Internal vertical scrollbar with compact rows (approximately 20 visible on standard desktop displays).
- Top horizontal scrollbar synchronized with the table.
- Sticky table header.
- Sticky right action column (`Xuất` / `Điều chỉnh`) so functions remain visible while scrolling.
- PPE history moved to top-right dropdown, preserving filters and dedicated Excel export.
- VIETCHEM watermark fixed to render faintly behind app content.
- Existing PPE cost allocation exports remain unchanged.

## Verification
- `node --check public/app.js`: PASS
- `node --check server.mjs`: PASS
- `npm test`: 43/43 tests PASS (42 integration subtests + suite).
- `node scripts/preflight.mjs`: Core READY, OCR runtime READY.

## Release status
Internal pilot candidate. Production HOLD remains unchanged.
