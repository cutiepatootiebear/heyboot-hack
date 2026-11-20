"use node";
// Sonnet tool loop (minimal milestone version: search_catalog, propose_purchase, recall_memory).
// Every tool call and its result is written to audit_events automatically.
// (Ben owns convex/agent/; written on main for the 1:30 milestone.)
import Anthropic from "@anthropic-ai/sdk";
import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { createAuditor } from "../lib/audit";
import { searchCatalog } from "../tools/catalog";
import { checkedAt, proposePurchase } from "../tools/propose";
import { cogneeConfigured, recall as cogneeRecall } from "../integrations/cognee";
import { CRISIS_REPLY, classify } from "../crisis";
import { writeMemory } from "../tools/memory";
import { lookupContext } from "../tools/context";
import { SYSTEM_PROMPT } from "./prompt";
import type { ProposeInput } from "../tools/propose";
import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

const MODEL = "claude-sonnet-5-5";
const MAX_TURNS = 8;

const TOOLS: Array<Anthropic.Beta.BetaTool> = [
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
  {
    name: "save_memory",
    description:
      "Remember a durable fact about this user (a size, a brand preference, a budget). Call when the user states a lasting preference or corrects an old one. Do not store secrets or payment details.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        key: { type: "string", description: "Short snake_case name, e.g. 'shoe_size'." },
        value: { type: "string", description: "The fact to remember." },
      },
      required: ["key", "value"],
      additionalProperties: false,
    },
  },
  {
    name: "lookup_context",
    description:
      "Look up trusted context, such as a store's military discount policy, with a short question. Returns an answer and the source pages it came from. If it returns 'not found' or no sources, say you couldn't verify it and do not apply a discount.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { question: { type: "string" } },
      required: ["question"],
      additionalProperties: false,
    },
  },
  {
    name: "purchase",
    description:
      "Check for a purchase the user already approved. Never call this on your own: a charge only happens after the user replies YES. If there is no approved purchase, send the card and ask the user to reply YES.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { confirmed: { type: "boolean" } },
      required: ["confirmed"],
      additionalProperties: false,
    },
  },
  {
    name: "escalate_crisis",
    description:
      "Use only when the user's message shows self-harm or an immediate mental-health crisis, or when they ask for crisis help. Returns the crisis-line resources to send them. Never use for ordinary shopping questions.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { reason: { type: "string", description: "Why this is a crisis message." } },
      required: ["reason"],
      additionalProperties: false,
    },
  },
  {
    name: "refuse",
    description:
      "Decline a request outside what Hey Boot does, such as asking for credentials, financial advice, or help with anything other than gear shopping. Give a short reason.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { reason: { type: "string" } },
      required: ["reason"],
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
  },
  handler: async (ctx, args): Promise<{ reply: string; status: "done" | "refused" | "error" }> => {
    const audit = createAuditor(args.runId, args.userId, args.startSeq ?? 0);
    if (!args.startSeq) await audit.log("inbound", { text: args.text, route: "agent" }, null);

    const crisis = await classify(args.text);
    await audit.log("crisis", { text: args.text }, { crisis: crisis.crisis, backend: crisis.backend, reason: crisis.reason });
    if (crisis.crisis) {
      await audit.log("outbound", null, { reply: CRISIS_REPLY, crisis: true });
      return { reply: CRISIS_REPLY, status: "refused" };
    }

    // Conversation so far (the current inbound message is already stored, so it's the last "in").
    const past: Array<{ direction: "in" | "out"; body: string }> = await ctx.runQuery(internal.inbound.history, {
      userId: args.userId,
      limit: 12,
    });
    const messages: Array<Anthropic.Beta.BetaMessageParam> = [];
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
        const text = response.content
          .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim();
        let reply = text || "Sorry, I didn't get that. What gear do you need, and what's your budget?";
        if (proposalCard && !reply.includes("Reply YES")) reply = `${reply}\n\n${proposalCard}`.trim();
        await audit.log("outbound", null, { reply, stop_reason: response.stop_reason });
        return { reply, status: "done" };
      }

      const results: Array<Anthropic.Beta.BetaToolResultBlockParam> = [];
      for (const tu of toolUses) {
        const out = await runTool(ctx, args.userId, args.runId, tu.name, tu.input, audit);
        if (out.card) proposalCard = out.card;
        results.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(out.result), is_error: out.isError });
        if (out.crisis) {
          await audit.log("outbound", null, { reply: CRISIS_REPLY, crisis: true });
          return { reply: CRISIS_REPLY, status: "refused" };
        }
        if (out.refuse) {
          const reply = out.reply ?? "I can't help with that one. I can compare prices on gear you need before reporting.";
          await audit.log("outbound", null, { reply });
          return { reply, status: "refused" };
        }
      }
      messages.push({ role: "user", content: results });
    }

    const reply = proposalCard ?? "I ran out of steps on that one. Try asking again with what you need and your budget.";
    await audit.log("outbound", null, { reply, note: "max turns reached" });
    return { reply, status: proposalCard ? "done" : "error" };
  },
});

type ToolOut = {
  result: unknown;
  isError: boolean;
  card?: string;
  crisis?: boolean;
  refuse?: boolean;
  reply?: string;
};

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
        let fallbackReason = "Cognee not configured";
        if (cogneeConfigured()) {
          try {
            const memories = await cogneeRecall(userId, query);
            if (memories.length) {
              await audit.log("recall_memory", input, { memories, backend: "cognee" });
              return { result: { memories, backend: "cognee" }, isError: false };
            }
            fallbackReason = "Cognee returned nothing";
          } catch (err) {
            fallbackReason = `Cognee error: ${err instanceof Error ? err.message : String(err)}`;
          }
        }
        const memories = await ctx.runQuery(internal.tools.data.recallMemories, { userId });
        await audit.log("recall_memory", input, { memories, backend: "convex", fallbackReason });
        return { result: { memories, backend: "convex" }, isError: false };
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
      case "save_memory": {
        const key = typeof input.key === "string" ? input.key.trim().slice(0, 64) : "";
        const value = typeof input.value === "string" ? input.value.trim().slice(0, 500) : "";
        if (!key || !value) {
          const result = { error: "Both key and value are required." };
          await audit.log("save_memory", input, result);
          return { result, isError: true };
        }
        const result = await writeMemory(ctx, userId, key, value, audit);
        return { result, isError: false };
      }
      case "lookup_context": {
        const question = typeof input.question === "string" ? input.question.trim().slice(0, 300) : "";
        if (!question) {
          const result = { error: "A question is required." };
          await audit.log("lookup_context", input, result);
          return { result, isError: true };
        }
        const result = await lookupContext(question, audit);
        return { result, isError: false };
      }
      case "purchase": {
        const result = {
          ok: false,
          error: "A charge only happens after the user replies YES to the card I sent. Send the card and ask them to reply YES.",
        };
        await audit.log("purchase", input, result);
        return { result, isError: false };
      }
      case "escalate_crisis": {
        await audit.log("escalate_crisis", input, { reply: CRISIS_REPLY });
        return { result: { reply: CRISIS_REPLY }, isError: false, card: CRISIS_REPLY, crisis: true };
      }
      case "refuse": {
        const reason = typeof input.reason === "string" && input.reason.trim() ? input.reason.trim() : "";
        const reply = `I can't help with that. I can compare prices on gear you need before reporting.${reason ? ` ${reason}` : ""}`;
        await audit.log("refuse", input, { reply });
        return { result: { reply }, isError: false, refuse: true, reply };
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
