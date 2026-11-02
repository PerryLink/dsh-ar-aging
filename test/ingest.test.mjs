import test from 'node:test'
import assert from 'node:assert/strict'
import { ingestArCsv, toIngestSummary } from '../lib/core/ar.js'
import { assertErrorCode, ledgerCsv, HEADER } from './helpers/fixtures.mjs'

const ROWS = [
  '甲公司,INV-1,2026-06-01,2026-07-01,100000,CNY,20000',
  '乙公司,INV-2,2026-05-01,2026-06-01,50000,CNY,0',
]

test('ingestArCsv accepts English headers and returns totals plus a preview', () => {
  const dataset = ingestArCsv(ledgerCsv(ROWS))
  assert.equal(dataset.rows, 2)
  assert.equal(dataset.currency, 'CNY')
  assert.equal(dataset.customers.length, 2)
  assert.equal(dataset.totalCents, 150000)
  assert.equal(dataset.paidCents, 20000)
  assert.equal(dataset.outstandingCents, 130000)
  assert.equal(dataset.settledRows, 0)
  assert.equal(dataset.openRows, 2)
  assert.equal(dataset.sourceSha256.length, 64)
  const summary = toIngestSummary(dataset)
  assert.equal(summary.preview.length, 2)
  assert.equal(summary.preview[0].invoice_no, 'INV-1')
  assert.equal(summary.preview[0].outstanding_cents, 80000)
})

test('ingestArCsv accepts Chinese header aliases and parentheses', () => {
  const csv = ledgerCsv(
    ['甲公司,INV-1,2026-06-01,2026-07-01,100000,CNY,20000', '乙公司,INV-2,2026-05-01,2026-06-01,50000,CNY,0'],
    '客户,发票号,开票日,到期日,金额分,币种,已收金额(分)',
  )
  const dataset = ingestArCsv(csv)
  assert.equal(dataset.currency, 'CNY')
  assert.equal(dataset.outstandingCents, 130000)
  assert.deepEqual(dataset.customers, ['乙公司', '甲公司'])
})

test('ingestArCsv ignores unknown extra columns but still checks the row width', () => {
  const csv = `${HEADER},notes\n甲公司,INV-1,2026-06-01,2026-07-01,100000,CNY,0,hello\n`
  assert.equal(ingestArCsv(csv).rows, 1)
  assert.throws(
    () => ingestArCsv(`${HEADER},notes\n甲公司,INV-1,2026-06-01,2026-07-01,100000,CNY,0\n`),
    (error) => assertErrorCode(error, 'E_AR_CSV_ROW'),
  )
})

test('ingestArCsv rejects duplicate invoice numbers', () => {
  const csv = ledgerCsv([
    '甲公司,INV-1,2026-06-01,2026-07-01,100000,CNY,0',
    '乙公司,INV-1,2026-06-01,2026-07-01,100000,CNY,0',
  ])
  assert.throws(() => ingestArCsv(csv), /E_AR_CSV_ROW.*重复/)
})

test('ingestArCsv rejects mixed currencies and bad currency codes', () => {
  const mixed = ledgerCsv([
    '甲公司,INV-1,2026-06-01,2026-07-01,100000,CNY,0',
    '乙公司,INV-2,2026-06-01,2026-07-01,100000,USD,0',
  ])
  assert.throws(() => ingestArCsv(mixed), /E_AR_CSV_ROW.*币种/)
  const bad = ledgerCsv(['甲公司,INV-1,2026-06-01,2026-07-01,100000,CN,0'])
  assert.throws(() => ingestArCsv(bad), /E_AR_CSV_ROW.*币种/)
})

test('ingestArCsv names missing headers and empty data sets', () => {
  assert.throws(() => ingestArCsv(''), /E_AR_CSV_ROW/)
  assert.throws(() => ingestArCsv('customer,invoice_no\n甲,INV-1\n'), /E_AR_CSV_ROW.*表头缺少/)
  assert.throws(() => ingestArCsv(`${HEADER}\n`), /E_AR_CSV_ROW.*只有表头/)
})

test('ingestArCsv rejects an empty customer and a due date before the invoice date', () => {
  assert.throws(
    () => ingestArCsv(ledgerCsv([',INV-1,2026-06-01,2026-07-01,100000,CNY,0'])),
    /E_AR_CSV_ROW.*客户为空/,
  )
  assert.throws(
    () => ingestArCsv(ledgerCsv(['甲公司,INV-1,2026-06-01,2026-05-01,100000,CNY,0'])),
    (error) => assertErrorCode(error, 'E_AR_DATE_INVALID'),
  )
})
