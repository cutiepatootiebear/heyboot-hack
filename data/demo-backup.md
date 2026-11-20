# Demo backup run

Recorded 2026-11-20 against the live dev backend (`POST https://intent-cat-46.convex.site/chat`), in case the live demo fails. Demo data only. Stripe is in **test mode**, so no real money moved.

| | |
|---|---|
| Handle | `demo-backup-1795209398` (demo user with seeded memory: men's 10.5 wide, prefers Brooks) |
| Stripe test PaymentIntent | `pi_3UdzAyDfJmsIes0m2QfhhtcZ`: succeeded, $116.94, livemode false |
| Stripe dashboard | https://dashboard.stripe.com/test/payments/pi_3UdzAyDfJmsIes0m2QfhhtcZ |
| Order | `jh7605t8jnphcjjew94a1wdcf18jkam0` |
| Proposal / receipt | `jn7akj0565nwb3q0yf7afvv60d8jjrpn` (https://heyboot-hack.vercel.app/receipt/jn7akj0565nwb3q0yf7afvv60d8jjrpn) |
| Catalog prices | captured 2026-11-20 1:07 PM PT |

## Transcript

**User** (13:16:55 PT):

> Report to SOI Tuesday. Need running shoes and a combination lock. Budget $150.

**Hey Boot** (17 s, status `done`, run `js746r2m31z51m98mndqbstsqd8jk94a`):

```
Both fit your size (10.5 wide) and your Brooks preference.

Here's what I found:
• Brooks Adrenaline GTS 25, Men's 10.5 Wide (EE), Black/Black/Ebony: $109.95 at Holabird Sports (price checked Nov 20, 1:07 PM PT)
  https://www.holabirdsports.com/products/brooks-adrenaline-gts-25-mens-black-black-ebony
  Military discount: not found, not applied
• Master Lock 1-7/8" Black Dial Combination Padlock: $6.99 at Target (price checked Nov 20, 1:07 PM PT)
  https://www.target.com/p/master-lock-1-7-8-black-dial-combination-padlock/-/A-14439947
Total $116.94, under your $150.00 budget.
Reply YES to buy (test mode, no real money moves). I'll never ask for your card, SSN, bank details or passwords by text.
```

**User** (13:16:57 PT):

> YES

**Hey Boot** (2 s, status `done`, run `js767n57egxth7hsskdrvcfq5n8jjwyk`):

```
Done. Order jh7605t8jnphcjjew94a1wdcf18jkam0 placed for $116.94 (Stripe test payment pi_3UdzAyDfJmsIes0m2QfhhtcZ; no real money moved).
Receipt with every source and step: https://heyboot-hack.vercel.app/receipt/jn7akj0565nwb3q0yf7afvv60d8jjrpn
```

**User** (13:16:58 PT):

> YES

**Hey Boot** (1 s, status `refused`, run `js7bephr52hye5jqnwcj30qjd18jk2t6`):

```
Already done. That order went through once (order jh7605t8jnphcjjew94a1wdcf18jkam0). No second charge.
Receipt: https://heyboot-hack.vercel.app/receipt/jn7akj0565nwb3q0yf7afvv60d8jjrpn
```

## What this shows

1. Remembers: recalled size 10.5 wide and the Brooks preference from memory.
2. Decides with sourced context: every price has its store URL and capture time. Holabird's catalog discount isn't applied because no Senso source has verified it yet ("not found" over a guess).
3. Approve card: total $116.94 under the $150 budget, with the no-card/SSN/password promise.
4. Acts: YES → one Stripe test charge.
5. Failure handling: a second YES → "Already done… No second charge."

## Audit trail (SingleStore `audit_events`)

| run_id | seq | step |
|---|---|---|
| `js746r2m31z51m98mndqbstsqd8jk94a` | 1 | inbound |
| `js746r2m31z51m98mndqbstsqd8jk94a` | 2 | recall_memory |
| `js746r2m31z51m98mndqbstsqd8jk94a` | 3 | search_catalog |
| `js746r2m31z51m98mndqbstsqd8jk94a` | 4 | search_catalog |
| `js746r2m31z51m98mndqbstsqd8jk94a` | 5 | search_catalog |
| `js746r2m31z51m98mndqbstsqd8jk94a` | 6 | propose |
| `js746r2m31z51m98mndqbstsqd8jk94a` | 7 | outbound |
| `js767n57egxth7hsskdrvcfq5n8jjwyk` | 1 | inbound |
| `js767n57egxth7hsskdrvcfq5n8jjwyk` | 2 | approval |
| `js767n57egxth7hsskdrvcfq5n8jjwyk` | 3 | stock_check |
| `js767n57egxth7hsskdrvcfq5n8jjwyk` | 4 | purchase |
| `js767n57egxth7hsskdrvcfq5n8jjwyk` | 5 | outbound |
| `js7bephr52hye5jqnwcj30qjd18jk2t6` | 1 | inbound |
| `js7bephr52hye5jqnwcj30qjd18jk2t6` | 2 | approval |
| `js7bephr52hye5jqnwcj30qjd18jk2t6` | 3 | outbound |

Not shown in this run: crisis classifier, Senso-cited discount, out-of-stock swap, Cognee memory (in progress).
