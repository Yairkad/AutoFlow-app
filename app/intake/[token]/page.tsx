import IntakeFormClient from '@/components/inspections/IntakeFormClient'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'טופס בדיקת קנייה' }

export default async function IntakePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <IntakeFormClient token={token} />
}
