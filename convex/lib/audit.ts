// Audit writer: one `audit_events` row in SingleStore per step, hash-chained per run.
// Agent-loop code logs only through `createAuditor(...).log(...)`; it never writes SQL itself.
//
// Tamper evidence: every row stores `canonical` (the exact JSON text that was hashed),
// `prev_hash` (the previous row's hash in the same run; 64 zeros for the first row) and
// `hash` = sha256(prev_hash + "|" + canonical). The receipt recomputes this in the browser.
// Changing any field breaks that row's hash and every later link in the run.
import { s2Exec } from "./singlestore";

export type AuditSource = { title: string; url: string; captured_at?: string; retrieved_at?: string };

export type Auditor = {
  runId: string;
  log: (step: string, input: unknown, output: unknown, sources?: AuditSource[]) => Promise<void>;
  /** Last seq written; pass it as `startSeq` when another action continues the same run. */
  current: () => number;
  /** Last hash written; pass it as `startHash` when another action continues the same run. */
  lastHash: () => string;
};

export const GENESIS_HASH = "0".repeat(64);

const toDatetime = (d: Date) => d.toISOString().replace("T", " ").replace("Z", "");

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function createAuditor(runId: string, userId: string, startSeq = 0, startHash = GENESIS_HASH): Auditor {
  let seq = startSeq;
  let prev = startHash;
  // Writes are chained, so they must happen in order even if callers don't await.
  let queue: Promise<void> = Promise.resolve();
  return {
    runId,
    current: () => seq,
    lastHash: () => prev,
    log(step, input, output, sources = []) {
      seq += 1;
      const mySeq = seq;
      const ts = toDatetime(new Date());
      const job = queue.then(async () => {
        const canonical = JSON.stringify({
          run_id: runId,
          user_id: userId,
          seq: mySeq,
          ts,
          step,
          input: input ?? null,
          output: output ?? null,
          sources,
        });
        const prevHash = prev;
        const hash = await sha256Hex(`${prevHash}|${canonical}`);
        prev = hash;
        try {
          await s2Exec(
            "INSERT INTO audit_events (id, run_id, user_id, seq, step, input, output, sources, ts, canonical, prev_hash, hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [
              crypto.randomUUID(),
              runId,
              userId,
              mySeq,
              step,
              JSON.stringify(input ?? null),
              JSON.stringify(output ?? null),
              JSON.stringify(sources),
              ts,
              canonical,
              prevHash,
              hash,
            ],
          );
        } catch (err) {
          // Never let a logging failure break the user's flow; surface it in Convex logs.
          console.error(`audit write failed (run ${runId}, seq ${mySeq}, ${step}):`, err);
        }
      });
      queue = job;
      return job;
    },
  };
}
