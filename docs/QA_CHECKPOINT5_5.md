# QA Checkpoint 5.5 — PPE Cost Allocation

## Scope
- Snapshot unit price + employee/department/site on every PPE OUT transaction.
- Backfill historical OUT transactions from current reference/master data with explicit `BACKFILL_CURRENT_REFERENCE` source.
- PPE Excel export adds `Phân bổ chi phí` and `Chi phí PPE lũy kế`.
- Missing unit prices are separated as `SL thiếu đơn giá`; they are not silently treated as zero cost.
- PPE receipt/adjust form can update the reference unit price for future issues.

## Automated regression
- `npm test`: 42 tests / 42 pass (41 subtests + parent suite).
- `node --check server.mjs`: pass.
- `node --check public/app.js`: pass.
- Preflight: Core READY, OCR runtime READY.

## Export verification
Synthetic real-flow verification issued 2 units of PPE-002 at 133,000 VND/unit to an active TT employee.

Expected and verified:
- `unit_price_snapshot = 133000`
- `cost_amount = 266000`
- Workbook sheets: `PPE Stock`, `PPE Ledger`, `Phân bổ chi phí`, `Chi phí PPE lũy kế`
- Department/person allocation row: 2 units, 266,000 VND
- Department subtotal: 266,000 VND
- Company total: 266,000 VND
- Cumulative PPE sheet: PPE-002 quantity 2, cumulative cost 266,000 VND
- Formula/error scan: 0 obvious Excel errors.

## Cost basis
For new issues, cost uses the PPE reference unit price **at the issue moment**, saved into the transaction. This prevents later price edits from rewriting historical allocation. Historical rows that predate CP5.5 are backfilled from the currently available reference price and clearly marked as backfill.
