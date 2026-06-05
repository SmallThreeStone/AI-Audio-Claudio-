import { useStore } from '../../store'
import VinylDisc from './VinylDisc'
import AudioWaveform from './AudioWaveform'
import PlayerControls from './PlayerControls'
import LyricPanel from './LyricPanel'

interface Props {
  open: boolean
  onClose: () => void
  onSkip: () => void
  onPrevious: () => void
  onStop: () => void
  onTogglePause: () => void
  onSeek: (time: number) => void
}

export default function ImmersivePlayer({
  open,
  onClose,
  onSkip,
  onPrevious,
  onStop,
  onTogglePause,
  onSeek,
}: Props) {
  const { currentItem, session } = useStore()

  if (!open) return null

  const coverUrl = currentItem?.cover_url
  const title = currentItem?.song_name || session?.session_theme || 'AI DJ 播放中'
  const subtitle = currentItem?.artist || session?.persona || 'iRadio AI Music Radio'

  return (
    <div className="immersive-player" role="dialog" aria-modal="true" aria-label="沉浸播放">
      <div className="immersive-player__ambient" />
      <button className="immersive-player__close" onClick={onClose}>返回工作台</button>

      <section className="immersive-player__deck">
        <div className="immersive-player__art" onClick={onClose} title="返回工作台">
          <div className="orbit-ring orbit-ring--outer" />
          <div className="orbit-ring orbit-ring--inner" />
          <div className="radio-artwork-card">
            {coverUrl ? (
              <img src={coverUrl} alt="" className="radio-artwork-image" />
            ) : (
              <div className="radio-artwork-fallback"><span>iRadio</span></div>
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

        <div className="immersive-player__meta">
          <span>{session?.session_theme || '当前播放'}</span>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>

        <PlayerControls
          onSkip={onSkip}
          onPrevious={onPrevious}
          onStop={onStop}
          onTogglePause={onTogglePause}
          onSeek={onSeek}
        />
      </section>

      <section className="immersive-player__lyrics">
        <div className="immersive-player__lyrics-head">
          <span>Lyrics</span>
          <strong>正在跟随播放滚动</strong>
        </div>
        <LyricPanel mode="full" />
      </section>
    </div>
  )
}
