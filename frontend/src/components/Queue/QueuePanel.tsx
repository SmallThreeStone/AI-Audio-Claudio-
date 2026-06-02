import { useStore } from '../../store'
import QueueItem from './QueueItem'

export default function QueuePanel({ compact }: { compact?: boolean }) {
  const { queue, session, currentIndex, demoMode, isGenerating, generationStage, generationMessage } = useStore()

  if (!session || queue.length === 0) {
    const emptySteps = [
      { key: 'analyzing', label: '读取心情' },
      { key: 'building', label: '匹配歌单' },
      { key: 'preparing', label: '准备开播' },
    ]
    const activeStep = emptySteps.findIndex((step) => step.key === generationStage)

    return (
      <div className={compact ? 'queue-panel-shell queue-panel-shell--empty' : 'queue-panel-shell queue-panel-shell--mobile'}>
        <div className={`queue-empty-state ${isGenerating ? 'queue-empty-state--generating' : ''}`}>
          <span className="queue-empty-state__kicker">{isGenerating ? '生成中' : '待开播'}</span>
          <h3>{isGenerating ? 'AI DJ 正在搭建频道' : '等待你的心情信号'}</h3>
          <p>{isGenerating ? generationMessage || '正在分析你的描述、筛选歌曲，并生成 DJ 串词。' : '在左侧输入一句话，AI DJ 会生成串词、匹配歌曲，并把播放队列显示在这里。'}</p>
          <div className="queue-empty-steps">
            {emptySteps.map((step, index) => (
              <span
                key={step.key}
                className={isGenerating && (index <= activeStep || activeStep < 0 && index === 0) ? 'active' : ''}
              >
                {step.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    )
  }

  const upcoming = queue.filter((item) => item.position >= currentIndex)
  const visible = compact ? upcoming : upcoming.slice(0, 10)
  const songCount = upcoming.filter((item) => item.item_type === 'song').length
  const ttsCount = upcoming.filter((item) => item.item_type.startsWith('tts')).length
  const verifiedCount = upcoming.filter((item) => item.item_type === 'song' && item.availability === 'verified').length
  const issueCount = upcoming.filter((item) => item.status === 'error' || item.status === 'skipped').length

  return (
    <div className={compact ? 'queue-panel-shell' : 'queue-panel-shell queue-panel-shell--mobile'}>
      <div className={`queue-panel-title ${compact ? '' : 'queue-panel-title--mobile'}`}>
        <h3>AI 节目单</h3>
        {demoMode && (
          <span className="queue-badge">
            体验模式
          </span>
        )}
        <span>
          {songCount} 首歌 · {verifiedCount} 已验证 · {ttsCount} 段 DJ{issueCount > 0 ? ` · ${issueCount} 个待处理` : ''}
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
