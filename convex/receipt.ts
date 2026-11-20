// Receipt data for /receipt/$proposalId: the proposal and order from Convex plus every
// audit_events row from SingleStore that belongs to it. The page converts this with
// src/components/receipt/fromConvex.ts → toReceiptData().
// Public on purpose (the receipt link is shared by text). Demo data only; IDs are unguessable.
import { v } from "convex/values";
import { action, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { s2Query } from "./lib/singlestore";
import type { Doc } from "./_generated/dataModel";

export const proposalAndOrder = internalQuery({
  args: { proposalId: v.string() },
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId("proposals", args.proposalId);
    if (!id) return null;
    const proposal = await ctx.db.get(id);
    if (!proposal) return null;
    const order = await ctx.db
      .query("orders")
      .withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", `${proposal.userId}:${proposal._id}`))
      .unique();
    return { proposal, order };
  },
});

type AuditRow = {
  run_id: string;
  seq: number;
  step: string;
  input: unknown;
  output: unknown;
  sources: unknown;
  ts: string;
  canonical: string | null;
  prev_hash: string | null;
  hash: string | null;
};

const COLS = "run_id, seq, step, input, output, sources, ts, canonical, prev_hash, hash";
const toDatetime = (ms: number) => new Date(ms).toISOString().replace("T", " ").replace("Z", "");
const parse = (v: unknown): any => {
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
};

export type ReceiptPayload = {
  proposal: Pick<Doc<"proposals">, "_creationTime" | "items" | "rejected" | "total" | "budget" | "status" | "approvedAt"> & {
    _id: string;
  };
  order: (Pick<Doc<"orders">, "_creationTime" | "amountCents" | "status" | "stripePaymentIntentId"> & { _id: string }) | null;
  audit: AuditRow[];
};

export const get = action({
  args: { proposalId: v.string() },
  handler: async (ctx, args): Promise<ReceiptPayload | null> => {
    const found: { proposal: Doc<"proposals">; order: Doc<"orders"> | null } | null = await ctx.runQuery(
      internal.receipt.proposalAndOrder,
      { proposalId: args.proposalId },
    );
    if (!found) return null;
    const { proposal, order } = found;

    // Runs that belong to this proposal: the run that created it, plus every YES attempt
    // that approved it or was refused because it was already handled.
    const own = await s2Query<AuditRow>(
      `SELECT ${COLS} FROM audit_events
       WHERE run_id IN (
         SELECT DISTINCT run_id FROM audit_events
         WHERE run_id = ?
            OR (step = 'approval' AND (JSON_EXTRACT_STRING(output, 'proposalId') = ?
                                    OR JSON_EXTRACT_STRING(output, 'lastProposalId') = ?))
       )
       ORDER BY ts, seq
       LIMIT 500`,
      [proposal.runId, proposal._id, proposal._id],
    );

    // Earlier turns of the same conversation (e.g. the original request, then the agent asking
    // for sizes): walk back over this user's runs from the 15 minutes before, stopping at a run
    // that produced its own proposal. At most 3 runs.
    const proposalRunStart = own.filter((r) => r.run_id === proposal.runId).map((r) => String(r.ts)).sort()[0];
    let earlier: AuditRow[] = [];
    if (proposalRunStart) {
      const windowStart = toDatetime(new Date(proposalRunStart.replace(" ", "T") + "Z").getTime() - 15 * 60 * 1000);
      const prior = await s2Query<AuditRow>(
        `SELECT ${COLS} FROM audit_events WHERE user_id = ? AND ts >= ? AND ts < ? ORDER BY ts, seq LIMIT 500`,
        [proposal.userId, windowStart, proposalRunStart],
      );
      const byRun = new Map<string, AuditRow[]>();
      for (const r of prior) {
        if (r.run_id === proposal.runId) continue;
        byRun.set(r.run_id, [...(byRun.get(r.run_id) ?? []), r]);
      }
      const runsNewestFirst = [...byRun.entries()].sort((a, b) => String(b[1][0].ts).localeCompare(String(a[1][0].ts)));
      for (const [, rows] of runsNewestFirst.slice(0, 3)) {
        const madeProposal = rows.some((r) => r.step === "propose" && parse(r.output)?.proposalId);
        const wasYes = rows.some((r) => r.step === "approval");
        if (madeProposal || wasYes) break;
        earlier = [...rows, ...earlier];
      }
    }
    const audit = [...earlier, ...own];

    return {
      proposal: {
        _id: proposal._id as string,
        _creationTime: proposal._creationTime,
        items: proposal.items,
        rejected: proposal.rejected,
        total: proposal.total,
        budget: proposal.budget,
        status: proposal.status,
        approvedAt: proposal.approvedAt,
      },
      order: order
        ? {
            _id: order._id as string,
            _creationTime: order._creationTime,
            amountCents: order.amountCents,
            status: order.status,
            stripePaymentIntentId: order.stripePaymentIntentId,
          }
        : null,
      audit: audit.map((r) => ({ ...r, seq: Number(r.seq), ts: String(r.ts) })),
    };
  },
});
