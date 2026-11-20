import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { verifyChain } from './hashChain'
import type { ChainStatus } from './hashChain'
import type { Check, ReceiptData, Source, Verdict } from './types'

const usd = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })

const timePT = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  }) + ' PT'

const datePT = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })


function Cite({ rule, source }: { rule?: string | null; source?: Source }) {
  if (!rule && !source) return null
  const label = rule ?? source?.title
  return (
    <span className="rc-cite">
      {source ? (
        <a href={source.url} target="_blank" rel="noreferrer" title={source.title}>
          {label}
        </a>
      ) : (
        label
      )}
    </span>
  )
}

function CheckBadge({ c }: { c: Check }) {
  const cls = c.status === 'pass' ? 'rc-pass' : c.status === 'fail' ? 'rc-fail' : 'rc-na'
  const mark = c.status === 'pass' ? '✓' : c.status === 'fail' ? '✗' : '–'
  return (
    <div className="rc-check">
      <span className={`rc-badge ${cls}`}>
        {mark} {c.label}
      </span>
      {c.note ? <span className="rc-note">{c.note}</span> : null}
      <Cite rule={c.rule} source={c.source} />
    </div>
  )
}

const VERDICT_LABEL: Record<Verdict, string> = {
  verified: 'Verified',
  conflict: 'Conflict',
  unsupported: 'Unsupported',
  not_checked: 'Not checked',
}

function ChainLine({ status }: { status: ChainStatus }) {
  switch (status.state) {
    case 'checking':
      return <span>Checking hash chain…</span>
    case 'verified':
      return (
        <span className="rc-ok">
          ✓ Tamper check passed in this browser: all {status.count} records match their sha256 chain
          {status.runs > 1 ? ` (${status.runs} runs)` : ''}
        </span>
      )
    case 'partial':
      return (
        <span className="rc-warn">
          ✓ {status.verified} records verified; {status.unhashed} older records were written before hashing
        </span>
      )
    case 'unhashed':
      return <span className="rc-warn">Events have no stored hashes, so the chain can't be verified</span>
    case 'broken':
      return <span className="rc-bad">✗ Tamper check failed at step #{status.atSeq}: this record was changed after it was written</span>
    case 'unavailable':
      return <span className="rc-warn">This browser can't verify hashes</span>
  }
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rc-section">
      <h2>{title}</h2>
      {children}
    </section>
  )
}

export function Receipt({ data }: { data: ReceiptData }) {
  const [chain, setChain] = useState<ChainStatus>({ state: 'checking' })
  useEffect(() => {
    let live = true
    verifyChain(data.events).then((s) => live && setChain(s))
    return () => {
      live = false
    }
  }, [data.events])

  const total = data.cart.reduce((sum, l) => sum + l.qty * l.unitPrice, 0)
  const listTotal = data.cart.reduce((sum, l) => sum + l.qty * (l.listPrice ?? l.unitPrice), 0)
  const isGpc = data.mode === 'gpc'
  const showScore = data.cart.some((l) => l.score !== undefined)
  const showChecks = data.cart.some((l) => l.checks.length > 0)
  const showDiscount = data.cart.some((l) => l.listPrice !== undefined)
  const showRejectPrice = data.rejected.some((r) => r.price !== undefined)
  const footSpan = 2 + (showScore ? 1 : 0) + (showChecks ? 1 : 0)

  return (
    <div className="rc-page">
      <style>{CSS}</style>
      {data.testMode ? (
        <div className="rc-test" role="note">
          TEST MODE · DEMO DATA · SIMULATED PURCHASE. No real money moved.
        </div>
      ) : null}

      <article className="rc-doc">
        <header className="rc-head">
          <h1>{isGpc ? 'Procurement Audit Trail' : 'Hey Boot Receipt'}</h1>
          <div className="rc-meta">
            <div><b>{isGpc ? 'Cardholder' : 'Buyer'}:</b> {data.buyer.label}</div>
            <div><b>Date:</b> {datePT(data.request.at)}</div>
            <div><b>Approver:</b> {data.approver.label}</div>
            {data.fundLine ? <div><b>Fund line:</b> {data.fundLine}</div> : null}
            {data.budget !== undefined ? <div><b>Budget:</b> {usd(data.budget)}</div> : null}
            <div><b>Proposal:</b> <code>{data.proposalId}</code></div>
            {data.order ? <div><b>Order:</b> <code>{data.order.orderId}</code></div> : null}
          </div>
        </header>

        <Section title="1 · Request">
          <blockquote className="rc-quote">“{data.request.text}”</blockquote>
          <div className="rc-sub">Received {timePT(data.request.at)}</div>
          {data.memory.length ? (
            <>
              <div className="rc-label">{isGpc ? 'Unit profile used' : 'Remembered about you'}</div>
              <dl className="rc-memory">
                {data.memory.map((m, i) => (
                  <div key={`${m.key}-${i}`}>
                    <dt>{m.key}</dt>
                    <dd>{m.value}</dd>
                  </div>
                ))}
              </dl>
            </>
          ) : null}
        </Section>

        <Section title={isGpc ? '2 · Approved cart' : '2 · What you bought'}>
          <div className="rc-scroll">
            <table className="rc-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>{isGpc ? 'Vendor' : 'Store'}</th>
                  <th className="rc-num">Qty</th>
                  <th className="rc-num">{showDiscount ? 'Price' : 'Unit'}</th>
                  {showDiscount ? <th>Military discount</th> : null}
                  <th className="rc-num">Line</th>
                  {showScore ? <th>Score</th> : null}
                  {showChecks ? <th>Compliance</th> : null}
                </tr>
              </thead>
              <tbody>
                {data.cart.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <div className="rc-item">{l.description}</div>
                      <a className="rc-src" href={l.url} target="_blank" rel="noreferrer">
                        price checked {datePT(l.capturedAt)}, {timePT(l.capturedAt)} ↗
                      </a>
                    </td>
                    <td>{l.vendor}</td>
                    <td className="rc-num">{l.qty}</td>
                    <td className="rc-num">
                      {l.listPrice !== undefined && l.listPrice !== l.unitPrice ? (
                        <>
                          <s className="rc-note">{usd(l.listPrice)}</s> {usd(l.unitPrice)}
                        </>
                      ) : (
                        usd(l.unitPrice)
                      )}
                    </td>
                    {showDiscount ? (
                      <td>
                        {l.discountPct ? (
                          <span className="rc-badge rc-pass">✓ {l.discountPct}% verified</span>
                        ) : (
                          <span className="rc-badge rc-na">– Not applied</span>
                        )}
                        {l.discountNote && l.discountNote !== 'verified' ? <span className="rc-note">{l.discountNote}</span> : null}
                        {l.discountSource ? <Cite source={l.discountSource} rule="source" /> : null}
                      </td>
                    ) : null}
                    <td className="rc-num">{usd(l.qty * l.unitPrice)}</td>
                    {showScore ? (
                      <td>
                        <b>{l.score?.toFixed(2)}</b>
                        <div className="rc-note">{(l.scoreDisplay ?? '').replace(/^[\d.]+\s*/, '')}</div>
                      </td>
                    ) : null}
                    {showChecks ? <td>{l.checks.map((c) => <CheckBadge key={c.label} c={c} />)}</td> : null}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={showDiscount ? 4 : 3} className="rc-num"><b>Total</b></td>
                  <td className="rc-num"><b>{usd(total)}</b></td>
                  <td colSpan={footSpan - 1 || 1}>
                    {data.threshold ? (
                      <span className={total <= data.threshold.amount ? 'rc-ok' : 'rc-bad'}>
                        {total <= data.threshold.amount ? 'Under' : 'Over'} the {usd(data.threshold.amount)}{' '}
                        {data.threshold.label.toLowerCase()}{' '}
                        <Cite source={data.threshold.source} rule="FAR 2.101" />
                      </span>
                    ) : data.budget !== undefined ? (
                      <span className={total <= data.budget ? 'rc-ok' : 'rc-bad'}>
                        {total <= data.budget ? `Under your ${usd(data.budget)} budget` : `Over your ${usd(data.budget)} budget`}
                      </span>
                    ) : null}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Section>

        <Section title="3 · Options rejected and why">
          {data.rejected.length ? (
            <div className="rc-scroll">
              <table className="rc-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>{isGpc ? 'Vendor' : 'Store'}</th>
                    {showRejectPrice ? <th className="rc-num">Price</th> : null}
                    <th>Why not</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rejected.map((r) => (
                    <tr key={r.id}>
                      <td><div className="rc-item">{r.description}</div></td>
                      <td>{r.vendor}</td>
                      {showRejectPrice ? <td className="rc-num">{r.price !== undefined ? usd(r.price) : '—'}</td> : null}
                      <td>
                        <span className="rc-badge rc-fail">✗ {r.finding}</span>
                        <div className="rc-reason">{r.reason}</div>
                        <Cite rule={r.rule} source={r.source} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="rc-note">No other options were considered.</p>
          )}
        </Section>

        <Section title="4 · Fact-check of the approve card (Senso)">
          {data.factChecks.length ? (
            <ul className="rc-facts">
              {data.factChecks.map((f) => (
                <li key={f.claim}>
                  <span className={`rc-badge rc-v-${f.verdict}`}>{VERDICT_LABEL[f.verdict]}</span>
                  <span>{f.claim}</span>
                  {f.source ? (
                    <Cite source={f.source} />
                  ) : (
                    <span className="rc-note">
                      {f.verdict === 'not_checked' ? 'no Senso source yet, so the discount was not applied' : 'no source found; claim removed from card'}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="rc-note">No fact-check ran for this purchase.</p>
          )}
        </Section>

        <Section title="5 · Approval and payment">
          <div className="rc-meta">
            {data.approval ? (
              <>
                <div><b>Approved by:</b> {data.approval.by}</div>
                <div><b>Approved at:</b> {timePT(data.approval.at)}</div>
                {data.approval.mandateHash ? (
                  <div className="rc-wide">
                    <b>Cart mandate:</b> <code className="rc-hash">sha256:{data.approval.mandateHash}</code>
                  </div>
                ) : null}
              </>
            ) : (
              <div><b>Approval:</b> pending</div>
            )}
            {data.order ? (
              <>
                <div><b>Charge:</b> {usd(data.order.amountCents / 100)} · {data.order.status}</div>
                <div><b>Payment ID:</b> <code>{data.order.paymentId}</code></div>
              </>
            ) : null}
          </div>
        </Section>

        <Section title="6 · Every step, in order">
          <div className="rc-chain">
            <ChainLine status={chain} />
          </div>
          <details className="rc-details">
            <summary>
              Show all {data.events.length} steps{data.events.some((e) => e.hash) ? ' and their hashes' : ''}
            </summary>
          <ol className="rc-log">
            {data.events.map((e, i) => (
              <li key={`${e.runId ?? ''}-${e.seq}-${i}`}>
                <span className="rc-seq">#{i + 1}</span>
                <span className="rc-time">{timePT(e.ts)}</span>
                <span className={`rc-actor rc-a-${e.actor}`}>{e.actor}</span>
                <span className="rc-sum">
                  {e.summary}
                  {e.sources?.length ? (
                    <span className="rc-srcs">
                      {e.sources.map((s, si) => (
                        <a key={`${s.url}-${si}`} href={s.url} target="_blank" rel="noreferrer" title={s.title}>
                          {s.title.length > 48 ? s.title.slice(0, 47) + '…' : s.title} ↗
                        </a>
                      ))}
                    </span>
                  ) : null}
                </span>
                {e.hash ? (
                  <span className="rc-hashrow">
                    <span className="rc-hashlabel">sha256</span>
                    <code className="rc-hash">{e.hash}</code>
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
          </details>
        </Section>

        <Section title="Summary">
          <dl className="rc-summary">
            <div>
              <dt>Items</dt>
              <dd>{data.cart.reduce((n, l) => n + l.qty, 0)} ({data.cart.map((l) => l.vendor).filter((v, i, a) => a.indexOf(v) === i).join(', ')})</dd>
            </div>
            <div>
              <dt>Options rejected</dt>
              <dd>{data.rejected.length}</dd>
            </div>
            {listTotal > total ? (
              <>
                <div>
                  <dt>Before discounts</dt>
                  <dd>{usd(listTotal)}</dd>
                </div>
                <div>
                  <dt>Military discount saved</dt>
                  <dd className="rc-ok">−{usd(listTotal - total)}</dd>
                </div>
              </>
            ) : (
              <div>
                <dt>Military discount saved</dt>
                <dd>$0.00 (none verified)</dd>
              </div>
            )}
            {data.budget !== undefined ? (
              <div>
                <dt>Budget left</dt>
                <dd className={total <= data.budget ? 'rc-ok' : 'rc-bad'}>{usd(data.budget - total)} of {usd(data.budget)}</dd>
              </div>
            ) : null}
            <div>
              <dt>Approval</dt>
              <dd>{data.approval ? `${data.approval.by}, ${timePT(data.approval.at)}` : 'pending'}</dd>
            </div>
            <div>
              <dt>Steps logged</dt>
              <dd>
                {data.events.length} ·{' '}
                {chain.state === 'verified' ? <span className="rc-ok">chain verified</span> : chain.state === 'broken' ? <span className="rc-bad">chain broken</span> : 'not verifiable'}
              </dd>
            </div>
            <div className="rc-sum-wide">
              <dt>Payment</dt>
              <dd>{data.order ? `${data.order.status} · ${data.order.paymentId}` : 'none'}</dd>
            </div>
            <div className="rc-sum-wide rc-sum-total">
              <dt>Total charged</dt>
              <dd>{data.order ? usd(data.order.amountCents / 100) : `${usd(total)} (not charged yet)`}</dd>
            </div>
          </dl>
        </Section>

        <footer className="rc-foot">
          Hey Boot · {data.testMode ? 'demo data, simulated purchase' : 'live record'} · each record's hash = sha256(previous hash in its run | exact stored record)
        </footer>
      </article>
    </div>
  )
}

const CSS = `
.rc-page{--ink:#111;--mute:#555;--line:#8a8a8a;--paper:#fff;--wash:#f3f3f3;--ok:#1b6e2a;--bad:#b3261e;--warn:#8a5a00;--na:#5f6368;
  background:#e7e9ec;color:var(--ink);min-height:100vh;padding:24px 16px 48px;font:18px/1.5 "Helvetica Neue",Helvetica,Arial,sans-serif}
.rc-test{max-width:1100px;margin:0 auto 12px;background:#fff4d6;border:2px solid #b07d00;color:#5a3d00;font-weight:700;padding:10px 16px;letter-spacing:.02em}
.rc-doc{max-width:1100px;margin:0 auto;background:var(--paper);border-top:8px solid var(--ink);padding:32px clamp(16px,4vw,44px);box-shadow:0 2px 8px rgba(0,0,0,.08)}
.rc-head{border-bottom:2px solid var(--ink);padding-bottom:14px}
.rc-head h1{margin:0;font-size:30px;text-transform:uppercase;letter-spacing:.06em}
.rc-meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:6px 24px;margin-top:12px}
.rc-meta b{color:var(--mute)} .rc-wide{grid-column:1/-1}
.rc-section{margin-top:28px}
.rc-section h2{font-size:20px;margin:0 0 10px;padding-bottom:4px;border-bottom:1px solid var(--line);text-transform:uppercase;letter-spacing:.04em}
.rc-quote{margin:0;font-size:22px;border-left:4px solid var(--ink);padding:4px 0 4px 14px}
.rc-sub,.rc-note{color:var(--mute);font-size:15px}
.rc-note{display:block}
.rc-memory{display:flex;flex-wrap:wrap;gap:8px 28px;margin:12px 0 0}
.rc-memory dt{font-size:14px;color:var(--mute);text-transform:uppercase;letter-spacing:.04em} .rc-memory dd{margin:0;font-weight:600}
.rc-scroll{overflow-x:auto}
.rc-table{width:100%;border-collapse:collapse;min-width:640px}
.rc-table th,.rc-table td{border:1px solid var(--line);padding:10px;text-align:left;vertical-align:top}
.rc-table th{background:var(--wash);font-size:15px;text-transform:uppercase;letter-spacing:.04em}
.rc-table tfoot td{background:var(--wash)}
.rc-num{text-align:right!important;white-space:nowrap;font-variant-numeric:tabular-nums}
.rc-src{font-size:14px;color:#1a4fa0}
code{font-family:"SFMono-Regular",Menlo,Consolas,monospace;font-size:.85em;background:var(--wash);border:1px solid #d0d0d0;padding:1px 5px}
.rc-badge{display:inline-block;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;color:#fff;padding:3px 8px;margin:0 6px 4px 0}
.rc-pass,.rc-v-verified{background:var(--ok)} .rc-fail,.rc-v-conflict{background:var(--bad)}
.rc-na,.rc-v-not_checked{background:var(--na)} .rc-v-unsupported{background:var(--warn)}
.rc-check{margin-bottom:8px}
.rc-reason{color:var(--bad);font-weight:700;margin:2px 0}
.rc-cite{display:inline-block;font-size:14px;font-style:italic;color:var(--mute)}
.rc-cite a{color:#1a4fa0}
.rc-ok{color:var(--ok);font-weight:700} .rc-bad{color:var(--bad);font-weight:700} .rc-warn{color:var(--warn);font-weight:700}
.rc-facts{list-style:none;margin:0;padding:0} .rc-facts li{padding:8px 0;border-bottom:1px dotted var(--line);display:flex;flex-wrap:wrap;gap:4px 10px;align-items:baseline}
.rc-log{list-style:none;margin:0;padding:0}
.rc-log li{display:grid;grid-template-columns:44px 130px 96px 1fr auto;gap:10px;padding:8px 0;border-bottom:1px dotted var(--line);align-items:baseline}
.rc-seq,.rc-time{color:var(--mute);font-variant-numeric:tabular-nums;font-size:15px}
.rc-actor{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.04em}
.rc-hash{font-size:12px;color:var(--mute);word-break:break-all;overflow-wrap:anywhere}
.rc-hashrow{grid-column:3/-1;display:flex;gap:8px;align-items:baseline;min-width:0}
.rc-hashlabel{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--mute)}
.rc-details{margin-top:12px}
.rc-details>summary{cursor:pointer;font-weight:700;color:#1a4fa0;padding:8px 0;list-style-position:inside}
.rc-details>summary:focus-visible{outline:2px solid #1a4fa0;outline-offset:2px}
.rc-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr));gap:0 48px;margin:0;border:2px solid var(--ink);padding:6px 20px}
.rc-sum-wide{grid-column:1/-1}
.rc-sum-total{border-bottom:0!important;border-top:2px solid var(--ink);margin-top:-1px;padding-top:12px!important}
.rc-summary>div{display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px dotted var(--line)}
.rc-summary dt{color:var(--mute)} .rc-summary dd{margin:0;text-align:right;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.rc-sum-total dt,.rc-sum-total dd{font-weight:700;color:var(--ink);font-size:24px}
.rc-label{margin-top:14px;font-size:14px;color:var(--mute);text-transform:uppercase;letter-spacing:.05em}
.rc-item{font-weight:600}
.rc-srcs{display:flex;flex-wrap:wrap;gap:2px 12px;font-size:14px;margin-top:2px}
.rc-srcs a{color:#1a4fa0}
.rc-chain{margin-top:12px;padding:10px 12px;background:var(--wash);border:1px solid var(--line)}
.rc-foot{margin-top:32px;padding-top:14px;border-top:1px dotted var(--line);text-align:center;color:var(--mute);font-size:14px}
@media (max-width:720px){.rc-log li{grid-template-columns:40px 1fr;}.rc-actor,.rc-hash{grid-column:2}.rc-sum{grid-column:1/-1}}
`
