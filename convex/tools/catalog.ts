// Catalog reads from SingleStore (plain helpers, no Convex functions).
import { s2Query } from "../lib/singlestore";

export type CatalogRow = {
  item: string;
  store: string;
  price: number;
  milDiscountPct: number;
  url: string;
  capturedAt: string; // ISO, UTC
  inStock: boolean;
};

type RawRow = {
  item: string;
  store: string;
  price: string | number;
  mil_discount_pct: string | number;
  url: string;
  captured_at: string;
  in_stock: string | number | boolean;
};

const toRow = (r: RawRow): CatalogRow => ({
  item: r.item,
  store: r.store,
  price: Number(r.price),
  milDiscountPct: Number(r.mil_discount_pct),
  url: r.url,
  capturedAt: new Date(String(r.captured_at).replace(" ", "T") + "Z").toISOString(),
  inStock: r.in_stock === true || r.in_stock === 1 || r.in_stock === "1",
});

const COLS = "item, store, price, mil_discount_pct, url, captured_at, in_stock";

// Keyword search. The catalog is small (tens of rows), so we score in code:
// a row matches if any keyword appears in its item or store; more matches rank higher.
export async function searchCatalog(opts: {
  query: string;
  maxPrice: number | null;
  inStockOnly: boolean;
  limit?: number;
}): Promise<CatalogRow[]> {
  const rows = (await s2Query<RawRow>(`SELECT ${COLS} FROM catalog LIMIT 500`)).map(toRow);
  const words = opts.query
    .toLowerCase()
    .split(/[^a-z0-9.\-]+/)
    .filter((w) => w.length >= 2);
  // Faded/damaged listings are hidden unless the query asks for them.
  const wantsWorn = /\b(faded|damaged)\b/i.test(opts.query);
  const scored = rows
    .filter((r) => wantsWorn || !/\b(faded|damaged)\b/i.test(r.item))
    .filter((r) => (opts.inStockOnly ? r.inStock : true))
    .filter((r) => (opts.maxPrice !== null ? r.price <= opts.maxPrice : true))
    .map((r) => {
      const hay = `${r.item} ${r.store}`.toLowerCase();
      return { r, score: words.length ? words.filter((w) => hay.includes(w)).length : 1 };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.r.price - b.r.price);
  return scored.slice(0, opts.limit ?? 10).map((x) => x.r);
}

export async function getCatalogRow(item: string, store: string): Promise<CatalogRow | null> {
  const rows = await s2Query<RawRow>(`SELECT ${COLS} FROM catalog WHERE item = ? AND store = ? LIMIT 1`, [item, store]);
  return rows[0] ? toRow(rows[0]) : null;
}
