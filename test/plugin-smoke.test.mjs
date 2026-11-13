import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as plugin from '../lib/plugin/index.js'
import { createTools } from '../lib/plugin/tools.js'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const samplePath = path.join(packageRoot, 'samples', 'quickstart', 'input', 'ar-ledger.csv')

test('createTools exposes the three ar_* tools with unique names', () => {
  const tools = createTools({ baseDir: path.join(os.tmpdir(), 'dsh-ar-aging-smoke') })
  assert.deepEqual(
    tools.map((tool) => tool.name),
    ['ar_ingest', 'ar_aging', 'ar_export'],
  )
  assert.equal(new Set(tools.map((tool) => tool.name)).size, 3)
  for (const tool of tools) {
    assert.ok(tool.name.startsWith('ar_'))
    assert.ok(tool.description.length > 0)
    assert.equal(typeof tool.execute, 'function')
    assert.equal(typeof tool.output.render, 'function')
  }
})

test('resolveBaseDir defaults to $DSH_HOME/dsh-ar-aging and honours the override', () => {
  assert.equal(plugin.resolveBaseDir({ DSH_HOME: '/tmp/dsh-home' }), path.join('/tmp/dsh-home', 'dsh-ar-aging'))
  assert.equal(
    plugin.resolveBaseDir({ DSH_HOME: '/tmp/dsh-home', DSH_AR_AGING_HOME: '/tmp/ar-home' }),
    '/tmp/ar-home',
  )
})

test('apply() registers the tools and wires the documented write root', async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dsh-ar-aging-apply-'))
  const previous = process.env.DSH_AR_AGING_HOME
  process.env.DSH_AR_AGING_HOME = dir
  t.after(async () => {
    if (previous === undefined) delete process.env.DSH_AR_AGING_HOME
    else process.env.DSH_AR_AGING_HOME = previous
    await rm(dir, { recursive: true, force: true })
  })

  const registered = []
  await plugin.apply({ tools: { register(tool) { registered.push(tool) } } })
  assert.equal(plugin.name, 'dsh-ar-aging')
  assert.deepEqual(plugin.inject, ['tools'])
  assert.equal(registered.length, 3)

  const exporter = registered.find((tool) => tool.name === 'ar_export')
  const result = await exporter.execute({ path: samplePath, as_of: '2026-06-30', filename: 'apply.csv' }, { callId: 'apply' })
  assert.ok(result.path.startsWith(`${dir}${path.sep}exports${path.sep}`), result.path)
  assert.equal(result.rows, 7)
})

test('every tool render returns one text block', async () => {
  const tools = Object.fromEntries(
    createTools({ baseDir: path.join(os.tmpdir(), 'dsh-ar-aging-render') }).map((tool) => [tool.name, tool]),
  )
  const ingest = await tools['ar_ingest'].execute({ path: samplePath }, { callId: 'render' })
  const rendered = tools['ar_ingest'].output.render({ path: samplePath }, ingest)
  assert.equal(rendered.length, 1)
  assert.equal(rendered[0].type, 'text')
  assert.match(rendered[0].text, /AR ingest: 13 rows/)
})
