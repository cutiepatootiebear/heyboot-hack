// DEMO DATA ONLY. Fictional unit, people and prices; the purchase is simulated (Stripe test mode).
// Regulation URLs are real (acquisition.gov). Event hashes were computed with the same rule the
// page uses to verify them: sha256(prevHash|seq|ts|step|summary), genesis prevHash = 64 zeros.
import type { ReceiptData, Source } from './types'

const AT = '2026-11-20T12:00:00-08:00'
const src = (title: string, url: string): Source => ({ title, url, retrievedAt: AT })

export const SOURCES = {
  far2101: src('FAR 2.101 Definitions (micro-purchase threshold $15,000; SAT $350,000)', 'https://www.acquisition.gov/far/2.101'),
  far8002: src('FAR 8.002 Priorities for use of mandatory Government sources', 'https://www.acquisition.gov/far/8.002'),
  far42102: src('FAR 4.2102 Prohibition (Section 889 covered telecom/video equipment)', 'https://www.acquisition.gov/far/4.2102'),
  dfars2257002: src('DFARS 225.7002-2 Exceptions (Berry Amendment)', 'https://www.acquisition.gov/dfars/225.7002-2-exceptions.'),
}

export const fixture: ReceiptData = {
  proposalId: 'prop_demo_001',
  mode: 'gpc',
  testMode: true,
  buyer: { label: 'Demo Cardholder', role: 'Unit GPC cardholder' },
  approver: { label: 'Demo Approving Official', role: 'Approving official' },
  fundLine: 'DEMO-OM-0412',
  request: {
    text: 'We need 40 cold-weather gloves and 6 rugged tablets for the field exercise on Dec 12. Fund line DEMO-OM-0412.',
    at: '2026-11-20T14:02:11-08:00',
  },
  memory: [
    { key: 'Approving official', value: 'Demo Approving Official (on file)' },
    { key: 'Fund line balance', value: '$9,500.00' },
    { key: 'Required specs', value: 'gloves: cold-weather · tablets: rugged' },
  ],
  threshold: { label: 'Micro-purchase threshold', amount: 15000, source: SOURCES.far2101 },
  cart: [
    {
      id: 'GLV-001',
      description: 'Extreme cold-weather gauntlet',
      vendor: 'AbilityOne Base Supply Center',
      qty: 40,
      unitPrice: 45,
      url: 'https://example.test/catalog/GLV-001',
      capturedAt: AT,
      score: 0.89,
      scoreDisplay: '0.89 (price 0.49, spec 0.40)',
      reason: '$1,800.00 at AbilityOne Base Supply Center; mandatory source (AbilityOne); meets all specs',
      checks: [
        { label: 'Mandatory source', status: 'pass', rule: 'FAR 8.002', source: SOURCES.far8002 },
        { label: 'Section 889', status: 'pass', rule: 'FAR 4.2102', note: 'Vendor not covered', source: SOURCES.far42102 },
        { label: 'Berry Amendment', status: 'n/a', rule: 'DFARS 225.7002-2', note: 'Purchase is under $200,000; exception (a) applies', source: SOURCES.dfars2257002 },
      ],
    },
    {
      id: 'TAB-001',
      description: 'Rugged 10" tablet',
      vendor: 'GSA Advantage vendor (demo)',
      qty: 6,
      unitPrice: 850,
      url: 'https://example.test/catalog/TAB-001',
      capturedAt: AT,
      score: 0.68,
      scoreDisplay: '0.68 (price 0.28, spec 0.40)',
      reason: '$5,100.00 at GSA Advantage vendor (demo); no mandatory source for this item; meets all specs',
      checks: [
        { label: 'Mandatory source', status: 'n/a', rule: 'FAR 8.002', note: 'None lists this item', source: SOURCES.far8002 },
        { label: 'Section 889', status: 'pass', rule: 'FAR 4.2102', note: 'Vendor not covered', source: SOURCES.far42102 },
      ],
    },
  ],
  rejected: [
    {
      id: 'TAB-002',
      description: 'Rugged tablet with thermal camera',
      vendor: 'Hikvision reseller (demo)',
      price: 4200,
      finding: 'Section 889',
      reason: 'Section 889 covered vendor (hikvision)',
      rule: 'FAR 4.2102',
      source: SOURCES.far42102,
    },
    {
      id: 'GLV-004',
      description: 'Insulated winter gloves (40)',
      vendor: 'Commercial vendor (demo)',
      price: 1240,
      finding: 'Mandatory source',
      reason: 'mandatory source available; non-mandatory vendor not allowed',
      rule: 'FAR 8.002',
      source: SOURCES.far8002,
    },
    {
      id: 'TAB-004',
      description: 'Ultra-rugged tablet (6)',
      vendor: 'Commercial IT vendor (demo)',
      price: 11100,
      finding: 'Over budget',
      reason: 'over budget ($11100.00 > $9500.00)',
      rule: null,
    },
    {
      id: 'GLV-006',
      description: 'Heated gloves (40)',
      vendor: 'AbilityOne Base Supply Center',
      price: 1400,
      finding: 'Out of stock',
      reason: 'out of stock',
      rule: null,
    },
  ],
  factChecks: [
    { claim: 'The micro-purchase threshold is $15,000.', verdict: 'verified', source: SOURCES.far2101 },
    { claim: 'AbilityOne must be used before commercial sources when it meets the need.', verdict: 'verified', source: SOURCES.far8002 },
    { claim: 'Hikvision equipment is prohibited under Section 889.', verdict: 'verified', source: SOURCES.far42102 },
    { claim: 'These gloves are rated to -40°F.', verdict: 'unsupported' },
  ],
  approval: {
    at: '2026-11-20T14:05:40-08:00',
    by: 'Demo Approving Official',
    mandateHash: 'c021e20fed255222ea26c3410fbdeb1d37cf22a70cb64d9483379777b01a617b',
  },
  order: {
    orderId: 'ord_demo_001',
    paymentId: 'pi_test_demo_001',
    status: 'succeeded (test mode)',
    amountCents: 690000,
    at: '2026-11-20T14:05:41-08:00',
  },
  events: [
    {
      "seq": 1,
      "ts": "2026-11-20T14:02:11-08:00",
      "step": "request",
      "actor": "user",
      "summary": "Request received: 40 cold-weather gloves, 6 rugged tablets, need by Dec 12, fund line DEMO-OM-0412.",
      "hash": "4c2e003854dcd916f1effccf9f1d8188af7c19e7af12efad36e7585671ec4847"
    },
    {
      "seq": 2,
      "ts": "2026-11-20T14:02:12-08:00",
      "step": "memory",
      "actor": "agent",
      "summary": "Recalled unit profile: approving official on file, remaining fund balance $9,500.00.",
      "hash": "6fa7fcbf3618fba35aa18ba21ee1fbc30d7cd86d78a156fbb076c0c3515c3851"
    },
    {
      "seq": 3,
      "ts": "2026-11-20T14:02:14-08:00",
      "step": "catalog",
      "actor": "agent",
      "summary": "Read 7 catalog rows (prices captured 2026-11-20 12:00 PT).",
      "hash": "537b41706309dbe500adba9351e0207b813a93b1e12f9501791576398a2127f1"
    },
    {
      "seq": 4,
      "ts": "2026-11-20T14:02:17-08:00",
      "step": "context",
      "actor": "senso",
      "summary": "Retrieved 5 sources: FAR 2.101, FAR 8.002, FAR 4.2102, DFARS 225.7002-2, unit GPC SOP.",
      "hash": "1ce4a44b55eeeafa4bf194f45578b7099ee4d4286aa5b30d4a8dba88c6bfb5a3"
    },
    {
      "seq": 5,
      "ts": "2026-11-20T14:02:18-08:00",
      "step": "rules",
      "actor": "rules",
      "summary": "Hard rejects applied: 1 Section 889, 1 mandatory-source gate, 1 over budget, 1 out of stock.",
      "hash": "55de4b5206126c62bdc003e10aec2f30e2d060bbe2dcd397f8794676da52742a"
    },
    {
      "seq": 6,
      "ts": "2026-11-20T14:02:19-08:00",
      "step": "score",
      "actor": "rules",
      "summary": "Scored 2 eligible lines with 0.60*(1 - price/budget) + 0.40*spec_match.",
      "hash": "9f664ef3f7da4effd892b8a2ec3bbf6e84f76bf4fd5c6073a1bb937f8c428723"
    },
    {
      "seq": 7,
      "ts": "2026-11-20T14:02:24-08:00",
      "step": "fact_check",
      "actor": "senso",
      "summary": "Fact-checked 4 claims on the approve card: 3 verified, 1 unsupported (removed).",
      "hash": "5cb479d4fff8ccfbcf0c917941d4826a5637b039aa68e4d5fcd4ef946074ed22"
    },
    {
      "seq": 8,
      "ts": "2026-11-20T14:02:25-08:00",
      "step": "propose",
      "actor": "agent",
      "summary": "Approve card sent: 2 lines, total $6,900.00, under the $15,000 micro-purchase threshold.",
      "hash": "267b552c00ebb4441c049f93981d08608ceae5b3d05b90ae6e0d4f03c094df98"
    },
    {
      "seq": 9,
      "ts": "2026-11-20T14:05:40-08:00",
      "step": "approve",
      "actor": "approver",
      "summary": "Approving official replied YES. Cart mandate signed.",
      "hash": "c7551e3836b3731f273ed807a5bfb0258c7aa141c36fdc1df906e4fd672a58fe"
    },
    {
      "seq": 10,
      "ts": "2026-11-20T14:05:41-08:00",
      "step": "charge",
      "actor": "payment",
      "summary": "TEST MODE charge succeeded, $6,900.00, idempotency key demo-unit:prop_demo_001.",
      "hash": "6a0946348252f742a26952a18806ab9bdd43748f5932a91a87aa8800996fd190"
    },
    {
      "seq": 11,
      "ts": "2026-11-20T14:05:44-08:00",
      "step": "approve",
      "actor": "approver",
      "summary": "Duplicate YES received. No second charge (same idempotency key).",
      "hash": "cdd499bd1621f0aaa476538819fac961ff3c4fba2040d868b81b4f969440be43"
    }
  ],
}
