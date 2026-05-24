import { useStore } from '../../store'

export default function UpNext({ onSkipTo }: { onSkipTo: (queueItemId: number) => void }) {
  const { queue, currentIndex, isGenerating } = useStore()

  const upcoming = queue.filter(
    (item) =>
      item.position > currentIndex &&
      item.item_type === 'song' &&
      item.status !== 'error' &&
      item.status !== 'skipped',
  )

  if (isGenerating || upcoming.length === 0) return null

  return (
    <div className="w-full max-w-md">
      <p className="text-[10px] font-semibold text-[var(--color-radio-muted)] uppercase tracking-wider mb-2">
        Up Next
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 sm:gap-2">
        {upcoming.slice(0, 3).map((item) => (
          <button
            key={item.id}
            onClick={() => onSkipTo(item.id)}
            className="flex items-center gap-2 px-2 py-2 sm:py-1.5 rounded-lg bg-[var(--color-radio-card)]/60 hover:bg-[var(--color-radio-card)] transition-colors text-left group min-w-0"
          >
            <div className="w-8 h-8 rounded overflow-hidden flex-shrink-0 bg-[var(--color-radio-surface)]">
              {item.cover_url ? (
                <img src={item.cover_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <svg className="w-4 h-4 m-2 text-[var(--color-radio-muted)]" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55C7.79 13 6 14.79 6 17s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                </svg>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium text-[var(--color-radio-text)] truncate group-hover:text-[var(--color-radio-accent)] transition-colors">
                {item.song_name || '未知'}
              </p>
              <p className="text-[10px] text-[var(--color-radio-muted)] truncate">
                {item.artist || '未知'}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
