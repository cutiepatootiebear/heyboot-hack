// Convex data functions behind the tools: proposals (with the YES guard), orders, memory.
// (Ben owns convex/tools/; minimal version written on main for the 1:30 milestone.)
import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import { proposalItem } from "../schema";

export const APPROVAL_WINDOW_MS = 30 * 60 * 1000;

export const recallMemories = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("memories")
      .withIndex("by_userId_and_key", (q) => q.eq("userId", args.userId))
      .take(50);
    return rows.map((m) => ({
      key: m.key,
      value: m.value,
      source: "convex" as const,
      origin: m.source,
      savedAt: new Date(m._creationTime).toISOString(),
    }));
  },
});

export const saveMemory = internalMutation({
  args: { userId: v.id("users"), key: v.string(), value: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("memories")
      .withIndex("by_userId_and_key", (q) => q.eq("userId", args.userId).eq("key", args.key))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { value: args.value, source: "agent" });
      return existing._id;
    }
    return await ctx.db.insert("memories", { userId: args.userId, key: args.key, value: args.value, source: "agent" });
  },
});

export const createProposal = internalMutation({
  args: {
    userId: v.id("users"),
    runId: v.id("runs"),
    items: v.array(proposalItem),
    rejected: v.array(v.object({ item: v.string(), store: v.string(), reason: v.string() })),
    total: v.number(),
    budget: v.number(),
    card: v.string(),
    smsCard: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Only one live proposal per user: older pending ones are superseded.
    const pending = await ctx.db
      .query("proposals")
      .withIndex("by_userId_and_status", (q) => q.eq("userId", args.userId).eq("status", "pending"))
      .take(20);
    for (const p of pending) await ctx.db.patch(p._id, { status: "superseded" });
    return await ctx.db.insert("proposals", { ...args, status: "pending", approvedAt: null });
  },
});

// YES guard: approve only this user's pending proposal, and only if it is under 30 minutes old.
// Runs as one serializable mutation, so two concurrent YES messages can't both approve.
export const approvePending = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const now = Date.now();
    const pending = await ctx.db
      .query("proposals")
      .withIndex("by_userId_and_status", (q) => q.eq("userId", args.userId).eq("status", "pending"))
      .order("desc")
      .first();
    if (!pending) {
      const purchased = await ctx.db
        .query("proposals")
        .withIndex("by_userId_and_status", (q) => q.eq("userId", args.userId).eq("status", "purchased"))
        .order("desc")
        .first();
      const approved = await ctx.db
        .query("proposals")
        .withIndex("by_userId_and_status", (q) => q.eq("userId", args.userId).eq("status", "approved"))
        .order("desc")
        .first();
      const last = [purchased, approved].filter((p) => p !== null).sort((a, b) => b._creationTime - a._creationTime)[0];
      return { ok: false as const, reason: "no_pending" as const, lastProposalId: last?._id ?? null, lastStatus: last?.status ?? null };
    }
    const ageMs = now - pending._creationTime;
    if (pending.userId !== args.userId) {
      return { ok: false as const, reason: "wrong_user" as const, lastProposalId: null, lastStatus: null };
    }
    if (ageMs > APPROVAL_WINDOW_MS) {
      await ctx.db.patch(pending._id, { status: "superseded" });
      return { ok: false as const, reason: "expired" as const, lastProposalId: pending._id, lastStatus: "superseded" as const, ageMs };
    }
    await ctx.db.patch(pending._id, { status: "approved", approvedAt: now });
    return { ok: true as const, proposal: { ...pending, status: "approved" as const, approvedAt: now }, ageMs };
  },
});

export const setProposalStatus = internalMutation({
  args: {
    proposalId: v.id("proposals"),
    status: v.union(v.literal("purchased"), v.literal("superseded"), v.literal("failed")),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.proposalId, { status: args.status });
    return null;
  },
});

// One order per proposal. Returns the existing order if this key was already claimed.
export const claimOrder = internalMutation({
  args: { userId: v.id("users"), proposalId: v.id("proposals"), amountCents: v.number() },
  handler: async (ctx, args) => {
    const idempotencyKey = `${args.userId}:${args.proposalId}`;
    const existing = await ctx.db
      .query("orders")
      .withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", idempotencyKey))
      .unique();
    if (existing) return { claimed: false as const, order: existing, idempotencyKey };
    const orderId = await ctx.db.insert("orders", {
      userId: args.userId,
      proposalId: args.proposalId,
      idempotencyKey,
      amountCents: args.amountCents,
      status: "claimed",
      stripePaymentIntentId: null,
      error: null,
    });
    return { claimed: true as const, order: (await ctx.db.get(orderId))!, idempotencyKey };
  },
});

export const settleOrder = internalMutation({
  args: {
    orderId: v.id("orders"),
    status: v.union(v.literal("charged"), v.literal("failed")),
    stripePaymentIntentId: v.union(v.string(), v.null()),
    error: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const { orderId, ...fields } = args;
    await ctx.db.patch(orderId, fields);
    return null;
  },
});

export const orderForProposal = internalQuery({
  args: { userId: v.id("users"), proposalId: v.id("proposals") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("orders")
      .withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", `${args.userId}:${args.proposalId}`))
      .unique();
  },
});

// The pending proposal created by a given run, if any (used to send the compact iMessage card).
export const pendingProposalForRun = internalQuery({
  args: { userId: v.id("users"), runId: v.id("runs") },
  handler: async (ctx, args) => {
    const pending = await ctx.db
      .query("proposals")
      .withIndex("by_userId_and_status", (q) => q.eq("userId", args.userId).eq("status", "pending"))
      .order("desc")
      .take(5);
    return pending.find((p) => p.runId === args.runId) ?? null;
  },
});

export const setSmsCard = internalMutation({
  args: { proposalId: v.id("proposals"), smsCard: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.proposalId, { smsCard: args.smsCard });
    return null;
  },
});
