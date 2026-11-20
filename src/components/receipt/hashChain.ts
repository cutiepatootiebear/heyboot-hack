import type { AuditEvent } from './types'

export const GENESIS = '0'.repeat(64)

export type ChainStatus =
  | { state: 'checking' }
  | { state: 'verified'; count: number }
  | { state: 'unhashed'; count: number }
  | { state: 'broken'; atSeq: number }
  | { state: 'unavailable' }

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Recompute sha256(prevHash|seq|ts|step|summary) for every event and compare to the stored hash. */
export async function verifyChain(events: AuditEvent[]): Promise<ChainStatus> {
  if (typeof crypto === 'undefined' || !('subtle' in crypto)) return { state: 'unavailable' }
  const sorted = [...events].sort((a, b) => a.seq - b.seq)
  if (!sorted.some((e) => e.hash)) return { state: 'unhashed', count: sorted.length }
  let prev = GENESIS
  for (const e of sorted) {
    const h = await sha256Hex(`${prev}|${e.seq}|${e.ts}|${e.step}|${e.summary}`)
    if (e.hash !== h) return { state: 'broken', atSeq: e.seq }
    prev = h
  }
  return { state: 'verified', count: sorted.length }
}
