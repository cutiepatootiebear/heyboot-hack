import { createFileRoute } from '@tanstack/react-router'
import { Receipt } from '~/components/receipt/Receipt'
import { fixture } from '~/components/receipt/fixture'

export const Route = createFileRoute('/receipt/$proposalId')({
  head: () => ({ meta: [{ title: 'Audit trail · Hey Boot' }] }),
  component: ReceiptPage,
})

function ReceiptPage() {
  const { proposalId } = Route.useParams()
  // TODO: swap the fixture for api.receipt.get({ proposalId }) once it lands on main.
  return <Receipt data={{ ...fixture, proposalId }} />
}
