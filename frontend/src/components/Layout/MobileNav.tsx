import { useRef, useCallback, type ReactNode } from 'react'

export type MobileTab = 'radio' | 'playlists' | 'profile'

interface Props {
  active: MobileTab
  onChange: (tab: MobileTab) => void
  onAdmin?: () => void
  onLogin?: () => void
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
    label: '找歌',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
      </svg>
    ),
  },
  {
    key: 'profile',
    label: '偏好',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
  },
]

const TAB_ORDER: MobileTab[] = ['radio', 'playlists', 'profile']

export default function MobileNav({ active, onChange, onAdmin, onLogin }: Props) {
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
        {onAdmin && (
          <button
            onClick={onAdmin}
            className="flex flex-col items-center justify-center gap-0.5 w-full h-full text-[var(--color-radio-muted)] transition-colors active:scale-95"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M6 7v10a2 2 0 002 2h8a2 2 0 002-2V7M9 11h6" />
            </svg>
            <span className="text-[10px] leading-none">管理</span>
          </button>
        )}
        {onLogin && (
          <button
            onClick={onLogin}
            className="flex flex-col items-center justify-center gap-0.5 w-full h-full text-[var(--color-radio-gold)] transition-colors active:scale-95"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6A2.25 2.25 0 005.25 5.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l3 3m0 0l-3 3m3-3H3" />
            </svg>
            <span className="text-[10px] leading-none">绑定</span>
          </button>
        )}
      </div>
    </nav>
  )
}
