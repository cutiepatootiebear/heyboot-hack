// Hey Boot option scoring. Port of scoring.py (keep the two in sync).
// score = w1*(1 - price/budget) + w2*discount_pct + w3*preference_match + w4*in_stock
// Pure function, no network. Price is after a *verified* discount only.

export const WEIGHTS = { price: 0.4, discount: 1.0, fit: 0.45, stock: 0.15 } as const;

export type CatalogRow = {
  item: string;
  store: string;
  price: number | string;
  mil_discount_pct: number | string;
  url: string;
  captured_at: string;
  in_stock: boolean | string;
};

export type Prefs = { brand?: string; size?: string; width?: string };

type Terms = { price: number; discount: number; fit: number; stock: number };

export type ScoredOption = {
  item: string;
  store: string;
  url: string;
  captured_at: string;
  list_price: number;
  price: number;
  discount_applied_pct: number;
  discount_note: string;
  score?: number;
  terms?: Terms;
  display?: string;
  reason: string;
};

const WIDTH_WORDS: Record<string, string> = {
  "extra wide": "extra wide", "4e": "extra wide", "wide": "wide", "2e": "wide",
  narrow: "narrow", regular: "regular", medium: "regular", d: "regular",
};
const WIDTH_KEYS = Object.keys(WIDTH_WORDS).sort((a, b) => b.length - a.length);

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const r2 = (n: number) => Math.round(n * 100) / 100;
const normWidth = (w: string) => WIDTH_WORDS[w.toLowerCase()] ?? w.toLowerCase();

function parseSize(item: string): string | null {
  const m = item.match(/(?:men's|women's|size)\s+(\d{1,2}(?:\.5)?)/i);
  return m ? m[1] : null;
}

function parseWidth(item: string): string | null {
  const low = item.toLowerCase();
  for (const w of WIDTH_KEYS) if (new RegExp(`\\b${esc(w)}\\b`).test(low)) return WIDTH_WORDS[w];
  return null;
}

const toBool = (v: unknown) => ["1", "true", "yes", "y"].includes(String(v).trim().toLowerCase());

export function preferenceMatch(item: string, prefs: Prefs): number {
  const checks: boolean[] = [];
  if (prefs.brand) checks.push(new RegExp(`\\b${esc(prefs.brand)}\\b`, "i").test(item));
  const size = parseSize(item);
  if (prefs.size && size !== null) checks.push(size === String(prefs.size));
  const width = parseWidth(item);
  if (prefs.width && width !== null) checks.push(width === normWidth(prefs.width));
  return checks.length ? checks.filter(Boolean).length / checks.length : 0.5;
}

export function scoreOptions(
  rows: CatalogRow[],
  prefs: Prefs,
  budget: number,
  verifiedDiscountStores: string[] = [],
  topN = 2,
): { weights: typeof WEIGHTS; budget: number; options: ScoredOption[]; rejected: ScoredOption[] } {
  const verified = new Set(verifiedDiscountStores.map((s) => s.toLowerCase()));
  const ranked: ScoredOption[] = [];
  const rejected: ScoredOption[] = [];

  for (const r of rows) {
    const listPrice = Number(r.price);
    const raw = Number(r.mil_discount_pct || 0);
    const disc = raw > 1 ? raw / 100 : raw;
    const discOk = disc > 0 && verified.has(r.store.toLowerCase());
    const applied = discOk ? disc : 0;
    const price = r2(listPrice * (1 - applied));
    const inStock = toBool(r.in_stock ?? true);

    const base = {
      item: r.item, store: r.store, url: r.url, captured_at: r.captured_at,
      list_price: listPrice, price, discount_applied_pct: Math.round(applied * 1000) / 10,
      discount_note: discOk ? "verified"
        : disc === 0 ? "military discount: not found"
        : "military discount: not verified, not applied",
    };

    const size = parseSize(r.item);
    const width = parseWidth(r.item);
    let reason: string | null = null;
    if (!inStock) reason = "out of stock";
    else if (price > budget) reason = `over budget ($${price.toFixed(2)} > $${budget.toFixed(2)})`;
    else if (prefs.size && size !== null && size !== String(prefs.size))
      reason = `wrong size (${size}, need ${prefs.size})`;
    else if (prefs.width && width !== null && width !== normWidth(prefs.width))
      reason = `wrong width (${width}, need ${prefs.width})`;
    if (reason) { rejected.push({ ...base, reason }); continue; }

    const terms: Terms = {
      price: r2(WEIGHTS.price * Math.max(0, 1 - price / budget)),
      discount: r2(WEIGHTS.discount * applied),
      fit: r2(WEIGHTS.fit * preferenceMatch(r.item, prefs)),
      stock: r2(WEIGHTS.stock),
    };
    const score = r2(terms.price + terms.discount + terms.fit + terms.stock);
    const display = `${score.toFixed(2)} (price ${terms.price.toFixed(2)}, discount ${terms.discount.toFixed(2)}, ` +
      `fit ${terms.fit.toFixed(2)}, stock ${terms.stock.toFixed(2)})`;
    ranked.push({ ...base, score, terms, display, reason: "" });
  }

  ranked.sort((a, b) => b.score! - a.score! || a.price - b.price);
  for (const o of ranked) {
    const bits = [`$${o.price.toFixed(2)} at ${o.store}`];
    bits.push(o.discount_applied_pct ? `${o.discount_applied_pct}% verified military discount` : o.discount_note);
    if (o.terms!.fit >= WEIGHTS.fit) bits.push("matches brand, size and width");
    o.reason = bits.join("; ");
  }
  for (const o of ranked.slice(topN))
    rejected.push({ ...o, reason: `lower score (${o.score!.toFixed(2)}) than top ${topN}` });
  return { weights: WEIGHTS, budget, options: ranked.slice(0, topN), rejected };
}

// ---------------------------------------------------------------------------
// GPC mode (Government Purchase Card / unit buyer). Port of score_gpc in scoring.py.
// Hard rejects: out of stock, over budget, Section 889 vendor, Berry Amendment
// (only when berryApplies), spec_match == 0, then the mandatory-source gate
// (FAR 8.002: if a mandatory source fully meets the spec, non-mandatory options
// are rejected). Survivors: score = 0.60*(1 - price/budget) + 0.40*spec_match
// ---------------------------------------------------------------------------
export const GPC_WEIGHTS = { price: 0.6, spec: 0.4 } as const;
export const SECTION_889_VENDORS = ["huawei", "zte", "hytera", "hikvision", "dahua"];

export type GpcRow = Omit<CatalogRow, "mil_discount_pct"> & {
  mil_discount_pct?: number | string;
  mandatory_source?: string;
  vendor_banned_889?: boolean | string;
  berry_covered?: boolean | string;
  country_of_origin?: string;
  spec_tags?: string;
};

export type GpcOption = {
  item: string;
  store: string;
  url: string;
  captured_at: string;
  price: number;
  mandatory_source: string | null;
  country_of_origin: string | null;
  score?: number;
  terms?: { price: number; spec: number };
  display?: string;
  reason: string;
  rule: string | null;
};

const tagsOf = (r: GpcRow) =>
  (r.spec_tags ?? "").split(/[;,|]/).map((t) => t.trim().toLowerCase()).filter(Boolean);

const hasSpec = (r: GpcRow, req: string) =>
  tagsOf(r).includes(req.toLowerCase()) || r.item.toLowerCase().includes(req.toLowerCase());

export function specMatch(r: GpcRow, required: string[]): number {
  if (!required.length) return 1;
  return required.filter((q) => hasSpec(r, q)).length / required.length;
}

function is889(r: GpcRow): string | null {
  if (toBool(r.vendor_banned_889 ?? false)) return r.store;
  const text = `${r.item} ${r.store}`.toLowerCase();
  return SECTION_889_VENDORS.find((v) => new RegExp(`\\b${v}\\b`).test(text)) ?? null;
}

export function scoreGpc(
  rows: GpcRow[],
  requiredSpecs: string[],
  budget: number,
  berryApplies = false,
  topN = 2,
) {
  const eligible: [GpcRow, GpcOption][] = [];
  const rejected: GpcOption[] = [];

  for (const r of rows) {
    const price = Number(r.price);
    const base: GpcOption = {
      item: r.item, store: r.store, url: r.url, captured_at: r.captured_at, price,
      mandatory_source: (r.mandatory_source ?? "").trim() || null,
      country_of_origin: r.country_of_origin || null, reason: "", rule: null,
    };
    const banned = is889(r);
    const coo = (r.country_of_origin ?? "").trim().toUpperCase();
    let reason: string | null = null;
    let rule: string | null = null;
    if (!toBool(r.in_stock ?? true)) reason = "out of stock";
    else if (price > budget) reason = `over budget ($${price.toFixed(2)} > $${budget.toFixed(2)})`;
    else if (banned) { reason = `Section 889 covered vendor (${banned})`; rule = "FAR 52.204-25"; }
    else if (berryApplies && toBool(r.berry_covered ?? false) && coo !== "US" && coo !== "USA") {
      reason = `Berry Amendment: covered item not US-made (${r.country_of_origin || "origin unknown"})`;
      rule = "DFARS 252.225-7012";
    } else if (requiredSpecs.length && specMatch(r, requiredSpecs) === 0)
      reason = `does not meet stated requirement (${requiredSpecs.join(", ")})`;
    if (reason) rejected.push({ ...base, reason, rule });
    else eligible.push([r, base]);
  }

  let pool = eligible;
  if (eligible.some(([r, b]) => b.mandatory_source && specMatch(r, requiredSpecs) === 1)) {
    pool = [];
    for (const [r, b] of eligible) {
      if (b.mandatory_source) pool.push([r, b]);
      else rejected.push({ ...b, rule: "FAR 8.002",
        reason: "mandatory source available; non-mandatory vendor not allowed" });
    }
  }

  const ranked: GpcOption[] = pool.map(([r, b]) => {
    const terms = {
      price: r2(GPC_WEIGHTS.price * Math.max(0, 1 - b.price / budget)),
      spec: r2(GPC_WEIGHTS.spec * specMatch(r, requiredSpecs)),
    };
    const score = r2(terms.price + terms.spec);
    const missing = requiredSpecs.filter((q) => !hasSpec(r, q));
    const why = [`$${b.price.toFixed(2)} at ${b.store}`];
    if (b.mandatory_source) why.push(`mandatory source (${b.mandatory_source})`);
    why.push(missing.length ? `missing spec: ${missing.join(", ")}` : "meets all specs");
    return { ...b, score, terms, reason: why.join("; "),
      display: `${score.toFixed(2)} (price ${terms.price.toFixed(2)}, spec ${terms.spec.toFixed(2)})` };
  });
  ranked.sort((a, b) => b.score! - a.score! || a.price - b.price);
  for (const o of ranked.slice(topN))
    rejected.push({ ...o, reason: `lower score (${o.score!.toFixed(2)}) than top ${topN}` });
  return { mode: "gpc" as const, weights: GPC_WEIGHTS, budget, requiredSpecs, berryApplies,
    options: ranked.slice(0, topN), rejected };
}
