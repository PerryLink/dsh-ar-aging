import { readFile, stat } from 'node:fs/promises'
import { ArAgingError } from './errors.js'

/** Local CSV limit: a single AR ledger should be far below this. */
export const MAX_SOURCE_BYTES = 20 * 1024 * 1024

/**
 * Read the user-named CSV. A missing path, a directory, or an unreadable file is
 * `E_AR_PATH_INVALID`; an empty or oversized file is `E_AR_CSV_ROW`.
 */
export async function readArSource(filePath: string): Promise<string> {
  if (typeof filePath !== 'string' || filePath.trim() === '') {
    throw new ArAgingError('E_AR_PATH_INVALID', 'path 为空')
  }
  const target = filePath.trim()
  let info
  try {
    info = await stat(target)
  } catch {
    throw new ArAgingError('E_AR_PATH_INVALID', `找不到 ${JSON.stringify(target)}，或当前用户读不到`)
  }
  if (!info.isFile()) throw new ArAgingError('E_AR_PATH_INVALID', `${JSON.stringify(target)} 不是文件`)
  if (info.size === 0) throw new ArAgingError('E_AR_CSV_ROW', 'CSV 是空文件')
  if (info.size > MAX_SOURCE_BYTES) {
    throw new ArAgingError('E_AR_CSV_ROW', `CSV 有 ${info.size} 字节，超过 20 MB 上限；请按客户或月份拆文件`)
  }
  try {
    return await readFile(target, 'utf8')
  } catch {
    throw new ArAgingError('E_AR_PATH_INVALID', `读不了 ${JSON.stringify(target)}；确认权限后重试`)
  }
}
