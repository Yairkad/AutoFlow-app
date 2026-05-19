'use client'

export default function LandscapeLock() {
  function lock() {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(screen.orientation as any).lock('landscape').catch(() => {})
    } catch {}
  }

  return (
    <button
      onClick={lock}
      title="נעל מסך לרוחב"
      style={{
        position: 'fixed', bottom: '12px', left: '12px', zIndex: 9999,
        width: '40px', height: '40px', borderRadius: '10px',
        background: 'rgba(30,41,59,0.75)', border: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', backdropFilter: 'blur(4px)',
      }}
    >
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="2" width="16" height="20" rx="2"/>
        <path d="M9 17h6M8 7l4-4 4 4"/>
      </svg>
    </button>
  )
}
