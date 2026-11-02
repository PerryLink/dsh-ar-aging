import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const expectedPath = path.join(packageRoot, 'samples', 'quickstart', 'expected', 'result.json')

test('the bundled quickstart input is a real UTF-8 AR ledger CSV', async () => {
  const text = await readFile(path.join(packageRoot, 'samples', 'quickstart', 'input', 'ar-ledger.csv'), 'utf8')
  assert.ok(text.startsWith('customer,invoice_no,invoice_date,due_date,amount_cents,currency,paid_cents\n'))
  assert.ok(text.includes('"江南纺织, 苏州"'))
  assert.equal(text.split('\n').filter((line) => line.trim() !== '').length, 14)
})

test('quickstart --check reproduces the committed golden result', () => {
  const result = spawnSync(process.execPath, ['samples/quickstart/run.mjs', '--check'], {
    cwd: packageRoot,
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr || result.stdout)
  assert.match(result.stdout, /bucket 0-30: 4 invoice\(s\), 2,230,000\.00/)
  assert.match(result.stdout, /golden samples\/quickstart\/expected\/result\.json matches/)
  assert.match(result.stdout, /quickstart ok/)
})

test('quickstart --json equals the committed golden file byte-for-byte after normalization', async () => {
  const result = spawnSync(process.execPath, ['samples/quickstart/run.mjs', '--json'], {
    cwd: packageRoot,
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr)
  const expected = JSON.parse(await readFile(expectedPath, 'utf8'))
  assert.deepEqual(JSON.parse(result.stdout), expected)
  assert.equal(expected.as_of, '2026-06-30')
  assert.equal(expected.aging.totals.overdue_ratio, 0.7113)
  assert.equal(expected.exports.summary.rows, 7)
  assert.equal(expected.exports.detail.rows, 11)
})
