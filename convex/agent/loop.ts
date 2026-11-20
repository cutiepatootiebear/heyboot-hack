"use node";
// Sonnet tool loop (minimal milestone version: search_catalog, propose_purchase, recall_memory).
// Every tool call and its result is written to audit_events automatically.
// (Ben owns convex/agent/; written on main for the 1:30 milestone.)
import Anthropic from "@anthropic-ai/sdk";
import { v } from "convex/values";
import { internalAction, type ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { createAuditor } from "../lib/audit";
import { searchCatalog } from "../tools/catalog";
import { proposePurchase, checkedAt, type ProposeInput } from "../tools/propose";
import { SYSTEM_PROMPT } from "./prompt";
import { cogneeConfigured, recall as cogneeRecall, save as cogneeSave } from "../integrations/cognee";

const MODEL = "claude-sonnet-5-5";
const MAX_TURNS = 8;

const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "recall_memory",
    description:
      "Recall what Hey Boot remembers about this user (sizes, brand preferences, past budgets). Call this first when the request depends on sizes or preferences.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "What you want to recall, e.g. 'shoe size'." } },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "save_memory",
    description:
      "Save one fact the user told you about themselves (a size or preference) so you never have to ask again. " +
      "Use short snake_case keys: cammies_size, cover_size, undershirt_size, boot_size, shoe_size, brand_preference.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        key: { type: "string" },
        value: { type: "string", description: "The fact in the user's own terms, e.g. 'MCCUU blouse and trousers: Medium-Regular'." },
      },
      required: ["key", "value"],
      additionalProperties: false,
    },
  },
  {
    name: "search_catalog",
    description:
      "Search the product catalog. Every row has a real price, store, product URL and the time the price was captured. " +
      "Search with short keywords that would appear in a product name (brand, model, size, 'wide', 'lock'), not full sentences. " +
      "Use an empty query to list everything; the catalog is small.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string" },
        max_price: { type: ["number", "null"], description: "Max list price in USD, or null." },
        in_stock_only: { type: "boolean" },
      },
      required: ["query", "max_price", "in_stock_only"],
      additionalProperties: false,
    },
  },
  {
    name: "propose_purchase",
    description:
      "Create the approve card the user replies YES to. Pass exact item and store strings from search_catalog; the server fills in " +
      "price, discount, URL and timestamp from the catalog and checks the total against the budget. " +
      "List the options you considered and didn't pick in `rejected`, each with a short reason.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: { item: { type: "string" }, store: { type: "string" }, qty: { type: "integer" } },
            required: ["item", "store", "qty"],
            additionalProperties: false,
          },
        },
        budget: { type: "number", description: "The user's total budget in USD." },
        rejected: {
          type: "array",
          items: {
            type: "object",
            properties: { item: { type: "string" }, store: { type: "string" }, reason: { type: "string" } },
            required: ["item", "store", "reason"],
            additionalProperties: false,
          },
        },
      },
      required: ["items", "budget", "rejected"],
      additionalProperties: false,
    },
  },
];

export const run = internalAction({
  args: {
    userId: v.id("users"),
    runId: v.id("runs"),
    text: v.string(),
    startSeq: v.optional(v.number()),
    startHash: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ reply: string; status: "done" | "refused" | "error" }> => {
    const audit = createAuditor(args.runId, args.userId, args.startSeq ?? 0, args.startHash);
    if (!args.startSeq) await audit.log("inbound", { text: args.text, route: "agent" }, null);

    // Conversation so far (the current inbound message is already stored, so it's the last "in").
    const past: { direction: "in" | "out"; body: string }[] = await ctx.runQuery(internal.inbound.history, {
      userId: args.userId,
      limit: 12,
    });
    const messages: Anthropic.Beta.BetaMessageParam[] = [];
    for (const m of past) {
      const role = m.direction === "in" ? "user" : "assistant";
      const last = messages[messages.length - 1];
      if (last && last.role === role && typeof last.content === "string") last.content += `\n\n${m.body}`;
      else messages.push({ role, content: m.body });
    }
    if (args.startSeq) messages.push({ role: "user", content: args.text }); // system note from the fast path
    while (messages.length && messages[0].role !== "user") messages.shift();
    if (!messages.length) messages.push({ role: "user", content: args.text });

    const client = new Anthropic();
    let proposalCard: string | null = null;

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const response = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "medium" },
        system: SYSTEM_PROMPT,
        tools: TOOLS,
        messages,
      });

      if (response.stop_reason === "refusal") {
        await audit.log("model_refusal", null, { stop_details: response.stop_details ?? null });
        const reply = "I can't help with that one. I can compare prices on gear you need before reporting.";
        await audit.log("outbound", null, { reply });
        return { reply, status: "refused" };
      }

      messages.push({ role: "assistant", content: response.content });
      const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");

      if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
        // Only the last text block is the message for the user; earlier blocks in the same
        // response can be the model's working notes ("Missing sizes. Ask once.").
        const textBlocks = response.content
          .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
          .map((b) => b.text.trim())
          .filter(Boolean);
        const text = textBlocks[textBlocks.length - 1] ?? "";
        let reply = text || "Sorry, I didn't get that. What gear do you need, and what's your budget?";
        if (proposalCard && !reply.includes("Reply YES")) reply = `${reply}\n\n${proposalCard}`.trim();
        await audit.log("outbound", null, { reply, stop_reason: response.stop_reason, textBlocks: textBlocks.length, droppedText: textBlocks.slice(0, -1) });
        return { reply, status: "done" };
      }

      const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const tu of toolUses) {
        const out = await runTool(ctx, args.userId, args.runId, tu.name, tu.input, audit);
        if (out.card) proposalCard = out.card;
        results.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(out.result), is_error: out.isError });
      }
      messages.push({ role: "user", content: results });
    }

    const reply = proposalCard ?? "I ran out of steps on that one. Try asking again with what you need and your budget.";
    await audit.log("outbound", null, { reply, note: "max turns reached" });
    return { reply, status: proposalCard ? "done" : "error" };
  },
});

type ToolOut = { result: unknown; isError: boolean; card?: string };

async function runTool(
  ctx: ActionCtx,
  userId: Id<"users">,
  runId: Id<"runs">,
  name: string,
  rawInput: unknown,
  audit: ReturnType<typeof createAuditor>,
): Promise<ToolOut> {
  const input = (rawInput ?? {}) as Record<string, unknown>;
  try {
    switch (name) {
      case "recall_memory": {
        const query = typeof input.query === "string" && input.query.trim() ? input.query : "sizes and preferences";
        const convexMemories = await ctx.runQuery(internal.tools.data.recallMemories, { userId });
        // Facts saved during this conversation may still be processing in Cognee (~10 s),
        // so they are always included from Convex alongside Cognee's answer.
        const savedByAgent = convexMemories.filter((m) => m.origin === "agent");
        let fallbackReason = "Cognee not configured";
        if (cogneeConfigured()) {
          try {
            const cognee = await cogneeRecall(userId, query);
            if (cognee.length) {
              const memories = [...cognee.map((m) => ({ ...m, source: "cognee" as const })), ...savedByAgent];
              const backend = savedByAgent.length ? "cognee+convex(recent saves)" : "cognee";
              await audit.log("recall_memory", input, { memories, backend });
              return { result: { memories, backend }, isError: false };
            }
            fallbackReason = "Cognee returned nothing";
          } catch (err) {
            fallbackReason = `Cognee error: ${err instanceof Error ? err.message : String(err)}`;
          }
        }
        await audit.log("recall_memory", input, { memories: convexMemories, backend: "convex", fallbackReason });
        return { result: { memories: convexMemories, backend: "convex" }, isError: false };
      }
      case "save_memory": {
        const key = String(input.key ?? "").trim().slice(0, 64);
        const value = String(input.value ?? "").trim().slice(0, 300);
        if (!key || !value) return { result: { error: "key and value are required" }, isError: true };
        await ctx.runMutation(internal.tools.data.saveMemory, { userId, key, value });
        let cognee: { saved: boolean; error?: string; pipelineRunId?: string } = { saved: false, error: "Cognee not configured" };
        if (cogneeConfigured()) {
          try {
            const r = await cogneeSave(userId, key, value);
            cognee = { saved: true, pipelineRunId: r.id };
          } catch (err) {
            cognee = { saved: false, error: err instanceof Error ? err.message : String(err) };
          }
        }
        const result = { saved: true, key, value, convex: true, cognee };
        await audit.log("save_memory", input, result);
        return { result, isError: false };
      }
      case "search_catalog": {
        const rows = await searchCatalog({
          query: typeof input.query === "string" ? input.query : "",
          maxPrice: typeof input.max_price === "number" ? input.max_price : null,
          inStockOnly: input.in_stock_only === true,
        });
        const result = {
          rows: rows.map((r) => ({ ...r, capturedAtPT: checkedAt(r.capturedAt) })),
          notFound: rows.length === 0,
        };
        await audit.log(
          "search_catalog",
          input,
          result,
          rows.map((r) => ({ title: `${r.item} at ${r.store}`, url: r.url, captured_at: r.capturedAt })),
        );
        return { result, isError: false };
      }
      case "propose_purchase": {
        const res = await proposePurchase(ctx, userId, runId, input as unknown as ProposeInput, audit);
        if (!res.ok) {
          await audit.log("propose", input, { error: res.error });
          return { result: { error: res.error }, isError: true };
        }
        return {
          result: { proposalId: res.proposalId, total: res.total, card: res.card, instructions: "Send the card text to the user exactly as written." },
          isError: false,
          card: res.card,
        };
      }
      default:
        await audit.log("unknown_tool", { name, input }, null);
        return { result: { error: `Unknown tool ${name}` }, isError: true };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await audit.log(name, input, { error: message });
    return { result: { error: message }, isError: true };
  }
}
