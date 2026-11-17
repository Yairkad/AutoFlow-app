import PageHeader from '@/components/ui/PageHeader'
import LabelsPanel from '@/components/documents/LabelsPanel'

export default function LabelsPage() {
  return (
    <div>
      <PageHeader
        icon={<svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>}
        title="מדבקות"
        subtitle="מחזיקי מפתחות לרכבים, מדבקות מחיר ומדבקות בעיצוב אישי — למדפסת המדבקות"
      />
      <LabelsPanel />
    </div>
  )
}
