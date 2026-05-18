import { requireAuth } from '@/lib/auth/require'
import { redirect } from 'next/navigation'
import NewCarClient from '@/components/yard/NewCarClient'

export default async function NewCarPage() {
  const auth = await requireAuth()
  if ('error' in auth) redirect('/login')
  return <NewCarClient />
}
