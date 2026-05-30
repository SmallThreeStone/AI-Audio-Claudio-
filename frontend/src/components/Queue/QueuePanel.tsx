import { useStore } from '../../store'
import QueueItem from './QueueItem'

export default function QueuePanel({ compact }: { compact?: boolean }) {
  const { queue, session, currentIndex, demoMode } = useStore()

  const validItems = queue.filter(
    (item) => item.status !== 'error' && item.status !== 'skipped'
  )
  if (!session || validItems.length === 0) return null

  const upcoming = validItems.filter((item) => item.position >= currentIndex)
  const visible = compact ? upcoming.slice(0, 5) : upcoming.slice(0, 10)

  return (
    <div className={compact ? 'w-full' : 'w-full max-w-md px-1 sm:px-0'}>
      <div className={`flex items-center gap-2 ${compact ? 'mb-2' : 'mb-2 sm:mb-3'}`}>
        <h3 className={`font-semibold text-[var(--color-radio-muted)] uppercase tracking-wider ${compact ? 'text-[11px]' : 'text-[10px] sm:text-xs'}`}>
          播放队列
        </h3>
        {demoMode && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--color-radio-accent)]/20 text-[var(--color-radio-accent)]">
            体验模式
          </span>
        )}
        <span className={`text-[var(--color-radio-muted)] ${compact ? 'text-[11px]' : 'text-[10px] sm:text-xs'}`}>
          {upcoming.length} 项
        </span>
      </div>

      <div className={`overflow-y-auto ${compact ? 'space-y-1 max-h-[50vh]' : 'space-y-1 max-h-48 sm:max-h-64'}`}>
        {visible.map((item) => (
          <QueueItem key={item.id} item={item} isCurrent={item.position === currentIndex} compact={compact} />
        ))}
      </div>
    </div>
  )
}
