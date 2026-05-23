import { useStore } from '../../store'
import VinylDisc from './VinylDisc'
import NowPlaying from './NowPlaying'
import PlayerControls from './PlayerControls'

const STAGES = [
  { key: 'analyzing', label: 'AI 感受你的心情' },
  { key: 'building', label: '挑选歌曲' },
  { key: 'fetching_urls', label: '准备音乐链接' },
  { key: 'synthesizing', label: '合成 DJ 语音' },
]

export default function RadioPlayer() {
  const { session, isGenerating, currentItem, generationStage, generationMessage } = useStore()

  const currentStageIdx = STAGES.findIndex((s) => s.key === generationStage)

  return (
    <div className="w-full max-w-md flex flex-col items-center gap-4">
      <VinylDisc />

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

      <NowPlaying />
      <PlayerControls />
    </div>
  )
}
