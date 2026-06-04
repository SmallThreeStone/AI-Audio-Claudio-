import type { QueueItem as QueueItemType } from '../../types'

export default function QueueItem({ item, isCurrent, compact }: { item: QueueItemType; isCurrent: boolean; compact?: boolean }) {
  const isTTS = item.item_type.startsWith('tts')
  const isError = item.status === 'error'
  const songReason = item.selection_reason || item.intro_text?.trim()
  const ttsLabel = item.item_type === 'tts_intro' ? '开场报幕' : item.item_type === 'tts_outro' ? '收尾' : '过渡串词'
  const issueLabel = item.recovery_hint || (item.error_message?.includes('howler')
    ? '播放失败，可能是版权或链接过期，已准备重试'
    : item.error_message || '播放链接暂不可用，可能需要绑定网易云或换一首')
  const readyLabel = item.item_type === 'song' && item.availability === 'verified'
    ? '可播'
    : item.item_type === 'song' && item.availability === 'deferred'
      ? '待取链'
      : '就绪'

  return (
    <div
      className={`queue-item ${compact ? 'queue-item--compact' : ''} ${
        isCurrent ? 'queue-item--current' : isError ? 'queue-item--error' : ''
      }`}
    >
      <div className="flex-shrink-0">
        {isTTS ? (
          <div className="queue-item__tts">
            <svg className="w-3 h-3 text-[var(--color-radio-gold)]" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
            </svg>
          </div>
        ) : (
          <div className="queue-item__cover">
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

      <div className="flex-1 min-w-0">
        <p className="queue-item__title">
          {isTTS ? (
            <span className="italic">DJ {ttsLabel}</span>
          ) : (
            <>
              <span className="font-medium">{item.song_name || '未知'}</span>
              <span className="ml-1">- {item.artist || '未知'}</span>
            </>
          )}
        </p>
        {isTTS && (
          <p className="queue-item__subline">{(item.tts_text || item.intro_text || '').slice(0, compact ? 34 : 52)}...</p>
        )}
        {!isTTS && songReason && (
          <p className={isError ? 'queue-item__reason queue-item__reason--error' : 'queue-item__reason'}>
            {isError ? issueLabel : `AI 选歌：${songReason.slice(0, compact ? 38 : 64)}`}
          </p>
        )}
        {!isTTS && item.reason_tags?.length ? (
          <div className="queue-item__tags">
            {item.reason_tags.slice(0, 2).map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex-shrink-0">
        {isError ? (
          <span className="queue-item__status queue-item__status--error" title={issueLabel}>
            待重试
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
          <span className={`queue-item__status ${item.availability === 'deferred' ? 'queue-item__status--pending-url' : ''}`}>
            {readyLabel}
          </span>
        ) : item.status === 'tts_generating' || item.status === 'pending' ? (
          <div className="w-3 h-3 border border-[var(--color-radio-muted)] border-t-transparent rounded-full animate-spin" />
        ) : (
          <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-radio-border)]" />
        )}
      </div>
    </div>
  )
}
