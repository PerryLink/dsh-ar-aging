<div align="center">

# dsh-ar-aging

> **Official repository.** The only official repository of this package, maintained by PerryLink. Same-name repositories under other accounts are not affiliated. Apache-2.0.

[![npm](https://img.shields.io/npm/v/dsh-ar-aging)](https://www.npmjs.com/package/dsh-ar-aging)
[![CI](https://github.com/PerryLink/dsh-ar-aging/actions/workflows/ci.yml/badge.svg)](https://github.com/PerryLink/dsh-ar-aging/actions)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)

**Turn an AR ledger CSV into an aging report: buckets, customer summary, overdue ratio and top overdue customers, then export CSV.**

> **Status: alpha / public-synthetic / partial / not counted / not GA.** No customer data, customer evidence, or production-readiness claim.

[English](README.md) · [简体中文](README-zh.md)

```sh
dsh plugin --profile <profile> add dsh-ar-aging
```

</div>

## One-liner

Read a local AR ledger CSV, age open invoices from their invoice date, measure overdue from their due date, and write a bucket table plus a customer summary.

## Fit / not a fit

- **Fits:** 10s to 1000s of rows exported from an ERP or accounting system; a 0-30 / 31-60 / 61-90 / 91-180 / 180+ aging table; an overdue ratio and a top-overdue list for a collections review; a CSV to hand to finance or archive.
- **Does not fit:** converting multiple currencies into one (no FX here); write-offs, bad-debt provisioning, impairment or collection advice; PDF, scans or Excel as direct input (export CSV first); replacing an auditor, tax adviser or credit decision; credit notes / negative invoices.

## Input

- UTF-8 CSV with a header row and comma separators. Quoted commas, embedded newlines and doubled quotes (RFC 4180) are supported, as are CRLF and a UTF-8 BOM.
- Header: `customer,invoice_no,invoice_date,due_date,amount_cents,currency,paid_cents`. Chinese aliases such as `客户 / 发票号 / 开票日 / 到期日 / 金额分 / 币种 / 已收金额分` work too; extra columns are ignored.
- Dates: `YYYY-MM-DD`; `due_date` must not be earlier than `invoice_date`.
- Amounts: integer **cents**; `amount_cents > 0` and `0 <= paid_cents <= amount_cents`.
- Currency: a 3-letter code such as `CNY`. **One CSV must use one currency**; mixing raises `E_AR_CSV_ROW`.
- Invoice numbers must be unique within the file.
- Size: up to 20 MB per file; split by customer or month beyond that.
- Source: the local CSV the user names; it is read-only and never modified.

## Output

- `ar.ingest`: `{ source_sha256, rows, customers, currency, invoice_date_min, invoice_date_max, due_date_min, due_date_max, total_cents, paid_cents, outstanding_cents, settled_rows, open_rows, preview }`. `preview` holds the first five normalized rows.
- `ar.aging`: `{ as_of, currency, totals, buckets, customers, top_overdue }`. `totals` carries outstanding, overdue, not-due and `overdue_ratio`; `buckets` is always the five buckets; `customers` is sorted by outstanding; `top_overdue` defaults to five customers (`top_n` accepts 1–50).
- `ar.export`: writes the aging table under `$DSH_HOME/dsh-ar-aging/exports/` and returns path, `sha256`, bytes and rows. `layout=summary` (default) is customer × bucket plus a `TOTAL` row; `layout=detail` is one row per open invoice. The source CSV is untouched.

Aging rules: age = `as_of - invoice_date` in UTC days. `0-30` covers days 0–30, `31-60` days 31–60, `61-90` days 61–90, `91-180` days 91–180, and `180+` starts at day 181. Overdue means `due_date < as_of`; an invoice due on `as_of` is not overdue. A fully paid invoice (`paid_cents = amount_cents`) counts as settled but is excluded from buckets and detail exports.

## Example

Paste this one line into the agent:

> 我有这份应收明细，按 2026-06-30 出账龄表：分桶、客户汇总和 Top 逾期客户，再导出 CSV。

Reproduce the bundled sample and compare with the golden file:

```sh
node samples/quickstart/run.mjs --check
```

![dsh-ar-aging quickstart terminal output](docs/assets/quickstart.png)

The sample is a 13-row synthetic ledger with 6 customers in one currency (CNY). It covers all five buckets, one partial payment, two settled invoices and a customer name with a comma (`江南纺织, 苏州`, which exercises CSV quoting). `samples/quickstart/expected/result.json` is the real stdout of `node samples/quickstart/run.mjs --json`, not hand-written.

## Permissions

Read: the AR ledger CSV the user names (sample: `samples/quickstart/input/ar-ledger.csv`); nothing else.
Write: `$DSH_HOME/dsh-ar-aging/exports/` only; the source CSV is not modified.
Network: no.
External systems: none.

`ar.ingest` and `ar.aging` are **R0** (read-only). `ar.export` is **R1** (local write under `$DSH_HOME/dsh-ar-aging/exports/`). `DSH_AR_AGING_HOME` can override the local write root for tests; the default is exactly `$DSH_HOME/dsh-ar-aging`.

## FAQ

### 1. Is aging measured from the invoice date or the due date?

From the **invoice date** (`as_of - invoice_date`). Overdue is measured separately from the **due date** (`due_date < as_of`). An invoice aged 100 days but not yet due lands in `91-180` with zero overdue amount.

### 2. What about multiple currencies?

One CSV must use one currency; mixing raises `E_AR_CSV_ROW`. There is no FX conversion and no cross-currency total here. Split the file by currency, or convert in the source system first.

### 3. How are partial payments and settled invoices handled?

Outstanding = `amount_cents - paid_cents`. Partially paid invoices enter aging at their outstanding balance. A fully paid invoice counts in `settled_rows` but is excluded from buckets, the customer summary and detail exports. `paid_cents > amount_cents` raises `E_AR_AMOUNT`.

### 4. Are amounts in yuan or cents?

The tool API uses integer **cents** everywhere. `128000000` means 1,280,000.00. Exported CSV renders two decimals so a spreadsheet can open it directly.

### 5. Does it modify or upload my file?

No. It reads the named CSV, writes only under `$DSH_HOME/dsh-ar-aging/exports/`, and never uses the network, a model call or an upload.

## Version

`0.1.0-alpha.1` · 53 tests pass (`node --test test/*.test.mjs`).

> ⭐ If this helps, a star makes it easier for the next person to find it. Nothing is gated behind it.

## Install

```sh
dsh plugin --profile <profile> add dsh-ar-aging
dsh --profile <profile> --dump-config | grep dsh-ar-aging
```

Uninstall:

```sh
dsh plugin --profile <profile> remove dsh-ar-aging
```

### Install channels

- **npm (recommended):** `dsh plugin --profile <profile> add dsh-ar-aging`
- **git channel:** `dsh plugin --profile <profile> add github:PerryLink/dsh-ar-aging`
- **tarball:** `pnpm pack`, then `dsh plugin --profile <profile> add ./dsh-ar-aging-<version>.tgz`

## Tools

Tool names are stable API; descriptions stay in English to match runtime output.

| Tool | Purpose | Risk |
|---|---|---|
| `ar.ingest` | Validate and normalize the AR CSV; return totals, settled/open counts and a 5-row preview | R0 |
| `ar.aging` | Build the five aging buckets, customer summary, overdue ratio and top overdue customers at `as_of` | R0 |
| `ar.export` | Write the customer aging table (`summary`) or invoice-level trace (`detail`) as CSV, returning path + sha256 | R1 local write |

## Aging rules

1. Age = `as_of - invoice_date` in whole UTC days. An `as_of` earlier than any invoice date raises `E_AR_DATE_INVALID`.
2. Buckets: `0-30` (0–30), `31-60` (31–60), `61-90` (61–90), `91-180` (91–180), `180+` (181+).
3. Overdue: `due_date < as_of` and outstanding > 0; due today is not overdue.
4. Overdue ratio = overdue outstanding ÷ total outstanding, rounded to 4 decimals (0.7113 = 71.13%).
5. Customers sort by outstanding descending, then name ascending. Top overdue sorts by overdue amount, then longest overdue days.
6. The summary CSV ends with a `TOTAL` row; the detail CSV contains open invoices only, sorted by customer, due date and invoice number.

## Quick start

```sh
# 1) validate and see totals
#    tool surface: ar.ingest({ path: "/abs/path/ar-ledger.csv" })

# 2) build the aging report
#    tool surface: ar.aging({ path: "/abs/path/ar-ledger.csv", as_of: "2026-06-30", top_n: 5 })

# 3) export CSV
#    tool surface: ar.export({ path: "/abs/path/ar-ledger.csv", as_of: "2026-06-30", layout: "summary" })
```

Or run the sample:

```sh
node samples/quickstart/run.mjs --check
```

## Errors

| Code | When | Next action |
|---|---|---|
| `E_AR_CSV_ROW` | Wrong column count, missing header, empty customer/invoice, duplicate invoice, mixed currency, empty or >20 MB file | Fix the named row, split by currency or month |
| `E_AR_DATE_INVALID` | Not `YYYY-MM-DD`, impossible date, due before invoice, `as_of` before an invoice | Use ISO dates and check ordering |
| `E_AR_AMOUNT` | Not a non-negative integer of cents, zero amount, paid above amount | Use integer cents and `0 <= paid <= amount` |
| `E_AR_PATH_INVALID` | Input missing / a directory / unreadable, unwritable exports directory, or an unsafe export filename | Pass an existing CSV; export with `[A-Za-z0-9._-]` only |

The message format is `<one sentence>（E_AR_XXX）｜下一步：<one action>`. See [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

## Acceptance evidence

Public/synthetic fixtures live in `samples/quickstart/`; `ACCEPTANCE.csv` records the checks. Every row is `counted=false` except the quickstart row.

| req_id | metric | threshold | actual | pass | source | counted |
|---|---|---|---|---|---|---|
| AR-A01 | ingest totals | rows=13 customers=6 | rows=13 customers=6 | true | public/synthetic | false |
| AR-A02 | aging buckets | counts=4/2/2/1/2 | counts=4/2/2/1/2 | true | public/synthetic | false |
| AR-A03 | overdue ratio | overdue=549500000 ratio=0.7113 | overdue=549500000 ratio=0.7113 | true | public/synthetic | false |
| PS1-QS01 | quickstart golden | 1/1 | 1 | true | synthetic/quickstart | true |

*Fixture-backed rows, not a customer run; no output is invented.*

## Limits and known limitations

- **Single currency:** no FX conversion; split files by currency.
- **No credit notes:** `amount_cents` must be > 0. Offset red invoices in the source system first.
- Aging and overdue statistics only: no write-off, bad-debt provision, impairment, collection strategy or audit opinion.
- CSV only: no PDF, scans or Excel, and no OCR. Export CSV from the source system first.
- Amount precision is one cent; dates use UTC calendar days. Pass `as_of` explicitly for a reproducible "today".
- Exported CSV uses RFC 4180 quoting only; Excel formula prefixes are not sanitised.
- Local only: no network, no model call, no upload.
- Public/synthetic samples only; alpha/partial, not counted, no GA or production-readiness claim.

## Development

```sh
pnpm install --frozen-lockfile
pnpm build && pnpm lint && pnpm typecheck
node --test test/*.test.mjs
node scripts/gate.mjs
```

## Compatibility

| Surface | Status |
|---|---|
| Harness | `dsh >=0.2.1-rc.3 <0.4.0` |
| Node | `>=24.9.0 <25` |
| Platforms | All; local files only |
| Data | No network, no model call, no upload |

## Related work

- [dsh-bankrec](https://github.com/PerryLink/dsh-bankrec) (bank statement reconciliation)
- [dsh-fin-invoice-core](https://github.com/PerryLink/dsh-fin-invoice-core) (invoice core logic)
- [Domain index](https://perrylink.github.io/dsh-plugins/)

## License

Apache-2.0. See `LICENSE`, `NOTICE`, `THIRD-PARTY-NOTICES`.
