import { useState, useEffect } from 'react'
import { useStore } from '../../store'
import { stopRadio } from '../../api/radio'

const PRESETS = [15, 30, 45, 60]

export default function SleepTimer() {
  const { sleepTimerMinutes, sleepTimerEnd, setSleepTimer, clearSleepTimer } = useStore()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!sleepTimerEnd) return
    const remaining = sleepTimerEnd - Date.now()
    if (remaining <= 0) {
      stopRadio()
      clearSleepTimer()
      return
    }
    const t = setTimeout(async () => {
      await stopRadio()
      clearSleepTimer()
    }, remaining)
    return () => clearTimeout(t)
  }, [sleepTimerEnd])

  const active = sleepTimerMinutes > 0
  const remaining = sleepTimerEnd ? Math.max(0, Math.ceil((sleepTimerEnd - Date.now()) / 60000)) : 0

  return (
    <div className="relative">
      <button
        onClick={() => active ? clearSleepTimer() : setOpen(!open)}
        className={`flex items-center gap-1 text-xs transition-colors ${
          active
            ? 'text-[var(--color-radio-accent)]'
            : 'text-[var(--color-radio-muted)] hover:text-[var(--color-radio-text)]'
        }`}
        title={active ? `定时关闭中: ${remaining} 分钟` : '定时关闭'}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        {active && <span>{remaining}m</span>}
      </button>

      {open && !active && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 z-50 bg-[var(--color-radio-card)] border border-[var(--color-radio-border)] rounded-xl shadow-xl overflow-hidden w-36">
            <p className="px-3 py-2 text-xs text-[var(--color-radio-muted)] border-b border-[var(--color-radio-border)]">
              定时关闭
            </p>
            {PRESETS.map((min) => (
              <button
                key={min}
                onClick={() => {
                  setSleepTimer(min)
                  setOpen(false)
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--color-radio-surface)] transition-colors"
              >
                {min} 分钟后
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
