// Senso fact-check of a store's military discount, built on Keanu's lookup()
// (convex/integrations/senso.ts): scoped to the official source pages, dated, weak matches dropped.
import { lookup, SOURCES } from "../integrations/senso";

export type Verdict = "verified" | "conflict" | "unsupported" | "not_checked";
export type Source = { title: string; url: string; retrievedAt: string; contentId?: string };

const possessive = (name: string) => (/s$/i.test(name) ? `${name}'` : `${name}'s`);
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

// Does this store have an official page in Senso? (Titles start with the store name, e.g.
// "Gear Rack Refund Policy" for catalog store "Gearrack".)
export const storeHasSource = (store: string) =>
  Object.values(SOURCES).some((s) => norm(s.title).startsWith(norm(store)));

const pctsIn = (text: string) => [...text.matchAll(/(\d{1,2})\s?%/g)].map((m) => Number(m[1]));

// verified: the store's own page, cited by Senso, states this percentage for military.
// conflict: the store's page states a different military percentage, or the offer has ended.
// unsupported: Senso found nothing on the store's pages about a military discount.
// not_checked: no official page for this store in Senso.
export async function verifyDiscount(
  store: string,
  pct: number,
): Promise<{ verdict: Verdict; pct: number; source?: Source; passage?: string; note: string }> {
  if (!storeHasSource(store)) return { verdict: "not_checked", pct: 0, note: `No official ${store} page in Senso` };

  const r = await lookup(`Does ${store} offer a military discount, and what percentage is it?`);
  const own = r.sources.find((s) => norm(s.title).startsWith(norm(store)));
  if (!r.answer || !own) return { verdict: "unsupported", pct: 0, note: `${possessive(store)} pages in Senso don't state a military discount` };

  const source: Source = { title: own.title, url: own.url, retrievedAt: own.retrievedAt, contentId: own.contentId };
  const passage = r.answer.replace(/\s+/g, " ").trim().slice(0, 280);
  if (/\b(ended|expired|no longer)\b/i.test(r.answer)) {
    return { verdict: "conflict", pct: 0, source, passage, note: `${possessive(store)} military offer has ended` };
  }
  const found = pctsIn(r.answer);
  if (pct > 0 && found.includes(pct)) {
    return { verdict: "verified", pct, source, passage, note: `${possessive(store)} own page states ${pct}% for military` };
  }
  if (found.length) {
    return {
      verdict: "conflict",
      pct: found[0],
      source,
      passage,
      note: pct > 0 ? `Catalog says ${pct}%, ${possessive(store)} page says ${found[0]}%` : `${possessive(store)} page states ${found[0]}% for military; catalog has none`,
    };
  }
  return { verdict: "unsupported", pct: 0, source, passage, note: `${possessive(store)} page mentions a military discount but no percentage` };
}
