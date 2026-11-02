# Evidence — dsh-ar-aging 0.1.0-alpha.1

All runs are local, over a synthetic AR ledger. No customer data, no network call, no model call.
No `git commit` and no `npm publish` were performed.

## Environment

- Node `v24.22.1`
- pnpm `11.28.5`
- TypeScript `7.0.2` (NodeNext, strict)
- Date: 2026-11-02 (Asia/Shanghai)

## Commands and results

| Command | Result |
|---|---|
| `pnpm build` | exit 0, `tsc -p tsconfig.json` emits `lib/` |
| `pnpm typecheck` | exit 0 |
| `pnpm test` / `node --test test/*.test.mjs` | 53 tests, 53 pass, 0 fail |
| `node samples/quickstart/run.mjs --check` | golden `expected/result.json` matches |
| `node scripts/lint.mjs` | 11 source files, 10 test files / 53 tests, 16 published entries |
| `node scripts/gate.mjs` | lint ok, acceptance ok, 11/11 acceptance rows pass |
| `npm pack --dry-run --json` | 42 files, 208,059 bytes unpacked, 120,817-byte tarball, no publish |

## Local Package Standard v1 score

The package is intentionally **not** added to `04-build/dsh-plugins/family.json` (not in the
family yet, so the committed roster does not count it). To verify the standard locally, the
official `04-build/dsh-plugins/scripts/score-packages.mjs` was copied to a temporary path,
pointed at a temporary two-item family file, and run against a copy of this checkout:

```
PS1 scores: 2 packages | green 2 / yellow 0 / red 0
domain packages: 2, avg 10.0
10 green  dsh-ar-aging
10 green  dsh-import-customs-check
```

Per-category score for `dsh-ar-aging`: `page=1 sample=2 prompt=1 expected=1 permissions=2 errors=1 evidence=2 total=10` (green; every category non-zero).

## Screenshot / golden hashes

| Artifact | SHA-256 |
|---|---|
| `docs/assets/quickstart.png` | `776aebecb966fd4a424298c80dafc3fe4e52b06edfa6164522f588f265008839` |
| `docs/assets/quickstart.log` | `6d11b7607472e5f0b88179dc5f686bd80d5625c7e881b7bffe7d5d97f99379f6` |
| `samples/quickstart/expected/result.json` | `8d3005c3883030013fdfba508b0b5c4987f9a91aeffc763966ced9784b6018cf` |
| `ACCEPTANCE.csv` quickstart row | uses the `expected/result.json` hash above |

The screenshot was rendered by `04-build/dsh-plugins/scripts/render-capture.py` from the real
captured terminal output in `docs/assets/quickstart.log` with
`RENDER_CAPTURE_FONT=/mnt/c/Windows/Fonts/msyh.ttc`; no output text was invented.

## Error-path coverage

- `E_AR_CSV_ROW` — wrong column count, missing header, duplicate invoice, mixed currency, empty/oversized file.
- `E_AR_DATE_INVALID` — impossible/malformed date, due before invoice, `as_of` before an invoice.
- `E_AR_AMOUNT` — non-integer/negative/zero amount, paid above amount.
- `E_AR_PATH_INVALID` — missing/directory input path, unsafe export filename, traversal, absolute path, symlink re-anchor.

All four codes are exercised by `test/*.test.mjs` and by `scripts/acceptance.mjs`.
