import { useEffect, useRef, useCallback } from 'react'
import { Howl } from 'howler'
import { useStore } from '../store'
import { radioWS } from '../api/ws'
import { skipTrack, skipToTrack, stopRadio, recordListenEvent } from '../api/radio'
import { getClientId } from '../utils/clientId'

export function useRadioPlayer() {
  const {
    queue, currentIndex, volume,
    setCurrentTime, setDuration, setCurrentItem, setIsPlaying,
    setCurrentIndex, setSession, setQueue,
  } = useStore()
  const howlRef = useRef<Howl | null>(null)
  const progressRef = useRef<ReturnType<typeof setInterval>>(undefined)
  const currentIdxRef = useRef(currentIndex)
  const playingSessionRef = useRef<number | null>(null)
  const autoPlayedRef = useRef(false)
  const isSkippingRef = useRef(false)
  const queueIdxBeforeHistory = useRef(0)  // saved queue position when switching to history mode

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
      playingSessionRef.current = useStore.getState().session?.id ?? null

      const isTTS = item.item_type.startsWith('tts')
      const src = isTTS ? item.tts_audio_url : `/api/audio/music/${item.song_id}`

      if (!src) {
        radioWS.send({ type: 'error_report', queue_item_id: item.id, reason: 'no_url' })
        if (isTTS) {
          useStore.getState().setNotice('正在跳过播报，直接为您放歌...')
        }
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
            useStore.getState().addToHistory(item)
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

          // Sync backend playing index (so page-refresh resume works)
          skipTrack()

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

  // Auto-play when queue updates (page refresh / new session)
  useEffect(() => {
    if (queue.length > 0 && !howlRef.current && !autoPlayedRef.current) {
      autoPlayedRef.current = true
      // Use timeout to ensure all batched state updates (queue, currentIndex) have flushed
      const timer = setTimeout(() => {
        const idx = useStore.getState().currentIndex
        playItem(idx < queue.length ? idx : 0)
      }, 50)
      return () => clearTimeout(timer)
    }
    if (queue.length === 0) {
      autoPlayedRef.current = false
    }
  }, [queue])

  // Listen for queue updates from WebSocket (new session created)
  useEffect(() => {
    const myId = getClientId()
    const unsub = radioWS.on('queue_update', (msg) => {
      const items = msg.items as Array<Record<string, unknown>>
      const newSessionId = (msg.session as Record<string, unknown>)?.id as number | undefined
      const initiatorId = (msg.initiator_client_id as string) || ''
      // Reset player only when a genuinely new session arrives (not skip/refill/hydrate)
      if (items && items.length > 0 && newSessionId !== undefined && newSessionId !== playingSessionRef.current) {
        playingSessionRef.current = newSessionId
        // Only auto-play if this client initiated the request
        const isMyRequest = !initiatorId || initiatorId === myId
        if (!isMyRequest) {
          if (import.meta.env.DEV) console.log('[Radio] Session', newSessionId, 'initiated by another device, skipping auto-play')
          autoPlayedRef.current = true  // prevent auto-play effect from re-triggering
          return
        }
        if (howlRef.current) {
          howlRef.current.unload()
          howlRef.current = null
        }
        if (progressRef.current) {
          clearInterval(progressRef.current)
        }
        autoPlayedRef.current = true  // prevent auto-play useEffect from double-playing
        setTimeout(() => {
          const idx = useStore.getState().currentIndex
          playItem(idx < items.length ? idx : 0)
        }, 0)
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
    if (isSkippingRef.current) return
    isSkippingRef.current = true

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

    // If in history mode (previous() was used), resume from saved queue position
    const baseIdx = currentIdxRef.current === -1 ? queueIdxBeforeHistory.current : currentIdxRef.current
    const next = baseIdx + 1
    if (next < queue.length) {
      playItem(next)
    }
    // Reset guard after playItem has had time to start
    setTimeout(() => { isSkippingRef.current = false }, 300)
  }, [queue, playItem])

  const skipTo = useCallback(
    (queueItemId: number) => {
      const store = useStore.getState()
      const idx = store.queue.findIndex((item) => item.id === queueItemId)
      if (idx < 0 || idx === store.currentIndex) return

      // Track skip for current item
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

      skipToTrack(queueItemId)
      currentIdxRef.current = idx
      setCurrentIndex(idx)
      setTimeout(() => playItem(idx), 0)
    },
    [queue, playItem],
  )

  const previous = useCallback(() => {
    if (isSkippingRef.current) return
    isSkippingRef.current = true

    const store = useStore.getState()
    const lastSong = store.playHistory.find((item) => item.item_type === 'song')
    if (!lastSong || !lastSong.song_id) {
      isSkippingRef.current = false
      return
    }

    // Save current queue position before entering history mode
    queueIdxBeforeHistory.current = currentIdxRef.current

    // Stop current playback
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

    // Mark history mode: -1 means playing outside the queue
    currentIdxRef.current = -1
    setCurrentIndex(-1)
    playingSessionRef.current = store.session?.id ?? null

    const src = `/api/audio/music/${lastSong.song_id}`
    const howl = new Howl({
      src: [src],
      html5: true,
      volume: store.volume,
      format: ['mp3'],
      onplay: () => {
        setIsPlaying(true)
        const dur = howl.duration()
        setDuration(dur)
        recordListenEvent(lastSong.id, 'started')
        progressRef.current = setInterval(() => {
          const seek = howl.seek() as number
          setCurrentTime(seek)
          radioWS.send({ type: 'progress_report', queue_item_id: lastSong.id, position_seconds: seek })
        }, 1000)
      },
      onend: () => {
        setIsPlaying(false)
        if (progressRef.current) clearInterval(progressRef.current)
        recordListenEvent(lastSong.id, 'completed')
        // Restore queue position so next skip plays the correct item
        currentIdxRef.current = queueIdxBeforeHistory.current
        setCurrentIndex(queueIdxBeforeHistory.current)
      },
      onloaderror: () => {
        store.setNotice('无法播放此歌曲')
        setIsPlaying(false)
        currentIdxRef.current = queueIdxBeforeHistory.current
        setCurrentIndex(queueIdxBeforeHistory.current)
      },
    })
    howlRef.current = howl
    howl.play()
    setCurrentItem(lastSong)

    setTimeout(() => { isSkippingRef.current = false }, 300)
  }, [])

  const togglePause = useCallback(() => {
    if (!howlRef.current) return
    const store = useStore.getState()
    if (store.isPlaying) {
      howlRef.current.pause()
      setIsPlaying(false)
    } else {
      howlRef.current.play()
      setIsPlaying(true)
    }
  }, [setIsPlaying])

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

  const seek = useCallback((time: number) => {
    if (howlRef.current) {
      howlRef.current.seek(time)
      setCurrentTime(time)
    }
  }, [setCurrentTime])

  return { skip, skipTo, stop, togglePause, seek, previous }
}
