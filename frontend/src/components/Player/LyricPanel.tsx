import { useEffect, useRef, useState } from 'react'
import { useStore } from '../../store'
import { parseLRC, findActiveLyricIndex } from '../../utils/lyrics'
import api from '../../api/client'

interface Props {
  mode?: 'compact' | 'full'
}

export default function LyricPanel({ mode = 'compact' }: Props) {
  const { currentItem, currentTime, lyrics, activeLyricIndex, setLyrics, setActiveLyricIndex } =
    useStore()
  const listRef = useRef<HTMLDivElement>(null)
  const fetchedSongIdRef = useRef<number | null>(null)
  const [lyricLoading, setLyricLoading] = useState(false)
  const immersive = mode === 'full'

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
    setLyricLoading(true)

    let cancelled = false

    api.get(`/audio/lyrics/${songId}`)
      .then(({ data }: { data: { lrc: string; tlrc: string } }) => {
        if (cancelled) return
        fetchedSongIdRef.current = songId
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
        setLyricLoading(false)
      })
      .catch(() => {
        if (!cancelled) {
          fetchedSongIdRef.current = songId
          setLyrics([])
          setLyricLoading(false)
        }
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

  // Auto-scroll to active line (within the panel — never leaks to page)
  useEffect(() => {
    if (activeLyricIndex < 0 || !listRef.current) return
    const activeEl = listRef.current.querySelector(
      `[data-lyric-index="${activeLyricIndex}"]`
    ) as HTMLElement | null
    if (activeEl) {
      const container = listRef.current
      const target = activeEl.offsetTop - container.clientHeight / 2 + activeEl.offsetHeight / 2
      container.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })
    }
  }, [activeLyricIndex])

  // Show nothing during TTS
  if (isTTS || !currentItem) return null

  // Loading state
  if (lyricLoading) {
    return (
      <div className="lyric-panel lyric-panel--loading">
        <div>
          <span />
          <p>歌词加载中</p>
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

  const compactLines = lyrics
    .map((line, index) => ({ line, index }))
    .filter(({ index }) => activeLyricIndex < 0 || Math.abs(index - activeLyricIndex) <= 1)
  const visibleLines = immersive ? lyrics.map((line, index) => ({ line, index })) : compactLines

  return (
    <div className={`lyric-panel glass-panel rounded-xl ${immersive ? 'lyric-panel--immersive overflow-y-auto scrollbar-hide' : 'lyric-panel--compact'}`} ref={listRef}>
      {mode === 'compact' && <div className="lyric-panel__mode">歌词预览</div>}
      <div className="lyric-list">
        {/* Top padding for centering first line */}
        {immersive && <div className="lyric-spacer" />}

        {visibleLines.map(({ line, index }) => {
          const isActive = index === activeLyricIndex
          const isPast = index < activeLyricIndex
          return (
            <p
              key={index}
              data-lyric-index={index}
              className={`lyric-line ${isActive ? 'lyric-line-active' : isPast ? 'lyric-line-past' : ''}`}
            >
              {line.text}
            </p>
          )
        })}

        {/* Bottom padding for centering last line */}
        {immersive && <div className="lyric-spacer" />}
      </div>
    </div>
  )
}
