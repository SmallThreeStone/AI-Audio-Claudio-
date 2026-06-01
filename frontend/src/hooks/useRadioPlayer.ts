import { useEffect, useRef, useCallback } from 'react'
import { Howl } from 'howler'
import { useStore } from '../store'
import { radioWS } from '../api/ws'
import { skipTrack, skipToTrack, stopRadio, recordListenEvent } from '../api/radio'

const playerLog = (...args: unknown[]) => {
  if (import.meta.env.DEV) console.log(`[${performance.now().toFixed(0)}ms]`, ...args)
}
import { getClientId } from '../utils/clientId'
import { sharedAudioEl, visSourceMap } from './useAudioVisualizer'

// Module-level guards survive React StrictMode double-mount in development,
// which resets component refs and would otherwise cause double auto-play.
let globalAutoPlayed = false
let lastProcessedNewSession = 0  // dedup WS "new session" events
let autoPlayBlockNoticeShown = false  // show "click to play" notice only once
const deadHowls = new WeakSet<Howl>()
let currentToken = 0  // F30: global token — incremented on every track advance, invalidates all stale callbacks/intervals

function destroyHowl(h: Howl | null) {
  if (!h) return
  deadHowls.add(h)
  // F37: Disconnect AudioContext source before stopping Howler.
  const sounds: Array<{ _node?: HTMLAudioElement }> = (h as any)._sounds || []
  for (const s of sounds) {
    if (s._node) {
      s._node.muted = true
      const src = visSourceMap.get(s._node)
      playerLog('destroyHowl node muted, hasVisSource=', !!src)
      if (src) { try { src.disconnect() } catch {} }
    }
  }
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
  const queueIdxBeforeHistory = useRef(0)
  const loadTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const prevGenerationRef = useRef(0)

  useEffect(() => {
    currentIdxRef.current = currentIndex
  }, [currentIndex])

  // F30: Centralized track advancement — single entry point for ALL skip/next paths
  const advanceTo = useCallback((nextIndex: number) => {
    ++currentToken
    const myToken = currentToken
    const hadHowl = !!howlRef.current
    playerLog('advanceTo idx=', nextIndex, 'token=', myToken, 'hadHowl=', hadHowl)

    if (howlRef.current) {
      const sounds: Array<{ _node?: HTMLAudioElement }> = (howlRef.current as any)._sounds || []
      playerLog('advanceTo destroying Howl, _sounds.length=', sounds.length,
        sounds.map((s, i) => `[${i}]:muted=${s._node?.muted},paused=${s._node?.paused}`).join(' '))
      destroyHowl(howlRef.current)
      howlRef.current = null
      sharedAudioEl.current = null
    }
    if (progressRef.current) { clearInterval(progressRef.current); progressRef.current = undefined }
    if (loadTimerRef.current) { clearTimeout(loadTimerRef.current); loadTimerRef.current = undefined }
    setIsAudioLoading(false); setIsPlaying(false); setCurrentTime(0); setDuration(0)

    const store = useStore.getState()
    if (nextIndex >= store.queue.length) {
      radioWS.send({ type: 'refill' })
      return
    }

    setTimeout(() => playItem(nextIndex, myToken), 150)
  }, [queue.length])

  const playItem = useCallback(
    (index: number, token: number) => {
      if (token !== currentToken) {
        playerLog('[Player] playItem IGNORED — stale token:', token, 'current:', currentToken)
        return
      }

      const storeQueue = useStore.getState().queue
      const item = storeQueue[index]
      if (!item) {
        playerLog('[Player] playItem — no item at index:', index)
        return
      }
      playerLog('playItem idx=', index, 'id=', item.id, 'type=', item.item_type, 'token=', token)

      setCurrentItem(item)
      setCurrentIndex(index)
      currentIdxRef.current = index
      playingSessionRef.current = useStore.getState().session?.id ?? null

      const isTTS = item.item_type.startsWith('tts')
      const src = isTTS ? item.tts_audio_url : `/api/audio/music/${item.song_id}?cid=${getClientId()}`

      if (!src) {
        playerLog('[Player] playItem — no src, advancing')
        radioWS.send({ type: 'error_report', queue_item_id: item.id, reason: 'no_url' })
        advanceTo(index + 1)
        return
      }

      setIsAudioLoading(true)
      const store = useStore.getState()

      playerLog('[Player] playItem — creating Howl, src:', src.substring(0, 80), 'token:', token, 'volume:', store.volume)

      if (loadTimerRef.current) clearTimeout(loadTimerRef.current)
      loadTimerRef.current = setTimeout(() => {
        console.warn('[Player] load TIMEOUT — id:', item.id)
        advanceTo(currentIdxRef.current + 1)
        useStore.getState().setNotice('加载超时，已自动跳过')
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
          if (token !== currentToken) { playerLog('[Player] onplay IGNORED — stale token:', token); return }
          clearLoadTimer()
          playerLog('onplay id=', item.id, 'type=', item.item_type, 'dur=', howl.duration().toFixed(1), 'token=', token)

          autoPlayBlockNoticeShown = false
          const getPlayingNode = () => {
            const sounds: Array<{ _node?: HTMLAudioElement; _paused?: boolean }> = (howl as any)._sounds || []
            return sounds.find(s => s._node && !s._paused)?._node
          }
          const playingNode = getPlayingNode()
          if (playingNode) sharedAudioEl.current = playingNode

          setIsAudioLoading(false)
          setIsPlaying(true)
          setDuration(howl.duration())

          if (!isTTS) {
            recordListenEvent(item.id, 'started')
            useStore.getState().addToHistory(item)
          }

          if (progressRef.current) { clearInterval(progressRef.current); progressRef.current = undefined }
          let stuckSeconds = 0
          progressRef.current = setInterval(() => {
            if (token !== currentToken || howl !== howlRef.current) {
              clearInterval(progressRef.current!); progressRef.current = undefined
              return
            }
            const node = getPlayingNode() || ((howl as any)._sounds?.[0]?._node)
            const seek = node ? node.currentTime : (howl.seek() as number)
            setCurrentTime(seek)
            radioWS.send({ type: 'progress_report', queue_item_id: item.id, position_seconds: seek })
            if (seek < 0.05) {
              stuckSeconds++
              if (stuckSeconds >= 5) {
                playerLog('[Player] STUCK at index', currentIdxRef.current, '— skipping')
                clearInterval(progressRef.current!); progressRef.current = undefined
                advanceTo(currentIdxRef.current + 1)
                skipTrack()
              }
            } else { stuckSeconds = 0 }
          }, 1000)
        },
        onplayerror: () => {
          if (token !== currentToken) return
          clearLoadTimer()
          console.warn('[Player] onplayerror — id:', item.id)
          advanceTo(currentIdxRef.current + 1)
          skipTrack()
        },
        onend: () => {
          if (token !== currentToken) { playerLog('[Player] onend IGNORED — stale token:', token); return }
          clearLoadTimer()
          playerLog('[Player] onend — id:', item.id, 'type:', item.item_type, 'token:', token)

          if (!isTTS) {
            recordListenEvent(item.id, 'completed', howl.duration() || store.duration)
          }

          setIsPlaying(false)
          setCurrentTime(0); setDuration(0)
          if (progressRef.current) { clearInterval(progressRef.current); progressRef.current = undefined }

          advanceTo(currentIdxRef.current + 1)
          skipTrack()
        },
        onloaderror: (_id, err) => {
          if (token !== currentToken) return
          clearLoadTimer()
          console.error('[Player] onloaderror — id:', item.id, 'error:', err)
          radioWS.send({ type: 'error_report', queue_item_id: item.id, reason: `howler_error_${err}` })
          advanceTo(currentIdxRef.current + 1)
          skipTrack()
        },
        onpause: () => {
          if (token !== currentToken) return
          setIsPlaying(false)
        },
        onunlock: () => {
          if (token !== currentToken) return
          playerLog('[Player] onunlock — id:', item.id)
          if (howlRef.current === howl && !howl.playing()) {
            howl.play()
          }
          if (!autoPlayBlockNoticeShown) {
            autoPlayBlockNoticeShown = true
            useStore.getState().setNotice('点击开始播放')
          }
        },
      })

      howl.play()
      howlRef.current = howl
      howl.volume(store.volume)
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
        const startIdx = idx < queue.length ? idx : 0
        playerLog('[Player] auto-play → advanceTo(', startIdx, ')')
        advanceTo(startIdx)
      }, 30)
      return () => {
        clearTimeout(timer)
        // Do NOT reset globalAutoPlayed here — cleanup runs on StrictMode unmount,
        // and we don't want the second mount to fire another auto-play.
      }
    }
    if (queue.length === 0) {
      // Session ended — stop playback and reset state
      ++currentToken
      if (howlRef.current) {
        destroyHowl(howlRef.current)
        howlRef.current = null
        sharedAudioEl.current = null
      }
      if (progressRef.current) { clearInterval(progressRef.current); progressRef.current = undefined }
      if (loadTimerRef.current) { clearTimeout(loadTimerRef.current); loadTimerRef.current = undefined }
      setIsAudioLoading(false); setIsPlaying(false); setCurrentTime(0)
      autoPlayedRef.current = false
      globalAutoPlayed = false
    }
  }, [queue, advanceTo])

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
        autoPlayedRef.current = true
        setTimeout(() => {
          if (howlRef.current) {
            playerLog('[Player] WS playItem CANCELLED — howlRef already set')
            return
          }
          const idx = useStore.getState().currentIndex
          const startIdx = idx < (items as unknown[]).length ? idx : 0
          playerLog('[Player] WS handler → advanceTo(', startIdx, ')')
          advanceTo(startIdx)
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
    playerLog('SKIP currentIdx=', currentIdxRef.current)

    const store = useStore.getState()
    if (howlRef.current && store.currentItem && store.currentItem.item_type === 'song') {
      recordListenEvent(store.currentItem.id, 'skipped', store.currentTime)
    }

    radioWS.send({ type: 'command', action: 'skip' })
    skipTrack()

    const baseIdx = currentIdxRef.current === -1 ? queueIdxBeforeHistory.current : currentIdxRef.current
    advanceTo(baseIdx + 1)

    setTimeout(() => { isSkippingRef.current = false }, 300)
  }, [queue, advanceTo])

  const skipTo = useCallback(
    (queueItemId: number) => {
      const store = useStore.getState()
      const idx = store.queue.findIndex((item) => item.id === queueItemId)
      if (idx < 0 || idx === store.currentIndex) return

      // Track skip for current item
      if (howlRef.current && store.currentItem && store.currentItem.item_type === 'song') {
        recordListenEvent(store.currentItem.id, 'skipped', store.currentTime)
      }

      skipToTrack(queueItemId)
      currentIdxRef.current = idx
      setCurrentIndex(idx)
      advanceTo(idx)
    },
    [queue, advanceTo],
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

    // F20: Clean up existing Howl before creating history Howl
    ++currentToken
    if (howlRef.current) {
      destroyHowl(howlRef.current)
      howlRef.current = null
      sharedAudioEl.current = null
    }
    if (progressRef.current) { clearInterval(progressRef.current); progressRef.current = undefined }
    if (loadTimerRef.current) { clearTimeout(loadTimerRef.current); loadTimerRef.current = undefined }
    setIsAudioLoading(false)
    setIsPlaying(false)
    setCurrentTime(0)

    // Mark history mode: -1 means playing outside the queue
    currentIdxRef.current = -1
    setCurrentIndex(-1)
    playingSessionRef.current = store.session?.id ?? null

    const src = `/api/audio/music/${lastSong.song_id}?cid=${getClientId()}`

    // F6: Loading timeout for history songs too
    loadTimerRef.current = setTimeout(() => {
      console.warn('[Player] previous load TIMEOUT — id:', lastSong.id)
      useStore.getState().setNotice('加载超时，已返回队列')
      currentIdxRef.current = queueIdxBeforeHistory.current
      setCurrentIndex(queueIdxBeforeHistory.current)
      advanceTo(queueIdxBeforeHistory.current + 1)
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
        if (progressRef.current) { clearInterval(progressRef.current); progressRef.current = undefined }
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
        currentIdxRef.current = queueIdxBeforeHistory.current
        setCurrentIndex(queueIdxBeforeHistory.current)
        advanceTo(queueIdxBeforeHistory.current + 1)
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
  }, [queue, advanceTo])

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
    ++currentToken
    if (howlRef.current) {
      destroyHowl(howlRef.current)
      howlRef.current = null
      sharedAudioEl.current = null
    }
    if (progressRef.current) { clearInterval(progressRef.current); progressRef.current = undefined }
    if (loadTimerRef.current) { clearTimeout(loadTimerRef.current); loadTimerRef.current = undefined }
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
