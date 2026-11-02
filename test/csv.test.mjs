import test from 'node:test'
import assert from 'node:assert/strict'
import { csvField, parseCsv, toCsv } from '../lib/core/csv.js'

test('parseCsv reads simple rows and keeps the physical line numbers', () => {
  const parsed = parseCsv('a,b\n1,2\n3,4\n')
  assert.deepEqual(parsed.rows, [
    ['a', 'b'],
    ['1', '2'],
    ['3', '4'],
  ])
  assert.deepEqual(parsed.lines, [1, 2, 3])
})

test('parseCsv handles quoted commas, doubled quotes and embedded newlines', () => {
  const parsed = parseCsv('name,note\n"江南纺织, 苏州","Q1 ""units"""\n"line1\nline2",ok\n')
  assert.deepEqual(parsed.rows, [
    ['name', 'note'],
    ['江南纺织, 苏州', 'Q1 "units"'],
    ['line1\nline2', 'ok'],
  ])
  assert.deepEqual(parsed.lines, [1, 2, 3])
})

test('parseCsv accepts CRLF, a UTF-8 BOM and blank lines', () => {
  const parsed = parseCsv('\ufeffa,b\r\n1,2\r\n\r\n3,4\r\n')
  assert.deepEqual(parsed.rows, [
    ['a', 'b'],
    ['1', '2'],
    ['3', '4'],
  ])
  assert.deepEqual(parsed.lines, [1, 2, 4])
})

test('parseCsv keeps empty trailing fields', () => {
  assert.deepEqual(parseCsv('a,b,c\n1,,\n').rows[1], ['1', '', ''])
})

test('parseCsv rejects malformed quoting and NUL bytes', () => {
  assert.throws(() => parseCsv('a,b\n"unclosed,2\n'), /E_AR_CSV_ROW/)
  assert.throws(() => parseCsv('a,b\nab"cd,2\n'), /E_AR_CSV_ROW/)
  assert.throws(() => parseCsv('a,b\n"x"y,2\n'), /E_AR_CSV_ROW/)
  assert.throws(() => parseCsv('a,b\n1,2\u0000\n'), /E_AR_CSV_ROW/)
})

test('csvField quotes only when needed and doubles embedded quotes', () => {
  assert.equal(csvField('plain'), 'plain')
  assert.equal(csvField('江南纺织, 苏州'), '"江南纺织, 苏州"')
  assert.equal(csvField('Q1 "units"'), '"Q1 ""units"""')
  assert.equal(csvField('a\nb'), '"a\nb"')
})

test('toCsv joins rows with LF and keeps a trailing newline', () => {
  assert.equal(toCsv([]), '')
  assert.equal(toCsv([['a', 'b,c'], ['d"e', '']]), 'a,"b,c"\n"d""e",\n')
})
