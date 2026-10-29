import ReceiveClient from '@/components/yard/ReceiveClient'

export const metadata = { title: 'קבלת סחורה' }

// Same receive flow as the yard terminal, kept inside the office app
export default function TiresReceivePage() {
  return <ReceiveClient office />
}
