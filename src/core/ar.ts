import { createHash } from 'node:crypto'
import { parseCsv } from './csv.js'
import { formatIsoDate, parseIsoDate } from './date.js'
import { ArAgingError } from './errors.js'
import { parseCents } from './money.js'

export interface ArInvoice {
  customer: string
  invoiceNo: string
  invoiceDate: string
  dueDate: string
  amountCents: number
  currency: string
  paidCents: number
  outstandingCents: number
  /** 1-based physical CSV line, useful in error details. */
  row: number
}

export interface ArDataset {
  invoices: ArInvoice[]
  currency: string
  rows: number
  customers: string[]
  totalCents: number
  paidCents: number
  outstandingCents: number
  settledRows: number
  openRows: number
  invoiceDateMin: string
  invoiceDateMax: string
  dueDateMin: string
  dueDateMax: string
  sourceSha256: string
}

type HeaderKey = 'customer' | 'invoice_no' | 'invoice_date' | 'due_date' | 'amount_cents' | 'currency' | 'paid_cents'

const HEADER_LABELS: Record<HeaderKey, string> = {
  customer: '客户',
  invoice_no: '发票号',
  invoice_date: '开票日',
  due_date: '到期日',
  amount_cents: '金额分',
  currency: '币种',
  paid_cents: '已收金额分',
}

const HEADER_ALIASES: Record<HeaderKey, string[]> = {
  customer: ['customer', 'customer_name', 'customername', '客户', '客户名称'],
  invoice_no: ['invoice_no', 'invoice_number', 'invoiceno', 'invoicenumber', 'invoice', '发票号', '发票号码'],
  invoice_date: ['invoice_date', 'invoicedate', '开票日', '开票日期'],
  due_date: ['due_date', 'duedate', '到期日', '到期日期'],
  amount_cents: ['amount_cents', 'amountcents', '金额分'],
  currency: ['currency', '币种'],
  paid_cents: ['paid_cents', 'paidcents', 'paid_amount_cents', 'received_cents', '已收金额分', '已收分'],
}

const HEADER_ORDER: HeaderKey[] = ['customer', 'invoice_no', 'invoice_date', 'due_date', 'amount_cents', 'currency', 'paid_cents']

/** Case/space/underscore/paren-insensitive header key, e.g. `已收金额(分)` -> `已收金额分`. */
function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_\-（）()]/g, '')
}

const ALIAS_TO_KEY = new Map<string, HeaderKey>()
for (const key of HEADER_ORDER) {
  for (const alias of HEADER_ALIASES[key]) ALIAS_TO_KEY.set(normalizeHeader(alias), key)
}

export function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

/**
 * Validate and normalize a single-currency AR ledger CSV. Every row is checked;
 * the first failure names the physical CSV line. Mixed currencies are rejected
 * because summing them without FX rates would produce a meaningless total.
 */
export function ingestArCsv(text: string): ArDataset {
  const parsed = parseCsv(text)
  if (parsed.rows.length === 0) throw new ArAgingError('E_AR_CSV_ROW', 'CSV 是空的，没有表头')

  const header = parsed.rows[0]!
  const positions = new Map<HeaderKey, number>()
  for (let index = 0; index < header.length; index += 1) {
    const key = ALIAS_TO_KEY.get(normalizeHeader(header[index]!))
    if (!key) continue
    if (positions.has(key)) {
      throw new ArAgingError('E_AR_CSV_ROW', `表头里 ${HEADER_LABELS[key]} 出现了两次`)
    }
    positions.set(key, index)
  }
  const missing = HEADER_ORDER.filter((key) => !positions.has(key))
  if (missing.length > 0) {
    throw new ArAgingError('E_AR_CSV_ROW', `表头缺少：${missing.map((key) => HEADER_LABELS[key]).join('、')}`)
  }
  if (parsed.rows.length === 1) throw new ArAgingError('E_AR_CSV_ROW', '只有表头，没有数据行')

  const invoices: ArInvoice[] = []
  const seenInvoices = new Set<string>()
  let currency = ''

  for (let index = 1; index < parsed.rows.length; index += 1) {
    const row = parsed.rows[index]!
    const line = parsed.lines[index]!
    if (row.length !== header.length) {
      throw new ArAgingError('E_AR_CSV_ROW', `第 ${line} 行有 ${row.length} 列，表头有 ${header.length} 列`)
    }
    const value = (key: HeaderKey): string => row[positions.get(key)!]!

    const customer = value('customer').trim()
    if (customer === '') throw new ArAgingError('E_AR_CSV_ROW', `第 ${line} 行客户为空`)
    const invoiceNo = value('invoice_no').trim()
    if (invoiceNo === '') throw new ArAgingError('E_AR_CSV_ROW', `第 ${line} 行发票号为空`)
    if (seenInvoices.has(invoiceNo)) {
      throw new ArAgingError('E_AR_CSV_ROW', `第 ${line} 行发票号 ${invoiceNo} 重复`)
    }
    seenInvoices.add(invoiceNo)

    const invoiceDateRaw = value('invoice_date').trim()
    const dueDateRaw = value('due_date').trim()
    const invoiceMs = parseIsoDate(invoiceDateRaw, `第 ${line} 行开票日`)
    const dueMs = parseIsoDate(dueDateRaw, `第 ${line} 行到期日`)
    if (dueMs < invoiceMs) {
      throw new ArAgingError('E_AR_DATE_INVALID', `第 ${line} 行到期日 ${dueDateRaw} 早于开票日 ${invoiceDateRaw}`)
    }

    const rowCurrency = value('currency').trim().toUpperCase()
    if (!/^[A-Z]{3}$/.test(rowCurrency)) {
      throw new ArAgingError('E_AR_CSV_ROW', `第 ${line} 行币种 ${JSON.stringify(value('currency'))} 不是 3 位字母代码`)
    }
    if (currency === '') currency = rowCurrency
    if (rowCurrency !== currency) {
      throw new ArAgingError(
        'E_AR_CSV_ROW',
        `第 ${line} 行币种 ${rowCurrency} 与前面的 ${currency} 混用；一份账龄表只能有一种币种，请按币种拆文件`,
      )
    }

    const amountCents = parseCents(value('amount_cents'), `第 ${line} 行金额分`, { allowZero: false })
    const paidCents = parseCents(value('paid_cents'), `第 ${line} 行已收金额分`, { allowZero: true })
    if (paidCents > amountCents) {
      throw new ArAgingError('E_AR_AMOUNT', `第 ${line} 行已收 ${paidCents} 分大于应收 ${amountCents} 分`)
    }

    invoices.push({
      customer,
      invoiceNo,
      invoiceDate: formatIsoDate(invoiceMs),
      dueDate: formatIsoDate(dueMs),
      amountCents,
      currency: rowCurrency,
      paidCents,
      outstandingCents: amountCents - paidCents,
      row: line,
    })
  }

  const totalCents = invoices.reduce((sum, invoice) => sum + invoice.amountCents, 0)
  const paidCents = invoices.reduce((sum, invoice) => sum + invoice.paidCents, 0)
  const outstandingCents = invoices.reduce((sum, invoice) => sum + invoice.outstandingCents, 0)
  const settledRows = invoices.filter((invoice) => invoice.outstandingCents === 0).length
  const invoiceDates = invoices.map((invoice) => invoice.invoiceDate).sort(compareText)
  const dueDates = invoices.map((invoice) => invoice.dueDate).sort(compareText)
  const customers = [...new Set(invoices.map((invoice) => invoice.customer))].sort(compareText)

  return {
    invoices,
    currency,
    rows: invoices.length,
    customers,
    totalCents,
    paidCents,
    outstandingCents,
    settledRows,
    openRows: invoices.length - settledRows,
    invoiceDateMin: invoiceDates[0]!,
    invoiceDateMax: invoiceDates.at(-1)!,
    dueDateMin: dueDates[0]!,
    dueDateMax: dueDates.at(-1)!,
    sourceSha256: createHash('sha256').update(text).digest('hex'),
  }
}

export interface IngestPreviewRow {
  customer: string
  invoice_no: string
  invoice_date: string
  due_date: string
  amount_cents: number
  currency: string
  paid_cents: number
  outstanding_cents: number
}

export interface IngestSummary {
  source_sha256: string
  rows: number
  customers: number
  currency: string
  invoice_date_min: string
  invoice_date_max: string
  due_date_min: string
  due_date_max: string
  total_cents: number
  paid_cents: number
  outstanding_cents: number
  settled_rows: number
  open_rows: number
  preview: IngestPreviewRow[]
}

export function toIngestSummary(dataset: ArDataset): IngestSummary {
  return {
    source_sha256: dataset.sourceSha256,
    rows: dataset.rows,
    customers: dataset.customers.length,
    currency: dataset.currency,
    invoice_date_min: dataset.invoiceDateMin,
    invoice_date_max: dataset.invoiceDateMax,
    due_date_min: dataset.dueDateMin,
    due_date_max: dataset.dueDateMax,
    total_cents: dataset.totalCents,
    paid_cents: dataset.paidCents,
    outstanding_cents: dataset.outstandingCents,
    settled_rows: dataset.settledRows,
    open_rows: dataset.openRows,
    preview: dataset.invoices.slice(0, 5).map((invoice) => ({
      customer: invoice.customer,
      invoice_no: invoice.invoiceNo,
      invoice_date: invoice.invoiceDate,
      due_date: invoice.dueDate,
      amount_cents: invoice.amountCents,
      currency: invoice.currency,
      paid_cents: invoice.paidCents,
      outstanding_cents: invoice.outstandingCents,
    })),
  }
}
