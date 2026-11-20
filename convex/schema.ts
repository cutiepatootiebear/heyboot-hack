import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Money is stored in US dollars (matching the SingleStore catalog's DECIMAL(10,2)).
// It is converted to integer cents only at the Stripe call.

export const proposalItem = v.object({
  item: v.string(),
  store: v.string(),
  qty: v.number(),
  price: v.number(), // list price from the catalog row
  milDiscountPct: v.number(), // discount actually applied (0 unless a source verified it)
  catalogMilDiscountPct: v.number(), // what the catalog row claims
  discountSourceUrl: v.union(v.string(), v.null()),
  finalPrice: v.number(), // per unit, after the applied discount
  url: v.string(),
  capturedAt: v.string(),
});

export default defineSchema({
  // Template table, still used by the starter page. Remove with the starter page.
  numbers: defineTable({ value: v.number() }),

  users: defineTable({
    handle: v.string(), // web chat handle or phone number
    displayName: v.string(),
  }).index("by_handle", ["handle"]),

  messages: defineTable({
    userId: v.id("users"),
    direction: v.union(v.literal("in"), v.literal("out")),
    channel: v.union(v.literal("web"), v.literal("sms")),
    body: v.string(),
    externalId: v.union(v.string(), v.null()),
    runId: v.union(v.id("runs"), v.null()),
  })
    .index("by_externalId", ["externalId"])
    .index("by_userId", ["userId"]),

  runs: defineTable({
    userId: v.id("users"),
    inboundMessageId: v.id("messages"),
    kind: v.union(v.literal("agent"), v.literal("yes_fast_path")),
    status: v.union(
      v.literal("running"),
      v.literal("done"),
      v.literal("refused"),
      v.literal("error"),
    ),
    endedAt: v.union(v.number(), v.null()),
  }).index("by_userId", ["userId"]),

  proposals: defineTable({
    userId: v.id("users"),
    runId: v.id("runs"),
    items: v.array(proposalItem),
    rejected: v.array(v.object({ item: v.string(), store: v.string(), reason: v.string() })),
    total: v.number(),
    budget: v.number(),
    card: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("purchased"),
      v.literal("superseded"),
      v.literal("failed"),
    ),
    approvedAt: v.union(v.number(), v.null()),
  }).index("by_userId_and_status", ["userId", "status"]),

  orders: defineTable({
    userId: v.id("users"),
    proposalId: v.id("proposals"),
    idempotencyKey: v.string(), // `${userId}:${proposalId}`
    amountCents: v.number(),
    status: v.union(v.literal("claimed"), v.literal("charged"), v.literal("failed")),
    stripePaymentIntentId: v.union(v.string(), v.null()),
    error: v.union(v.string(), v.null()),
  }).index("by_idempotencyKey", ["idempotencyKey"]),

  // Memory fallback (and the stub used until the Cognee wrapper lands).
  memories: defineTable({
    userId: v.id("users"),
    key: v.string(),
    value: v.string(),
    source: v.union(v.literal("seed"), v.literal("agent")),
  }).index("by_userId_and_key", ["userId", "key"]),
});
