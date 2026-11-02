import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { rm } from 'node:fs/promises'
import { createTools } from '../../lib/plugin/tools.js'

export const HEADER = 'customer,invoice_no,invoice_date,due_date,amount_cents,currency,paid_cents'

export function ledgerCsv(rows, header = HEADER) {
  return `${header}\n${rows.join('\n')}\n`
}

export async function makeTemp(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dsh-ar-aging-test-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  return dir
}

export async function writeTextFile(dir, name, content) {
  const file = path.join(dir, name)
  await writeFile(file, content)
  return file
}

export async function writeLedger(dir, name, rows, header = HEADER) {
  return writeTextFile(dir, name, ledgerCsv(rows, header))
}

export function toolMap(baseDir) {
  return Object.fromEntries(createTools({ baseDir }).map((tool) => [tool.name, tool]))
}

export const exec = { callId: 'test' }

export function assertErrorCode(error, code) {
  assert.equal(error?.code, code, `expected ${code}, got ${error?.code}: ${error?.message}`)
  assert.match(error.message, new RegExp(`${code}`))
  assert.match(error.message, /下一步：/)
  return true
}
