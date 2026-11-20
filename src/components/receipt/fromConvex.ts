// Turns the rows main already stores (Convex proposal + order, SingleStore audit_events)
// into ReceiptData. Pure function: api.receipt.get can call it, and fixture.ts uses it too.
import type { AuditEvent, CartLine, ReceiptData, RejectedLine, Source } from './types'

export type ProposalItemRow = {
  item: string
  store: string
  qty: number
  price: number
  milDiscountPct: number
  catalogMilDiscountPct: number
  discountSourceUrl: string | null
  finalPrice: number
  url: string
  capturedAt: string
}

export type ProposalRow = {
  _id: string
  _creationTime: number
  items: ProposalItemRow[]
  rejected: { item: string; store: string; reason: string }[]
  total: number
  budget: number
  status: string
  approvedAt: number | null
}

export type OrderRow = {
  _id: string
  _creationTime: number
  amountCents: number
  status: string
  stripePaymentIntentId: string | null
}

/** One SingleStore audit_events row. input/output/sources may arrive as JSON strings. */
export type AuditRow = {
  run_id: string
  seq: number
  step: string
  input: unknown
  output: unknown
  sources: unknown
  ts: string // "YYYY-MM-DD HH:MM:SS[.fff]" UTC, or ISO
  hash?: string | null
}

const parse = (v: unknown): any => {
  if (typeof v !== 'string') return v ?? null
  try {
    return JSON.parse(v)
  } catch {
    return v
  }
}

const toIso = (ts: string) => (/[zZ]|[+-]\d\d:\d\d$/.test(ts) ? ts : ts.replace(' ', 'T') + 'Z')
const msToIso = (ms: number) => new Date(ms).toISOString()
const usd = (n: number) => `$${Number(n).toFixed(2)}`

const ACTOR: Record<string, AuditEvent['actor']> = {
  inbound: 'user',
  approval: 'approver',
  purchase: 'payment',
  stock_check: 'rules',
  fact_check: 'senso',
  lookup_context: 'senso',
}

function summarize(step: string, input: any, output: any): string {
  switch (step) {
    case 'inbound':
      return `Message received: "${input?.text ?? ''}"`
    case 'recall_memory': {
      const m: any[] = output?.memories ?? []
      return m.length
        ? `Recalled ${m.map((x) => `${x.key} = ${x.value}`).join('; ')}`
        : 'Recalled no saved memories'
    }
    case 'search_catalog': {
      const rows: any[] = output?.rows ?? []
      const q = input?.query ? `"${input.query}"` : 'the catalog'
      return output?.notFound || rows.length === 0
        ? `Searched ${q}: nothing found`
        : `Searched ${q}: ${rows.length} row${rows.length === 1 ? '' : 's'}`
    }
    case 'lookup_context':
      return output?.answer ? `Senso context found for "${input?.question ?? ''}"` : `Senso: not found for "${input?.question ?? ''}"`
    case 'propose':
      return output?.error
        ? `Proposal failed: ${output.error}`
        : `Approve card sent: ${output?.items?.length ?? 0} items, total ${usd(output?.total ?? 0)} (budget ${usd(output?.budget ?? 0)})`
    case 'approval':
      if (output?.allowed) return `YES accepted (proposal ${output.ageSeconds ?? '?'}s old, same user, still pending)`
      return output?.reason === 'no_pending'
        ? 'YES refused: nothing pending, order already placed. No second charge.'
        : `YES refused: ${String(output?.reason ?? 'not allowed').replace(/_/g, ' ')}`
    case 'stock_check':
      return 'Stock re-checked before charging'
    case 'purchase':
      if (output?.paymentIntentId) return `Stripe TEST charge ${output.status}: ${output.paymentIntentId}`
      if (output?.skipped) return `No second charge: ${output.skipped}`
      return `Charge failed: ${output?.error ?? 'unknown error'}`
    case 'outbound':
      return output?.note ? `Reply sent (${output.note})` : 'Reply sent'
    case 'model_refusal':
      return 'Model declined to continue'
    default:
      return step.replace(/_/g, ' ')
  }
}

const shortFinding = (reason: string) => {
  const first = reason.split(/[;:(—-]/)[0].trim()
  const s = first.length > 28 ? first.slice(0, 27) + '…' : first
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function toReceiptData(args: {
  proposal: ProposalRow
  order: OrderRow | null
  audit: AuditRow[]
  buyerLabel?: string
  testMode?: boolean
}): ReceiptData {
  const { proposal, order } = args
  const rows = [...args.audit].sort(
    (a, b) => toIso(a.ts).localeCompare(toIso(b.ts)) || a.run_id.localeCompare(b.run_id) || a.seq - b.seq,
  )

  const events: AuditEvent[] = rows.map((r) => {
    const input = parse(r.input)
    const output = parse(r.output)
    const sources: Source[] = (parse(r.sources) ?? []).map((s: any) => ({
      title: s.title,
      url: s.url,
      retrievedAt: s.retrieved_at ?? s.captured_at ?? '',
    }))
    return {
      seq: r.seq,
      runId: r.run_id,
      ts: toIso(r.ts),
      step: r.step,
      actor: ACTOR[r.step] ?? 'agent',
      summary: summarize(r.step, input, output),
      sources: sources.length ? sources : undefined,
      hash: r.hash ?? undefined,
    }
  })

  const firstInbound = rows.find((r) => r.step === 'inbound')
  const memoryRow = rows.find((r) => r.step === 'recall_memory')
  const memories: { key: string; value: string }[] = parse(memoryRow?.output)?.memories ?? []

  const cart: CartLine[] = proposal.items.map((i, n) => ({
    id: `ITEM-${n + 1}`,
    description: i.item,
    vendor: i.store,
    qty: i.qty,
    unitPrice: i.finalPrice,
    listPrice: i.price,
    discountPct: i.milDiscountPct,
    discountNote:
      i.milDiscountPct > 0
        ? 'verified'
        : i.catalogMilDiscountPct > 0
          ? `store lists ${i.catalogMilDiscountPct}%, no source verified it, not applied`
          : 'not found, not applied',
    discountSource: i.discountSourceUrl
      ? { title: `${i.store} military discount policy`, url: i.discountSourceUrl, retrievedAt: i.capturedAt }
      : undefined,
    url: i.url,
    capturedAt: i.capturedAt,
    checks: [],
  }))

  const rejected: RejectedLine[] = proposal.rejected.map((r, n) => ({
    id: `ALT-${n + 1}`,
    description: r.item,
    vendor: r.store,
    finding: shortFinding(r.reason),
    reason: r.reason,
    rule: null,
  }))

  const approvalEvent = rows.find((r) => r.step === 'approval' && parse(r.output)?.allowed)
  return {
    proposalId: proposal._id,
    mode: 'consumer',
    testMode: args.testMode ?? true,
    buyer: { label: args.buyerLabel ?? 'Demo user', role: 'Buyer' },
    approver: { label: args.buyerLabel ?? 'Demo user', role: 'Approved by text (YES)' },
    budget: proposal.budget,
    request: {
      text: parse(firstInbound?.input)?.text ?? '',
      at: firstInbound ? toIso(firstInbound.ts) : msToIso(proposal._creationTime),
    },
    memory: memories.map((m) => ({ key: m.key, value: m.value })),
    cart,
    rejected,
    factChecks: [],
    approval:
      proposal.approvedAt !== null
        ? { at: msToIso(proposal.approvedAt), by: 'Buyer replied YES' }
        : approvalEvent
          ? { at: toIso(approvalEvent.ts), by: 'Buyer replied YES' }
          : null,
    order: order
      ? {
          orderId: order._id,
          paymentId: order.stripePaymentIntentId ?? '—',
          status: order.status === 'charged' ? 'succeeded (test mode)' : order.status,
          amountCents: order.amountCents,
          at: msToIso(order._creationTime),
        }
      : null,
    events,
  }
}
