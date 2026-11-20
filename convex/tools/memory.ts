import { internal } from "../_generated/api";
import { cogneeConfigured, save as cogneeSave } from "../integrations/cognee";
import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import type { Auditor } from "../lib/audit";

export async function writeMemory(
  ctx: ActionCtx,
  userId: Id<"users">,
  key: string,
  value: string,
  audit: Auditor,
): Promise<{ ok: true; backend: string; error: string | null }> {
  let backend = "convex";
  let error: string | null = null;
  if (cogneeConfigured()) {
    try {
      await cogneeSave(userId, key, value);
      backend = "cognee";
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }
  await ctx.runMutation(internal.tools.data.saveMemory, { userId, key, value });
  const result = { ok: true as const, backend, error };
  await audit.log("save_memory", { key, value }, result);
  return result;
}
