import { createHash } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { ingestArCsv, toIngestSummary, type IngestSummary } from '../core/ar.js'
import { buildAgingContext, toAgingReport, type AgingReport } from '../core/aging.js'
import { exportCsv, type ExportLayout } from '../core/export.js'
import { ArAgingError } from '../core/errors.js'
import { formatCents } from '../core/money.js'
import { safeExportPath } from '../core/safe-path.js'
import { readArSource } from '../core/source.js'

export interface ToolDeps {
  /** Local write root; the plugin uses `$DSH_HOME/dsh-ar-aging`. */
  baseDir: string
}

const text = (value: string) => [{ type: 'text' as const, text: value }]
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')

async function load(sourcePath: string) {
  return ingestArCsv(await readArSource(sourcePath))
}

export function createTools(deps: ToolDeps) {
  const ingest = defineTool({
    name: 'ar.ingest',
    description:
      'Validate and normalize a local AR ledger CSV (customer, invoice_no, invoice_date, due_date, amount_cents, currency, paid_cents). Returns totals and a 5-row preview; one file must use one currency. Read-only.',
    parameters: { path: { type: 'string', required: true } },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          source_sha256: { type: 'string', required: true },
          rows: { type: 'number', required: true },
          customers: { type: 'number', required: true },
          currency: { type: 'string', required: true },
          invoice_date_min: { type: 'string', required: true },
          invoice_date_max: { type: 'string', required: true },
          due_date_min: { type: 'string', required: true },
          due_date_max: { type: 'string', required: true },
          total_cents: { type: 'number', required: true },
          paid_cents: { type: 'number', required: true },
          outstanding_cents: { type: 'number', required: true },
          settled_rows: { type: 'number', required: true },
          open_rows: { type: 'number', required: true },
          preview: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                customer: { type: 'string', required: true },
                invoice_no: { type: 'string', required: true },
                invoice_date: { type: 'string', required: true },
                due_date: { type: 'string', required: true },
                amount_cents: { type: 'number', required: true },
                currency: { type: 'string', required: true },
                paid_cents: { type: 'number', required: true },
                outstanding_cents: { type: 'number', required: true },
              },
            },
          },
        },
      },
      render: (_args, value: IngestSummary) =>
        text(
          `AR ingest: ${value.rows} rows, ${value.customers} customers, ${value.currency}, outstanding ${formatCents(value.outstanding_cents)} (${value.open_rows} open / ${value.settled_rows} settled)`,
        ),
    },
    async execute(args) {
      return toIngestSummary(await load(args.path))
    },
  })

  const aging = defineTool({
    name: 'ar.aging',
    description:
      'Bucket open AR invoices by age at as_of into 0-30/31-60/61-90/91-180/180+ days (age counts from invoice_date), then return customer totals, overdue ratio (by due_date) and the top overdue customers. Read-only.',
    parameters: {
      path: { type: 'string', required: true },
      as_of: { type: 'string', required: true },
      top_n: { type: 'number' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          as_of: { type: 'string', required: true },
          currency: { type: 'string', required: true },
          totals: {
            type: 'object',
            additionalProperties: false,
            required: true,
            properties: {
              invoices: { type: 'number', required: true },
              open_invoices: { type: 'number', required: true },
              settled_invoices: { type: 'number', required: true },
              amount_cents: { type: 'number', required: true },
              paid_cents: { type: 'number', required: true },
              outstanding_cents: { type: 'number', required: true },
              overdue_cents: { type: 'number', required: true },
              not_due_cents: { type: 'number', required: true },
              overdue_ratio: { type: 'number', required: true },
            },
          },
          buckets: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                key: { type: 'string', required: true },
                label: { type: 'string', required: true },
                min_days: { type: 'number', required: true },
                max_days: { oneOf: [{ type: 'number' }, { type: 'null' }], required: true },
                invoice_count: { type: 'number', required: true },
                outstanding_cents: { type: 'number', required: true },
                share: { type: 'number', required: true },
              },
            },
          },
          customers: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                customer: { type: 'string', required: true },
                invoice_count: { type: 'number', required: true },
                outstanding_cents: { type: 'number', required: true },
                overdue_cents: { type: 'number', required: true },
                not_due_cents: { type: 'number', required: true },
                overdue_ratio: { type: 'number', required: true },
                max_days_past_due: { type: 'number', required: true },
                buckets: {
                  type: 'object',
                  additionalProperties: false,
                  required: true,
                  properties: {
                    '0-30': { type: 'number', required: true },
                    '31-60': { type: 'number', required: true },
                    '61-90': { type: 'number', required: true },
                    '91-180': { type: 'number', required: true },
                    '180+': { type: 'number', required: true },
                  },
                },
              },
            },
          },
          top_overdue: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                customer: { type: 'string', required: true },
                overdue_cents: { type: 'number', required: true },
                overdue_invoices: { type: 'number', required: true },
                max_days_past_due: { type: 'number', required: true },
              },
            },
          },
        },
      },
      render: (_args, value: AgingReport) =>
        text(
          `AR aging ${value.as_of}: outstanding ${formatCents(value.totals.outstanding_cents)}, overdue ${formatCents(value.totals.overdue_cents)} (${(value.totals.overdue_ratio * 100).toFixed(1)}%), top overdue ${value.top_overdue.length} customer(s)`,
        ),
    },
    async execute(args) {
      const context = buildAgingContext(await load(args.path), args.as_of)
      return toAgingReport(context, args.top_n ?? 5)
    },
  })

  const exportTool = defineTool({
    name: 'ar.export',
    description:
      'Write the AR aging table as CSV under $DSH_HOME/dsh-ar-aging/exports. layout=summary (customer x bucket + TOTAL) or detail (one row per open invoice); returns path, sha256, bytes and rows.',
    parameters: {
      path: { type: 'string', required: true },
      as_of: { type: 'string', required: true },
      filename: { type: 'string' },
      layout: { type: 'string', enum: ['summary', 'detail'] },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          path: { type: 'string', required: true },
          sha256: { type: 'string', required: true },
          bytes: { type: 'number', required: true },
          rows: { type: 'number', required: true },
          layout: { type: 'string', required: true },
          as_of: { type: 'string', required: true },
          currency: { type: 'string', required: true },
          outstanding_cents: { type: 'number', required: true },
          overdue_cents: { type: 'number', required: true },
          overdue_ratio: { type: 'number', required: true },
        },
      },
      render: (_args, value: { path: string; rows: number; layout: string }) =>
        text(`AR ${value.layout} CSV ${value.rows} row(s) -> ${value.path}`),
    },
    async execute(args) {
      const layout: ExportLayout = args.layout ?? 'summary'
      const context = buildAgingContext(await load(args.path), args.as_of)
      const csv = exportCsv(context, layout)
      const filename = args.filename ?? `ar-aging-${context.asOf}-${layout}.csv`
      let filePath: string
      try {
        filePath = await safeExportPath(path.join(deps.baseDir, 'exports'), filename)
      } catch (error) {
        if (error instanceof ArAgingError) throw error
        throw new ArAgingError('E_AR_PATH_INVALID', String(error))
      }
      try {
        await writeFile(filePath, csv, 'utf8')
      } catch (error) {
        throw new ArAgingError('E_AR_PATH_INVALID', `写 CSV 失败：${String(error)}`)
      }
      return {
        path: filePath,
        sha256: sha256(csv),
        bytes: Buffer.byteLength(csv, 'utf8'),
        rows: layout === 'summary' ? context.customers.length + 1 : context.open.length,
        layout,
        as_of: context.asOf,
        currency: context.currency,
        outstanding_cents: context.totals.outstandingCents,
        overdue_cents: context.totals.overdueCents,
        overdue_ratio: context.totals.overdueRatio,
      }
    },
  })

  return [ingest, aging, exportTool]
}
