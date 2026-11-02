import test from 'node:test'
import assert from 'node:assert/strict'
import { ingestArCsv } from '../lib/core/ar.js'
import { bucketForAge, buildAgingContext } from '../lib/core/aging.js'
import { assertErrorCode, ledgerCsv } from './helpers/fixtures.mjs'

const BOUNDARY_ROWS = [
  ['甲公司', 'INV-000', '2026-06-30'],
  ['甲公司', 'INV-030', '2026-05-31'],
  ['甲公司', 'INV-031', '2026-05-30'],
  ['甲公司', 'INV-060', '2026-05-01'],
  ['甲公司', 'INV-061', '2026-04-30'],
  ['甲公司', 'INV-090', '2026-04-01'],
  ['甲公司', 'INV-091', '2026-03-31'],
  ['甲公司', 'INV-180', '2026-01-01'],
  ['甲公司', 'INV-181', '2025-12-31'],
].map(([customer, invoice, date]) => `${customer},${invoice},${date},2027-01-01,100,CNY,0`)

test('bucketForAge maps every boundary to exactly one bucket', () => {
  assert.equal(bucketForAge(0).key, '0-30')
  assert.equal(bucketForAge(30).key, '0-30')
  assert.equal(bucketForAge(31).key, '31-60')
  assert.equal(bucketForAge(60).key, '31-60')
  assert.equal(bucketForAge(61).key, '61-90')
  assert.equal(bucketForAge(90).key, '61-90')
  assert.equal(bucketForAge(91).key, '91-180')
  assert.equal(bucketForAge(180).key, '91-180')
  assert.equal(bucketForAge(181).key, '180+')
  assert.equal(bucketForAge(900).key, '180+')
})

test('buildAgingContext assigns boundary invoices to the documented buckets', () => {
  const dataset = ingestArCsv(ledgerCsv(BOUNDARY_ROWS))
  const context = buildAgingContext(dataset, '2026-06-30')
  assert.deepEqual(
    context.open.map((item) => [item.invoice.invoiceNo, item.ageDays, item.bucket]),
    [
      ['INV-000', 0, '0-30'],
      ['INV-030', 30, '0-30'],
      ['INV-031', 31, '31-60'],
      ['INV-060', 60, '31-60'],
      ['INV-061', 61, '61-90'],
      ['INV-090', 90, '61-90'],
      ['INV-091', 91, '91-180'],
      ['INV-180', 180, '91-180'],
      ['INV-181', 181, '180+'],
    ],
  )
  assert.deepEqual(
    context.buckets.map((bucket) => [bucket.definition.key, bucket.invoiceCount]),
    [
      ['0-30', 2],
      ['31-60', 2],
      ['61-90', 2],
      ['91-180', 2],
      ['180+', 1],
    ],
  )
})

test('an as_of earlier than an invoice date is E_AR_DATE_INVALID', () => {
  const dataset = ingestArCsv(ledgerCsv(['甲公司,INV-1,2026-07-01,2026-08-01,100,CNY,0']))
  assert.throws(() => buildAgingContext(dataset, '2026-06-30'), (error) => assertErrorCode(error, 'E_AR_DATE_INVALID'))
})

test('an invalid as_of is E_AR_DATE_INVALID before any aging math', () => {
  const dataset = ingestArCsv(ledgerCsv(['甲公司,INV-1,2026-06-01,2026-07-01,100,CNY,0']))
  assert.throws(() => buildAgingContext(dataset, '2026-02-30'), /E_AR_DATE_INVALID/)
  assert.throws(() => buildAgingContext(dataset, 'yesterday'), /E_AR_DATE_INVALID/)
})

test('settled invoices are excluded from buckets but counted in totals', () => {
  const dataset = ingestArCsv(
    ledgerCsv([
      '甲公司,INV-1,2026-06-01,2026-07-01,100000,CNY,100000',
      '乙公司,INV-2,2026-06-01,2026-07-01,50000,CNY,0',
    ]),
  )
  const context = buildAgingContext(dataset, '2026-06-30')
  assert.equal(context.open.length, 1)
  assert.equal(context.totals.invoices, 2)
  assert.equal(context.totals.settledInvoices, 1)
  assert.equal(context.totals.outstandingCents, 50000)
})
