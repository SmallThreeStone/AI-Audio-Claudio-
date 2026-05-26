import { useStore } from '../../store'
import { useRadioPlayer } from '../../hooks/useRadioPlayer'
import VinylDisc from './VinylDisc'
import AudioWaveform from './AudioWaveform'
import LyricPanel from './LyricPanel'
import AmbientBackground from './AmbientBackground'
import NowPlaying from './NowPlaying'
import PlayerControls from './PlayerControls'
import SleepTimer from './SleepTimer'
import SpeakerSelector from './SpeakerSelector'
import UpNext from './UpNext'
import PlayHistory from './PlayHistory'
import { useEffect } from 'react'

const STAGES = [
  { key: 'analyzing', label: '分析心情' },
  { key: 'building', label: '精选歌曲' },
  { key: 'preparing', label: '加载 & 合成' },
]

export default function RadioPlayer() {
  const { session, isGenerating, currentItem, generationStage, generationMessage, notice, setNotice } = useStore()
  const { skip, skipTo, stop, togglePause, seek, previous } = useRadioPlayer()

  // Auto-clear notice after 8 seconds
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 8000)
    return () => clearTimeout(timer)
  }, [notice, setNotice])

  const currentStageIdx = STAGES.findIndex((s) => s.key === generationStage)

  return (
    <div className="w-full max-w-xl flex flex-col items-center gap-4">
      <AmbientBackground />
      <div className="relative vinyl-stage">
        <VinylDisc />
        <AudioWaveform />
      </div>

      {isGenerating && (
        <div className="w-full space-y-2">
          <p className="text-center text-xs text-[var(--color-radio-muted)]">
            {generationMessage || 'AI DJ 正在为你准备...'}
          </p>
          <div className="flex items-center gap-1 justify-center">
            {STAGES.map((s, i) => (
              <div key={s.key} className="flex items-center gap-1">
                <div
                  className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                    i < currentStageIdx
                      ? 'bg-green-400 scale-75'
                      : i === currentStageIdx
                        ? 'bg-[var(--color-radio-accent)] animate-pulse'
                        : 'bg-[var(--color-radio-border)]'
                  }`}
                />
                {i < STAGES.length - 1 && (
                  <div
                    className={`w-6 h-0.5 rounded transition-colors duration-300 ${
                      i < currentStageIdx ? 'bg-green-400' : 'bg-[var(--color-radio-border)]'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-[var(--color-radio-muted)]">
            {STAGES.map((s, i) => (
              <span
                key={s.key}
                className={
                  i <= currentStageIdx ? 'text-[var(--color-radio-text)]' : ''
                }
              >
                {s.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {session?.session_theme && (
        <div className="text-xs text-[var(--color-radio-gold)] font-medium tracking-wider uppercase">
          {session.session_theme}
        </div>
      )}

      {session?.weather_summary && (
        <div className="text-[11px] text-[var(--color-radio-muted)] bg-white/5 rounded-full px-3 py-0.5 backdrop-blur-sm">
          {session.weather_summary}
        </div>
      )}

      {notice && (
        <div className="flex items-center gap-2 text-xs text-[var(--color-radio-gold)] bg-[var(--color-radio-gold)]/10 rounded-full pl-3 pr-1.5 py-1">
          <span>{notice}</span>
          <button
            onClick={() => setNotice(null)}
            className="w-4 h-4 rounded-full bg-[var(--color-radio-gold)]/20 flex items-center justify-center hover:bg-[var(--color-radio-gold)]/40 transition-colors"
          >
            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      <NowPlaying />
      <LyricPanel />
      <UpNext onSkipTo={skipTo} />
      <PlayerControls onSkip={skip} onPrevious={previous} onStop={stop} onTogglePause={togglePause} onSeek={seek} />

      {/* Tools row */}
      <div className="w-full border-t border-[var(--color-radio-border)]/50 pt-2 flex flex-wrap items-center gap-x-6 gap-y-2">
        <PlayHistory />
        <SpeakerSelector />
        <SleepTimer />
      </div>
    </div>
  )
}
