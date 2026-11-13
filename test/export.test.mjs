import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseCsv } from '../lib/core/csv.js'
import { exec, makeTemp, toolMap } from './helpers/fixtures.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sample = path.join(root, 'samples', 'quickstart', 'input', 'ar-ledger.csv')
const AS_OF = '2026-06-30'
const sha256 = (value) => createHash('sha256').update(value).digest('hex')

async function setup(t) {
  const dir = await makeTemp(t)
  const baseDir = path.join(dir, 'store')
  return { dir, baseDir, tools: toolMap(baseDir) }
}

test('ar_export writes the summary table with a TOTAL row and safe quoting', async (t) => {
  const { baseDir, tools } = await setup(t)
  const result = await tools['ar_export'].execute({ path: sample, as_of: AS_OF }, exec)
  assert.equal(result.layout, 'summary')
  assert.equal(result.rows, 7)
  assert.equal(result.as_of, AS_OF)
  assert.equal(result.outstanding_cents, 772_500_000)
  assert.equal(result.overdue_cents, 549_500_000)
  assert.equal(result.overdue_ratio, 0.7113)
  assert.ok(result.path.startsWith(`${baseDir}${path.sep}exports${path.sep}`), result.path)
  assert.equal(path.basename(result.path), 'ar-aging-2026-06-30-summary.csv')

  const text = await readFile(result.path, 'utf8')
  assert.equal(result.sha256, sha256(text))
  assert.equal(result.bytes, Buffer.byteLength(text, 'utf8'))
  const parsed = parseCsv(text)
  assert.equal(parsed.rows.length, 8)
  assert.deepEqual(parsed.rows[0], [
    'customer',
    '0-30',
    '31-60',
    '61-90',
    '91-180',
    '180+',
    'total_outstanding',
    'overdue',
    'overdue_ratio',
  ])
  assert.equal(parsed.rows.at(-1)[0], 'TOTAL')
  assert.equal(parsed.rows.at(-1)[6], '7725000.00')
  assert.ok(text.includes('"江南纺织, 苏州"'), text)
  assert.ok(text.includes('0.7113'))
})

test('ar_export detail layout writes one row per open invoice, sorted', async (t) => {
  const { tools } = await setup(t)
  const result = await tools['ar_export'].execute(
    { path: sample, as_of: AS_OF, filename: 'detail.csv', layout: 'detail' },
    exec,
  )
  assert.equal(result.layout, 'detail')
  assert.equal(result.rows, 11)
  const parsed = parseCsv(await readFile(result.path, 'utf8'))
  assert.equal(parsed.rows.length, 12)
  assert.deepEqual(parsed.rows[0], [
    'customer',
    'invoice_no',
    'invoice_date',
    'due_date',
    'age_days',
    'days_past_due',
    'bucket',
    'currency',
    'amount',
    'paid',
    'outstanding',
    'status',
  ])
  assert.equal(parsed.rows[1][0], '北方重工设备有限公司')
  assert.equal(parsed.rows[1][1], 'INV-2026-0022')
  assert.equal(parsed.rows[1][6], '180+')
  assert.equal(parsed.rows[1][11], 'overdue')
  assert.ok(parsed.rows.some((row) => row[11] === 'not_due'))
})

test('ar_export uses a default filename and returns a matching sha256', async (t) => {
  const { tools } = await setup(t)
  const result = await tools['ar_export'].execute({ path: sample, as_of: AS_OF, layout: 'detail' }, exec)
  assert.equal(path.basename(result.path), 'ar-aging-2026-06-30-detail.csv')
  const text = await readFile(result.path, 'utf8')
  assert.equal(result.sha256, sha256(text))
  assert.equal(result.bytes, Buffer.byteLength(text, 'utf8'))
})

test('ar_export rejects path traversal, absolute paths and spaces', async (t) => {
  const { tools } = await setup(t)
  for (const filename of ['../evil.csv', '../../evil.csv', '/tmp/evil.csv', 'a/b.csv', 'with space.csv', '表格.csv']) {
    await assert.rejects(
      () => tools['ar_export'].execute({ path: sample, as_of: AS_OF, filename }, exec),
      (error) => error.code === 'E_AR_PATH_INVALID',
      filename,
    )
  }
})

test('a second export to the same file overwrites it atomically enough for a rerun', async (t) => {
  const { tools } = await setup(t)
  const first = await tools['ar_export'].execute({ path: sample, as_of: AS_OF, filename: 'same.csv' }, exec)
  const second = await tools['ar_export'].execute({ path: sample, as_of: AS_OF, filename: 'same.csv' }, exec)
  assert.equal(first.path, second.path)
  assert.equal(first.sha256, second.sha256)
})
