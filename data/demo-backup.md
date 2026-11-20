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

---

# Demo backup run 2: asks for uniform sizes once, saves to Cognee

Recorded 2026-11-20 ~1:45 PM PT against the live dev backend. Demo data only, Stripe **test mode**.

The demo user starts with only shoe size (men's 10.5 wide) and a Brooks preference. No uniform sizes are pre-seeded. The agent asks for the missing sizes once, saves each answer with `save_memory` (Convex + Cognee), then continues straight to the approve card.

| | |
|---|---|
| Handle | `demo-backup2-1795211054` |
| Stripe test PaymentIntent | `pi_3UdzcgDfJmsIes0m0Yo1IMKQ`: succeeded, $106.99, livemode false |
| Stripe dashboard | https://dashboard.stripe.com/test/payments/pi_3UdzcgDfJmsIes0m0Yo1IMKQ |
| Order | `jh70xm0jesybcfzdbhvw7zcpbs8jk9ze` |
| Proposal / receipt | `jn71rh3hjv1ed6r80yq6qexe3x8jkdw3` (https://heyboot-hack.vercel.app/receipt/jn71rh3hjv1ed6r80yq6qexe3x8jkdw3) |
| Catalog prices | captured 2026-11-20 1:40 PM PT |

## Transcript

**User** (13:44:22 PT) (setup: creates the demo user so Cognee can process its seed; wait ~45 s before the next message):

> hi

**Hey Boot** (8 s, status `done`, run `js70nkqqrw2e2tqdw0h4wkfdzd8jkd8g`):

```
Hi, I'm Hey Boot. I find the best prices on gear for reporting to training and set up a purchase for you to approve.

What do you need? For example, boots, cammies, covers, or undershirts. If you have a budget, tell me that too.
```

**User** (13:45:18 PT):

> Report to SOI Tuesday. Need cammies (blouse and trousers), an 8-point cover, and a coyote brown undershirt. Budget $150.

**Hey Boot** (11 s, status `done`, run `js7b5cv5nd9a3cvw665se4rh118jjx0e`):

```
I don't have your sizes saved yet. Please send these:

1. Cammies (blouse and trousers), for example Medium-Regular
2. Cover size, for example 7 1/4
3. Undershirt size, for example Medium
```

**User** (13:45:33 PT):

> Blouse and trousers Medium-Regular, cover 7 3/8, undershirt Medium.

**Hey Boot** (15 s, status `done`, run `js75a1wvb4v08eyv9102ckr5nd8jkavp`):

```
Your sizes are saved. Here's the set I picked:

Here's what I found:
• USMC MCCUU Woodland MARPAT Blouse (cammies), Medium-Regular, Used: $35.00 at Gearrack (price checked Nov 20, 1:40 PM PT)
  https://gearrack.com/products/usmc-woodland-marpat-mccuu-blouse
• USMC MCCUU Woodland MARPAT Trousers (cammies), Medium-Regular, Used: $45.00 at Gearrack (price checked Nov 20, 1:40 PM PT)
  https://gearrack.com/products/usmc-woodland-marpat-mccuu-trousers-1
• USMC 8-Point Woodland MARPAT Utility Cover, Medium, Used: $10.00 at Gearrack (price checked Nov 20, 1:40 PM PT)
  https://gearrack.com/products/usmc-woodland-marpat-utility-cover
• Coyote Brown T-Shirt / Undershirt (AR 670-1), Medium: $16.99 at USAMM (price checked Nov 20, 1:40 PM PT)
  https://www.usamm.com/products/ar-670-1-coyote-t-shirt
Total $106.99, under your $150.00 budget.
Reply YES to buy (test mode, no real money moves). I'll never ask for your card, SSN, bank details or passwords by text.

The catalog only lists the cover as "Medium", not in numeric sizes. Check that it fits a 7 3/8 before you buy.
```

**User** (13:45:36 PT):

> YES

**Hey Boot** (3 s, status `done`, run `js7bq6jnyyny302dhs3qpwy1bd8jjdv7`):

```
Done. Order jh70xm0jesybcfzdbhvw7zcpbs8jk9ze placed for $106.99 (Stripe test payment pi_3UdzcgDfJmsIes0m0Yo1IMKQ; no real money moved).
Receipt with every source and step: https://heyboot-hack.vercel.app/receipt/jn71rh3hjv1ed6r80yq6qexe3x8jkdw3
```

**User** (13:45:36 PT):

> YES

**Hey Boot** (0 s, status `refused`, run `js7brhdk4w4gwtvh4edpc5zd5h8jk056`):

```
Already done. That order went through once (order jh70xm0jesybcfzdbhvw7zcpbs8jk9ze). No second charge.
Receipt: https://heyboot-hack.vercel.app/receipt/jn71rh3hjv1ed6r80yq6qexe3x8jkdw3
```

## What this shows

1. Asks once: one message lists every missing size (cammies, cover, undershirt). It doesn't guess and doesn't search before it has them.
2. Saves and continues: three `save_memory` calls (each stored in Convex and sent to Cognee, `cognee saved=True`), then search and approve card in the same turn, without asking again.
3. Sourced card: $106.99 under the $150 budget; every line has a store URL and capture time. The agent flags that the cover is sold as "Medium", not a numeric 7 3/8.
4. Acts once: YES → one Stripe test charge; second YES → "Already done… No second charge."

## Audit trail (SingleStore `audit_events`)

| run_id | seq | step | detail |
|---|---|---|---|
| `js70nkqqrw2e2tqdw0h4wkfdzd8jkd8g` | 1 | inbound |  |
| `js70nkqqrw2e2tqdw0h4wkfdzd8jkd8g` | 2 | outbound |  |
| `js7b5cv5nd9a3cvw665se4rh118jjx0e` | 1 | inbound |  |
| `js7b5cv5nd9a3cvw665se4rh118jjx0e` | 2 | recall_memory | backend=cognee / I could not find an answer to this in your memory. |
| `js7b5cv5nd9a3cvw665se4rh118jjx0e` | 3 | outbound |  |
| `js75a1wvb4v08eyv9102ckr5nd8jkavp` | 1 | inbound |  |
| `js75a1wvb4v08eyv9102ckr5nd8jkavp` | 2 | save_memory | cammies_size=MCCUU blouse and trousers: Medium-Regular / cognee saved=True |
| `js75a1wvb4v08eyv9102ckr5nd8jkavp` | 3 | save_memory | cover_size=7 3/8 / cognee saved=True |
| `js75a1wvb4v08eyv9102ckr5nd8jkavp` | 4 | save_memory | undershirt_size=Medium / cognee saved=True |
| `js75a1wvb4v08eyv9102ckr5nd8jkavp` | 5 | search_catalog |  |
| `js75a1wvb4v08eyv9102ckr5nd8jkavp` | 6 | propose |  |
| `js75a1wvb4v08eyv9102ckr5nd8jkavp` | 7 | outbound |  |
| `js7bq6jnyyny302dhs3qpwy1bd8jjdv7` | 1 | inbound |  |
| `js7bq6jnyyny302dhs3qpwy1bd8jjdv7` | 2 | approval |  |
| `js7bq6jnyyny302dhs3qpwy1bd8jjdv7` | 3 | stock_check |  |
| `js7bq6jnyyny302dhs3qpwy1bd8jjdv7` | 4 | purchase |  |
| `js7bq6jnyyny302dhs3qpwy1bd8jjdv7` | 5 | outbound |  |
| `js7brhdk4w4gwtvh4edpc5zd5h8jk056` | 1 | inbound |  |
| `js7brhdk4w4gwtvh4edpc5zd5h8jk056` | 2 | approval |  |
| `js7brhdk4w4gwtvh4edpc5zd5h8jk056` | 3 | outbound |  |

Known issue in this recording, fixed right after (commit following `c21ef7c`): at seq 2 of the uniform request, Cognee answered "I could not find an answer to this in your memory." and that reply was logged as a memory instead of triggering the Convex fallback. The behavior was still correct (the uniform sizes really weren't saved yet). Cognee "could not find" replies are now treated as empty, so the Convex table answers instead.
