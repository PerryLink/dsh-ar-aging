import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildAgingContext, toAgingReport } from '../lib/core/aging.js'
import { ingestArCsv } from '../lib/core/ar.js'
import { exec, ledgerCsv, makeTemp, toolMap, writeLedger } from './helpers/fixtures.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sample = path.join(root, 'samples', 'quickstart', 'input', 'ar-ledger.csv')
const baseDir = path.join(os.tmpdir(), 'dsh-ar-aging-unit')

test('the bundled AR ledger produces the documented aging totals', async () => {
  const report = await toolMap(baseDir)['ar.aging'].execute({ path: sample, as_of: '2026-06-30' }, exec)
  assert.equal(report.as_of, '2026-06-30')
  assert.equal(report.currency, 'CNY')
  assert.equal(report.totals.invoices, 13)
  assert.equal(report.totals.open_invoices, 11)
  assert.equal(report.totals.settled_invoices, 2)
  assert.equal(report.totals.outstanding_cents, 772_500_000)
  assert.equal(report.totals.overdue_cents, 549_500_000)
  assert.equal(report.totals.not_due_cents, 223_000_000)
  assert.equal(report.totals.overdue_ratio, 0.7113)
})

test('bucket counts, amounts and shares reconcile to the outstanding total', async () => {
  const report = await toolMap(baseDir)['ar.aging'].execute(
    { path: sample, as_of: '2026-06-30' },
    exec,
  )
  assert.deepEqual(
    report.buckets.map((bucket) => [bucket.key, bucket.invoice_count, bucket.outstanding_cents]),
    [
      ['0-30', 4, 223_000_000],
      ['31-60', 2, 162_000_000],
      ['61-90', 2, 45_500_000],
      ['91-180', 1, 210_000_000],
      ['180+', 2, 132_000_000],
    ],
  )
  assert.equal(report.buckets.reduce((sum, bucket) => sum + bucket.outstanding_cents, 0), 772_500_000)
  assert.ok(Math.abs(report.buckets.reduce((sum, bucket) => sum + bucket.share, 0) - 1) < 0.001)
  assert.equal(report.buckets.at(-1).max_days, null)
})

test('customer summary is sorted by outstanding and carries per-bucket amounts', async () => {
  const report = await toolMap(baseDir)['ar.aging'].execute(
    { path: sample, as_of: '2026-06-30' },
    exec,
  )
  assert.equal(report.customers.length, 6)
  assert.equal(report.customers[0].customer, '北方重工设备有限公司')
  assert.equal(report.customers[0].outstanding_cents, 330_000_000)
  assert.equal(report.customers[0].overdue_cents, 330_000_000)
  assert.equal(report.customers[0].overdue_ratio, 1)
  assert.equal(report.customers[0].buckets['91-180'], 210_000_000)
  assert.equal(report.customers[0].buckets['180+'], 120_000_000)
  assert.deepEqual(
    report.customers.map((customer) => customer.outstanding_cents),
    [...report.customers.map((customer) => customer.outstanding_cents)].sort((left, right) => right - left),
  )
})

test('top overdue customers are ranked by overdue amount and honour top_n', async () => {
  const tools = toolMap(baseDir)
  const report = await tools['ar.aging'].execute({ path: sample, as_of: '2026-06-30', top_n: 3 }, exec)
  assert.equal(report.top_overdue.length, 3)
  assert.deepEqual(
    report.top_overdue.map((customer) => [customer.customer, customer.overdue_cents, customer.overdue_invoices]),
    [
      ['北方重工设备有限公司', 330_000_000, 2],
      ['华东精密制造有限公司', 96_000_000, 1],
      ['江南纺织, 苏州', 66_000_000, 1],
    ],
  )
  assert.equal(report.top_overdue[0].max_days_past_due, 177)
  const clampedLow = await tools['ar.aging'].execute({ path: sample, as_of: '2026-06-30', top_n: 0 }, exec)
  assert.equal(clampedLow.top_overdue.length, 1)
  const clampedHigh = await tools['ar.aging'].execute({ path: sample, as_of: '2026-06-30', top_n: 999 }, exec)
  assert.equal(clampedHigh.top_overdue.length, 6)
})

test('a fully settled ledger reports zero outstanding and an empty top list', async (t) => {
  const dir = await makeTemp(t)
  const file = await writeLedger(dir, 'settled.csv', ['甲公司,INV-1,2026-06-01,2026-07-01,100000,CNY,100000'])
  const report = await toolMap(path.join(dir, 'store'))['ar.aging'].execute(
    { path: file, as_of: '2026-06-30' },
    exec,
  )
  assert.equal(report.totals.outstanding_cents, 0)
  assert.equal(report.totals.overdue_ratio, 0)
  assert.equal(report.totals.open_invoices, 0)
  assert.deepEqual(report.top_overdue, [])
  assert.deepEqual(report.buckets.map((bucket) => bucket.share), [0, 0, 0, 0, 0])
})

test('an invoice due exactly on as_of is not overdue', () => {
  const dataset = ingestArCsv(ledgerCsv(['甲公司,INV-1,2026-06-01,2026-06-30,100000,CNY,0']))
  const report = toAgingReport(buildAgingContext(dataset, '2026-06-30'))
  assert.equal(report.totals.overdue_cents, 0)
  assert.equal(report.customers[0].overdue_ratio, 0)
})
