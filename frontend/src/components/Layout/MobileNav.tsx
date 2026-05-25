import { useRef, useCallback, type ReactNode } from 'react'

export type MobileTab = 'radio' | 'playlists' | 'profile'

interface Props {
  active: MobileTab
  onChange: (tab: MobileTab) => void
}

const TABS: { key: MobileTab; label: string; icon: ReactNode }[] = [
  {
    key: 'radio',
    label: '电台',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zm12-3c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zM9 10l12-3" />
      </svg>
    ),
  },
  {
    key: 'playlists',
    label: '歌单',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
      </svg>
    ),
  },
  {
    key: 'profile',
    label: '画像',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
  },
]

const TAB_ORDER: MobileTab[] = ['radio', 'playlists', 'profile']

export default function MobileNav({ active, onChange }: Props) {
  const touchStartX = useRef(0)
  const touchStartY = useRef(0)

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
  }, [])

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current
    const dy = e.changedTouches[0].clientY - touchStartY.current

    // Only react to horizontal swipes (> 50px, horizontal > vertical)
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return

    const currentIdx = TAB_ORDER.indexOf(active)
    if (dx > 0 && currentIdx > 0) {
      onChange(TAB_ORDER[currentIdx - 1])
    } else if (dx < 0 && currentIdx < TAB_ORDER.length - 1) {
      onChange(TAB_ORDER[currentIdx + 1])
    }
  }, [active, onChange])

  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-[var(--color-radio-surface)]/95 backdrop-blur-md border-t border-[var(--color-radio-border)]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="flex items-center justify-around h-14">
        {TABS.map((tab) => {
          const isActive = active === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => onChange(tab.key)}
              className={`flex flex-col items-center justify-center gap-0.5 w-full h-full transition-colors active:scale-95 ${
                isActive
                  ? 'text-[var(--color-radio-accent)]'
                  : 'text-[var(--color-radio-muted)]'
              }`}
            >
              {tab.icon}
              <span className="text-[10px] leading-none">{tab.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
