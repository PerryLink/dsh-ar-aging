#!/usr/bin/env node
/**
 * Acceptance checks over the public synthetic AR ledger. Writes ACCEPTANCE.csv
 * and evidence/<run_id>/result.json. No network, no customer data.
 *
 *   node scripts/acceptance.mjs
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createTools } from '../lib/plugin/tools.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const sample = path.join(root, 'samples', 'quickstart', 'input', 'ar-ledger.csv')
const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const errors = []

async function errorCode(promise) {
  try {
    await promise
    return 'NO_ERROR'
  } catch (error) {
    return error?.code ?? error?.name ?? 'UNKNOWN'
  }
}

async function main() {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'dsh-ar-aging-acceptance-'))
  const baseDir = path.join(tempDir, 'store')
  try {
    const tools = Object.fromEntries(createTools({ baseDir }).map((tool) => [tool.name, tool]))
    const exec = { callId: 'acceptance' }
    const asOf = '2026-06-30'

    const ingest = await tools['ar_ingest'].execute({ path: sample }, exec)
    const aging = await tools['ar_aging'].execute({ path: sample, as_of: asOf }, exec)
    const summary = await tools['ar_export'].execute({ path: sample, as_of: asOf, filename: 'acceptance-summary.csv' }, exec)
    const detail = await tools['ar_export'].execute(
      { path: sample, as_of: asOf, filename: 'acceptance-detail.csv', layout: 'detail' },
      exec,
    )
    const summaryText = readFileSync(summary.path, 'utf8')
    const detailText = readFileSync(detail.path, 'utf8')

    const badRowFile = path.join(tempDir, 'bad-row.csv')
    writeFileSync(badRowFile, 'customer,invoice_no,invoice_date,due_date,amount_cents,currency,paid_cents\n甲,INV-1,2026-06-01,2026-07-01,100000,CNY\n')
    const badDateFile = path.join(tempDir, 'bad-date.csv')
    writeFileSync(
      badDateFile,
      'customer,invoice_no,invoice_date,due_date,amount_cents,currency,paid_cents\n甲,INV-1,2026-02-30,2026-07-01,100000,CNY,0\n',
    )
    const badAmountFile = path.join(tempDir, 'bad-amount.csv')
    writeFileSync(
      badAmountFile,
      'customer,invoice_no,invoice_date,due_date,amount_cents,currency,paid_cents\n甲,INV-1,2026-06-01,2026-07-01,100000,CNY,100001\n',
    )

    const bucketCounts = aging.buckets.map((bucket) => bucket.invoice_count).join('/')
    const bucketSum = aging.buckets.reduce((sum, bucket) => sum + bucket.outstanding_cents, 0)
    const quoted = summaryText.includes('"江南纺织, 苏州"') && summaryText.split('\n').at(-2)?.startsWith('TOTAL,')

    // ACCEPTANCE.csv uses a simple comma-split schema: keep every field free of commas.
    const metrics = [
      {
        req_id: 'AR-A01',
        metric: 'ingest totals',
        threshold: 'rows=13 customers=6 outstanding=772500000',
        actual: `rows=${ingest.rows} customers=${ingest.customers} outstanding=${ingest.outstanding_cents}`,
        pass: ingest.rows === 13 && ingest.customers === 6 && ingest.outstanding_cents === 772_500_000,
      },
      {
        req_id: 'AR-A02',
        metric: 'aging buckets',
        threshold: 'counts=4/2/2/1/2 sum=772500000',
        actual: `counts=${bucketCounts} sum=${bucketSum}`,
        pass: bucketCounts === '4/2/2/1/2' && bucketSum === 772_500_000,
      },
      {
        req_id: 'AR-A03',
        metric: 'overdue ratio',
        threshold: 'overdue=549500000 ratio=0.7113',
        actual: `overdue=${aging.totals.overdue_cents} ratio=${aging.totals.overdue_ratio}`,
        pass: aging.totals.overdue_cents === 549_500_000 && aging.totals.overdue_ratio === 0.7113,
      },
      {
        req_id: 'AR-A04',
        metric: 'top overdue',
        threshold: 'count=5 first=330000000',
        actual: `count=${aging.top_overdue.length} first=${aging.top_overdue[0]?.overdue_cents ?? 0}`,
        pass: aging.top_overdue.length === 5 && aging.top_overdue[0]?.overdue_cents === 330_000_000,
      },
      {
        req_id: 'AR-A05',
        metric: 'summary CSV',
        threshold: 'rows=7 sha and quote ok',
        actual: `rows=${summary.rows} sha=${summary.sha256 === sha256(summaryText) ? 'ok' : 'bad'} quote=${quoted ? 'ok' : 'bad'}`,
        pass: summary.rows === 7 && summary.sha256 === sha256(summaryText) && quoted,
      },
      {
        req_id: 'AR-A06',
        metric: 'detail CSV',
        threshold: 'rows=11 lines=12',
        actual: `rows=${detail.rows} lines=${detailText.trimEnd().split('\n').length}`,
        pass: detail.rows === 11 && detailText.trimEnd().split('\n').length === 12,
      },
      {
        req_id: 'AR-A07',
        metric: 'bad CSV row',
        threshold: 'E_AR_CSV_ROW',
        actual: await errorCode(tools['ar_ingest'].execute({ path: badRowFile }, exec)),
        pass: (await errorCode(tools['ar_ingest'].execute({ path: badRowFile }, exec))) === 'E_AR_CSV_ROW',
      },
      {
        req_id: 'AR-A08',
        metric: 'invalid date',
        threshold: 'E_AR_DATE_INVALID',
        actual: await errorCode(tools['ar_ingest'].execute({ path: badDateFile }, exec)),
        pass: (await errorCode(tools['ar_ingest'].execute({ path: badDateFile }, exec))) === 'E_AR_DATE_INVALID',
      },
      {
        req_id: 'AR-A09',
        metric: 'invalid amount',
        threshold: 'E_AR_AMOUNT',
        actual: await errorCode(tools['ar_ingest'].execute({ path: badAmountFile }, exec)),
        pass: (await errorCode(tools['ar_ingest'].execute({ path: badAmountFile }, exec))) === 'E_AR_AMOUNT',
      },
      {
        req_id: 'AR-A10',
        metric: 'export path safety',
        threshold: 'traversal rejected',
        actual: await errorCode(
          tools['ar_export'].execute({ path: sample, as_of: asOf, filename: '../evil.csv' }, exec),
        ),
        pass:
          (await errorCode(tools['ar_export'].execute({ path: sample, as_of: asOf, filename: '../evil.csv' }, exec))) ===
          'E_AR_PATH_INVALID',
      },
    ]

    let quickstartPass = true
    try {
      execFileSync(process.execPath, ['samples/quickstart/run.mjs', '--check'], { cwd: root, stdio: 'ignore' })
    } catch {
      quickstartPass = false
    }
    const quickstartHash = sha256(readFileSync(path.join(root, 'samples', 'quickstart', 'expected', 'result.json')))
    const quickstart = {
      req_id: 'PS1-QS01',
      metric: 'quickstart golden',
      threshold: '1/1',
      actual: quickstartPass ? '1' : '0',
      pass: quickstartPass,
      evidence_sha256: quickstartHash,
    }

    const failures = metrics.filter((item) => !item.pass)
    for (const failure of failures) errors.push(`${failure.req_id} ${failure.metric}: ${failure.actual}`)
    if (!quickstartPass) errors.push('PS1-QS01 quickstart golden failed')

    const runId = `ar-aging-${Date.now()}`
    const evidence = {
      run_id: runId,
      scope: 'AR-AGING-S1',
      status: failures.length === 0 && quickstartPass ? 'pass' : 'fail',
      counted: false,
      note: 'synthetic AR ledger only; no customer data',
      metrics,
      pass: failures.length === 0 && quickstartPass,
    }
    const evidenceDir = path.join(root, 'evidence', runId)
    mkdirSync(evidenceDir, { recursive: true })
    const evidenceJson = `${JSON.stringify(evidence, null, 2)}\n`
    writeFileSync(path.join(evidenceDir, 'result.json'), evidenceJson)
    const evidenceHash = sha256(evidenceJson)

    const rows = [
      ...metrics.map(
        (item) =>
          `${item.req_id},${item.metric},${item.threshold},${item.actual},scripts/acceptance.mjs,${evidenceHash},${item.pass},public/synthetic,false`,
      ),
      `${quickstart.req_id},${quickstart.metric},${quickstart.threshold},${quickstart.actual},samples/quickstart/run.mjs,${quickstart.evidence_sha256},${quickstart.pass},synthetic/quickstart,true`,
    ]
    writeFileSync(
      path.join(root, 'ACCEPTANCE.csv'),
      `req_id,metric,threshold,actual,script,evidence_sha256,pass,source,counted\n${rows.join('\n')}\n`,
    )

    if (errors.length > 0) {
      for (const error of errors) console.error(`acceptance: ${error}`)
      process.exit(1)
    }
    console.log(`acceptance ok: ${metrics.length + 1} checks`)
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

await main()
