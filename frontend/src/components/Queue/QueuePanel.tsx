import { useStore } from '../../store'
import QueueItem from './QueueItem'

export default function QueuePanel() {
  const { queue, session, currentIndex } = useStore()

  const validItems = queue.filter(
    (item) => item.status !== 'error' && item.status !== 'skipped'
  )
  if (!session || validItems.length === 0) return null

  const upcoming = validItems.filter((item) => item.position >= currentIndex)

  return (
    <div className="w-full max-w-md px-1 sm:px-0">
      <div className="flex items-center gap-2 mb-2 sm:mb-3">
        <h3 className="text-[10px] sm:text-xs font-semibold text-[var(--color-radio-muted)] uppercase tracking-wider">
          播放队列
        </h3>
        <span className="text-[10px] sm:text-xs text-[var(--color-radio-muted)]">
          {upcoming.length} 项
        </span>
      </div>

      <div className="space-y-1 max-h-48 sm:max-h-64 overflow-y-auto">
        {upcoming.slice(0, 10).map((item) => (
          <QueueItem key={item.id} item={item} isCurrent={item.position === currentIndex} />
        ))}
      </div>
    </div>
  )
}
