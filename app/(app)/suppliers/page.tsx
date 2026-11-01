import { redirect } from 'next/navigation'

// Accounts with suppliers and customers moved to /accounts (tabs); contact details to /contacts
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  const q = new URLSearchParams({ tab: 'suppliers' })
  for (const [k, v] of Object.entries(sp)) if (typeof v === 'string' && k !== 'tab') q.set(k, v)
  redirect(`/accounts?${q}`)
}
