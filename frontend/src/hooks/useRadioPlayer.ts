import { useEffect, useRef, useCallback } from 'react'
import { Howl } from 'howler'
import { useStore } from '../store'
import { radioWS } from '../api/ws'
import { skipTrack, skipToTrack, stopRadio, recordListenEvent } from '../api/radio'

const playerLog = (...args: unknown[]) => { if (import.meta.env.DEV) console.log(...args) }
import { getClientId } from '../utils/clientId'
import { sharedAudioEl } from './useAudioVisualizer'

// Module-level guards survive React StrictMode double-mount in development,
// which resets component refs and would otherwise cause double auto-play.
let globalAutoPlayed = false
let globalPlayItemLock = false
let lastProcessedNewSession = 0  // dedup WS "new session" events
let autoPlayBlockNoticeShown = false  // show "click to play" notice only once

function destroyHowl(h: Howl | null) {
  if (!h) return
  h.off('end')
  h.off('play')
  h.off('loaderror')
  h.off('pause')
  h.off('playerror')
  h.off('unlock')
  h.volume(0)
  h.stop()
  h.unload()
}

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
  const loadTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const prevGenerationRef = useRef(0)  // separate generation counter for previous() mode

  useEffect(() => {
    currentIdxRef.current = currentIndex
  }, [currentIndex])

  const playItem = useCallback(
    (index: number) => {
      // Prevent re-entrant / duplicate calls (e.g. from StrictMode double-mount)
      if (globalPlayItemLock) {
        playerLog('[Player] playItem BLOCKED — global lock held')
        return
      }
      globalPlayItemLock = true

      // Always read queue from store, not closure — closure may be stale
      // when queue content changes without length change.
      const storeQueue = useStore.getState().queue
      const item = storeQueue[index]
      if (!item) {
        playerLog('[Player] playItem — no item at index:', index, 'queue length:', storeQueue.length)
        globalPlayItemLock = false
        return
      }
      playerLog('[Player] playItem — index:', index, 'id:', item.id, 'type:', item.item_type, 'hasHowlRef:', !!howlRef.current)

      // Cleanup previous Howl completely before creating a new one
      if (howlRef.current) {
        playerLog('[Player] playItem — cleaning up previous Howl')
        howlRef.current.off('end')
        howlRef.current.off('play')
        howlRef.current.off('loaderror')
        howlRef.current.off('pause')
        howlRef.current.off('playerror')
        howlRef.current.off('unlock')
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
        playerLog('[Player] playItem — no src, skipping to next')
        radioWS.send({ type: 'error_report', queue_item_id: item.id, reason: 'no_url' })
        if (isTTS) {
          useStore.getState().setNotice('正在跳过播报，直接为您放歌...')
        }
        globalPlayItemLock = false
        const next = index + 1
        if (next < useStore.getState().queue.length) {
          setTimeout(() => playItem(next), 150)
        }
        return
      }

      playerLog('[Player] playItem — creating Howl, src:', src.substring(0, 80), 'gen:', gen)

      setIsAudioLoading(true)
      const store = useStore.getState()

      // F6: Loading timeout — if onplay doesn't fire within 30s, abort and advance
      if (loadTimerRef.current) clearTimeout(loadTimerRef.current)
      loadTimerRef.current = setTimeout(() => {
        console.warn('[Player] load TIMEOUT — id:', item.id, 'src:', src.substring(0, 60))
        if (howlRef.current === howl) {
          howl.off('play')
          howl.off('loaderror')
          howl.off('playerror')
          howl.stop()
          howl.unload()
          howlRef.current = null
          sharedAudioEl.current = null
        }
        setIsAudioLoading(false)
        setIsPlaying(false)
        useStore.getState().setNotice('加载超时，已自动跳过')
        const next = currentIdxRef.current + 1
        if (next < useStore.getState().queue.length) setTimeout(() => playItem(next), 150)
      }, 30000)

      const clearLoadTimer = () => {
        if (loadTimerRef.current) {
          clearTimeout(loadTimerRef.current)
          loadTimerRef.current = undefined
        }
      }

      const howl = new Howl({
        src: [src],
        html5: true,
        volume: store.volume,
        format: ['mp3'],
        onplay: () => {
          if (gen !== generationRef.current) {
            playerLog('[Player] onplay IGNORED — stale gen:', gen, 'current:', generationRef.current)
            return
          }
          clearLoadTimer()
          playerLog('[Player] onplay — id:', item.id, 'type:', item.item_type, 'index:', index, 'duration:', howl.duration(), 'gen:', gen)

          autoPlayBlockNoticeShown = false  // playback started, reset for next session
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
        onplayerror: () => {
          // F1: Browser blocked autoplay or codec unsupported
          if (gen !== generationRef.current) return
          clearLoadTimer()
          console.warn('[Player] onplayerror — id:', item.id, 'gen:', gen)
          howl.stop()
          howl.unload()
          if (howlRef.current === howl) {
            howlRef.current = null
            sharedAudioEl.current = null
          }
          setIsAudioLoading(false)
          setIsPlaying(false)
          if (progressRef.current) {
            clearInterval(progressRef.current)
            progressRef.current = undefined
          }
          useStore.getState().setNotice('播放被阻止，点击播放按钮继续')
          skipTrack()
          const next = currentIdxRef.current + 1
          if (next < useStore.getState().queue.length) setTimeout(() => playItem(next), 150)
        },
        onend: () => {
          if (gen !== generationRef.current) {
            playerLog('[Player] onend IGNORED — stale gen:', gen, 'current:', generationRef.current)
            return
          }
          clearLoadTimer()
          playerLog('[Player] onend — id:', item.id, 'type:', item.item_type, 'index:', currentIdxRef.current, 'gen:', gen)

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
          // Always read queue from store to avoid stale closure
          if (next >= useStore.getState().queue.length) {
            radioWS.send({ type: 'refill' })
          } else {
            setTimeout(() => playItem(next), 150)
          }

          // Fire-and-forget backend sync (don't block next track)
          skipTrack()
        },
        onloaderror: (_id, err) => {
          if (gen !== generationRef.current) {
            playerLog('[Player] onloaderror IGNORED — stale gen:', gen, 'current:', generationRef.current)
            return
          }
          clearLoadTimer()
          console.error('[Player] onloaderror — id:', item.id, 'type:', item.item_type, 'index:', index, 'error:', err, 'src:', src, 'gen:', gen)

          radioWS.send({ type: 'error_report', queue_item_id: item.id, reason: `howler_error_${err}` })
          setIsAudioLoading(false)
          setIsPlaying(false)
          useStore.getState().setNotice('歌曲加载失败，已自动跳过')

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

          // Keep backend in sync — the song failed so advance played_items
          skipTrack()
          const next = currentIdxRef.current + 1
          if (next < useStore.getState().queue.length) {
            playerLog('[Player] onloaderror → advancing to next:', next)
            setTimeout(() => playItem(next), 150)
          }
        },
        onpause: () => {
          if (gen !== generationRef.current) return
          setIsPlaying(false)
        },
        // F24: Mobile autoplay unlock — retry play once audio context is unlocked
        onunlock: () => {
          if (gen !== generationRef.current) return
          playerLog('[Player] onunlock — retrying play for id:', item.id)
          if (!autoPlayBlockNoticeShown) {
            autoPlayBlockNoticeShown = true
            useStore.getState().setNotice('浏览器阻止了自动播放，请点击页面任意位置开始播放')
          }
          if (howlRef.current === howl && !howl.playing()) {
            howl.play()
          }
        },
      })

      howl.play()
      howlRef.current = howl
      // F4: Release lock only after howlRef is assigned — prevents race window
      globalPlayItemLock = false
    },
    [queue.length],
  )

  // Auto-play when queue updates (page refresh / new session)
  useEffect(() => {
    if (queue.length > 0 && !howlRef.current && !globalAutoPlayed && !autoPlayedRef.current) {
      playerLog('[Player] auto-play triggered — queue length:', queue.length, 'currentIndex:', useStore.getState().currentIndex)
      autoPlayedRef.current = true
      globalAutoPlayed = true
      // Short delay to survive React StrictMode double-mount cycle
      // and ensure all batched state updates have flushed before starting playback.
      // globalAutoPlayed (module-level) handles the double-mount guard, so 30ms is enough.
      const timer = setTimeout(() => {
        if (howlRef.current) {
          playerLog('[Player] auto-play CANCELLED — howlRef already set by another path')
          return
        }
        const idx = useStore.getState().currentIndex
        playerLog('[Player] auto-play → playItem(', idx < queue.length ? idx : 0, ')')
        playItem(idx < queue.length ? idx : 0)
      }, 30)
      return () => {
        clearTimeout(timer)
        // Do NOT reset globalAutoPlayed here — cleanup runs on StrictMode unmount,
        // and we don't want the second mount to fire another auto-play.
      }
    }
    if (queue.length === 0) {
      // Session ended — stop playback and reset state
      if (howlRef.current) {
        ++generationRef.current
        destroyHowl(howlRef.current)
        howlRef.current = null
        sharedAudioEl.current = null
      }
      if (progressRef.current) {
        clearInterval(progressRef.current)
        progressRef.current = undefined
      }
      if (loadTimerRef.current) {
        clearTimeout(loadTimerRef.current)
        loadTimerRef.current = undefined
      }
      setIsAudioLoading(false)
      setIsPlaying(false)
      setCurrentTime(0)
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
        // Dedup: if we already processed this session (duplicate WS message or handler),
        // skip — otherwise two playItem chains race and kill each other's Howls.
        if (newSessionId === lastProcessedNewSession) {
          playerLog('[Player] WS new session — id', newSessionId, 'already processed, skipping duplicate')
          return
        }
        lastProcessedNewSession = newSessionId
        playerLog('[Player] WS new session detected — id:', newSessionId, 'prev playingSession:', playingSessionRef.current)
        // Page refresh recovery: if playingSessionRef was null (just refreshed) AND
        // the store already has a queue (hydrate completed), skip — auto-play handles it.
        // Use getState() not autoPlayedRef because the WS message may arrive before
        // React re-renders (Zustand state is synchronous, refs update in effects).
        const wasNull = playingSessionRef.current === null
        playingSessionRef.current = newSessionId
        if (wasNull && useStore.getState().queue.length > 0) {
          playerLog('[Player] WS new session — queue already hydrated, deferring to auto-play')
          return
        }
        // Only auto-play if this client initiated the request
        const isMyRequest = !initiatorId || initiatorId === myId
        if (!isMyRequest) {
          playerLog('[Player] WS session initiated by another device, skipping auto-play')
          autoPlayedRef.current = true  // prevent auto-play effect from re-triggering
          return
        }
        ++generationRef.current
        if (howlRef.current) {
          playerLog('[Player] WS handler — cleaning up existing Howl')
          howlRef.current.off('end')
          howlRef.current.off('play')
          howlRef.current.off('loaderror')
          howlRef.current.off('pause')
          howlRef.current.off('playerror')
          howlRef.current.off('unlock')
          howlRef.current.volume(0)
          howlRef.current.stop()
          howlRef.current.unload()
          howlRef.current = null
          sharedAudioEl.current = null
        }
        if (progressRef.current) {
          clearInterval(progressRef.current)
        }
        if (loadTimerRef.current) {
          clearTimeout(loadTimerRef.current)
        }
        autoPlayedRef.current = true  // prevent auto-play useEffect from double-playing
        setTimeout(() => {
          if (howlRef.current) {
            playerLog('[Player] WS playItem CANCELLED — howlRef already set')
            return
          }
          const idx = useStore.getState().currentIndex
          playerLog('[Player] WS handler → playItem(', idx < items.length ? idx : 0, ')')
          playItem(idx < items.length ? idx : 0)
        }, 150)
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
    playerLog('[Player] skip — currentIdxRef:', currentIdxRef.current)

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
      howlRef.current.off('playerror')
      howlRef.current.off('unlock')
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

    // F14: Standardized 150ms delay for consistent track transitions
    const baseIdx = currentIdxRef.current === -1 ? queueIdxBeforeHistory.current : currentIdxRef.current
    const next = baseIdx + 1
    if (next < useStore.getState().queue.length) {
      setTimeout(() => playItem(next), 150)
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

      ++generationRef.current
      if (howlRef.current) {
        destroyHowl(howlRef.current)
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
      setTimeout(() => playItem(idx), 150)
    },
    [queue, playItem],
  )

  const previous = useCallback(() => {
    if (isSkippingRef.current) return
    isSkippingRef.current = true
    playerLog('[Player] previous — currentIdxRef:', currentIdxRef.current)

    const store = useStore.getState()
    const lastSong = store.playHistory.filter((item) => item.item_type === 'song' && item.position !== store.currentIndex)[0]
    if (!lastSong || !lastSong.song_id) {
      isSkippingRef.current = false
      return
    }

    // Save current queue position before entering history mode
    queueIdxBeforeHistory.current = currentIdxRef.current

    // F3: increment prevGenerationRef for history-mode callback guards
    const prevGen = ++prevGenerationRef.current

    // F20: Clean up existing Howl before creating history Howl (same as playItem)
    ++generationRef.current
    if (howlRef.current) {
      howlRef.current.off('end')
      howlRef.current.off('play')
      howlRef.current.off('loaderror')
      howlRef.current.off('pause')
      howlRef.current.off('playerror')
      howlRef.current.off('unlock')
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
    if (loadTimerRef.current) {
      clearTimeout(loadTimerRef.current)
      loadTimerRef.current = undefined
    }
    setIsAudioLoading(false)
    setIsPlaying(false)
    setCurrentTime(0)

    // Mark history mode: -1 means playing outside the queue
    currentIdxRef.current = -1
    setCurrentIndex(-1)
    playingSessionRef.current = store.session?.id ?? null

    const src = `/api/audio/music/${lastSong.song_id}`

    // F6: Loading timeout for history songs too
    loadTimerRef.current = setTimeout(() => {
      console.warn('[Player] previous load TIMEOUT — id:', lastSong.id)
      if (howlRef.current === howl) {
        howl.off('play')
        howl.off('loaderror')
        howl.off('playerror')
        howl.stop()
        howl.unload()
        howlRef.current = null
        sharedAudioEl.current = null
      }
      setIsPlaying(false)
      // F2: Restore queue position and advance
      currentIdxRef.current = queueIdxBeforeHistory.current
      setCurrentIndex(queueIdxBeforeHistory.current)
      useStore.getState().setNotice('加载超时，已返回队列')
      const next = queueIdxBeforeHistory.current + 1
      if (next < useStore.getState().queue.length) setTimeout(() => playItem(next), 150)
      isSkippingRef.current = false
    }, 15000)

    const clearLoadTimer = () => {
      if (loadTimerRef.current) {
        clearTimeout(loadTimerRef.current)
        loadTimerRef.current = undefined
      }
    }

    const howl = new Howl({
      src: [src],
      html5: true,
      volume: store.volume,
      format: ['mp3'],
      onplay: () => {
        if (prevGen !== prevGenerationRef.current) return  // F3: generation guard
        clearLoadTimer()
        // F3: Expose audio element for visualizer
        const audioNode = (howl as any)._sounds?.[0]?._node as HTMLAudioElement | undefined
        if (audioNode) sharedAudioEl.current = audioNode
        setIsAudioLoading(false)
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
      onplayerror: () => {
        if (prevGen !== prevGenerationRef.current) return
        clearLoadTimer()
        console.warn('[Player] previous onplayerror — id:', lastSong.id)
        howl.stop()
        howl.unload()
        if (howlRef.current === howl) {
          howlRef.current = null
          sharedAudioEl.current = null
        }
        setIsPlaying(false)
        currentIdxRef.current = queueIdxBeforeHistory.current
        setCurrentIndex(queueIdxBeforeHistory.current)
        useStore.getState().setNotice('播放被阻止，点击播放按钮继续')
        isSkippingRef.current = false
      },
      onend: () => {
        if (prevGen !== prevGenerationRef.current) return  // F3: generation guard
        clearLoadTimer()
        setIsPlaying(false)
        setCurrentTime(0)
        setDuration(0)
        if (progressRef.current) {
          clearInterval(progressRef.current)
          progressRef.current = undefined
        }
        recordListenEvent(lastSong.id, 'completed')
        // F2: Restore queue position and auto-advance to next song
        currentIdxRef.current = queueIdxBeforeHistory.current
        setCurrentIndex(queueIdxBeforeHistory.current)
        const next = queueIdxBeforeHistory.current + 1
        if (next < useStore.getState().queue.length) {
          setTimeout(() => playItem(next), 150)
        }
        isSkippingRef.current = false
      },
      onloaderror: (_id: unknown, err: unknown) => {
        if (prevGen !== prevGenerationRef.current) return
        clearLoadTimer()
        console.warn('[Player] previous onloaderror — id:', lastSong.id, 'error:', err)
        store.setNotice('无法播放此歌曲')
        setIsPlaying(false)
        if (howlRef.current === howl) {
          howlRef.current = null
          sharedAudioEl.current = null
        }
        // F2: Restore queue position on error
        currentIdxRef.current = queueIdxBeforeHistory.current
        setCurrentIndex(queueIdxBeforeHistory.current)
        isSkippingRef.current = false
      },
      onunlock: () => {
        if (prevGen !== prevGenerationRef.current) return
        playerLog('[Player] previous onunlock — retrying play for id:', lastSong.id)
        if (howlRef.current === howl && !howl.playing()) {
          howl.play()
        }
      },
    })
    howlRef.current = howl
    howl.play()
    setCurrentItem(lastSong)

    setTimeout(() => { isSkippingRef.current = false }, 300)
  }, [queue, playItem])

  const togglePause = useCallback(() => {
    if (!howlRef.current) return
    // F5: Use Howl.playing() for ground-truth state, not store which can drift
    if (howlRef.current.playing()) {
      howlRef.current.pause()
      setIsPlaying(false)
    } else {
      howlRef.current.play()
      setIsPlaying(true)
    }
  }, [setIsPlaying])

  const stop = useCallback(() => {
    playerLog('[Player] stop')
    ++generationRef.current
    if (howlRef.current) {
      howlRef.current.off('end')
      howlRef.current.off('play')
      howlRef.current.off('loaderror')
      howlRef.current.off('pause')
      howlRef.current.off('playerror')
      howlRef.current.off('unlock')
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
    if (loadTimerRef.current) {
      clearTimeout(loadTimerRef.current)
      loadTimerRef.current = undefined
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
