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
        <div className="shortcut-modal fade-scale-in">
          <div className="shortcut-modal__head">
            <div>
              <span>快速操作</span>
              <h2>键盘快捷键</h2>
            </div>
            <button
              onClick={() => setShowShortcuts(false)}
              className="shortcut-modal__close"
              aria-label="关闭快捷键说明"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="shortcut-list">
            {SHORTCUTS.map((s) => (
              <div key={s.key} className="shortcut-row">
                <kbd>{s.key}</kbd>
                <span>{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
