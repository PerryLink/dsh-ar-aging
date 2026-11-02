# dsh-ar-aging quickstart

- `input/ar-ledger.csv` — synthetic 13-row AR ledger, 6 customers, one currency (CNY), no customer data.
- `expected/result.json` — the real stdout of `node samples/quickstart/run.mjs --json`; it is regenerated, never hand-written.
- `run.mjs` — validates the ledger, builds the 2026-06-30 aging report and exports summary + detail CSV into a temporary directory.

```sh
node samples/quickstart/run.mjs            # human-readable summary
node samples/quickstart/run.mjs --json     # golden output
node samples/quickstart/run.mjs --check    # recompute and diff against expected/result.json
```

The sample deliberately includes a quoted customer name with a comma, all five age buckets, one partial payment and two settled invoices.
