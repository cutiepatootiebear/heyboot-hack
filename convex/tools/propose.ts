// propose_purchase: the model passes (item, store, qty); every price, discount and URL
// comes from the catalog row, never from the model. Builds the approve card text.
import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import type { Auditor } from "../lib/audit";
import { getCatalogRow } from "./catalog";

export type ProposeInput = {
  items: { item: string; store: string; qty: number }[];
  budget: number;
  rejected: { item: string; store: string; reason: string }[];
};

const money = (n: number) => `$${n.toFixed(2)}`;
const round2 = (n: number) => Math.round(n * 100) / 100;

export function checkedAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      timeZone: "America/Los_Angeles",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }) + " PT";
  } catch {
    return iso;
  }
}

// Discount verification will come from Senso (Keanu's wrapper). Until then no catalog
// discount counts as verified, so none is applied and the card says "not found".
async function verifiedDiscount(_store: string, _pct: number): Promise<{ pct: number; sourceUrl: string | null }> {
  return { pct: 0, sourceUrl: null };
}

export async function proposePurchase(
  ctx: ActionCtx,
  userId: Id<"users">,
  runId: Id<"runs">,
  input: ProposeInput,
  audit: Auditor,
): Promise<{ ok: true; proposalId: Id<"proposals">; card: string; total: number; underBudget: true } | { ok: false; error: string }> {
  if (!input.items.length) return { ok: false, error: "No items given." };
  const items = [];
  for (const it of input.items) {
    const qty = Math.max(1, Math.floor(it.qty));
    const row = await getCatalogRow(it.item, it.store);
    if (!row) return { ok: false, error: `Not in catalog: "${it.item}" at ${it.store}. Use exact item and store strings from search_catalog.` };
    if (!row.inStock) return { ok: false, error: `Out of stock: "${it.item}" at ${it.store}. Pick another option.` };
    const disc = await verifiedDiscount(row.store, row.milDiscountPct);
    const finalPrice = round2(row.price * (1 - disc.pct / 100));
    items.push({
      item: row.item,
      store: row.store,
      qty,
      price: row.price,
      milDiscountPct: disc.pct,
      catalogMilDiscountPct: row.milDiscountPct,
      discountSourceUrl: disc.sourceUrl,
      finalPrice,
      url: row.url,
      capturedAt: row.capturedAt,
    });
  }
  const total = round2(items.reduce((s, i) => s + i.finalPrice * i.qty, 0));
  if (total > input.budget) {
    return { ok: false, error: `Total ${money(total)} is over the ${money(input.budget)} budget by ${money(total - input.budget)}. Choose cheaper options.` };
  }

  const lines = items.map((i) => {
    const qty = i.qty > 1 ? `${i.qty} × ` : "";
    let line = `• ${qty}${i.item}: ${money(i.finalPrice)} at ${i.store} (price checked ${checkedAt(i.capturedAt)})\n  ${i.url}`;
    if (i.milDiscountPct > 0 && i.discountSourceUrl) line += `\n  Includes ${i.milDiscountPct}% military discount (source: ${i.discountSourceUrl})`;
    else if (i.catalogMilDiscountPct > 0) line += `\n  Military discount: not found, not applied`;
    return line;
  });
  const card =
    `Here's what I found:\n${lines.join("\n")}\n` +
    `Total ${money(total)}, under your ${money(input.budget)} budget.\n` +
    `Reply YES to buy (test mode, no real money moves). I'll never ask for your card, SSN, bank details or passwords by text.`;

  const proposalId: Id<"proposals"> = await ctx.runMutation(internal.tools.data.createProposal, {
    userId,
    runId,
    items,
    rejected: input.rejected,
    total,
    budget: input.budget,
    card,
  });
  await audit.log(
    "propose",
    input,
    { proposalId, total, budget: input.budget, items, rejected: input.rejected },
    items.map((i) => ({ title: `${i.item} at ${i.store}`, url: i.url, captured_at: i.capturedAt })),
  );
  return { ok: true, proposalId, card, total, underBudget: true };
}
