// YES fast path (no model call): guard → stock re-check → claim order → Stripe test charge.
// Every attempt, allowed or refused, is written to audit_events.
import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { createAuditor } from "../lib/audit";
import { createTestCharge } from "../integrations/stripe";
import { getCatalogRow } from "./catalog";

const RECEIPT_BASE = "https://heyboot-hack.vercel.app/receipt/";

export const yesFastPath = internalAction({
  args: { userId: v.id("users"), runId: v.id("runs"), text: v.string() },
  handler: async (ctx, args): Promise<{ reply: string; status: "done" | "refused" | "error" }> => {
    const audit = createAuditor(args.runId, args.userId);
    await audit.log("inbound", { text: args.text, route: "yes_fast_path" }, null);

    const approval = await ctx.runMutation(internal.tools.data.approvePending, { userId: args.userId });
    await audit.log(
      "approval",
      { guard: { sameUser: true, status: "pending", maxAgeMinutes: 30 } },
      approval.ok
        ? { allowed: true, proposalId: approval.proposal._id, ageSeconds: Math.round(approval.ageMs / 1000) }
        : { allowed: false, reason: approval.reason, lastProposalId: approval.lastProposalId, lastStatus: approval.lastStatus },
    );

    if (!approval.ok) {
      if (approval.reason === "no_pending" && approval.lastProposalId) {
        const order = await ctx.runQuery(internal.tools.data.orderForProposal, {
          userId: args.userId,
          proposalId: approval.lastProposalId,
        });
        if (order?.status === "charged") {
          const reply = `Already done. That order went through once (order ${order._id}). No second charge.\nReceipt: ${RECEIPT_BASE}${approval.lastProposalId}`;
          await audit.log("outbound", null, { reply });
          return { reply, status: "refused" };
        }
      }
      const reply =
        approval.reason === "expired"
          ? "That offer is more than 30 minutes old, so I didn't buy it. Prices may have changed. Tell me what you need and I'll check again."
          : "There's nothing waiting for your YES right now. Tell me what you need and I'll find options.";
      await audit.log("outbound", null, { reply });
      return { reply, status: "refused" };
    }

    const proposal = approval.proposal;

    // Re-check stock right before charging.
    const stock = [];
    for (const it of proposal.items) {
      const row = await getCatalogRow(it.item, it.store);
      stock.push({ item: it.item, store: it.store, inStock: row?.inStock ?? false });
    }
    const out = stock.filter((s) => !s.inStock);
    await audit.log("stock_check", { items: proposal.items.map((i) => ({ item: i.item, store: i.store })) }, { stock });
    if (out.length) {
      await ctx.runMutation(internal.tools.data.setProposalStatus, { proposalId: proposal._id, status: "superseded" });
      const note =
        `[System note, not from the user] The user replied YES, but these approved items are now out of stock: ` +
        out.map((o) => `"${o.item}" at ${o.store}`).join("; ") +
        `. Nothing was charged. Propose the next best in-stock option within the same budget (${proposal.budget}).`;
      const swap: { reply: string } = await ctx.runAction(internal.agent.loop.run, {
        userId: args.userId,
        runId: args.runId,
        text: note,
        startSeq: audit.current(),
      });
      const reply = `Heads up: ${out.map((o) => `${o.item} at ${o.store}`).join(", ")} just went out of stock, so I didn't charge you.\n\n${swap.reply}`;
      await audit.log("outbound", null, { reply });
      return { reply, status: "done" };
    }

    const amountCents = Math.round(proposal.total * 100);
    const claim = await ctx.runMutation(internal.tools.data.claimOrder, {
      userId: args.userId,
      proposalId: proposal._id,
      amountCents,
    });
    if (!claim.claimed) {
      await audit.log("purchase", { idempotencyKey: claim.idempotencyKey }, { skipped: "order already claimed", orderId: claim.order._id });
      const reply = `Already done. That order went through once (order ${claim.order._id}). No second charge.`;
      await audit.log("outbound", null, { reply });
      return { reply, status: "refused" };
    }

    try {
      const charge = await createTestCharge({
        amountCents,
        idempotencyKey: claim.idempotencyKey,
        metadata: { proposalId: proposal._id, userId: args.userId, runId: args.runId, orderId: claim.order._id },
      });
      await ctx.runMutation(internal.tools.data.settleOrder, {
        orderId: claim.order._id,
        status: "charged",
        stripePaymentIntentId: charge.paymentIntentId,
        error: null,
      });
      await ctx.runMutation(internal.tools.data.setProposalStatus, { proposalId: proposal._id, status: "purchased" });
      await audit.log(
        "purchase",
        { amountCents, idempotencyKey: claim.idempotencyKey, mode: "stripe_test" },
        { orderId: claim.order._id, paymentIntentId: charge.paymentIntentId, status: charge.status },
      );
      const reply =
        `Done. Order ${claim.order._id} placed for $${proposal.total.toFixed(2)} ` +
        `(Stripe test payment ${charge.paymentIntentId}; no real money moved).\n` +
        `Receipt with every source and step: ${RECEIPT_BASE}${proposal._id}`;
      await audit.log("outbound", null, { reply });
      return { reply, status: "done" };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await ctx.runMutation(internal.tools.data.settleOrder, {
        orderId: claim.order._id,
        status: "failed",
        stripePaymentIntentId: null,
        error: message,
      });
      await ctx.runMutation(internal.tools.data.setProposalStatus, { proposalId: proposal._id, status: "failed" });
      await audit.log("purchase", { amountCents, idempotencyKey: claim.idempotencyKey }, { error: message });
      const reply = "The test payment didn't go through, so nothing was charged. I've logged the error.";
      await audit.log("outbound", null, { reply });
      return { reply, status: "error" };
    }
  },
});
