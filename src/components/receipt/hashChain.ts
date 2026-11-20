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

export const chainInput = (prev: string, e: AuditEvent) => `${prev}|${e.seq}|${e.ts}|${e.step}|${e.summary}`

/** Recompute sha256(prevHash|seq|ts|step|summary) for every event, in display order,
 *  and compare to the stored hash. `atSeq` in the result is the 1-based display position. */
export async function verifyChain(events: AuditEvent[]): Promise<ChainStatus> {
  if (typeof crypto === 'undefined' || !('subtle' in crypto)) return { state: 'unavailable' }
  if (!events.some((e) => e.hash)) return { state: 'unhashed', count: events.length }
  let prev = GENESIS
  for (let i = 0; i < events.length; i++) {
    const h = await sha256Hex(chainInput(prev, events[i]))
    if (events[i].hash !== h) return { state: 'broken', atSeq: i + 1 }
    prev = h
  }
  return { state: 'verified', count: events.length }
}
