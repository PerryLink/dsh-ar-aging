/** Stable, user-facing failure codes for dsh-ar-aging. */
export type ArAgingErrorCode = 'E_AR_CSV_ROW' | 'E_AR_DATE_INVALID' | 'E_AR_AMOUNT' | 'E_AR_PATH_INVALID'

interface HumanMessage {
  text: string
  next: string
}

const AR_HUMAN: Record<ArAgingErrorCode, HumanMessage> = {
  E_AR_CSV_ROW: {
    text: '应收 CSV 有一行读不了：列数、表头或字段不合规',
    next: '对照表头检查这一行：客户、发票号、开票日、到期日、金额分、币种、已收金额分',
  },
  E_AR_DATE_INVALID: {
    text: '日期不是有效的 YYYY-MM-DD，或者到期日早于开票日',
    next: '统一成 2026-06-30 这种格式，并确认到期日不早于开票日、as_of 不早于开票日',
  },
  E_AR_AMOUNT: {
    text: '金额分不是非负整数，或已收金额超过应收金额',
    next: '金额分与已收金额分都填整数分（如 128000000 表示 1,280,000.00 元）',
  },
  E_AR_PATH_INVALID: {
    text: '文件路径或导出文件名不可用',
    next: '传一个存在的 CSV 文件；导出时只传 [A-Za-z0-9._-] 组成的文件名',
  },
}

/** `one plain sentence（E_CODE）｜下一步：one action｜细节：detail` — what the end user sees. */
export function arErrorMessage(code: ArAgingErrorCode, detail?: string): string {
  const human = AR_HUMAN[code]
  return `${human.text}（${code}）｜下一步：${human.next}${detail ? `｜细节：${detail}` : ''}`
}

export class ArAgingError extends Error {
  readonly code: ArAgingErrorCode

  constructor(code: ArAgingErrorCode, detail?: string) {
    super(arErrorMessage(code, detail))
    this.name = 'ArAgingError'
    this.code = code
  }
}
