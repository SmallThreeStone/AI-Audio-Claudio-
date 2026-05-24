import { useEffect, useRef, useCallback } from 'react'
import { Howl } from 'howler'
import { useStore } from '../store'
import { radioWS } from '../api/ws'
import { skipTrack, stopRadio, recordListenEvent } from '../api/radio'

export function useRadioPlayer() {
  const {
    queue, currentIndex, volume,
    setCurrentTime, setDuration, setCurrentItem, setIsPlaying,
    setCurrentIndex, setSession, setQueue,
  } = useStore()
  const howlRef = useRef<Howl | null>(null)
  const progressRef = useRef<ReturnType<typeof setInterval>>(undefined)
  const currentIdxRef = useRef(currentIndex)

  useEffect(() => {
    currentIdxRef.current = currentIndex
  }, [currentIndex])

  const playItem = useCallback(
    (index: number) => {
      const item = queue[index]
      if (!item) return

      // Cleanup previous
      if (howlRef.current) {
        howlRef.current.unload()
      }
      if (progressRef.current) {
        clearInterval(progressRef.current)
      }

      setCurrentItem(item)
      setCurrentIndex(index)
      currentIdxRef.current = index

      const isTTS = item.item_type.startsWith('tts')
      const src = isTTS ? item.tts_audio_url : `/api/audio/music/${item.song_id}`

      if (!src) {
        radioWS.send({ type: 'error_report', queue_item_id: item.id, reason: 'no_url' })
        const next = index + 1
        if (next < queue.length) {
          playItem(next)
        }
        return
      }

      const howl = new Howl({
        src: [src],
        html5: true,
        volume: useStore.getState().volume,
        format: ['mp3'],
        onplay: () => {
          setIsPlaying(true)
          const dur = howl.duration()
          setDuration(dur)

          // Track listening: song started
          if (!isTTS) {
            recordListenEvent(item.id, 'started')
          }

          progressRef.current = setInterval(() => {
            const seek = howl.seek() as number
            setCurrentTime(seek)
            radioWS.send({ type: 'progress_report', queue_item_id: item.id, position_seconds: seek })
          }, 1000)
        },
        onend: () => {
          // Track listening: song completed
          if (!isTTS) {
            const endPos = howl.duration() || (useStore.getState().duration)
            recordListenEvent(item.id, 'completed', endPos)
          }

          setIsPlaying(false)
          setCurrentTime(0)
          setDuration(0)
          if (progressRef.current) clearInterval(progressRef.current)

          const next = currentIdxRef.current + 1
          if (next >= queue.length) {
            radioWS.send({ type: 'refill' })
          } else {
            playItem(next)
          }
        },
        onloaderror: (_id, err) => {
          console.error('Audio load error:', err)
          radioWS.send({ type: 'error_report', queue_item_id: item.id })
          const next = currentIdxRef.current + 1
          if (next < queue.length) playItem(next)
        },
        onpause: () => setIsPlaying(false),
      })

      howl.play()
      howlRef.current = howl
    },
    [queue.length],
  )

  // Auto-play when queue updates
  useEffect(() => {
    if (queue.length > 0 && !howlRef.current) {
      playItem(currentIndex)
    }
  }, [queue])

  // Listen for queue updates from WebSocket (new session created)
  useEffect(() => {
    let lastSessionId: number | null = null

    const unsub = radioWS.on('queue_update', (msg) => {
      const items = msg.items as Array<Record<string, unknown>>
      const newSessionId = (msg.session as Record<string, unknown>)?.id as number | undefined

      // Only reset player for a brand-new session, not for skip/refill updates
      if (items && items.length > 0 && newSessionId !== undefined && newSessionId !== lastSessionId) {
        lastSessionId = newSessionId
        if (howlRef.current) {
          howlRef.current.unload()
          howlRef.current = null
        }
        if (progressRef.current) {
          clearInterval(progressRef.current)
        }
      }
    })
    return unsub
  }, [])

  // Volume sync
  useEffect(() => {
    if (howlRef.current) {
      howlRef.current.volume(volume)
    }
  }, [volume])

  const skip = useCallback(() => {
    // Track listening: song skipped at current position
    const store = useStore.getState()
    if (howlRef.current && store.currentItem && store.currentItem.item_type === 'song') {
      recordListenEvent(store.currentItem.id, 'skipped', store.currentTime)
    }

    if (howlRef.current) {
      howlRef.current.stop()
      howlRef.current.unload()
      howlRef.current = null
    }
    if (progressRef.current) {
      clearInterval(progressRef.current)
    }
    radioWS.send({ type: 'command', action: 'skip' })
    skipTrack()

    const next = currentIdxRef.current + 1
    if (next < queue.length) {
      playItem(next)
    }
  }, [queue, playItem])

  const stop = useCallback(() => {
    if (howlRef.current) {
      howlRef.current.stop()
      howlRef.current.unload()
      howlRef.current = null
    }
    if (progressRef.current) {
      clearInterval(progressRef.current)
    }
    setIsPlaying(false)
    setCurrentTime(0)
    setCurrentItem(null)
    setCurrentIndex(0)
    setQueue([])
    setSession(null)
    radioWS.send({ type: 'command', action: 'stop' })
    stopRadio()
  }, [setIsPlaying, setCurrentTime, setCurrentItem, setCurrentIndex, setQueue, setSession])

  return { skip, stop }
}
