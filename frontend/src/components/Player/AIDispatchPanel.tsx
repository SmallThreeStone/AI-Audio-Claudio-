import type { DJSession, QueueItem } from '../../types'
import { useState } from 'react'

const STAGE_LABELS: Record<string, string> = {
  analyzing: '解析意图',
  building: '编排节目',
  preparing: '准备播出',
  synthesizing: '合成串词',
}

function coverageLabel(coverage?: string) {
  if (coverage === 'enough') return '命中充足'
  if (coverage === 'partial') return '需要补齐'
  if (coverage === 'missing') return '曲库缺口'
  return '画像选歌'
}

function confidenceLabel(confidence?: string) {
  if (confidence === 'high') return '高'
  if (confidence === 'low') return '低'
  return '中'
}

export default function AIDispatchPanel({
  session,
  queue,
  currentItem,
  isGenerating,
  generationStage,
  generationMessage,
}: {
  session: DJSession | null
  queue: QueueItem[]
  currentItem: QueueItem | null
  isGenerating: boolean
  generationStage: string
  generationMessage: string
}) {
  const [expanded, setExpanded] = useState(false)
  const intent = session?.ai_intent
  const songCount = queue.filter((item) => item.item_type === 'song').length
  const ttsCount = queue.filter((item) => item.item_type.startsWith('tts')).length
  const readySongs = queue.filter((item) => item.item_type === 'song' && item.status === 'ready').length
  const verifiedSongs = queue.filter((item) => item.item_type === 'song' && item.availability === 'verified').length
  const deferredSongs = queue.filter((item) => item.item_type === 'song' && item.availability === 'deferred').length
  const failedSongs = queue.filter((item) => item.item_type === 'song' && (item.status === 'error' || item.availability === 'failed')).length
  const stage = isGenerating ? STAGE_LABELS[generationStage] || '实时调度' : session ? '播出中' : '待命'
  const strategy = intent?.strategy || (session ? '心情画像优先' : '等待指令')
  const signals = intent?.signals?.length ? intent.signals : ['心情', '曲库', '时间']
  const request = intent?.raw_request || session?.user_request || '说一句想听什么'
  const artists = intent?.detected_artists || []
  const coverage = coverageLabel(intent?.coverage)
  const headline = artists.length
    ? `${artists.join(' / ')} · ${intent?.match_count || 0} 首命中${(intent?.fallback_count || 0) > 0 ? ` · ${intent?.fallback_count} 首补齐` : ''}`
    : strategy
  const playbackCue = failedSongs > 0
    ? `有 ${failedSongs} 首歌播放链接暂不可用，系统会自动重试或跳过。`
    : deferredSongs > 0
      ? `还有 ${deferredSongs} 首歌会在播放前实时取链。`
      : ''
  const cue = isGenerating
    ? generationMessage || 'AI DJ 正在理解你的请求'
    : playbackCue || intent?.message || (currentItem?.song_name ? `正在播放 ${currentItem.song_name}` : '描述心情后，我会从你的歌单里编排节目单')

  return (
    <section className={`ai-dispatch ${expanded ? 'ai-dispatch--expanded' : ''} ai-dispatch--${intent?.coverage || 'none'}`}>
      <button className="ai-dispatch__summary" onClick={() => setExpanded(!expanded)}>
        <div>
          <span>AI 调度台</span>
          <strong>{headline}</strong>
        </div>
        <div className="ai-dispatch__summary-stats">
          <em>{stage}</em>
          <em>{verifiedSongs}/{songCount || 0} 可播</em>
          <em>{confidenceLabel(intent?.confidence)}</em>
        </div>
      </button>

      {expanded && (
        <>
          <div className="ai-dispatch__brief">
            <span>用户指令</span>
            <p>{request}</p>
          </div>

          <div className="ai-dispatch__grid">
            <div>
              <span>理解信号</span>
              <strong>{signals.join(' / ')}</strong>
            </div>
            <div>
              <span>调度策略</span>
              <strong>{strategy}</strong>
            </div>
            <div>
              <span>匹配覆盖</span>
              <strong>{coverage}</strong>
            </div>
            <div>
              <span>节目单</span>
              <strong>{readySongs}/{songCount} 就绪 · {ttsCount} 段 DJ</strong>
            </div>
            <div>
              <span>播放链接</span>
              <strong>{verifiedSongs} 已验证{deferredSongs > 0 ? ` · ${deferredSongs} 待取` : ''}</strong>
            </div>
          </div>

          {artists.length > 0 && (
            <div className="ai-dispatch__artist">
              <span>点名艺人</span>
              <strong>{artists.join(' / ')}</strong>
              <em>{intent?.match_count || 0} 首命中{(intent?.fallback_count || 0) > 0 ? `，${intent?.fallback_count} 首补齐` : ''}</em>
            </div>
          )}
        </>
      )}

      <p className="ai-dispatch__cue">{cue}</p>
    </section>
  )
}
