import type { QueueItem } from '../../types'

function isTts(item?: QueueItem | null) {
  return !!item?.item_type?.startsWith('tts')
}

function ttsLabel(item?: QueueItem | null) {
  if (!item) return '待命'
  if (item.item_type === 'tts_intro') return '开场报幕'
  if (item.item_type === 'tts_outro') return '收尾报幕'
  return '过渡串词'
}

function compactText(text?: string, fallback = '等待下一段内容') {
  const value = text?.trim() || fallback
  return value.length > 42 ? `${value.slice(0, 42)}...` : value
}

export default function BroadcastDirector({
  queue,
  currentItem,
  currentIndex,
  isPlaying,
  isAudioLoading,
}: {
  queue: QueueItem[]
  currentItem: QueueItem | null
  currentIndex: number
  isPlaying: boolean
  isAudioLoading: boolean
}) {
  if (!currentItem && queue.length === 0) return null

  const upcoming = queue.find((item) => item.position > currentIndex && item.status !== 'skipped')
  const currentIsTts = isTts(currentItem)
  const nextIsTts = isTts(upcoming)
  const hasIssue = currentItem?.status === 'error' || currentItem?.availability === 'failed'
  const stageLabel = isAudioLoading
    ? '取链 / 缓冲'
    : hasIssue
      ? '兜底切换'
      : currentIsTts
        ? 'DJ 报幕'
        : isPlaying
          ? '音乐播放'
          : '暂停中'
  const currentTitle = currentIsTts
    ? compactText(currentItem?.tts_text || currentItem?.intro_text, ttsLabel(currentItem))
    : `${currentItem?.song_name || '未知歌曲'}${currentItem?.artist ? ` - ${currentItem.artist}` : ''}`
  const nextTitle = upcoming
    ? nextIsTts
      ? compactText(upcoming.tts_text || upcoming.intro_text, ttsLabel(upcoming))
      : `${upcoming.song_name || '下一首歌'}${upcoming.artist ? ` - ${upcoming.artist}` : ''}`
    : '节目单尾声，等待补充'
  const bridge = hasIssue
    ? '播放链接不可用时会降音量并快速跳过，避免 DJ 和音乐卡住。'
    : currentIsTts && upcoming && !nextIsTts
      ? '报幕后留出短暂停顿，下一首会轻柔淡入。'
      : !currentIsTts && upcoming && nextIsTts
        ? '音乐结束后留一点余温，再进入下一段 DJ 串词。'
        : isAudioLoading
          ? '正在确认音频可播性，成功后自动接入当前节目。'
          : 'AI 会按节目单继续推进，并在必要时补歌或跳过不可播内容。'
  const reason = !currentIsTts && currentItem?.intro_text
    ? currentItem.intro_text
    : !nextIsTts && upcoming?.intro_text
      ? upcoming.intro_text
      : ''

  return (
    <section className={`broadcast-director ${hasIssue ? 'broadcast-director--issue' : ''}`}>
      <div className="broadcast-director__rail" aria-hidden="true">
        <span className="is-on" />
        <i />
        <span className={upcoming ? 'is-next' : ''} />
      </div>
      <div className="broadcast-director__main">
        <div className="broadcast-director__head">
          <span>播出导演</span>
          <strong>{stageLabel}</strong>
        </div>
        <p>{bridge}</p>
        <div className="broadcast-director__cards">
          <div>
            <span>当前段落</span>
            <strong>{currentTitle}</strong>
          </div>
          <div>
            <span>下一段</span>
            <strong>{nextTitle}</strong>
          </div>
        </div>
        {reason && (
          <p className="broadcast-director__reason">AI 选歌理由：{compactText(reason, '')}</p>
        )}
      </div>
    </section>
  )
}
