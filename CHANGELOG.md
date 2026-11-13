# Changelog

## [0.2.0] — 2026-11-13

### Breaking

- **Tool names no longer contain a dot.** The three tools are now `ar_ingest`,
  `ar_aging` and `ar_export`. Providers validate `tools[].name` against
  `^[a-zA-Z0-9_-]+$`; the old dotted spelling invalidated the whole `tools`
  array, so the plugin registered but every request carrying its tools was
  rejected with `Invalid 'tools[N].name'`. Minor bump because tool names are
  part of the 0.1.0 compatibility promise — update prompts, saved calls and
  permission rules that still use the old dotted spelling.
- `test/tool-name-wire.test.mjs` pins the wire pattern, so a new tool cannot
  reintroduce a dot, drop the `ar_` namespace or duplicate an existing name.
- Earlier changelog entries use the underscore spelling, so a repository-wide
  search no longer finds dotted tool names.

## [0.1.0] — 2026-11-03

### Stable

- First non-alpha release: tool names and the CLI surface are covered by a
  compatibility promise (breaking changes require a minor bump).
- Ships a quickstart sample, a one-line prompt, a permission block and real captures.

## 0.1.0-alpha.1 — 2026-11-02

- First public alpha of `dsh-ar-aging`.
- `ar_ingest`: RFC 4180 CSV ingest, header aliases, strict dates, integer-cent amounts and single-currency validation.
- `ar_aging`: five age buckets from the invoice date, customer summary, overdue ratio from the due date and top overdue customers.
- `ar_export`: safe-path CSV export in `summary` (customer × bucket + TOTAL) and `detail` (one row per open invoice) layouts.
- Synthetic 13-row quickstart ledger, real-output golden file and real terminal screenshot.
- Local only: no network, no model call, no upload.
