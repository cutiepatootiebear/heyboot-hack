// propose_purchase: the model passes (item, store, qty); every price, discount and URL
// comes from the catalog row, never from the model. Builds the approve card text.
import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import type { Auditor } from "../lib/audit";
import { getCatalogRow } from "./catalog";
import { sensoConfigured } from "../integrations/senso";
import { verifyDiscount, type Source, type Verdict } from "./factcheck";

export type ProposeInput = {
  items: { item: string; store: string; qty: number }[];
  budget: number;
  rejected: { item: string; store: string; reason: string }[];
};

const money = (n: number) => `$${n.toFixed(2)}`;
const possessive = (name: string) => (/s$/i.test(name) ? `${name}'` : `${name}'s`);
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

type StoreCheck = {
  store: string;
  catalogPct: number;
  verdict: Verdict;
  appliedPct: number;
  source?: Source;
  passage?: string;
  note: string;
};

// Senso fact-check per store on the card: a catalog discount is applied only when the store's own
// page (ingested into Senso) states that percentage. Runs once per store, before the card is built.
async function checkStores(rows: { store: string; catalogPct: number }[]): Promise<Map<string, StoreCheck>> {
  const out = new Map<string, StoreCheck>();
  for (const { store, catalogPct } of rows) {
    if (out.has(store)) continue;
    if (!sensoConfigured()) {
      out.set(store, { store, catalogPct, verdict: "not_checked", appliedPct: 0, note: "Senso not configured" });
      continue;
    }
    try {
      const r = await verifyDiscount(store, catalogPct);
      out.set(store, {
        store,
        catalogPct,
        verdict: r.verdict,
        appliedPct: r.verdict === "verified" ? catalogPct : 0,
        source: r.source,
        passage: r.passage,
        note: r.note,
      });
    } catch (err) {
      out.set(store, {
        store,
        catalogPct,
        verdict: "not_checked",
        appliedPct: 0,
        note: `Senso error: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }
  return out;
}

export async function proposePurchase(
  ctx: ActionCtx,
  userId: Id<"users">,
  runId: Id<"runs">,
  input: ProposeInput,
  audit: Auditor,
): Promise<{ ok: true; proposalId: Id<"proposals">; card: string; total: number; underBudget: true } | { ok: false; error: string }> {
  if (!input.items.length) return { ok: false, error: "No items given." };
  const rows = [];
  for (const it of input.items) {
    const qty = Math.max(1, Math.floor(it.qty));
    const row = await getCatalogRow(it.item, it.store);
    if (!row) return { ok: false, error: `Not in catalog: "${it.item}" at ${it.store}. Use exact item and store strings from search_catalog.` };
    if (!row.inStock) return { ok: false, error: `Out of stock: "${it.item}" at ${it.store}. Pick another option.` };
    rows.push({ row, qty });
  }
  const checks = await checkStores(rows.map(({ row }) => ({ store: row.store, catalogPct: row.milDiscountPct })));
  const items = rows.map(({ row, qty }) => {
    const c = checks.get(row.store)!;
    return {
      item: row.item,
      store: row.store,
      qty,
      price: row.price,
      milDiscountPct: c.appliedPct,
      catalogMilDiscountPct: row.milDiscountPct,
      discountSourceUrl: c.appliedPct > 0 && c.source ? c.source.url : null,
      finalPrice: round2(row.price * (1 - c.appliedPct / 100)),
      url: row.url,
      capturedAt: row.capturedAt,
    };
  });
  const total = round2(items.reduce((s, i) => s + i.finalPrice * i.qty, 0));
  if (total > input.budget) {
    return { ok: false, error: `Total ${money(total)} is over the ${money(input.budget)} budget by ${money(total - input.budget)}. Choose cheaper options.` };
  }

  const lines = items.map((i) => {
    const qty = i.qty > 1 ? `${i.qty} × ` : "";
    let line = `• ${qty}${i.item}: ${money(i.finalPrice)} at ${i.store} (price checked ${checkedAt(i.capturedAt)})\n  ${i.url}`;
    if (i.milDiscountPct > 0 && i.discountSourceUrl)
      line += `\n  Includes ${i.milDiscountPct}% military discount, verified on ${possessive(i.store)} own page: ${i.discountSourceUrl}\n  (list price ${money(i.price)}; you verify military status yourself at the store, e.g. VerifyPass)`;
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
  // Show a claim only when the card makes one (a catalog discount) or Senso found a discount
  // the catalog lacks. Stores with no discount claimed and none found aren't listed.
  const factChecks = [...checks.values()].filter((c) => c.catalogPct > 0 || c.verdict === "conflict").map((c) => ({
    claim:
      c.catalogPct > 0
        ? `${c.store} gives military customers ${c.catalogPct}% off`
        : `${c.store}: no military discount claimed`,
    verdict: c.verdict,
    note: c.note,
    passage: c.passage ?? null,
    source: c.source ?? null,
  }));
  await audit.log(
    "fact_check",
    { stores: [...checks.values()].map((c) => ({ store: c.store, catalogPct: c.catalogPct })) },
    { checks: factChecks, engine: sensoConfigured() ? "senso" : "none" },
    factChecks.filter((f) => f.source).map((f) => ({ title: f.source!.title, url: f.source!.url, retrieved_at: f.source!.retrievedAt })),
  );
  await audit.log(
    "propose",
    input,
    { proposalId, total, budget: input.budget, items, rejected: input.rejected },
    items.map((i) => ({ title: `${i.item} at ${i.store}`, url: i.url, captured_at: i.capturedAt })),
  );
  return { ok: true, proposalId, card, total, underBudget: true };
}
