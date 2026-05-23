import type { QueueItem as QueueItemType } from '../../types'

export default function QueueItem({ item, isCurrent }: { item: QueueItemType; isCurrent: boolean }) {
  const isTTS = item.item_type.startsWith('tts')
  const isError = item.status === 'error'

  return (
    <div
      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
        isCurrent
          ? 'bg-[var(--color-radio-accent)]/10 border border-[var(--color-radio-accent)]/20'
          : isError
            ? 'bg-red-950/20 border border-red-900/20 opacity-60'
            : 'bg-[var(--color-radio-card)]/50'
      }`}
    >
      {/* Icon */}
      <div className="flex-shrink-0">
        {isTTS ? (
          <div className="w-6 h-6 rounded-full bg-[var(--color-radio-gold)]/20 flex items-center justify-center">
            <svg className="w-3 h-3 text-[var(--color-radio-gold)]" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
            </svg>
          </div>
        ) : (
          <div className="w-6 h-6 rounded bg-[var(--color-radio-surface)] flex items-center justify-center overflow-hidden">
            {item.cover_url ? (
              <img src={item.cover_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <svg className="w-3 h-3 text-[var(--color-radio-muted)]" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55C7.79 13 6 14.79 6 17s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
              </svg>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={`truncate text-xs ${isCurrent ? 'text-[var(--color-radio-text)]' : 'text-[var(--color-radio-muted)]'}`}>
          {isTTS ? (
            <span className="italic">DJ {(item.tts_text || item.intro_text || '').slice(0, 40)}...</span>
          ) : (
            <>
              <span className="font-medium">{item.song_name || '未知'}</span>
              <span className="ml-1">- {item.artist || '未知'}</span>
            </>
          )}
        </p>
      </div>

      {/* Status */}
      <div className="flex-shrink-0">
        {isError ? (
          <span className="text-xs text-red-400" title={item.error_message || '无法获取播放链接'}>
            版权受限
          </span>
        ) : item.user_feedback === 'liked' ? (
          <svg className="w-3.5 h-3.5 text-green-400" fill="currentColor" viewBox="0 0 24 24">
            <path d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z" />
          </svg>
        ) : item.user_feedback === 'disliked' ? (
          <svg className="w-3.5 h-3.5 text-red-400" fill="currentColor" viewBox="0 0 24 24">
            <path d="M15 3H6c-.83 0-1.54.5-1.84 1.22l-3.02 7.05c-.09.23-.14.47-.14.73v2c0 1.1.9 2 2 2h6.31l-.95 4.57-.03.32c0 .41.17.79.44 1.06L9.83 23l6.59-6.59c.36-.36.58-.86.58-1.41V5c0-1.1-.9-2-2-2z" />
          </svg>
        ) : isCurrent ? (
          <div className="equalizer">
            <div className="bar" />
            <div className="bar" />
            <div className="bar" />
          </div>
        ) : item.status === 'ready' ? (
          <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
        ) : item.status === 'tts_generating' || item.status === 'pending' ? (
          <div className="w-3 h-3 border border-[var(--color-radio-muted)] border-t-transparent rounded-full animate-spin" />
        ) : (
          <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-radio-border)]" />
        )}
      </div>
    </div>
  )
}
