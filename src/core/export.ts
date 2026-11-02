import { compareText } from './ar.js'
import { BUCKETS, type AgingContext } from './aging.js'
import { toCsv } from './csv.js'
import { formatCents } from './money.js'

export type ExportLayout = 'summary' | 'detail'

/** Classic customer × bucket aging table with a final TOTAL row. */
export function summaryCsv(context: AgingContext): string {
  const header = ['customer', ...BUCKETS.map((bucket) => bucket.key), 'total_outstanding', 'overdue', 'overdue_ratio']
  const rows: string[][] = [header]
  for (const customer of context.customers) {
    const ratio = customer.outstandingCents > 0 ? customer.overdueCents / customer.outstandingCents : 0
    rows.push([
      customer.customer,
      ...BUCKETS.map((bucket) => formatCents(customer.bucketCents[bucket.key])),
      formatCents(customer.outstandingCents),
      formatCents(customer.overdueCents),
      ratio.toFixed(4),
    ])
  }
  rows.push([
    'TOTAL',
    ...context.buckets.map((bucket) => formatCents(bucket.outstandingCents)),
    formatCents(context.totals.outstandingCents),
    formatCents(context.totals.overdueCents),
    context.totals.overdueRatio.toFixed(4),
  ])
  return toCsv(rows)
}

/** Invoice-level trace: one row per open invoice, sorted by customer and due date. */
export function detailCsv(context: AgingContext): string {
  const header = [
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
  ]
  const rows: string[][] = [header]
  const ordered = [...context.open].sort(
    (left, right) =>
      compareText(left.invoice.customer, right.invoice.customer) ||
      compareText(left.invoice.dueDate, right.invoice.dueDate) ||
      compareText(left.invoice.invoiceNo, right.invoice.invoiceNo),
  )
  for (const item of ordered) {
    rows.push([
      item.invoice.customer,
      item.invoice.invoiceNo,
      item.invoice.invoiceDate,
      item.invoice.dueDate,
      String(item.ageDays),
      String(item.daysPastDue),
      item.bucket,
      item.invoice.currency,
      formatCents(item.invoice.amountCents),
      formatCents(item.invoice.paidCents),
      formatCents(item.invoice.outstandingCents),
      item.status,
    ])
  }
  return toCsv(rows)
}

export function exportCsv(context: AgingContext, layout: ExportLayout): string {
  return layout === 'detail' ? detailCsv(context) : summaryCsv(context)
}
