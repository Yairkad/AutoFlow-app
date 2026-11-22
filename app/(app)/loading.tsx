import { PageSkeleton } from '@/components/ui/Skeleton'

// Instant feedback while the next page loads (otherwise the old page stays frozen until the server answers)
export default function Loading() {
  return <PageSkeleton kind="table" />
}
