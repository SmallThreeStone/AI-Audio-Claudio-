import { useStore } from '../../store'
import { useRef } from 'react'
import WaveProgressBar from './WaveProgressBar'

interface Props {
  onSkip: () => void
  onPrevious: () => void
  onStop: () => void
  onTogglePause: () => void
  onSeek: (time: number) => void
}

export default function PlayerControls({ onSkip, onPrevious, onStop, onTogglePause, onSeek }: Props) {
  const { volume, isPlaying, isAudioLoading, session, setVolume, queue, playHistory } = useStore()
  const prevVolumeRef = useRef(volume)

  const hasPlayableItems = queue.some(
    (item) => item.status !== 'error' && item.status !== 'skipped'
  )
  if (!session || !hasPlayableItems) return null

  return (
    <div className="w-full space-y-3">
      {/* Wave progress bar */}
      <WaveProgressBar onSeek={onSeek} />

      {/* Controls */}
      <div className="flex items-center justify-center gap-3 sm:gap-4">
        <button
          onClick={onStop}
          className="w-9 h-9 sm:w-10 sm:h-10 rounded-full border border-[var(--color-radio-border)] flex items-center justify-center hover:border-[var(--color-radio-accent)] transition-colors"
          title="停止"
        >
          <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="currentColor" viewBox="0 0 24 24">
            <rect x="6" y="6" width="12" height="12" rx="1" />
          </svg>
        </button>

        <button
          onClick={onPrevious}
          disabled={playHistory.length === 0}
          className="w-9 h-9 sm:w-10 sm:h-10 rounded-full border border-[var(--color-radio-border)] flex items-center justify-center hover:border-[var(--color-radio-accent)] transition-colors disabled:opacity-30"
          title="上一首"
        >
          <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
          </svg>
        </button>

        <button
          onClick={onTogglePause}
          disabled={isAudioLoading}
          className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-[var(--color-radio-accent)] flex items-center justify-center hover:bg-[var(--color-radio-accent-dim)] transition-colors disabled:opacity-70"
          title={isAudioLoading ? '正在加载...' : isPlaying ? '暂停' : '播放'}
        >
          {isAudioLoading ? (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : isPlaying ? (
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
          className="w-9 h-9 sm:w-10 sm:h-10 rounded-full border border-[var(--color-radio-border)] flex items-center justify-center hover:border-[var(--color-radio-accent)] transition-colors"
          title="下一首"
        >
          <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
          </svg>
        </button>
      </div>

      {/* Volume */}
      <div className="flex items-center justify-center gap-2">
        <button
          onClick={() => {
            if (volume > 0) {
              prevVolumeRef.current = volume
              setVolume(0)
            } else {
              setVolume(prevVolumeRef.current || 0.5)
            }
          }}
          className="text-[var(--color-radio-muted)] hover:text-[var(--color-radio-text)] transition-colors"
          title={volume === 0 ? '取消静音' : '静音'}
        >
          {volume === 0 ? (
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
            </svg>
          )}
        </button>
        <input
          type="range"
          min="0"
          max="100"
          value={Math.round(volume * 100)}
          onChange={(e) => {
            const v = Number(e.target.value) / 100
            setVolume(v)
            if (v > 0) prevVolumeRef.current = v
          }}
          className="w-20 h-1 accent-[var(--color-radio-accent)]"
        />
        <span className="text-[10px] text-[var(--color-radio-muted)] w-8 text-right tabular-nums">
          {Math.round(volume * 100)}%
        </span>
      </div>
    </div>
  )
}
