import { useStore } from '../../store'

const SHORTCUTS = [
  { key: 'Space', label: '播放 / 暂停' },
  { key: '→', label: '下一首' },
  { key: 'Esc', label: '停止播放' },
  { key: 'T', label: '打开 DJ 脚本' },
  { key: '?', label: '显示此帮助' },
  { key: 'S', label: '定时关闭' },
]

export default function ShortcutHelp() {
  const { showShortcuts, setShowShortcuts } = useStore()

  if (!showShortcuts) return null

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/60" onClick={() => setShowShortcuts(false)} />
      <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
        <div className="bg-[var(--color-radio-card)] border border-[var(--color-radio-border)] rounded-2xl p-6 w-80 max-w-full shadow-2xl fade-scale-in">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold">键盘快捷键</h2>
            <button
              onClick={() => setShowShortcuts(false)}
              className="p-1 hover:bg-[var(--color-radio-surface)] rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="space-y-2">
            {SHORTCUTS.map((s) => (
              <div key={s.key} className="flex items-center justify-between text-sm">
                <kbd className="px-2 py-1 text-xs rounded bg-[var(--color-radio-surface)] border border-[var(--color-radio-border)] min-w-[40px] text-center">
                  {s.key}
                </kbd>
                <span className="text-[var(--color-radio-muted)]">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
