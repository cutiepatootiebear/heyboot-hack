// DEMO DATA. Mirrors the demo backup run in data/demo-backup.md (Stripe test mode, no real
// money moved). It is built from raw rows shaped like main's Convex + SingleStore data, so it
// also exercises toReceiptData(). The rejected options and memory keys are illustrative;
// that run's exact rejected list isn't in the backup notes.
// Hashes: sha256(prevHash|seq|ts|step|summary) over the events in display order, genesis = 64 zeros.
import { toReceiptData } from './fromConvex'
import type { AuditRow, OrderRow, ProposalRow } from './fromConvex'

const CAPTURED = '2026-11-20T21:07:22Z'
const RUN1 = 'js746r2m31z51m98mndqbstsqd8jk94a'
const RUN2 = 'js767n57egxth7hsskdrvcfq5n8jjwyk'
const RUN3 = 'js7bephr52hye5jqnwcj30qjd18jk2t6'

const items = [
  {
    item: "Brooks Adrenaline GTS 25, Men's 10.5 Wide (EE), Black/Black/Ebony",
    store: 'Holabird Sports',
    qty: 1,
    price: 109.95,
    milDiscountPct: 0,
    catalogMilDiscountPct: 10,
    discountSourceUrl: null,
    finalPrice: 109.95,
    url: 'https://www.holabirdsports.com/products/brooks-adrenaline-gts-25-mens-black-black-ebony',
    capturedAt: CAPTURED,
  },
  {
    item: 'Master Lock 1-7/8" Black Dial Combination Padlock',
    store: 'Target',
    qty: 1,
    price: 6.99,
    milDiscountPct: 0,
    catalogMilDiscountPct: 0,
    discountSourceUrl: null,
    finalPrice: 6.99,
    url: 'https://www.target.com/p/master-lock-1-7-8-black-dial-combination-padlock/-/A-14439947',
    capturedAt: CAPTURED,
  },
]

export const fixtureProposal: ProposalRow = {
  _id: 'jn7akj0565nwb3q0yf7afvv60d8jjrpn',
  _creationTime: Date.parse('2026-11-20T21:17:11Z'),
  items,
  rejected: [
    { item: "Brooks Ghost 18, Men's 10.5 Wide (EE), Black/Grey/White", store: 'Holabird Sports', reason: 'out of stock at Holabird Sports' },
    { item: "Brooks Ghost 18, Men's 10.5 Wide (2E), Black/Grey/White", store: 'Running Warehouse', reason: 'over budget: $149.95 plus a lock is more than $150' },
    { item: "ASICS GT-2000 14, Men's 10.5 Wide (2E), Black/Graphite Grey", store: 'Sports Basement', reason: 'not your preferred brand (Brooks)' },
    { item: 'Master Lock Combination Brass Lock, Resettable, 0.5" Shackle', store: 'Target', reason: 'costs more than the $6.99 lock that does the same job' },
  ],
  total: 116.94,
  budget: 150,
  status: 'purchased',
  approvedAt: Date.parse('2026-11-20T21:17:14Z'),
}

export const fixtureOrder: OrderRow = {
  _id: 'jh7605t8jnphcjjew94a1wdcf18jkam0',
  _creationTime: Date.parse('2026-11-20T21:17:15Z'),
  amountCents: 11694,
  status: 'charged',
  stripePaymentIntentId: 'pi_3UdzAyDfJmsIes0m2QfhhtcZ',
}

const src = (rows: { item: string; store: string; url: string }[]) =>
  JSON.stringify(rows.map((r) => ({ title: `${r.item} at ${r.store}`, url: r.url, captured_at: CAPTURED })))

export const fixtureAudit: AuditRow[] = [
  { run_id: RUN1, seq: 1, step: 'inbound', ts: '2026-11-20 21:16:55.120', input: { text: 'Report to SOI Tuesday. Need running shoes and a combination lock. Budget $150.', route: 'agent' }, output: null, sources: '[]' },
  { run_id: RUN1, seq: 2, step: 'recall_memory', ts: '2026-11-20 21:16:58.410', input: { query: 'sizes and preferences' }, output: { memories: [{ key: 'shoe size', value: "men's 10.5" }, { key: 'shoe width', value: 'wide' }, { key: 'brand', value: 'prefers Brooks' }], backend: 'convex' }, sources: '[]' },
  { run_id: RUN1, seq: 3, step: 'search_catalog', ts: '2026-11-20 21:17:01.030', input: { query: "Brooks men's 10.5 wide running shoes", max_price: 150 }, output: { rows: [1, 2, 3, 4, 5], notFound: false }, sources: src([{ item: items[0].item, store: items[0].store, url: items[0].url }]) },
  { run_id: RUN1, seq: 4, step: 'search_catalog', ts: '2026-11-20 21:17:03.770', input: { query: "men's 10.5 wide running shoes", max_price: 150 }, output: { rows: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], notFound: false }, sources: '[]' },
  { run_id: RUN1, seq: 5, step: 'search_catalog', ts: '2026-11-20 21:17:06.250', input: { query: 'combination lock', max_price: 40 }, output: { rows: [1, 2, 3], notFound: false }, sources: src([{ item: items[1].item, store: items[1].store, url: items[1].url }]) },
  { run_id: RUN1, seq: 6, step: 'propose', ts: '2026-11-20 21:17:11.480', input: {}, output: { items, total: 116.94, budget: 150 }, sources: src(items) },
  { run_id: RUN1, seq: 7, step: 'outbound', ts: '2026-11-20 21:17:12.020', input: null, output: { reply: 'approve card' }, sources: '[]' },
  { run_id: RUN2, seq: 1, step: 'inbound', ts: '2026-11-20 21:17:13.900', input: { text: 'YES', route: 'yes_fast_path' }, output: null, sources: '[]' },
  { run_id: RUN2, seq: 2, step: 'approval', ts: '2026-11-20 21:17:14.050', input: {}, output: { allowed: true, proposalId: 'jn7akj0565nwb3q0yf7afvv60d8jjrpn', ageSeconds: 3 }, sources: '[]' },
  { run_id: RUN2, seq: 3, step: 'stock_check', ts: '2026-11-20 21:17:14.400', input: {}, output: { stock: [] }, sources: '[]' },
  { run_id: RUN2, seq: 4, step: 'purchase', ts: '2026-11-20 21:17:15.610', input: { amountCents: 11694, mode: 'stripe_test' }, output: { orderId: 'jh7605t8jnphcjjew94a1wdcf18jkam0', paymentIntentId: 'pi_3UdzAyDfJmsIes0m2QfhhtcZ', status: 'succeeded' }, sources: '[]' },
  { run_id: RUN2, seq: 5, step: 'outbound', ts: '2026-11-20 21:17:15.900', input: null, output: { reply: 'done' }, sources: '[]' },
  { run_id: RUN3, seq: 1, step: 'inbound', ts: '2026-11-20 21:17:16.700', input: { text: 'YES', route: 'yes_fast_path' }, output: null, sources: '[]' },
  { run_id: RUN3, seq: 2, step: 'approval', ts: '2026-11-20 21:17:16.850', input: {}, output: { allowed: false, reason: 'no_pending' }, sources: '[]' },
  { run_id: RUN3, seq: 3, step: 'outbound', ts: '2026-11-20 21:17:17.100', input: null, output: { reply: 'already done' }, sources: '[]' },
]

// Computed once from the events below (see the comment at the top); editing any event breaks the chain.
const HASHES: string[] = [
  'c41d3cc4d4ec4cf4f2633692fa51f8cae7a17f3c2209f78ecf2cad381592cbd6',
  '8980ec1f8005a8e1f7bdb0aa5e1fd2b29a1d66f4bd375006f013e574c1241f40',
  '15b6374ac1be42769dba90b379227e80c6013bc3e6b51dbb26ee0b53d60b3c30',
  'df0232a955cb9ce3220961b8fb93a46786f76c39469c6d2f9493c32d8f955dd5',
  '94e2b247b8b72e7e31f323e1edd1e1023c2b1566d5344138246ca8068a4ca97d',
  '70ffa248f3d065fd257b5d8d9b4d9e497fb31fbc95d2ced677a416c18b79795f',
  'b0cd890ed1e7e0e43059608e7b59dbe5c927f1d97f80f0ed3ae6fb65f15d9b0e',
  'a726adb3b32de31f433ba6c3ceb65bb364b811ec07ab2a6d3dbb514a873214c3',
  '7673217dc278bf076b40739ce948fb3ca94af05b8d0319b6178717a2272b1296',
  '1516787015cf924b8adcd142418e2377eb217be745bd8bf5643599b5c18a4c09',
  'fd47ee67095aa36e00950fa133164dda82b69986935f252990663a32cffcf1de',
  'c93e353b7c185abedc206a5e3fef60f174664d6661530151e19b7137f05df089',
  '578c5479d99423d3c8f5f917f861ab426f842bdf6314b7dea74bd23f3e9fc728',
  'dc767cb0ad0e1290cc5460a36cad51f44e59433175be73e50d02da295254a5ff',
  '23b9996305d7b48cdafe2b166e29ecf8d36fea37972b609392a45e130be0380e',
]

export const fixture = (() => {
  const data = toReceiptData({
    proposal: fixtureProposal,
    order: fixtureOrder,
    audit: fixtureAudit,
    buyerLabel: 'Demo user',
  })
  data.events.forEach((e, i) => {
    if (HASHES[i]) e.hash = HASHES[i]
  })
  data.factChecks = [
    {
      claim: 'Holabird Sports gives a 10% military discount on this shoe.',
      verdict: 'not_checked',
    },
  ]
  return data
})()
