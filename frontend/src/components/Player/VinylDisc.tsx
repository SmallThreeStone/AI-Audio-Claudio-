import { useStore } from '../../store'
import { useEffect, useRef } from 'react'

export default function VinylDisc() {
  const { isPlaying, isAudioLoading, currentItem } = useStore()

  const coverUrl = currentItem?.cover_url
  const isIdle = !currentItem
  const containerRef = useRef<HTMLDivElement>(null)
  const prevItemIdRef = useRef<number | null>(null)

  // Song transition: scale bounce on song change
  useEffect(() => {
    const itemId = currentItem?.id ?? null
    if (itemId && prevItemIdRef.current !== null && itemId !== prevItemIdRef.current) {
      const el = containerRef.current
      if (el) {
        el.style.transition = 'transform 0.15s ease-in'
        el.style.transform = 'scale(0.9)'
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            el.style.transition = 'transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1)'
            el.style.transform = ''
          })
        })
      }
    }
    prevItemIdRef.current = itemId
  }, [currentItem?.id])

  return (
    <div
      ref={containerRef}
      className={`relative transition-all duration-500 vinyl-container ${isIdle ? 'opacity-40 scale-75' : 'opacity-100'}`}
    >
      <div className={`vinyl-disc ${isAudioLoading ? 'animate-pulse' : isPlaying ? 'playing' : 'paused'}`}>
        {coverUrl ? (
          <img
            src={coverUrl}
            alt=""
            className="absolute inset-0 w-full h-full rounded-full object-cover opacity-80"
            style={{ maskImage: 'radial-gradient(circle at center, transparent 28%, black 30%)', WebkitMaskImage: 'radial-gradient(circle at center, transparent 28%, black 30%)' }}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[var(--color-radio-muted)] text-2xl font-bold">C</span>
          </div>
        )}
      </div>

      {/* Tonearm — only show when playing or has item */}
      {currentItem && (
        <div className={`tonearm-container ${isPlaying ? 'active' : ''}`}>
          <svg viewBox="0 0 40 120" className="w-full h-full">
            <rect x="16" y="0" width="4" height="70" rx="2" fill="#888" />
            <rect x="14" y="65" width="8" height="20" rx="2" fill="#aaa" />
            <circle cx="18" cy="88" r="4" fill="#ccc" />
            <rect x="0" y="85" width="40" height="4" rx="2" fill="#999" />
          </svg>
        </div>
      )}
    </div>
  )
}
