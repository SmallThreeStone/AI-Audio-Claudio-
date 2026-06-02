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
    <div className={compact ? 'queue-panel-shell' : 'queue-panel-shell queue-panel-shell--mobile'}>
      <div className={`queue-panel-title ${compact ? '' : 'queue-panel-title--mobile'}`}>
        <h3>
          播放队列
        </h3>
        {demoMode && (
          <span className="queue-badge">
            体验模式
          </span>
        )}
        <span>
          {upcoming.length} 项
        </span>
      </div>

      <div className={`queue-scroll ${compact ? 'queue-scroll--desktop' : 'queue-scroll--mobile'}`}>
        {visible.map((item) => (
          <QueueItem key={item.id} item={item} isCurrent={item.position === currentIndex} compact={compact} />
        ))}
      </div>
    </div>
  )
}
