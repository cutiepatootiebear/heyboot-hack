// Copy a user's Convex memories into Cognee (write-through for seeded demo users).
import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { cogneeConfigured, save } from "../integrations/cognee";

export const seedCognee = internalAction({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    if (!cogneeConfigured()) return { saved: 0, skipped: "Cognee not configured" };
    const memories: { key: string; value: string }[] = await ctx.runQuery(internal.tools.data.recallMemories, {
      userId: args.userId,
    });
    let saved = 0;
    for (const m of memories) {
      try {
        await save(args.userId, m.key, m.value);
        saved += 1;
      } catch (err) {
        console.error("Cognee save failed", m.key, err);
      }
    }
    return { saved, skipped: null };
  },
});
