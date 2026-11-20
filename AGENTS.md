# Hey Boot

Hackathon build for the tokens& Personal Agents Hack, 20 Nov 2026.
Theme: "Build a shopping agent with an audit trail." Use reliable context, take a meaningful action, show the information and steps behind it.
Submit by 4:30 PT (public repo, 3-min demo video, tools used, team). Target finish 4:15 PT.

## Who owns what (read this first)

| Owner | Branch | Files you may change |
|---|---|---|
| Ben (`bbeirut`) | `agent-loop` | `convex/agent/` (Sonnet tool loop, tool definitions, system prompt, Anthropic client), `convex/tools/` (the 8 tool implementations), `convex/inbound.ts` (dedupe + routing + YES fast path), `convex/crisis.ts` (Haiku classifier) |
| Onyu (`dhsdb010`) | `receipt-page` | `src/routes/receipt.$proposalId.tsx`, `src/components/receipt/`, `convex/scoring/`; plus `data/catalog.csv` (by PR to `main`) |
| Keanu (`kc-routerplus`) | `integrations` | `convex/integrations/senso.ts`, `convex/integrations/stripe.ts`, `convex/integrations/cognee.ts`, `scripts/senso-ingest.ts`, `scripts/integrations-smoke.ts` |
| Jameel | `main` | infra and everything not listed above: `convex/schema.ts`, `convex/http.ts` (`POST /chat`, Sendblue webhook), `convex/lib/` (audit writer `audit.ts`, `singlestore.ts`, `sendblue.ts`), `convex/receipt.ts` (the receipt query), `db/`, `data/` (except `catalog.csv`), `scripts/csv-to-seed.mjs`, `package.json`, configs, Vercel/Convex setup, this file |

Rules:
1. Work only in your files. Need a change anywhere else (a package, a schema field, a style)? Ask on `main`; don't do it on your branch.
2. Open a PR to `main`. No direct pushes to `main` from feature branches.
3. Never commit `.env*` files (only `.env.example`). Keys live in your own `.env.local`.
4. `src/routeTree.gen.ts` is generated. Never hand-edit it; on conflict take `main`'s copy and run the dev server once.
5. `data/` changes go to `main` by PR. Onyu owns `data/catalog.csv`; the Senso source list is open to whoever takes that task.

### Interfaces between owners

`convex/integrations/*` are plain TypeScript functions (no Convex query/mutation/action definitions). Ben's code in `convex/tools/` calls them.

Main ↔ agent loop: `convex/http.ts` (main) hands each inbound message to Ben's handler in `convex/inbound.ts`. Ben's code writes every step through `logStep()` from `convex/lib/audit.ts` (main), which writes the `audit_events` row; it never writes SQL to SingleStore itself. Tables Ben needs that aren't in `convex/schema.ts` → ask on `main`.

```ts
// senso.ts
lookup(question: string): Promise<{ answer: string | null;
  sources: { title: string; url: string; retrievedAt: string }[] }>   // null answer = "not found"
ingest(urls: string[]): Promise<{ ingested: number; failed: string[] }>

// cognee.ts
recall(userId: string, query: string): Promise<{ key: string; value: string; savedAt: string }[]>
save(userId: string, key: string, value: string): Promise<{ id: string }>

// stripe.ts  (throws unless STRIPE_SECRET_KEY starts with "sk_test_" or "rk_test_")
createTestCharge(args: { amountCents: number; idempotencyKey: string;
  metadata: Record<string, string> }): Promise<{ paymentIntentId: string; status: string; amountCents: number }>
```

The receipt page reads one Convex query, `api.receipt.get({ proposalId })` (built on `main`): proposal (items, prices, sources, rejected options), order, and `audit_events` rows in `seq` order. Build against `src/components/receipt/fixture.ts` until it lands.

## One line

A new Marine texts what he needs before SOI. Hey Boot remembers his sizes and budget, finds the best price including military discounts, sends an approve card, buys it on YES, and shows a receipt with every source and step.

## Judging map

- Autonomy: text in → order placed. The YES tap is the only human step.
- Idea: new Marines overpay right before reporting, get hit by scams, and don't know where military discounts apply.
- Technical: Convex tool loop, idempotent purchase, audit trail table, sourced context.
- Tool use: Senso (trusted context), SingleStore (catalog + audit trail), Cognee (memory). Stretch: Firedrill, Amplitude/Statsig.
- Presentation: 3-min recording, live run.

## Demo flow: Gear Run

1. **Remembers.** User: "Report to SOI Tuesday. Need running shoes and a combination lock. Budget $150." Agent recalls from Cognee: shoe size 10.5 wide, prefers Brooks (seeded earlier).
2. **Decides with sourced context.** Agent queries the SingleStore catalog (real items, real prices captured today, each row with URL + captured_at) and Senso (discount policies, each with source). Picks the best 2 options.
3. **Approve card.** "Brooks Ghost 10.5W, $112 at [store] with 10% military discount (source). Lock $9. Total $121, under your $150. Reply YES to buy." Never asks for card, SSN, bank, or passwords over text.
4. **Acts.** YES → Stripe test-mode charge. Order ID logged.
5. **Failure handling.** YES twice → one charge (idempotency key). Out of stock → swap to option 2 and ask again.
6. **Receipt + audit trail page:** input, memory recalled, catalog rows read, Senso sources cited, options rejected and why, discount applied, approval, charge, order ID.
7. **Side beat:** the crisis classifier runs first on every non-YES message → 988 press 1 / text 838255, and the agent stops. (On `main`, ported from Ben's `convex/crisis.ts`.)

## Hard rules

- Never DoD credentials, never CAC photos, never SSN/bank/password asks over text.
- Military status verification (ID.me / SheerID) is done by the user himself. In the demo it is mocked, and the screen says so.
- No financial advice. Price comparison only.
- Every price and discount shown has a source URL + timestamp. "Not found" over a guess. A discount with no Senso source is shown as "military discount: not found" and not applied.
- Product name is "Hey Boot." No other company or employer names anywhere in the repo, UI, or demo. The agent never calls the user "boot."
- Public repo. Secrets only in `.env.local` (gitignored). Stripe TEST mode only.

## Architecture

- Stack: TanStack Start + Convex + TypeScript on Vercel. Claude Sonnet runs the tool loop; Claude Haiku runs the crisis classifier.
- Inbound: `POST /chat` (web chat, the default) or `POST /sendblue?token=…` (iMessage, only when `SENDBLUE_ENABLED=true`) → dedupe → YES fast path (no model call, no crisis check), or Haiku crisis classifier (`convex/crisis.ts`, logged as `crisis_check`; a crisis gets the 988 reply and stops) → Sonnet tool loop.
- YES fast path (no model call): a YES marks the sender's pending proposal approved and charges it, only if the proposal belongs to that user, is `pending`, and is under 30 minutes old. Every attempt, allowed or refused, is logged to `audit_events`. One order per proposal; Stripe idempotency key `${userId}:${proposalId}`.
- Model tools on `main` (4): `recall_memory`, `save_memory` (Cognee, Convex fallback), `search_catalog` (SingleStore), `propose_purchase` (takes item/store/qty; server fills price, discount, URL from the catalog; Senso fact-checks each store's military discount before it is applied). The Stripe test charge runs in the YES fast path, not as a model tool. `lookup_context`, `refuse` and `escalate_crisis` exist only on Ben's unmerged `agent-loop` branch (the crisis check itself runs before the loop, not as a tool). Audit logging is automatic, not a model tool.
- SingleStore (`db/singlestore.sql`): `catalog(item, store, price, mil_discount_pct, url, captured_at, in_stock)`, `audit_events(id, run_id, user_id, seq, step, input, output, sources, ts, canonical, prev_hash, hash)`, where `hash = sha256(prev_hash|canonical)` chained per run (tamper-evident; the receipt re-verifies it).
- Senso: ingest 5 to 10 source pages (military discount policies, SOI-W check-in page). Agent cites them.
- Receipt page reads Convex + SingleStore. Large type for the projector. Demo data only.
- Fallback: iMessage → web chat → recorded video.

## Timeline (PT)

- 11:00–11:30: repo, env keys, empty Vercel deploy, SingleStore tables, Senso ingest.
- 11:30–1:30: core loop. Milestone: text in, test charge out.
- 1:30–2:00: lunch + Cognee memory.
- 2:00–3:15: Senso citations, receipt page, double-YES idempotency, out-of-stock swap.
- 3:15–3:45: freeze. Two rehearsals. Backup recording.
- 3:45–4:05: record demo.
- 4:05–4:15: submit.

Cut order: Amplitude → Firedrill → out-of-stock swap → Sendblue (web chat) → Cognee (Convex fallback). Never cut: approve card, idempotent purchase, audit trail page, Senso citations.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
