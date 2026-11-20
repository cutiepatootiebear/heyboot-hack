// Inbound routing data layer: dedupe, user lookup, run bookkeeping, outbound record.
// (Ben owns this file; minimal version written on main for the 1:30 milestone.)
import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";

const YES_WORDS = new Set(["yes", "y", "yes!", "yes.", "yep", "yeah", "ok yes", "yes please"]);
export const isYes = (text: string) => YES_WORDS.has(text.trim().toLowerCase());

const DEMO_MEMORIES: { key: string; value: string }[] = [
  { key: "shoe_size", value: "Men's 10.5, wide (2E/EE)" },
  { key: "brand_preference", value: "Prefers Brooks running shoes" },
  { key: "cammies_size", value: "MCCUU blouse and trousers: Medium-Regular" },
  { key: "cover_size", value: "8-point cover: 7 3/8 (stores that sell S/M/L: Medium)" },
  { key: "undershirt_size", value: "Coyote brown undershirt: Medium" },
  { key: "boot_size", value: "Boots: men's 10.5 wide" },
];

export const receive = internalMutation({
  args: {
    handle: v.string(),
    text: v.string(),
    externalId: v.string(),
    channel: v.union(v.literal("web"), v.literal("sms")),
  },
  handler: async (ctx, args) => {
    const dup = await ctx.db
      .query("messages")
      .withIndex("by_externalId", (q) => q.eq("externalId", args.externalId))
      .first();
    if (dup) return { duplicate: true as const };

    let user = await ctx.db
      .query("users")
      .withIndex("by_handle", (q) => q.eq("handle", args.handle))
      .unique();
    if (!user) {
      const userId = await ctx.db.insert("users", { handle: args.handle, displayName: args.handle });
      // Demo users get the "seeded earlier" memories from the spec's Gear Run.
      if (args.handle.startsWith("demo")) {
        for (const m of DEMO_MEMORIES) {
          await ctx.db.insert("memories", { userId, key: m.key, value: m.value, source: "seed" });
        }
        // Copy the seed into Cognee too (no-op if Cognee isn't configured).
        await ctx.scheduler.runAfter(0, internal.tools.memorySync.seedCognee, { userId });
      }
      user = (await ctx.db.get(userId))!;
    }

    const messageId = await ctx.db.insert("messages", {
      userId: user._id,
      direction: "in",
      channel: args.channel,
      body: args.text,
      externalId: args.externalId,
      runId: null,
    });
    const kind = isYes(args.text) ? ("yes_fast_path" as const) : ("agent" as const);
    const runId = await ctx.db.insert("runs", {
      userId: user._id,
      inboundMessageId: messageId,
      kind,
      status: "running",
      endedAt: null,
    });
    await ctx.db.patch(messageId, { runId });
    return { duplicate: false as const, userId: user._id, runId, kind };
  },
});

export const finish = internalMutation({
  args: {
    userId: v.id("users"),
    runId: v.id("runs"),
    reply: v.string(),
    status: v.union(v.literal("done"), v.literal("refused"), v.literal("error")),
    channel: v.union(v.literal("web"), v.literal("sms")),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("messages", {
      userId: args.userId,
      direction: "out",
      channel: args.channel,
      body: args.reply,
      externalId: null,
      runId: args.runId,
    });
    await ctx.db.patch(args.runId, { status: args.status, endedAt: Date.now() });
    return null;
  },
});

// Recent conversation for the agent loop, oldest first (bounded).
export const history = internalQuery({
  args: { userId: v.id("users"), limit: v.number() },
  handler: async (ctx, args) => {
    const recent = await ctx.db
      .query("messages")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(args.limit);
    return recent.reverse().map((m) => ({ direction: m.direction, body: m.body }));
  },
});
