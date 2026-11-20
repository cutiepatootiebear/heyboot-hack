// Receipt data contract. `api.receipt.get({ proposalId })` (main) can build this with
// `toReceiptData()` from ./fromConvex; until it lands the page renders `fixture.ts`.

export type Verdict = 'verified' | 'conflict' | 'unsupported' | 'not_checked'

export type Source = {
  title: string
  url: string
  retrievedAt: string // ISO
  contentId?: string // Senso content_id, when it came from Senso
}

export type Check = {
  label: string // e.g. "Mandatory source"
  status: 'pass' | 'fail' | 'n/a'
  rule?: string // e.g. "FAR 8.002"
  note?: string
  source?: Source
}

export type CartLine = {
  id: string
  description: string
  vendor: string
  qty: number
  unitPrice: number // per unit, after any applied discount
  listPrice?: number // per unit, before discount
  discountPct?: number // applied (0 unless a source verified it)
  discountNote?: string // e.g. "not found, not applied"
  discountSource?: Source
  url: string
  capturedAt: string
  score?: number
  scoreDisplay?: string // from convex/scoring: "0.55 (price 0.15, spec 0.40)"
  reason?: string
  checks: Check[]
}

export type RejectedLine = {
  id: string
  description: string
  vendor: string
  price?: number
  finding: string // short badge label
  reason: string
  rule: string | null
  source?: Source
}

export type FactCheck = {
  claim: string
  verdict: Verdict
  source?: Source
}

export type AuditEvent = {
  seq: number // seq within its run
  runId?: string
  ts: string // ISO
  step: string
  actor: 'user' | 'agent' | 'rules' | 'senso' | 'approver' | 'payment'
  summary: string
  sources?: Source[]
  hash?: string // sha256(prevHash + "|" + canonical), hex, chained per run
  prevHash?: string // previous row's hash in the same run (64 zeros for the first)
  canonical?: string // exact JSON text that was hashed (the stored record)
}

export type ReceiptData = {
  proposalId: string
  mode: 'gpc' | 'consumer'
  testMode: boolean
  buyer: { label: string; role: string }
  approver: { label: string; role: string }
  fundLine?: string
  budget?: number
  request: { text: string; at: string }
  memory: { key: string; value: string }[]
  threshold?: { label: string; amount: number; source: Source }
  cart: CartLine[]
  rejected: RejectedLine[]
  factChecks: FactCheck[]
  approval: { at: string; by: string; mandateHash?: string } | null
  order: { orderId: string; paymentId: string; status: string; amountCents: number; at: string } | null
  events: AuditEvent[] // in display order (oldest first)
}
