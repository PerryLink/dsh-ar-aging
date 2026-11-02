#!/usr/bin/env node
/**
 * dsh-ar-aging quickstart — validates the bundled synthetic AR ledger, builds
 * the aging report at 2026-06-30 and exports both summary and detail CSV.
 *
 *   node samples/quickstart/run.mjs            # human-readable summary
 *   node samples/quickstart/run.mjs --json     # the golden result on stdout
 *   node samples/quickstart/run.mjs --check    # recompute and diff against the golden file
 *
 * The golden file `expected/result.json` is the stdout of `--json`; it is a real
 * run over the committed CSV, not hand-written output.
 */
import assert from 'node:assert/strict'
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { formatCents } from '../../lib/core/money.js'
import { createTools } from '../../lib/plugin/tools.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const samplePath = path.join(here, 'input', 'ar-ledger.csv')
const expectedPath = path.join(here, 'expected', 'result.json')
const mode = process.argv.includes('--check') ? 'check' : process.argv.includes('--json') ? 'json' : 'summary'
const AS_OF = '2026-06-30'

const money = (cents) => {
  const [whole, fraction] = formatCents(cents).split('.')
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${fraction}`
}

async function run() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'dsh-ar-aging-quickstart-'))
  const realTemp = await realpath(tempDir)
  try {
    const tools = Object.fromEntries(createTools({ baseDir: tempDir }).map((tool) => [tool.name, tool]))
    const exec = { callId: 'quickstart' }

    const ingest = await tools['ar.ingest'].execute({ path: samplePath }, exec)
    const aging = await tools['ar.aging'].execute({ path: samplePath, as_of: AS_OF }, exec)
    const summary = await tools['ar.export'].execute(
      { path: samplePath, as_of: AS_OF, filename: 'ar-aging-summary.csv' },
      exec,
    )
    const detail = await tools['ar.export'].execute(
      { path: samplePath, as_of: AS_OF, filename: 'ar-aging-detail.csv', layout: 'detail' },
      exec,
    )
    const summaryText = await readFile(summary.path, 'utf8')
    const detailText = await readFile(detail.path, 'utf8')

    return {
      sample: 'samples/quickstart/input/ar-ledger.csv',
      as_of: AS_OF,
      ingest,
      aging,
      exports: {
        summary: {
          path: path.relative(realTemp, summary.path).split(path.sep).join('/'),
          sha256: summary.sha256,
          bytes: summary.bytes,
          rows: summary.rows,
          text: summaryText,
        },
        detail: {
          path: path.relative(realTemp, detail.path).split(path.sep).join('/'),
          sha256: detail.sha256,
          bytes: detail.bytes,
          rows: detail.rows,
          text: detailText,
        },
      },
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}

function printSummary(result) {
  const { ingest, aging } = result
  console.log('dsh-ar-aging quickstart - synthetic AR ledger (not customer data)')
  console.log(
    `${ingest.rows} invoices / ${ingest.customers} customers / ${ingest.currency}; outstanding ${money(ingest.outstanding_cents)} (${ingest.open_rows} open, ${ingest.settled_rows} settled)`,
  )
  console.log(
    `aging ${aging.as_of}: overdue ${money(aging.totals.overdue_cents)} of ${money(aging.totals.outstanding_cents)} (${(aging.totals.overdue_ratio * 100).toFixed(1)}%)`,
  )
  for (const bucket of aging.buckets) {
    console.log(`bucket ${bucket.key}: ${bucket.invoice_count} invoice(s), ${money(bucket.outstanding_cents)} (${(bucket.share * 100).toFixed(1)}%)`)
  }
  console.log('top overdue:')
  for (const customer of aging.top_overdue) {
    console.log(`  ${customer.customer}: ${money(customer.overdue_cents)} across ${customer.overdue_invoices} invoice(s), max ${customer.max_days_past_due}d`)
  }
  console.log(
    `summary CSV ${result.exports.summary.path}: ${result.exports.summary.rows} rows, ${result.exports.summary.bytes} bytes, sha256 ${result.exports.summary.sha256.slice(0, 12)}...`,
  )
  console.log(
    `detail CSV ${result.exports.detail.path}: ${result.exports.detail.rows} rows, ${result.exports.detail.bytes} bytes, sha256 ${result.exports.detail.sha256.slice(0, 12)}...`,
  )
}

const result = await run()

if (mode === 'json') {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
} else if (mode === 'check') {
  const expected = JSON.parse(await readFile(expectedPath, 'utf8'))
  assert.deepEqual(result, expected)
  printSummary(result)
  console.log('golden samples/quickstart/expected/result.json matches')
  console.log('quickstart ok')
} else {
  printSummary(result)
  console.log('run with --check to compare against expected/result.json')
}
