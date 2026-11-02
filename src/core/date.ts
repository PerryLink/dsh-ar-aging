import { ArAgingError } from './errors.js'

export const MS_PER_DAY = 86_400_000

/**
 * Parse a strict `YYYY-MM-DD` calendar date into UTC midnight milliseconds.
 * Rejects impossible dates such as 2026-02-30 and years outside 1900–2999.
 */
export function parseIsoDate(value: string, label = '日期'): number {
  if (typeof value !== 'string') {
    throw new ArAgingError('E_AR_DATE_INVALID', `${label}：${JSON.stringify(value)} 不是字符串`)
  }
  const text = value.trim()
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
  if (!match) {
    throw new ArAgingError('E_AR_DATE_INVALID', `${label}：${JSON.stringify(value)} 不是 YYYY-MM-DD`)
  }
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (year < 1900 || year > 2999) {
    throw new ArAgingError('E_AR_DATE_INVALID', `${label}：年份 ${year} 超出 1900–2999`)
  }
  const ms = Date.UTC(year, month - 1, day)
  const check = new Date(ms)
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    throw new ArAgingError('E_AR_DATE_INVALID', `${label}：${JSON.stringify(value)} 不是真实存在的日期`)
  }
  return ms
}

/** Whole days from `fromMs` to `toMs`; positive when `toMs` is later. */
export function daysBetween(fromMs: number, toMs: number): number {
  return Math.round((toMs - fromMs) / MS_PER_DAY)
}

/** Render UTC midnight milliseconds back as `YYYY-MM-DD`. */
export function formatIsoDate(ms: number): string {
  const date = new Date(ms)
  const year = String(date.getUTCFullYear()).padStart(4, '0')
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Round a 0..1 ratio to four decimals without negative zero. */
export function roundRatio(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0
  return Math.round(value * 10_000) / 10_000
}
