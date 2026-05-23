import { useStore } from '../../store'

export default function VinylDisc() {
  const { isPlaying, currentItem } = useStore()

  const coverUrl = currentItem?.cover_url
  const isIdle = !currentItem

  return (
    <div className={`relative transition-all duration-500 ${isIdle ? 'opacity-40 scale-75' : 'opacity-100'}`}>
      <div className={`vinyl-disc ${isPlaying ? 'playing' : 'paused'}`}>
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
