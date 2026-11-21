import { Link, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  head: () => ({ meta: [{ title: 'Hey Boot' }] }),
  component: Home,
})

function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 px-4 text-center">
      <h1 className="text-5xl font-bold">Hey Boot</h1>
      <p className="text-xl max-w-xl">
        An iMessage shopping agent for new Marines. Text +1 929 364 9402.
      </p>
      <Link
        to="/receipt/$proposalId"
        params={{ proposalId: 'jn750bw5ya6ecgfdkdt95dhwxh8jjwp7' }}
        className="rounded-md border-2 px-5 py-3 text-lg font-semibold"
      >
        See a verified receipt
      </Link>
    </main>
  )
}
