# Checkpoint 2 RBAC Matrix

| Role | Intended scope |
|---|---|
| admin | Full system + user/role administration |
| ehs_manager | EHS CRUD, Legal Review, approve deadline changes, audit read |
| ehs_staff | Day-to-day EHS CRUD, deadline requests, document intelligence; cannot approve own deadline extension or resolve legal authority decisions |
| warehouse | Employee read + PPE read/issue/adjust + task read |
| manager | Oversight read access + deadline approval; no operational stock/payment edits |
| accounting_viewer | Payment/documents read-only; EHS Payment Tracker remains outside accounting execution |

Server-side authorization is authoritative. Hidden UI controls are only a usability layer.
