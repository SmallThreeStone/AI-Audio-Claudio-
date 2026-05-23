import { useStore } from '../../store'

export default function ScriptTranscript() {
  const { queue, session, showTranscript, setShowTranscript } = useStore()

  if (!showTranscript || !session) return null

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60" onClick={() => setShowTranscript(false)} />
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-full sm:max-w-md bg-[var(--color-radio-surface)] border-l border-[var(--color-radio-border)] shadow-2xl flex flex-col slide-in-right">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-radio-border)]">
          <div>
            <h2 className="text-sm font-semibold">DJ 脚本回看</h2>
            <p className="text-xs text-[var(--color-radio-muted)]">{session.session_theme}</p>
          </div>
          <button
            onClick={() => setShowTranscript(false)}
            className="p-1 hover:bg-[var(--color-radio-card)] rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {queue.map((item, idx) => (
            <div
              key={item.id}
              className={`flex gap-3 ${
                item.status === 'error' ? 'opacity-40' : ''
              }`}
            >
              <div className="flex flex-col items-center gap-1 pt-0.5">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                    item.item_type.startsWith('tts')
                      ? 'bg-[var(--color-radio-gold)]/20 text-[var(--color-radio-gold)]'
                      : 'bg-[var(--color-radio-accent)]/20 text-[var(--color-radio-accent)]'
                  }`}
                >
                  {idx + 1}
                </div>
                {idx < queue.length - 1 && (
                  <div className="w-0.5 flex-1 bg-[var(--color-radio-border)]" />
                )}
              </div>

              <div className="pb-4 flex-1 min-w-0">
                {item.item_type.startsWith('tts') ? (
                  <div>
                    <span className="text-xs text-[var(--color-radio-gold)] font-medium">DJ 播报</span>
                    <p className="text-sm text-[var(--color-radio-text)] mt-1 leading-relaxed italic">
                      {item.tts_text || item.intro_text}
                    </p>
                  </div>
                ) : (
                  <div>
                    <span className="text-xs text-[var(--color-radio-accent)] font-medium">歌曲</span>
                    <p className="text-sm font-medium mt-0.5">{item.song_name || '未知歌曲'}</p>
                    <p className="text-xs text-[var(--color-radio-muted)]">{item.artist || '未知艺术家'}</p>
                    {item.intro_text && (
                      <p className="text-xs text-[var(--color-radio-muted)] mt-1 italic">
                        DJ: {item.intro_text}
                      </p>
                    )}
                    {item.status === 'error' && (
                      <p className="text-xs text-red-400 mt-1">{item.error_message || '无法播放'}</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
