import { ArAgingError } from './errors.js'

const INTEGER_CENTS = /^\d+$/

/**
 * Parse a non-negative integer amount in cents. Thousands separators, spaces and
 * underscores are ignored; decimals are rejected because the column is 金额分.
 */
export function parseCents(value: string, label: string, options: { allowZero: boolean } = { allowZero: true }): number {
  const text = value.trim().replace(/[,\s_]/g, '')
  if (!INTEGER_CENTS.test(text)) {
    throw new ArAgingError('E_AR_AMOUNT', `${label}：${JSON.stringify(value)} 不是整数分`)
  }
  const cents = Number(text)
  if (!Number.isSafeInteger(cents)) {
    throw new ArAgingError('E_AR_AMOUNT', `${label}：${JSON.stringify(value)} 超出安全整数范围`)
  }
  if (!options.allowZero && cents === 0) {
    throw new ArAgingError('E_AR_AMOUNT', `${label}：金额必须大于 0`)
  }
  return cents
}

/** Render integer cents as a two-decimal amount string, e.g. 128000000 -> 1280000.00. */
export function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const absolute = Math.abs(Math.trunc(cents))
  return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, '0')}`
}
