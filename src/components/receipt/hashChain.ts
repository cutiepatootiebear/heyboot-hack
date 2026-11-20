import type { AuditEvent } from './types'

export const GENESIS = '0'.repeat(64)

export type ChainStatus =
  | { state: 'checking' }
  | { state: 'verified'; count: number; runs: number }
  | { state: 'partial'; verified: number; unhashed: number }
  | { state: 'unhashed'; count: number }
  | { state: 'broken'; atSeq: number }
  | { state: 'unavailable' }

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Each run is its own chain: hash = sha256(prevHash + "|" + canonical), where prevHash is the
 *  previous row's hash in that run (64 zeros for its first row) and canonical is the exact
 *  stored record. Any edited field, reordered row or swapped hash breaks the chain.
 *  `atSeq` in a broken result is the 1-based display position. Rows written before hashing
 *  existed are reported as unhashed, not as tampering. */
export async function verifyChain(events: AuditEvent[]): Promise<ChainStatus> {
  if (typeof crypto === 'undefined' || !('subtle' in crypto)) return { state: 'unavailable' }
  const hashed = events.filter((e) => e.hash && e.canonical)
  if (!hashed.length) return { state: 'unhashed', count: events.length }
  const lastInRun = new Map<string, string>()
  let verified = 0
  for (let i = 0; i < events.length; i++) {
    const e = events[i]
    if (!e.hash || !e.canonical) continue
    const run = e.runId ?? ''
    const expectedPrev = lastInRun.get(run) ?? GENESIS
    if (e.prevHash !== expectedPrev) return { state: 'broken', atSeq: i + 1 }
    if ((await sha256Hex(`${e.prevHash}|${e.canonical}`)) !== e.hash) return { state: 'broken', atSeq: i + 1 }
    lastInRun.set(run, e.hash)
    verified++
  }
  const unhashed = events.length - verified
  return unhashed ? { state: 'partial', verified, unhashed } : { state: 'verified', count: verified, runs: lastInRun.size }
}
