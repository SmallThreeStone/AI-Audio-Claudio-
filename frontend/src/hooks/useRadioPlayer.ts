import { useEffect, useRef, useCallback } from 'react'
import { Howl } from 'howler'
import { useStore } from '../store'
import { radioWS } from '../api/ws'
import { skipTrack, skipToTrack, stopRadio, recordListenEvent } from '../api/radio'
import { getClientId } from '../utils/clientId'
import { sharedAudioEl } from './useAudioVisualizer'

// Module-level guards survive React StrictMode double-mount in development,
// which resets component refs and would otherwise cause double auto-play.
let globalAutoPlayed = false
let globalPlayItemLock = false

export function useRadioPlayer() {
  const {
    queue, currentIndex, volume,
    setCurrentTime, setDuration, setCurrentItem, setIsPlaying,
    setCurrentIndex, setSession, setQueue, setIsAudioLoading,
  } = useStore()
  const howlRef = useRef<Howl | null>(null)
  const progressRef = useRef<ReturnType<typeof setInterval>>(undefined)
  const currentIdxRef = useRef(currentIndex)
  const playingSessionRef = useRef<number | null>(null)
  const autoPlayedRef = useRef(false)
  const isSkippingRef = useRef(false)
  const queueIdxBeforeHistory = useRef(0)  // saved queue position when switching to history mode
  const generationRef = useRef(0)  // incremented on each playItem, used to reject stale callbacks

  useEffect(() => {
    currentIdxRef.current = currentIndex
  }, [currentIndex])

  const playItem = useCallback(
    (index: number) => {
      // Prevent re-entrant / duplicate calls (e.g. from StrictMode double-mount)
      if (globalPlayItemLock) {
        console.log('[Player] playItem BLOCKED — global lock held')
        return
      }
      globalPlayItemLock = true

      const item = queue[index]
      if (!item) {
        console.log('[Player] playItem — no item at index:', index, 'queue length:', queue.length)
        globalPlayItemLock = false
        return
      }
      console.log('[Player] playItem — index:', index, 'id:', item.id, 'type:', item.item_type, 'hasHowlRef:', !!howlRef.current)

      // Cleanup previous Howl completely before creating a new one
      if (howlRef.current) {
        console.log('[Player] playItem — cleaning up previous Howl')
        howlRef.current.off('end')
        howlRef.current.off('play')
        howlRef.current.off('loaderror')
        howlRef.current.off('pause')
        howlRef.current.volume(0)  // Mute instantly
        howlRef.current.stop()
        howlRef.current.unload()
        howlRef.current = null
        sharedAudioEl.current = null
      }
      if (progressRef.current) {
        clearInterval(progressRef.current)
        progressRef.current = undefined
      }

      const gen = ++generationRef.current

      setCurrentItem(item)
      setCurrentIndex(index)
      currentIdxRef.current = index
      playingSessionRef.current = useStore.getState().session?.id ?? null

      const isTTS = item.item_type.startsWith('tts')
      const src = isTTS ? item.tts_audio_url : `/api/audio/music/${item.song_id}`

      if (!src) {
        console.log('[Player] playItem — no src, skipping to next')
        radioWS.send({ type: 'error_report', queue_item_id: item.id, reason: 'no_url' })
        if (isTTS) {
          useStore.getState().setNotice('正在跳过播报，直接为您放歌...')
        }
        globalPlayItemLock = false
        const next = index + 1
        if (next < queue.length) {
          setTimeout(() => playItem(next), 200)
        }
        return
      }

      console.log('[Player] playItem — creating Howl, src:', src.substring(0, 80), 'gen:', gen)

      // Release the global lock once the Howl is created (or fails synchronously).
      // The callbacks below handle async lifecycle — onloaderror releases the lock
      // for the next track, onend triggers the next track naturally.
      globalPlayItemLock = false
      setIsAudioLoading(true)

      const howl = new Howl({
        src: [src],
        html5: true,
        volume: useStore.getState().volume,
        format: ['mp3'],
        onplay: () => {
          if (gen !== generationRef.current) {
            console.log('[Player] onplay IGNORED — stale gen:', gen, 'current:', generationRef.current)
            return
          }
          console.log('[Player] onplay — id:', item.id, 'type:', item.item_type, 'index:', index, 'duration:', howl.duration(), 'gen:', gen)

          // Expose audio element for visualizer
          const audioNode = (howl as any)._sounds?.[0]?._node as HTMLAudioElement | undefined
          if (audioNode) sharedAudioEl.current = audioNode

          setIsAudioLoading(false)
          setIsPlaying(true)
          const dur = howl.duration()
          setDuration(dur)

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
          if (gen !== generationRef.current) {
            console.log('[Player] onend IGNORED — stale gen:', gen, 'current:', generationRef.current)
            return
          }
          console.log('[Player] onend — id:', item.id, 'type:', item.item_type, 'index:', currentIdxRef.current, 'gen:', gen)

          if (!isTTS) {
            const endPos = howl.duration() || (useStore.getState().duration)
            recordListenEvent(item.id, 'completed', endPos)
          }

          setIsPlaying(false)
          setCurrentTime(0)
          setDuration(0)
          if (progressRef.current) {
            clearInterval(progressRef.current)
            progressRef.current = undefined
          }

          const next = currentIdxRef.current + 1
          // Defer via setTimeout to avoid re-entrant unload — calling stop()/unload()
          // on the current Howl from within its own onend callback can silently fail,
          // leaving the audio node alive and causing overlap with the next track.
          if (next >= queue.length) {
            radioWS.send({ type: 'refill' })
          } else {
            setTimeout(() => playItem(next), 0)
          }

          // Fire-and-forget backend sync (don't block next track)
          skipTrack()
        },
        onloaderror: (_id, err) => {
          if (gen !== generationRef.current) {
            console.log('[Player] onloaderror IGNORED — stale gen:', gen, 'current:', generationRef.current)
            return
          }
          console.error('[Player] onloaderror — id:', item.id, 'type:', item.item_type, 'index:', index, 'error:', err, 'src:', src, 'gen:', gen)

          radioWS.send({ type: 'error_report', queue_item_id: item.id, reason: `howler_error_${err}` })
          setIsAudioLoading(false)
          setIsPlaying(false)

          // CRITICAL: stop playback THEN destroy the zombie Howl so it can't
          // resurrect mid-buffer and overlap with the next track.
          howl.stop()
          howl.unload()
          if (howlRef.current === howl) {
            howlRef.current = null
            sharedAudioEl.current = null
          }
          if (progressRef.current) {
            clearInterval(progressRef.current)
            progressRef.current = undefined
          }

          const next = currentIdxRef.current + 1
          if (next < queue.length) {
            console.log('[Player] onloaderror → advancing to next:', next)
            setTimeout(() => playItem(next), 500)
          }
        },
        onpause: () => {
          if (gen !== generationRef.current) return
          setIsPlaying(false)
        },
      })

      howl.play()
      howlRef.current = howl
    },
    [queue.length],
  )

  // Auto-play when queue updates (page refresh / new session)
  useEffect(() => {
    if (queue.length > 0 && !howlRef.current && !globalAutoPlayed && !autoPlayedRef.current) {
      console.log('[Player] auto-play triggered — queue length:', queue.length, 'currentIndex:', useStore.getState().currentIndex)
      autoPlayedRef.current = true
      globalAutoPlayed = true
      // Short delay to survive React StrictMode double-mount cycle
      // and ensure all batched state updates have flushed before starting playback.
      // globalAutoPlayed (module-level) handles the double-mount guard, so 30ms is enough.
      const timer = setTimeout(() => {
        if (howlRef.current) {
          console.log('[Player] auto-play CANCELLED — howlRef already set by another path')
          return
        }
        const idx = useStore.getState().currentIndex
        console.log('[Player] auto-play → playItem(', idx < queue.length ? idx : 0, ')')
        playItem(idx < queue.length ? idx : 0)
      }, 30)
      return () => {
        clearTimeout(timer)
        // Do NOT reset globalAutoPlayed here — cleanup runs on StrictMode unmount,
        // and we don't want the second mount to fire another auto-play.
      }
    }
    if (queue.length === 0) {
      autoPlayedRef.current = false
      globalAutoPlayed = false
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
        console.log('[Player] WS new session detected — id:', newSessionId, 'prev playingSession:', playingSessionRef.current)
        playingSessionRef.current = newSessionId
        // Only auto-play if this client initiated the request
        const isMyRequest = !initiatorId || initiatorId === myId
        if (!isMyRequest) {
          console.log('[Player] WS session initiated by another device, skipping auto-play')
          autoPlayedRef.current = true  // prevent auto-play effect from re-triggering
          return
        }
        ++generationRef.current
        if (howlRef.current) {
          console.log('[Player] WS handler — cleaning up existing Howl')
          howlRef.current.off('end')
          howlRef.current.off('play')
          howlRef.current.off('loaderror')
          howlRef.current.off('pause')
          howlRef.current.volume(0)
          howlRef.current.stop()
          howlRef.current.unload()
          howlRef.current = null
          sharedAudioEl.current = null
        }
        if (progressRef.current) {
          clearInterval(progressRef.current)
        }
        autoPlayedRef.current = true  // prevent auto-play useEffect from double-playing
        setTimeout(() => {
          if (howlRef.current) {
            console.log('[Player] WS playItem CANCELLED — howlRef already set')
            return
          }
          const idx = useStore.getState().currentIndex
          console.log('[Player] WS handler → playItem(', idx < items.length ? idx : 0, ')')
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
    console.log('[Player] skip — currentIdxRef:', currentIdxRef.current)

    // Track listening: song skipped at current position
    const store = useStore.getState()
    if (howlRef.current && store.currentItem && store.currentItem.item_type === 'song') {
      recordListenEvent(store.currentItem.id, 'skipped', store.currentTime)
    }

    // Invalidate onend & silently destroy old Howl before creating new one.
    // off() removes all event listeners so stop() can NOT trigger onend/onplay.
    ++generationRef.current
    if (howlRef.current) {
      howlRef.current.off('end')
      howlRef.current.off('play')
      howlRef.current.off('loaderror')
      howlRef.current.off('pause')
      howlRef.current.volume(0)  // Mute instantly to prevent any residual audio
      howlRef.current.stop()
      howlRef.current.unload()
      howlRef.current = null
      sharedAudioEl.current = null
    }
    if (progressRef.current) {
      clearInterval(progressRef.current)
      progressRef.current = undefined
    }
    setIsAudioLoading(false)
    radioWS.send({ type: 'command', action: 'skip' })
    skipTrack()

    // Longer delay (200ms) to ensure browser finishes tearing down the old
    // Audio node before creating a new one. 50ms was not enough.
    const baseIdx = currentIdxRef.current === -1 ? queueIdxBeforeHistory.current : currentIdxRef.current
    const next = baseIdx + 1
    if (next < queue.length) {
      setTimeout(() => playItem(next), 200)
    }
    // Reset guard after playItem has had time to start
    setTimeout(() => { isSkippingRef.current = false }, 500)
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

      ++generationRef.current
      if (howlRef.current) {
        howlRef.current.off('end')
        howlRef.current.off('play')
        howlRef.current.off('loaderror')
        howlRef.current.off('pause')
        howlRef.current.volume(0)
        howlRef.current.stop()
        howlRef.current.unload()
        howlRef.current = null
        sharedAudioEl.current = null
      }
      if (progressRef.current) {
        clearInterval(progressRef.current)
        progressRef.current = undefined
      }
      setIsAudioLoading(false)

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
    console.log('[Player] previous — currentIdxRef:', currentIdxRef.current)

    const store = useStore.getState()
    const lastSong = store.playHistory.find((item) => item.item_type === 'song')
    if (!lastSong || !lastSong.song_id) {
      isSkippingRef.current = false
      return
    }

    // Save current queue position before entering history mode
    queueIdxBeforeHistory.current = currentIdxRef.current

    // Stop current playback
    ++generationRef.current
    if (howlRef.current) {
      howlRef.current.off('end')
      howlRef.current.off('play')
      howlRef.current.off('loaderror')
      howlRef.current.off('pause')
      howlRef.current.volume(0)
      howlRef.current.stop()
      howlRef.current.unload()
      howlRef.current = null
      sharedAudioEl.current = null
    }
    if (progressRef.current) {
      clearInterval(progressRef.current)
      progressRef.current = undefined
    }
    setIsAudioLoading(false)
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
    console.log('[Player] stop')
    ++generationRef.current
    if (howlRef.current) {
      howlRef.current.off('end')
      howlRef.current.off('play')
      howlRef.current.off('loaderror')
      howlRef.current.off('pause')
      howlRef.current.volume(0)
      howlRef.current.stop()
      howlRef.current.unload()
      howlRef.current = null
      sharedAudioEl.current = null
    }
    if (progressRef.current) {
      clearInterval(progressRef.current)
      progressRef.current = undefined
    }
    setIsAudioLoading(false)
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
