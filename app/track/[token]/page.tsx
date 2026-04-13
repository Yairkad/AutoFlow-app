import { createClient } from '@/lib/supabase/server'
import TrackView from './TrackView'

export const dynamic = 'force-dynamic'

export default async function TrackPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = await createClient()

  // 1. Try alignment job
  const { data: alignJob } = await supabase
    .from('alignment_jobs')
    .select('plate, make, model, year, color, customer_name, customer_phone, job_type, status, updated_at')
    .eq('track_token', token)
    .maybeSingle()

  if (alignJob) {
    return <TrackView type="alignment" job={alignJob} />
  }

  // 2. Try test transfer
  const { data: transfer } = await supabase
    .from('test_transfers')
    .select('plate, make, model, year, customer_name, customer_phone, transfer_date, status, extra_charges, updated_at')
    .eq('track_token', token)
    .maybeSingle()

  if (transfer) {
    return <TrackView type="test_transfer" job={transfer} />
  }

  // Not found
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full text-center">
        <div className="text-5xl mb-4">🔍</div>
        <h1 className="text-xl font-bold text-gray-800 mb-2">לינק לא תקין</h1>
        <p className="text-gray-500 text-sm">לא נמצאה עבודה עם לינק זה.</p>
      </div>
    </div>
  )
}
