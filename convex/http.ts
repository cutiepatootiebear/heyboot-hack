import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS } });

// POST /chat  { handle: string, text: string, messageId: string }  →  { reply, runId }
// Web-chat fallback channel. Demo only: the handle identifies the user (no auth).
http.route({
  path: "/chat",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ error: "invalid JSON" }, 400);
    }
    const b = body as Record<string, unknown>;
    if (
      typeof b?.handle !== "string" || !b.handle.trim() || b.handle.length > 64 ||
      typeof b.text !== "string" || !b.text.trim() || b.text.length > 2000 ||
      typeof b.messageId !== "string" || !b.messageId.trim() || b.messageId.length > 128
    ) {
      return json({ error: "expected { handle, text, messageId } as non-empty strings" }, 400);
    }
    const handle = b.handle.trim();
    const text = b.text.trim();

    const r = await ctx.runMutation(internal.inbound.receive, {
      handle,
      text,
      externalId: `web:${b.messageId}`,
      channel: "web",
    });
    if (r.duplicate) return json({ duplicate: true, reply: null });

    let out: { reply: string; status: "done" | "refused" | "error" };
    try {
      out =
        r.kind === "yes_fast_path"
          ? await ctx.runAction(internal.tools.purchase.yesFastPath, { userId: r.userId, runId: r.runId, text })
          : await ctx.runAction(internal.agent.loop.run, { userId: r.userId, runId: r.runId, text });
    } catch (err) {
      console.error("run failed", err);
      out = { reply: "Something went wrong on my end. Nothing was charged. Please try again.", status: "error" };
    }
    await ctx.runMutation(internal.inbound.finish, {
      userId: r.userId,
      runId: r.runId,
      reply: out.reply,
      status: out.status,
      channel: "web",
    });
    return json({ reply: out.reply, runId: r.runId, status: out.status });
  }),
});

http.route({
  path: "/chat",
  method: "OPTIONS",
  handler: httpAction(async () => new Response(null, { status: 204, headers: CORS })),
});

export default http;
