import type { LyricLine } from '../types'

/**
 * Parse LRC-format lyrics into an array of timed lines.
 * Handles common variations: [mm:ss.xx], [mm:ss.xxx], [mm:ss]
 */
export function parseLRC(lrcText: string): LyricLine[] {
  if (!lrcText || !lrcText.trim()) return []

  const lines: LyricLine[] = []
  const timeRegex = /\[(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?\]/g

  for (const raw of lrcText.split('\n')) {
    const trimmed = raw.trim()
    if (!trimmed) continue

    // Extract all timestamps on this line (some LRC files repeat timestamps)
    const times: number[] = []
    let match: RegExpExecArray | null
    timeRegex.lastIndex = 0

    while ((match = timeRegex.exec(trimmed)) !== null) {
      const mins = parseInt(match[1], 10)
      const secs = parseInt(match[2], 10)
      const ms = match[3] ? parseInt(match[3].padEnd(3, '0'), 10) : 0
      times.push(mins * 60 + secs + ms / 1000)
    }

    if (times.length === 0) continue

    // Get the text after the last timestamp bracket
    const text = trimmed.replace(timeRegex, '').trim()
    if (!text) continue // skip pure-timestamp lines (metadata)

    for (const time of times) {
      lines.push({ time, text })
    }
  }

  // Sort by time
  lines.sort((a, b) => a.time - b.time)
  return lines
}

/**
 * Binary search for the active lyric line index given current time in seconds.
 * Returns -1 if before the first line.
 */
export function findActiveLyricIndex(lyrics: LyricLine[], currentTime: number): number {
  if (lyrics.length === 0) return -1
  if (currentTime < lyrics[0].time) return -1

  let lo = 0
  let hi = lyrics.length - 1

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2)
    if (lyrics[mid].time <= currentTime) {
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }

  return hi
}
