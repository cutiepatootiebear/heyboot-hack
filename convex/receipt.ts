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
    const audit = await s2Query<AuditRow>(
      `SELECT run_id, seq, step, input, output, sources, ts FROM audit_events
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
