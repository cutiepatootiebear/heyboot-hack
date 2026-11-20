# Hey Boot — demo talking points (vision-first)

**North star:** *Let's get to zero suicides by 2032.*

Every message a Marine sends is a chance to catch someone before it's too late — and a receipt that proves what we did.

The gear run is **proof the agent works**, not the point. The point is that Hey Boot already has his attention, his memory, and a two-way channel — so it can act on the signal that matters most.

## Why this lands with judges

- **Not a bolt-on feature.** The crisis check runs on *every* non-YES message, before the tool loop. Proactive, not a "help" button nobody taps.
- **The same infrastructure that makes shopping safe makes crisis response trustworthy:** memory (knows the person), sourced context (no guessing), and a tamper-evident audit trail (you can prove what it saw and said).
- **Say it as a direction, not a promise.** "Zero by 2032 isn't something a weekend build delivers. It's the direction. This is the first brick."

## 3-minute outline

### 0:00–0:25 — The hook
- "The first year is the hardest. [VERIFY before recording: 'E-1 to E-4 were half of all active-duty suicides in 2024.' If it can't be sourced, drop the number and keep the next line.]"
- "Most of what crushes a new Marine isn't dramatic. It's logistics nobody explains: what to buy, where, what fits, who's scamming him."
- "We're trying to get to zero suicides by 2032. This is the first brick — an agent that checks every message, before it does anything else."

### 0:25–0:45 — What's actually built
- "No app. Just text."
- "One message in. It remembers him, shops with sources, asks for one YES, and shows a receipt you can audit."
- "The whole loop runs on Convex — tools, state, audit calls. It's the kind of infrastructure you forget about, which is the highest praise infrastructure can get."
- "That's the foundation. Here's the foundation working."

### 0:45–1:30 — Gear run (proof, not the pitch)
- Send: `Report to SOI Tuesday. Need cammies, a cover, and running shoes. Budget $250.`
- "It recalled his 10.5-wide shoes and Brooks preference from memory, and asked **once** for the two sizes it didn't have. No back-and-forth."
- Wink, as the memory comes back: "That's Cognee doing the remembering. It made this whole build a breeze — we barely had to think about it. Which feels appropriate for a memory layer."
- Send: `Blouse and trousers Medium-Regular, cover 7 3/8.`
- "It saves each size, then searches the catalog in the same turn."
- Fast narration: "Every price is a real catalog row in SingleStore, with a store URL and capture time — no made-up numbers. 'Not found' beats a guess. It's hard to scam a Marine when the receipt has a timestamp."

### 1:30–1:55 — Sourced discount + trust in action
- "Holabird lists 10% military discount, but Hey Boot doesn't take the catalog's word for it. It checked Holabird's own policy page through Senso — cited right on the card. Only then does the discount apply."
- Wink: "Senso's whole job is not guessing. We took that personally — a discount with no source is 'not found,' not a number we made up."
- "The new blouse was out of stock, so it went used. The Marine verifies his own status at the store. The agent never handles credentials."
- Send `YES` → test charge. Send `YES` again → "Already done. No second charge."
- Wink: "Stripe's test mode — real plumbing, no real money. We get to prove the charge is idempotent without charging anyone. Everybody wins."
- Say out loud: "Test mode. No real money moved."

### 1:55–2:25 — The pivot (the vision beat)
- Send a crisis message on the same handle: `I don't know if I can do this anymore.`
- Have the 988 / press 1 / text 838255 reply ready on screen.
- "Same agent. Same channel. A different kind of save. It hands him to a human and stops shopping. Most never ask for help. This one didn't have to."

### 2:25–2:50 — The receipt as proof of the whole mission
- Open the receipt from the gear run.
- "Every step is chained by SHA-256 in SingleStore, and the page re-verifies the chain in the browser."
- "Here's the `crisis_check` step — Haiku `NO` on the shopping messages, `YES` on the last one. You can see exactly what it detected, when, and what it said. That's what makes an agent you can trust with something this serious."
- Wink: "Sonnet does the shopping, Haiku does the caring. We gave the smaller model the bigger job — it turns out it notices the one thing that matters."
- Hold on **VERIFIED** (Senso) and **✓ all records match their sha256 chain**.

### 2:50–3:00 — Close
- "Today it's gear for SOI. Next: PCS moves, his first car, the transition out — a text-first agent for his whole contract."
- "Zero suicides by 2032. We're not there. But every message is now a chance to catch someone — and we can prove it."
- "Hey Boot."

## Setup
- Use a handle starting with `demo` so the seeded memory (10.5 wide, Brooks) is present.
- Pre-create the demo user and wait ~45 s for Cognee to process the seed before the first gear message.
- Crises are detected via the classifier before any tool call; the YES fast path never calls it.

## Guardrails
- **Verify the 2024 suicide statistic before recording.** If it can't be sourced, don't say the number — the mission stands without it.
- Never claim we *prevented* a suicide — say "a chance to catch someone."
- Product name stays **Hey Boot**; never call the user "boot."
- Never ask for card, SSN, bank, password, DoD credentials, or ID/CAC photos.
- Military status is verified by the user himself; the screen says so.
- Every price and discount shown has a source URL + timestamp; "not found" over a guess.
- Keep the four never-cut beats: approve card, idempotent purchase, audit trail page, Senso citations.
- The crisis beat is a **coda**, not a replacement for the gear run. If the recording runs short, narrate it instead of sending it.
- The sponsor winks are seasoning, not substance. If the clock is tight, drop the winks before dropping any mission or proof beat.

## Links
- Live app: https://heyboot-hack.vercel.app
- Locked demo receipt (run 3): https://heyboot-hack.vercel.app/receipt/jn76sdq1z9tbs4rpcfkpss1rgn8jk2ns
- Narrator script + full transcript: `data/demo-backup.md`
- Convex dashboard: https://dashboard.convex.dev/t/jameel/heyboot-hack
