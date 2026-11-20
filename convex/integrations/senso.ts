// Senso trusted context (plain fetch; no Convex functions here). Keanu owns this file.
//
// Env: SENSO_API_KEY. Optional SENSO_BASE_URL (defaults to the public API).
//
// lookup(question): an answer from the official source pages, or null for "not found".
// factCheck(claim): verified / conflict / unsupported for one claim on the approve card.
//
// Two rules keep citations honest:
// 1. Search only the official source pages in SOURCES (scoped by content_id). The same
//    knowledge base also holds team notes such as "Start Here", which match discount
//    questions but are not a store's policy and must never be cited on a receipt.
// 2. Tell Senso today's date. Senso does not know it, and without it it called an offer
//    that ended July 4, 2026 "available".

const BASE_URL = "https://apiv2.senso.ai/api/v1";
const TIMEOUT_MS = 20000;
const NOT_FOUND = "NOT_FOUND";
// A source is cited only if it scores within this much of the best match.
const RELATED_WITHIN = 0.15;

// The official pages saved to Senso on 2026-11-20, one entry per Senso document (content_id).
// Matches data/senso_sources/README.md. Add a page there and here together.
export const SOURCES: Record<string, { title: string; url: string; retrievedAt: string }> = {
  "b5bcb842-7268-4b7e-a902-278734a8369e": {
    title: "Holabird Sports Military Discount",
    url: "https://www.holabirdsports.com/pages/exclusive-discounts",
    retrievedAt: "2026-11-20",
  },
  "1725bf08-2047-499d-99b9-6f2448f232dd": {
    title: "Running Warehouse Military Discount and Price Match",
    url: "https://www.runningwarehouse.com/SupportCenter/OrderInfo/",
    retrievedAt: "2026-11-20",
  },
  "f68bad5b-1ae9-4343-8a04-722fcb3f181b": {
    title: "Running Warehouse Shipping and Returns",
    url: "https://www.runningwarehouse.com/SupportCenter/Shipping/",
    retrievedAt: "2026-11-20",
  },
  "97e05e5e-72cd-4ad6-ada3-d522fc39895e": {
    title: "Target Military Status Verification",
    url: "https://www.target.com/help/article/000170253",
    retrievedAt: "2026-11-20",
  },
  "fb68e516-bd6e-49a3-8756-005dc90f90ac": {
    title: "Target Military Appreciation Discount, June 2026",
    url: "https://corporate.target.com/press/release/2026/06/new,-deep-savings-for-back-to-school-and-summer-target-circle-deal-days-delivers-value-with-style",
    retrievedAt: "2026-11-20",
  },
  "f4d3f85c-3d02-4998-9b13-364681d23739": {
    title: "U.S. Elite Gear Duty Call Military Discount",
    url: "https://us-elitegear.com/pages/service-discount",
    retrievedAt: "2026-11-20",
  },
  "c091cccf-75b5-4e45-952c-0489a1eacdeb": {
    title: "U.S. Elite Gear Return Policy",
    url: "https://us-elitegear.com/pages/return-policy",
    retrievedAt: "2026-11-20",
  },
  "851ad7d0-d82d-4876-a290-473882a586af": {
    title: "Gear Rack Refund Policy",
    url: "https://gearrack.com/policies/refund-policy",
    retrievedAt: "2026-11-20",
  },
  "f2341539-d2aa-4499-8654-aa2fef320923": {
    title: "HiVis365 Refund Policy",
    url: "https://www.hivis365.com/policies/refund-policy",
    retrievedAt: "2026-11-20",
  },
};

export type SensoSource = {
  title: string;
  url: string;
  retrievedAt: string;
  // For the audit trail and receipt.
  contentId: string;
  versionId: string | null;
  score: number;
};

export type LookupResult = { answer: string | null; sources: SensoSource[] };

type SearchResult = { content_id?: string; version_id?: string; score?: number };

export const sensoConfigured = () => Boolean(process.env.SENSO_API_KEY);

// Today's date where the team and the demo are (Pacific time), as YYYY-MM-DD.
export function todayPT(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(now);
}

// The question goes first so retrieval matches on it; the instructions ride in parentheses.
// Tested 2026-11-20: this wording kept search scores high (0.83-0.95) and turned
// "Target's discount is available June 21-July 4" into "the offer has ended".
export function buildQuery(question: string, today: string): string {
  return (
    `${question.trim()} (Today is ${today}. If a source's offer dates have passed, say the offer has ended. ` +
    `If the sources do not answer this question, reply only ${NOT_FOUND}.)`
  );
}

type SearchOpts = { today?: string; probe?: boolean };

// One Senso search over the official source pages only. Returns Senso's answer text and
// the cited documents: one per document, strongest match first. Anything outside SOURCES
// is dropped, and so are weak matches: a Holabird answer also returned U.S. Elite Gear at
// 0.52 and Running Warehouse at 0.41, which would have been cited for a fact they don't state.
// opts.probe keeps test searches out of Senso's gap report.
async function scopedSearch(query: string, opts: SearchOpts): Promise<{ answer: string; sources: SensoSource[] }> {
  const key = process.env.SENSO_API_KEY;
  if (!key) throw new Error("Senso not configured");
  const base = (process.env.SENSO_BASE_URL || BASE_URL).replace(/\/$/, "");

  const headers: Record<string, string> = { "X-API-Key": key, "Content-Type": "application/json" };
  if (opts.probe) headers["X-Senso-Signals"] = "off";

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${base}/org/search`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        query,
        max_results: 5,
        content_ids: Object.keys(SOURCES),
        require_scoped_ids: true,
      }),
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  if (!res.ok) throw new Error(`Senso search ${res.status}: ${text.slice(0, 200)}`);

  const data = JSON.parse(text) as { answer?: string | null; results?: SearchResult[] };
  const results = (data.results ?? []).slice().sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const floor = (results[0]?.score ?? 0) - RELATED_WITHIN;
  const sources: SensoSource[] = [];
  for (const r of results) {
    const meta = r.content_id ? SOURCES[r.content_id] : undefined;
    if (!meta || (r.score ?? 0) < floor || sources.some((s) => s.contentId === r.content_id)) continue;
    sources.push({ ...meta, contentId: r.content_id!, versionId: r.version_id ?? null, score: r.score ?? 0 });
  }
  return { answer: (data.answer ?? "").trim(), sources };
}

// Ask Senso a question, answered only from the official source pages.
// answer === null means "not found": show "not found" and apply no discount.
export async function lookup(question: string, opts: SearchOpts = {}): Promise<LookupResult> {
  const { answer, sources } = await scopedSearch(buildQuery(question, opts.today ?? todayPT()), opts);
  if (!answer || answer.includes(NOT_FOUND) || sources.length === 0) return { answer: null, sources: [] };
  return { answer, sources };
}

// Fact-check verdicts, named as the receipt names them (src/components/receipt/types.ts).
export type Verdict = "verified" | "conflict" | "unsupported";

export type FactCheckResult = {
  claim: string;
  verdict: Verdict;
  // Senso's one-sentence reason, for the audit trail.
  evidence: string;
  // The pages behind a verified or conflict verdict; empty when unsupported.
  sources: SensoSource[];
};

// Tested 2026-11-20 on six claims, all judged as expected: Holabird 10% verified, Holabird 20%
// conflict, Target 20% conflict (its offer ended July 4), U.S. Elite Gear 10% verified,
// Sports Basement 10% and Running Warehouse 10% (no percent on its page) not found.
export function buildFactCheckQuery(claim: string, today: string): string {
  return (
    `Fact-check: ${claim.trim()} (Today is ${today}. Start your reply with exactly one word: ` +
    `VERIFIED if a source states this is true today, CONFLICT if a source contradicts it ` +
    `(for example a different percentage, or an offer that has ended), or ${NOT_FOUND} if no ` +
    `source addresses it. Then one sentence of evidence.)`
  );
}

// Check one claim the approve card makes (e.g. "Holabird Sports offers a 10% military
// discount.") against the official source pages. Only "verified" may stay on the card.
export async function factCheck(claim: string, opts: SearchOpts = {}): Promise<FactCheckResult> {
  const { answer, sources } = await scopedSearch(buildFactCheckQuery(claim, opts.today ?? todayPT()), opts);
  const word = answer.match(/^[^A-Za-z_]*([A-Za-z_]+)/)?.[1]?.toUpperCase() ?? "";
  const evidence = answer.replace(/^[^A-Za-z_]*[A-Za-z_]+[\s.:,-]*/, "").trim();
  if (word === "VERIFIED" && sources.length) return { claim, verdict: "verified", evidence, sources };
  if (word === "CONFLICT" && sources.length) return { claim, verdict: "conflict", evidence, sources };
  return { claim, verdict: "unsupported", evidence: evidence || "No source addresses this claim.", sources: [] };
}
