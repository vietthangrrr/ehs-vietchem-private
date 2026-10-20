# QA — Checkpoint 6.2 PPE History Correction

Status: PASS / Internal Pilot.

## Correction model
The ledger is immutable for business history. A wrong OUT transaction is never overwritten. The correction workflow creates a REVERSAL transaction that returns the original quantity to current stock, marks the old OUT as superseded or voided, and optionally writes a new corrected OUT.

## Verified cases
- Wrong quantity: original OUT 3 -> corrected OUT 1; final stock equals original stock - 1.
- Cancel wrong issue: corrected OUT cancelled; final stock returns to original stock.
- Multi-size correction: old size stock is restored before corrected size is deducted.
- Cost allocation excludes superseded/voided OUT transactions.
- Migration 003 is versioned, preceded by validated backup on an existing persistent database, and preserves business counts.
- Full automated suite: 51/51 tests PASS.
