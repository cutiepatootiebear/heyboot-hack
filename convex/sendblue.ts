// iMessage/SMS channel via Sendblue, behind the SENDBLUE_ENABLED flag (web chat stays the default).
// Inbound: Sendblue → POST /sendblue?token=... (convex/http.ts) → inbound.receive (dedupe) →
// this action (same YES fast path / agent loop as web chat) → reply sent with Sendblue's API.
//
// Env: SENDBLUE_ENABLED ("true" to turn on), SENDBLUE_WEBHOOK_TOKEN (shared secret in the webhook
// URL), SENDBLUE_API_KEY_ID, SENDBLUE_API_SECRET, SENDBLUE_FROM_NUMBER, SENDBLUE_BASE_URL.
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

export const sendblueEnabled = () => process.env.SENDBLUE_ENABLED === "true";

export async function sendText(to: string, content: string): Promise<{ ok: boolean; status: number; body: string }> {
  const base = (process.env.SENDBLUE_BASE_URL || "https://api.sendblue.co").replace(/\/$/, "");
  const res = await fetch(`${base}/api/send-message`, {
    method: "POST",
    headers: {
      "sb-api-key-id": process.env.SENDBLUE_API_KEY_ID ?? "",
      "sb-api-secret-key": process.env.SENDBLUE_API_SECRET ?? "",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ number: to, from_number: process.env.SENDBLUE_FROM_NUMBER, content }),
  });
  const body = await res.text();
  return { ok: res.ok, status: res.status, body: body.slice(0, 300) };
}

export const handleInbound = internalAction({
  args: {
    userId: v.id("users"),
    runId: v.id("runs"),
    kind: v.union(v.literal("agent"), v.literal("yes_fast_path")),
    text: v.string(),
    from: v.string(),
  },
  handler: async (ctx, args) => {
    let out: { reply: string; status: "done" | "refused" | "error" };
    try {
      out =
        args.kind === "yes_fast_path"
          ? await ctx.runAction(internal.tools.purchase.yesFastPath, { userId: args.userId, runId: args.runId, text: args.text })
          : await ctx.runAction(internal.agent.loop.run, { userId: args.userId, runId: args.runId, text: args.text });
    } catch (err) {
      console.error("sendblue run failed", err);
      out = { reply: "Something went wrong on my end. Nothing was charged. Please try again.", status: "error" };
    }
    await ctx.runMutation(internal.inbound.finish, {
      userId: args.userId,
      runId: args.runId,
      reply: out.reply,
      status: out.status,
      channel: "sms",
    });
    const sent = await sendText(args.from, out.reply);
    if (!sent.ok) console.error(`Sendblue send failed ${sent.status}: ${sent.body}`);
    return null;
  },
});
