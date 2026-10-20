# QA — Excel Export CP5.1

- Integration regression: 35/35 tests PASS.
- Export endpoint tested for `ppe`, `compliance`, `all`.
- MIME: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.
- ZIP/OOXML integrity: `unzip -t` PASS.
- Real consolidated export imported successfully with `artifact_tool`.
- Verified workbook sheets: Summary, Employees, PPE Stock, PPE Ledger, Compliance, Documents, Payments, Payment Checklist, Equipment, Inspections, Tasks, Alerts, Audit.
- Formula/error scan: 0 spreadsheet error tokens.
- RBAC: module export checks module read permission; consolidated export requires Compliance read and only includes sheets the user may read.
