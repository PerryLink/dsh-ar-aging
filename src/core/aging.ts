import { compareText, type ArDataset, type ArInvoice } from './ar.js'
import { daysBetween, formatIsoDate, parseIsoDate, roundRatio } from './date.js'
import { ArAgingError } from './errors.js'

export type BucketKey = '0-30' | '31-60' | '61-90' | '91-180' | '180+'

export interface BucketDefinition {
  key: BucketKey
  label: string
  minDays: number
  maxDays: number | null
}

/** Aging is measured from the invoice date; `180+` starts at 181 to avoid overlap. */
export const BUCKETS: readonly BucketDefinition[] = [
  { key: '0-30', label: '0-30 天', minDays: 0, maxDays: 30 },
  { key: '31-60', label: '31-60 天', minDays: 31, maxDays: 60 },
  { key: '61-90', label: '61-90 天', minDays: 61, maxDays: 90 },
  { key: '91-180', label: '91-180 天', minDays: 91, maxDays: 180 },
  { key: '180+', label: '180+ 天', minDays: 181, maxDays: null },
]

export function bucketForAge(ageDays: number): BucketDefinition {
  const bucket = BUCKETS.find((item) => ageDays >= item.minDays && (item.maxDays === null || ageDays <= item.maxDays))
  if (!bucket) throw new ArAgingError('E_AR_DATE_INVALID', `账龄 ${ageDays} 天无法分桶`)
  return bucket
}

export interface OpenInvoice {
  invoice: ArInvoice
  ageDays: number
  daysPastDue: number
  bucket: BucketKey
  status: 'overdue' | 'not_due'
}

export interface CustomerAging {
  customer: string
  invoiceCount: number
  outstandingCents: number
  overdueCents: number
  notDueCents: number
  maxDaysPastDue: number
  bucketCents: Record<BucketKey, number>
}

export interface AgingTotals {
  invoices: number
  openInvoices: number
  settledInvoices: number
  amountCents: number
  paidCents: number
  outstandingCents: number
  overdueCents: number
  notDueCents: number
  overdueRatio: number
}

export interface AgingContext {
  asOf: string
  asOfMs: number
  currency: string
  dataset: ArDataset
  open: OpenInvoice[]
  totals: AgingTotals
  buckets: { definition: BucketDefinition; invoiceCount: number; outstandingCents: number; share: number }[]
  customers: CustomerAging[]
}

function emptyBuckets(): Record<BucketKey, number> {
  return { '0-30': 0, '31-60': 0, '61-90': 0, '91-180': 0, '180+': 0 }
}

export function classifyInvoice(invoice: ArInvoice, asOfMs: number): OpenInvoice {
  const invoiceMs = parseIsoDate(invoice.invoiceDate, `发票 ${invoice.invoiceNo} 的开票日`)
  if (invoiceMs > asOfMs) {
    throw new ArAgingError(
      'E_AR_DATE_INVALID',
      `发票 ${invoice.invoiceNo} 的开票日 ${invoice.invoiceDate} 晚于 as_of ${formatIsoDate(asOfMs)}`,
    )
  }
  const dueMs = parseIsoDate(invoice.dueDate, `发票 ${invoice.invoiceNo} 的到期日`)
  const ageDays = daysBetween(invoiceMs, asOfMs)
  const daysPastDue = daysBetween(dueMs, asOfMs)
  return {
    invoice,
    ageDays,
    daysPastDue,
    bucket: bucketForAge(ageDays).key,
    status: daysPastDue > 0 ? 'overdue' : 'not_due',
  }
}

/** Build the single source of truth for `ar_aging` and `ar_export`. */
export function buildAgingContext(dataset: ArDataset, asOfValue: string): AgingContext {
  const asOfMs = parseIsoDate(asOfValue, 'as_of')
  const asOf = formatIsoDate(asOfMs)
  const open: OpenInvoice[] = []
  for (const invoice of dataset.invoices) {
    if (invoice.outstandingCents <= 0) continue
    open.push(classifyInvoice(invoice, asOfMs))
  }

  const outstandingCents = open.reduce((sum, item) => sum + item.invoice.outstandingCents, 0)
  const overdueCents = open
    .filter((item) => item.status === 'overdue')
    .reduce((sum, item) => sum + item.invoice.outstandingCents, 0)
  const notDueCents = outstandingCents - overdueCents

  const bucketState = BUCKETS.map((definition) => ({ definition, invoiceCount: 0, outstandingCents: 0, share: 0 }))
  const customerMap = new Map<string, CustomerAging>()
  for (const item of open) {
    const bucket = bucketState.find((entry) => entry.definition.key === item.bucket)!
    bucket.invoiceCount += 1
    bucket.outstandingCents += item.invoice.outstandingCents

    const current = customerMap.get(item.invoice.customer) ?? {
      customer: item.invoice.customer,
      invoiceCount: 0,
      outstandingCents: 0,
      overdueCents: 0,
      notDueCents: 0,
      maxDaysPastDue: 0,
      bucketCents: emptyBuckets(),
    }
    current.invoiceCount += 1
    current.outstandingCents += item.invoice.outstandingCents
    current.bucketCents[item.bucket] += item.invoice.outstandingCents
    if (item.status === 'overdue') {
      current.overdueCents += item.invoice.outstandingCents
      current.maxDaysPastDue = Math.max(current.maxDaysPastDue, item.daysPastDue)
    } else {
      current.notDueCents += item.invoice.outstandingCents
    }
    customerMap.set(item.invoice.customer, current)
  }

  for (const bucket of bucketState) {
    bucket.share = outstandingCents > 0 ? roundRatio(bucket.outstandingCents / outstandingCents) : 0
  }
  const customers = [...customerMap.values()].sort(
    (left, right) => right.outstandingCents - left.outstandingCents || compareText(left.customer, right.customer),
  )

  return {
    asOf,
    asOfMs,
    currency: dataset.currency,
    dataset,
    open,
    totals: {
      invoices: dataset.rows,
      openInvoices: open.length,
      settledInvoices: dataset.settledRows,
      amountCents: dataset.totalCents,
      paidCents: dataset.paidCents,
      outstandingCents,
      overdueCents,
      notDueCents,
      overdueRatio: outstandingCents > 0 ? roundRatio(overdueCents / outstandingCents) : 0,
    },
    buckets: bucketState,
    customers,
  }
}

export interface AgingBucketReport {
  key: string
  label: string
  min_days: number
  max_days: number | null
  invoice_count: number
  outstanding_cents: number
  share: number
}

export interface AgingCustomerReport {
  customer: string
  invoice_count: number
  outstanding_cents: number
  overdue_cents: number
  not_due_cents: number
  overdue_ratio: number
  max_days_past_due: number
  buckets: Record<BucketKey, number>
}

export interface TopOverdueCustomer {
  customer: string
  overdue_cents: number
  overdue_invoices: number
  max_days_past_due: number
}

export interface AgingTotalsReport {
  invoices: number
  open_invoices: number
  settled_invoices: number
  amount_cents: number
  paid_cents: number
  outstanding_cents: number
  overdue_cents: number
  not_due_cents: number
  overdue_ratio: number
}

export interface AgingReport {
  as_of: string
  currency: string
  totals: AgingTotalsReport
  buckets: AgingBucketReport[]
  customers: AgingCustomerReport[]
  top_overdue: TopOverdueCustomer[]
}

/** Project an internal context into the public, schema-stable report. */
export function toAgingReport(context: AgingContext, topN = 5): AgingReport {
  const limit = Math.max(1, Math.min(50, Number.isFinite(topN) ? Math.trunc(topN) : 5))
  const top = context.customers
    .filter((customer) => customer.overdueCents > 0)
    .map((customer) => ({
      customer: customer.customer,
      overdue_cents: customer.overdueCents,
      overdue_invoices: context.open.filter(
        (item) => item.invoice.customer === customer.customer && item.status === 'overdue',
      ).length,
      max_days_past_due: customer.maxDaysPastDue,
    }))
    .sort(
      (left, right) =>
        right.overdue_cents - left.overdue_cents ||
        right.max_days_past_due - left.max_days_past_due ||
        compareText(left.customer, right.customer),
    )
    .slice(0, limit)

  return {
    as_of: context.asOf,
    currency: context.currency,
    totals: {
      invoices: context.totals.invoices,
      open_invoices: context.totals.openInvoices,
      settled_invoices: context.totals.settledInvoices,
      amount_cents: context.totals.amountCents,
      paid_cents: context.totals.paidCents,
      outstanding_cents: context.totals.outstandingCents,
      overdue_cents: context.totals.overdueCents,
      not_due_cents: context.totals.notDueCents,
      overdue_ratio: context.totals.overdueRatio,
    },
    buckets: context.buckets.map((bucket) => ({
      key: bucket.definition.key,
      label: bucket.definition.label,
      min_days: bucket.definition.minDays,
      max_days: bucket.definition.maxDays,
      invoice_count: bucket.invoiceCount,
      outstanding_cents: bucket.outstandingCents,
      share: bucket.share,
    })),
    customers: context.customers.map((customer) => ({
      customer: customer.customer,
      invoice_count: customer.invoiceCount,
      outstanding_cents: customer.outstandingCents,
      overdue_cents: customer.overdueCents,
      not_due_cents: customer.notDueCents,
      overdue_ratio: customer.outstandingCents > 0 ? roundRatio(customer.overdueCents / customer.outstandingCents) : 0,
      max_days_past_due: customer.maxDaysPastDue,
      buckets: customer.bucketCents,
    })),
    top_overdue: top,
  }
}
