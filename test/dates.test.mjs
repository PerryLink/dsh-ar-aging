import test from 'node:test'
import assert from 'node:assert/strict'
import { daysBetween, formatIsoDate, parseIsoDate, roundRatio } from '../lib/core/date.js'
import { assertErrorCode } from './helpers/fixtures.mjs'

test('parseIsoDate accepts real calendar dates', () => {
  assert.equal(formatIsoDate(parseIsoDate('2026-06-30')), '2026-06-30')
  assert.equal(formatIsoDate(parseIsoDate('2024-02-29')), '2024-02-29')
  assert.equal(formatIsoDate(parseIsoDate(' 2025-12-01 ')), '2025-12-01')
})

test('parseIsoDate rejects impossible, malformed and out-of-range dates', () => {
  for (const value of ['2026-02-29', '2026-13-01', '2026-00-10', '2026-04-31', '2026-6-1', '01/06/2026', '']) {
    assert.throws(() => parseIsoDate(value, 'as_of'), (error) => assertErrorCode(error, 'E_AR_DATE_INVALID'))
  }
  assert.throws(() => parseIsoDate('1899-12-31', 'as_of'), /E_AR_DATE_INVALID/)
  assert.throws(() => parseIsoDate('3000-01-01', 'as_of'), /E_AR_DATE_INVALID/)
})

test('daysBetween counts whole UTC days across month and year boundaries', () => {
  const from = parseIsoDate('2025-12-31')
  const to = parseIsoDate('2026-01-01')
  assert.equal(daysBetween(from, to), 1)
  assert.equal(daysBetween(parseIsoDate('2026-01-01'), parseIsoDate('2026-06-30')), 180)
  assert.equal(daysBetween(parseIsoDate('2026-06-30'), parseIsoDate('2026-06-30')), 0)
  assert.equal(daysBetween(parseIsoDate('2026-06-30'), parseIsoDate('2026-06-28')), -2)
})

test('roundRatio keeps four decimals and never returns negative zero', () => {
  assert.equal(roundRatio(549_500_000 / 772_500_000), 0.7113)
  assert.equal(roundRatio(0), 0)
  assert.equal(roundRatio(-0.2), 0)
  assert.equal(roundRatio(Number.NaN), 0)
})
