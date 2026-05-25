import { useStore } from '../../store'

interface Props {
  onSkip: () => void
  onStop: () => void
  onTogglePause: () => void
}

export default function PlayerControls({ onSkip, onStop, onTogglePause }: Props) {
  const { currentTime, duration, volume, isPlaying, session, setVolume, queue } = useStore()

  const hasPlayableItems = queue.some(
    (item) => item.status !== 'error' && item.status !== 'skipped'
  )
  if (!session || !hasPlayableItems) return null

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  return (
    <div className="w-full space-y-3">
      {/* Progress bar */}
      <div className="space-y-1">
        <div className="h-1 bg-[var(--color-radio-border)] rounded-full overflow-hidden">
          <div
            className="h-full bg-[var(--color-radio-accent)] rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-[var(--color-radio-muted)]">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-4">
        <button
          onClick={onStop}
          className="w-10 h-10 rounded-full border border-[var(--color-radio-border)] flex items-center justify-center hover:border-[var(--color-radio-accent)] transition-colors"
          title="停止"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <rect x="6" y="6" width="12" height="12" rx="1" />
          </svg>
        </button>

        <button
          onClick={onTogglePause}
          className="w-12 h-12 rounded-full bg-[var(--color-radio-accent)] flex items-center justify-center hover:bg-[var(--color-radio-accent-dim)] transition-colors"
          title={isPlaying ? '暂停' : '播放'}
        >
          {isPlaying ? (
            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : (
            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        <button
          onClick={onSkip}
          className="w-10 h-10 rounded-full border border-[var(--color-radio-border)] flex items-center justify-center hover:border-[var(--color-radio-accent)] transition-colors"
          title="下一首"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
          </svg>
        </button>
      </div>

      {/* Volume */}
      <div className="flex items-center justify-center gap-2">
        <svg className="w-3.5 h-3.5 text-[var(--color-radio-muted)]" fill="currentColor" viewBox="0 0 24 24">
          <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
        </svg>
        <input
          type="range"
          min="0"
          max="100"
          value={Math.round(volume * 100)}
          onChange={(e) => setVolume(Number(e.target.value) / 100)}
          className="w-20 h-1 accent-[var(--color-radio-accent)]"
        />
      </div>
    </div>
  )
}
