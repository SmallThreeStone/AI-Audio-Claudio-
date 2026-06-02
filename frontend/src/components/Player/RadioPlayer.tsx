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
import ShareCard from './ShareCard'
import AIDispatchPanel from './AIDispatchPanel'
import { useEffect } from 'react'

const STAGES = [
  { key: 'analyzing', label: '分析心情' },
  { key: 'building', label: '精选歌曲' },
  { key: 'preparing', label: '加载 & 合成' },
]

export default function RadioPlayer() {
  const { session, queue, isGenerating, currentItem, generationStage, generationMessage, notice, setNotice } = useStore()
  const { skip, skipTo, stop, togglePause, seek, previous } = useRadioPlayer()

  // Auto-clear notice after 8 seconds
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 8000)
    return () => clearTimeout(timer)
  }, [notice, setNotice])

  const currentStageIdx = STAGES.findIndex((s) => s.key === generationStage)
  const activeStageIdx = currentStageIdx >= 0 ? currentStageIdx : 0

  const coverUrl = currentItem?.cover_url
  const isIdle = !session && !currentItem && !isGenerating
  const title = currentItem?.song_name || session?.session_theme || '等待你的心情信号'
  const subtitle = currentItem?.artist || session?.persona || '描述一句话，AI DJ 会为你开播'

  return (
    <div className="radio-player-stage">
      <AmbientBackground />

      <div className="radio-artwork-zone">
        <div className="orbit-ring orbit-ring--outer" />
        <div className="orbit-ring orbit-ring--inner" />
        <div className="radio-artwork-card">
          {coverUrl ? (
            <img src={coverUrl} alt="" className="radio-artwork-image" />
          ) : (
            <div className="radio-artwork-fallback">
              <span>iRadio</span>
            </div>
          )}
          <div className="radio-artwork-bars">
            {Array.from({ length: 13 }).map((_, i) => <span key={i} />)}
          </div>
        </div>
        <div className="relative vinyl-stage">
          <VinylDisc />
          <AudioWaveform />
        </div>
      </div>

      {isGenerating && (
        <div className="radio-generation-panel">
          <p>
            {generationMessage || '深空探测扫描中...'}
          </p>
          <div className="radio-generation-dots">
            {STAGES.map((s, i) => (
              <div key={s.key}>
                <div
                  className={`radio-generation-dot ${
                    i < activeStageIdx
                      ? 'is-done'
                      : i === activeStageIdx
                        ? 'is-active'
                        : ''
                  }`}
                />
                {i < STAGES.length - 1 && (
                  <div
                    className={`radio-generation-line ${
                      i < activeStageIdx ? 'is-done' : ''
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="radio-generation-labels">
            {STAGES.map((s, i) => (
              <span
                key={s.key}
                className={
                  i <= activeStageIdx ? 'is-lit' : ''
                }
              >
                {s.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {session?.session_theme && (
        <div className="flex items-center gap-3">
          <span className="text-xs text-[var(--color-radio-gold)] font-medium tracking-wider uppercase">
            {session.session_theme}
          </span>
          <button
            onClick={stop}
            title="切换频道"
            className="text-[10px] text-[var(--color-radio-muted)] hover:text-[var(--color-radio-gold)] border border-[var(--color-radio-border)]/30 hover:border-[var(--color-radio-gold)]/40 rounded-full px-2 py-0.5 transition-colors"
          >
            切换频道 ↻
          </button>
        </div>
      )}

      {session?.weather_summary && (
        <div className="text-[11px] text-[var(--color-radio-muted)] bg-white/5 rounded-full px-3 py-0.5 backdrop-blur-sm">
          {session.weather_summary}
        </div>
      )}

      {(session || isGenerating) && (
        <AIDispatchPanel
          session={session}
          queue={queue}
          currentItem={currentItem}
          isGenerating={isGenerating}
          generationStage={generationStage}
          generationMessage={generationMessage}
        />
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

      <div className="radio-title-block">
        <p className="radio-title-kicker">{isGenerating ? generationMessage || '正在调频' : session?.session_theme || 'iRadio 待机频道'}</p>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>

      {isIdle && (
        <div className="radio-standby-card">
          <div>
            <span>当前状态</span>
            <strong>待机</strong>
          </div>
          <div>
            <span>推荐操作</span>
            <strong>从左侧输入心情开始</strong>
          </div>
        </div>
      )}

      <PlayerControls onSkip={skip} onPrevious={previous} onStop={stop} onTogglePause={togglePause} onSeek={seek} />

      <LyricPanel />
      <div className="desktop-player-secondary">
        <NowPlaying />
        <UpNext onSkipTo={skipTo} />
      </div>

      {/* Tools row */}
      <div className="player-toolbelt">
        <PlayHistory />
        <ShareCard />
        <SpeakerSelector />
        <SleepTimer />
      </div>
    </div>
  )
}
