import { useEffect, useRef } from 'react'
import { useStore } from '../../store'
import { parseLRC, findActiveLyricIndex } from '../../utils/lyrics'
import api from '../../api/client'

export default function LyricPanel() {
  const { currentItem, currentTime, lyrics, activeLyricIndex, setLyrics, setActiveLyricIndex } =
    useStore()
  const listRef = useRef<HTMLDivElement>(null)
  const fetchedSongIdRef = useRef<number | null>(null)

  const isTTS = currentItem?.item_type?.startsWith('tts')
  const songId = currentItem?.song_id

  // Fetch lyrics when song changes
  useEffect(() => {
    if (!songId || isTTS) {
      setLyrics([])
      setActiveLyricIndex(-1)
      return
    }

    if (fetchedSongIdRef.current === songId) return
    fetchedSongIdRef.current = songId

    let cancelled = false

    api.get(`/audio/lyrics/${songId}`)
      .then(({ data }: { data: { lrc: string; tlrc: string } }) => {
        if (cancelled) return
        const lrcText = data.tlrc || data.lrc
        const parsed = parseLRC(lrcText)
        if (parsed.length > 0) {
          setLyrics(parsed)
        } else if (data.lrc) {
          const origParsed = parseLRC(data.lrc)
          setLyrics(origParsed)
        } else {
          setLyrics([])
        }
      })
      .catch(() => {
        if (!cancelled) setLyrics([])
      })

    return () => {
      cancelled = true
    }
  }, [songId, isTTS, setLyrics, setActiveLyricIndex])

  // Sync active line with currentTime
  useEffect(() => {
    if (lyrics.length === 0) {
      setActiveLyricIndex(-1)
      return
    }
    const idx = findActiveLyricIndex(lyrics, currentTime)
    setActiveLyricIndex(idx)
  }, [lyrics, currentTime, setActiveLyricIndex])

  // Auto-scroll to active line
  useEffect(() => {
    if (activeLyricIndex < 0 || !listRef.current) return
    const activeEl = listRef.current.querySelector(`[data-lyric-index="${activeLyricIndex}"]`)
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [activeLyricIndex])

  // Show nothing during TTS
  if (isTTS || !currentItem) return null

  // Loading state
  if (lyrics.length === 0 && currentItem.item_type === 'song' && fetchedSongIdRef.current === songId) {
    return (
      <div className="lyric-panel text-center flex items-center justify-center">
        <div className="space-y-3 w-full">
          <div className="h-3 bg-white/10 rounded animate-pulse mx-auto w-3/4" />
          <div className="h-3 bg-white/10 rounded animate-pulse mx-auto w-1/2" />
          <div className="h-3 bg-white/10 rounded animate-pulse mx-auto w-2/3" />
          <div className="h-3 bg-white/10 rounded animate-pulse mx-auto w-3/4" />
        </div>
      </div>
    )
  }

  // No lyrics available
  if (lyrics.length === 0 && currentItem.item_type === 'song') {
    return (
      <div className="lyric-panel text-center flex flex-col items-center justify-center gap-2">
        <p className="text-base font-semibold text-[var(--color-radio-text)]">
          {currentItem.song_name || '未知歌曲'}
        </p>
        <p className="text-sm text-[var(--color-radio-muted)]">
          {currentItem.artist || '未知艺术家'}
        </p>
        <p className="text-xs text-[var(--color-radio-muted)] opacity-60 italic">
          暂无歌词
        </p>
      </div>
    )
  }

  return (
    <div ref={listRef} className="lyric-panel glass-panel rounded-xl overflow-y-auto scrollbar-hide">
      <div className="lyric-list">
        {/* Top padding for centering first line */}
        <div className="lyric-spacer" />

        {lyrics.map((line, i) => {
          const isActive = i === activeLyricIndex
          const isPast = i < activeLyricIndex
          return (
            <p
              key={i}
              data-lyric-index={i}
              className={`lyric-line ${isActive ? 'lyric-line-active' : isPast ? 'lyric-line-past' : ''}`}
            >
              {line.text}
            </p>
          )
        })}

        {/* Bottom padding for centering last line */}
        <div className="lyric-spacer" />
      </div>
    </div>
  )
}
