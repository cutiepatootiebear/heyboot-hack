// Audit writer: one `audit_events` row in SingleStore per step.
// Agent-loop code logs only through `createAuditor(...).log(...)`; it never writes SQL itself.
import { s2Exec } from "./singlestore";

export type AuditSource = { title: string; url: string; captured_at?: string; retrieved_at?: string };

export type Auditor = {
  runId: string;
  log: (step: string, input: unknown, output: unknown, sources?: AuditSource[]) => Promise<void>;
  /** Last seq written; pass it as `startSeq` when another action continues the same run. */
  current: () => number;
};

const toDatetime = (d: Date) => d.toISOString().replace("T", " ").replace("Z", "");

export function createAuditor(runId: string, userId: string, startSeq = 0): Auditor {
  let seq = startSeq;
  return {
    runId,
    current: () => seq,
    async log(step, input, output, sources = []) {
      seq += 1;
      try {
        await s2Exec(
          "INSERT INTO audit_events (id, run_id, user_id, seq, step, input, output, sources, ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [
            crypto.randomUUID(),
            runId,
            userId,
            seq,
            step,
            JSON.stringify(input ?? null),
            JSON.stringify(output ?? null),
            JSON.stringify(sources),
            toDatetime(new Date()),
          ],
        );
      } catch (err) {
        // Never let a logging failure break the user's flow; surface it in Convex logs.
        console.error(`audit write failed (run ${runId}, seq ${seq}, ${step}):`, err);
      }
    },
  };
}
