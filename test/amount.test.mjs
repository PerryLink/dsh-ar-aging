import test from 'node:test'
import assert from 'node:assert/strict'
import { ingestArCsv } from '../lib/core/ar.js'
import { formatCents, parseCents } from '../lib/core/money.js'
import { assertErrorCode, ledgerCsv } from './helpers/fixtures.mjs'

test('parseCents accepts integer cents with separators and spaces', () => {
  assert.equal(parseCents('128,000,000', '金额分'), 128000000)
  assert.equal(parseCents(' 1 000 ', '金额分'), 1000)
  assert.equal(parseCents('1_000', '金额分'), 1000)
  assert.equal(parseCents('0', '金额分'), 0)
})

test('parseCents rejects decimals, negatives, text and unsafe integers', () => {
  for (const value of ['12.34', '-1', 'abc', '1e6', '']) {
    assert.throws(() => parseCents(value, '金额分'), (error) => assertErrorCode(error, 'E_AR_AMOUNT'))
  }
  assert.throws(() => parseCents('9'.repeat(20), '金额分'), /E_AR_AMOUNT/)
})

test('parseCents rejects zero when the amount must be positive', () => {
  assert.throws(
    () => parseCents('0', '金额分', { allowZero: false }),
    (error) => assertErrorCode(error, 'E_AR_AMOUNT'),
  )
})

test('formatCents always renders two decimals', () => {
  assert.equal(formatCents(0), '0.00')
  assert.equal(formatCents(5), '0.05')
  assert.equal(formatCents(128000000), '1280000.00')
  assert.equal(formatCents(-130), '-1.30')
})

test('a paid amount above the invoice amount is E_AR_AMOUNT', () => {
  const csv = ledgerCsv(['甲公司,INV-1,2026-06-01,2026-07-01,100000,CNY,100001'])
  assert.throws(() => ingestArCsv(csv), (error) => assertErrorCode(error, 'E_AR_AMOUNT'))
})

test('a fully paid invoice is kept but counted as settled', () => {
  const csv = ledgerCsv([
    '甲公司,INV-1,2026-06-01,2026-07-01,100000,CNY,100000',
    '乙公司,INV-2,2026-06-01,2026-07-01,50000,CNY,0',
  ])
  const dataset = ingestArCsv(csv)
  assert.equal(dataset.settledRows, 1)
  assert.equal(dataset.openRows, 1)
  assert.equal(dataset.outstandingCents, 50000)
})

test('a zero invoice amount is E_AR_AMOUNT', () => {
  const csv = ledgerCsv(['甲公司,INV-1,2026-06-01,2026-07-01,0,CNY,0'])
  assert.throws(() => ingestArCsv(csv), (error) => assertErrorCode(error, 'E_AR_AMOUNT'))
})
