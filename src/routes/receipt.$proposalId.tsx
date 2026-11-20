import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { convexAction } from '@convex-dev/react-query'
import { api } from '../../convex/_generated/api'
import { Receipt } from '~/components/receipt/Receipt'
import { fixture } from '~/components/receipt/fixture'
import { toReceiptData } from '~/components/receipt/fromConvex'

export const Route = createFileRoute('/receipt/$proposalId')({
  head: () => ({ meta: [{ title: 'Audit trail · Hey Boot' }] }),
  component: ReceiptPage,
})

function ReceiptPage() {
  const { proposalId } = Route.useParams()
  // Demo fixture IDs (prop_demo_*) render the fixture; real IDs load from Convex + SingleStore.
  if (proposalId.startsWith('prop_demo')) return <Receipt data={{ ...fixture, proposalId }} />
  return <LiveReceipt proposalId={proposalId} />
}

function LiveReceipt({ proposalId }: { proposalId: string }) {
  const { data, isPending, error } = useQuery({
    ...convexAction(api.receipt.get, { proposalId }),
    staleTime: 30_000,
  })
  if (isPending) return <Message text="Loading receipt…" />
  if (error) return <Message text="Couldn't load this receipt. Try refreshing." />
  if (!data) return <Message text="Receipt not found." />
  return <Receipt data={toReceiptData({ proposal: data.proposal, order: data.order, audit: data.audit })} />
}

function Message({ text }: { text: string }) {
  return <main className="mx-auto max-w-3xl p-8 text-2xl">{text}</main>
}
