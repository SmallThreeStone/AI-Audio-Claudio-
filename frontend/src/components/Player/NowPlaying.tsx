import { useStore } from '../../store'
import FeedbackButtons from './FeedbackButtons'

export default function NowPlaying() {
  const { currentItem, isPlaying, isAudioLoading, isRestoring } = useStore()

  if (isRestoring) {
    return (
      <div className="text-center py-2">
        <div className="w-6 h-6 border-2 border-[var(--color-radio-accent)] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
        <p className="text-[var(--color-radio-muted)] text-sm">正在恢复电台...</p>
      </div>
    )
  }

  if (!currentItem || currentItem.status === 'error' || currentItem.status === 'skipped') {
    return (
      <div className="text-center py-2">
        <p className="text-[var(--color-radio-text)] text-base font-medium mb-1">
          Claude FM 私人 AI 电台
        </p>
        <p className="text-[var(--color-radio-muted)] text-sm leading-relaxed">
          在下方用自然语言描述你的心情或场景
        </p>
        <p className="text-[var(--color-radio-muted)] text-xs mt-1 opacity-60">
          AI DJ 会从你的歌单中选歌，并生成 DJ 串词为你播报
        </p>
      </div>
    )
  }

  const isTTS = currentItem.item_type.startsWith('tts')
  const displayText = currentItem.tts_text || currentItem.intro_text

  return (
    <div className="text-center space-y-1 min-h-[80px] flex flex-col justify-center glass-panel rounded-xl px-3 py-2">
      {isTTS ? (
        <div className="dj-text-enter">
          <div className="flex items-center justify-center gap-2 mb-1">
            <span className="text-xs text-[var(--color-radio-gold)] bg-[var(--color-radio-gold)]/10 px-2 py-0.5 rounded-full">
              DJ
            </span>
          </div>
          <p className="text-sm text-[var(--color-radio-text)] leading-relaxed italic max-w-sm">
            {displayText || '...'}
          </p>
        </div>
      ) : (
        <div className="dj-text-enter">
          <p className="text-xs text-[var(--color-radio-muted)]">
            {isAudioLoading ? (
              <span className="animate-pulse">正在加载音频...</span>
            ) : isPlaying ? 'Now Playing' : 'Up Next'}
          </p>
          <p className="text-base font-semibold truncate">
            {currentItem.song_name || '未知歌曲'}
          </p>
          <p className="text-sm text-[var(--color-radio-muted)]">
            {currentItem.artist || '未知艺术家'}
          </p>
          <FeedbackButtons />
        </div>
      )}
    </div>
  )
}
