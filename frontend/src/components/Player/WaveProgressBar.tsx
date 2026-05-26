import { useRef, useEffect, useCallback } from 'react'
import { useStore } from '../../store'

interface Props {
  onSeek: (time: number) => void
}

export default function WaveProgressBar({ onSeek }: Props) {
  const { currentTime, duration, lowFreqEnergy, isPlaying } = useStore()
  const phaseRef = useRef(0)
  const rafRef = useRef<number>(0)

  const progress = duration > 0 ? Math.min(currentTime / duration, 1) : 0

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  // Animate wave phase
  useEffect(() => {
    let lastTime = 0
    const loop = (t: number) => {
      if (isPlaying && t - lastTime > 16) {
        phaseRef.current += 0.05
        lastTime = t
      }
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [isPlaying])

  const handleSeek = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (duration <= 0) return
      const rect = e.currentTarget.getBoundingClientRect()
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
      onSeek(ratio * duration)
    },
    [duration, onSeek],
  )

  const amp = isPlaying ? lowFreqEnergy * 4 + 1.5 : 1
  const phase = phaseRef.current

  // Build full-width wave path
  const wavePath = (): string => {
    const W = 1000
    const H = 40
    const midY = H * 0.55
    let d = `M 0 ${H}`
    // Entry from bottom-left
    d += `L 0 ${midY}`
    for (let x = 0; x <= W; x += 4) {
      const y =
        midY +
        Math.sin(x * 0.012 + phase) * amp * 3.5 +
        Math.sin(x * 0.031 + phase * 1.8) * amp * 1.8 +
        Math.sin(x * 0.007 + phase * 0.5) * amp * 2.2
      d += ` L ${x / 10} ${y}`
    }
    d += ` L 100 ${H} Z`
    return d
  }

  const px = progress * 100

  return (
    <div className="w-full space-y-1">
      <div
        className="relative w-full h-10 flex items-center cursor-pointer group"
        onClick={handleSeek}
      >
        <svg
          viewBox="0 0 100 40"
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full"
        >
          <defs>
            <linearGradient id="waveFill" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#e94560" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#f0c060" stopOpacity="0.85" />
            </linearGradient>
            <clipPath id="waveClip">
              <rect x="0" y="0" width={px} height="40" />
            </clipPath>
          </defs>

          {/* Unplayed wave outline — dim */}
          <path
            d={wavePath()}
            fill="rgba(255,255,255,0.04)"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="0.5"
          />

          {/* Played wave fill — vibrant gradient, clipped to progress */}
          <path
            d={wavePath()}
            fill="url(#waveFill)"
            clipPath="url(#waveClip)"
          />

          {/* Played wave top highlight line */}
          <path
            d={(() => {
              const W = 1000
              const midY = 40 * 0.55
              let d2 = ''
              for (let x = 0; x <= W; x += 4) {
                const y =
                  midY +
                  Math.sin(x * 0.012 + phase) * amp * 3.5 +
                  Math.sin(x * 0.031 + phase * 1.8) * amp * 1.8 +
                  Math.sin(x * 0.007 + phase * 0.5) * amp * 2.2
                const cmd = x === 0 ? 'M' : 'L'
                d2 += ` ${cmd} ${x / 10} ${y}`
              }
              return d2
            })()}
            fill="none"
            stroke="rgba(255,255,255,0.25)"
            strokeWidth="0.8"
            clipPath="url(#waveClip)"
          />

          {/* Progress divider glow */}
          <line
            x1={px}
            y1="0"
            x2={px}
            y2="40"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            opacity="0.7"
          />
        </svg>

        {/* Hover highlight */}
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="w-full h-full">
            <path
              d={wavePath()}
              fill="none"
              stroke="rgba(255,255,255,0.12)"
              strokeWidth="1"
            />
          </svg>
        </div>
      </div>

      <div className="flex justify-between text-xs text-[var(--color-radio-muted)]">
        <span>{formatTime(currentTime)}</span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  )
}
