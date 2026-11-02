# Changelog

## 0.1.0-alpha.1 — 2026-11-02

- First public alpha of `dsh-ar-aging`.
- `ar.ingest`: RFC 4180 CSV ingest, header aliases, strict dates, integer-cent amounts and single-currency validation.
- `ar.aging`: five age buckets from the invoice date, customer summary, overdue ratio from the due date and top overdue customers.
- `ar.export`: safe-path CSV export in `summary` (customer × bucket + TOTAL) and `detail` (one row per open invoice) layouts.
- Synthetic 13-row quickstart ledger, real-output golden file and real terminal screenshot.
- Local only: no network, no model call, no upload.
