import { useEffect, useRef, useCallback } from 'react'
import { Howl } from 'howler'
import { useStore } from '../store'
import { radioWS } from '../api/ws'
import { skipTrack, skipToTrack, stopRadio, recordListenEvent } from '../api/radio'

const playerLog = (...args: unknown[]) => {
  if (import.meta.env.DEV) console.log(`[${performance.now().toFixed(0)}ms]`, ...args)
}
import { getClientId } from '../utils/clientId'
import { sharedAudioEl } from './useAudioVisualizer'

// Module-level guards survive React StrictMode double-mount in development,
// which resets component refs and would otherwise cause double auto-play.
let globalAutoPlayed = false
let lastProcessedNewSession = 0  // dedup WS "new session" events
let autoPlayBlockNoticeShown = false  // show "click to play" notice only once
const deadHowls = new WeakSet<Howl>()
let currentToken = 0
// F38: Module-level Howl ref — survives React StrictMode double-mount.
// useRef would create two separate refs, and callbacks from the first mount
// can't see updates made by the second mount.
let _howl: Howl | null = null
let _soundId: number | null = null
let _playingSession: number | null = null  // F38: module-level, survives StrictMode

function isTtsItem(item?: { item_type?: string } | null) {
  return !!item?.item_type?.startsWith('tts')
}

function transitionDelay(from?: { item_type?: string } | null, to?: { item_type?: string } | null, manual = false) {
  if (manual) return 90
  if (!from || !to) return 180
  if (isTtsItem(from) && !isTtsItem(to)) return 520
  if (!isTtsItem(from) && isTtsItem(to)) return 700
  return 260
}

function introVolume(item: { item_type?: string }, volume: number) {
  return isTtsItem(item) ? Math.min(volume, 0.92) : Math.max(0.01, volume * 0.72)
}

function fadeInDuration(item: { item_type?: string }) {
  return isTtsItem(item) ? 180 : 650
}

function bindSoundId(howl: Howl, soundId?: number | null) {
  if (howl !== _howl || soundId == null) return
  _soundId = soundId
}

function clearSoundId(howl: Howl | null) {
  if (!howl || howl === _howl) _soundId = null
}

function getSoundNode(howl: Howl, soundId?: number | null) {
  const sounds: Array<{ _id?: number; _node?: HTMLAudioElement; _paused?: boolean }> = (howl as any)._sounds || []
  return sounds.find(s => soundId != null && s._id === soundId)?._node
    || sounds.find(s => s._node && !s._paused)?._node
    || sounds.find(s => s._node)?._node
}

function howlSeek(howl: Howl, soundId?: number | null) {
  const seek = soundId != null ? howl.seek(soundId) : howl.seek()
  return typeof seek === 'number' ? seek : 0
}

function destroyHowl(h: Howl | null) {
  if (!h) return
  deadHowls.add(h)
  // F37: Stop + unload is enough — the HTMLAudioElement pauses and src clears.
  // When the element is reused from Howler's pool, the existing MediaElementAudioSourceNode
  // (if any) will read the new audio data automatically. Don't disconnect sources —
  // disconnect()+connect() on the same source node can fail to re-establish the audio chain.
  h.off('end')
  h.off('play')
  h.off('loaderror')
  h.off('pause')
  h.off('playerror')
  h.off('unlock')
  h.volume(0)
  h.stop()
  h.unload()
  clearSoundId(h)
}

export function useRadioPlayer() {
  const {
    queue, currentIndex, volume,
    setCurrentTime, setDuration, setCurrentItem, setIsPlaying,
    setCurrentIndex, setSession, setQueue, setIsAudioLoading,
  } = useStore()
  const progressRef = useRef<ReturnType<typeof setInterval>>(undefined)
  const currentIdxRef = useRef(currentIndex)
  const autoPlayedRef = useRef(false)
  const isSkippingRef = useRef(false)
  const queueIdxBeforeHistory = useRef(0)
  const loadTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const prevGenerationRef = useRef(0)

  useEffect(() => {
    currentIdxRef.current = currentIndex
  }, [currentIndex])

  // F30: Centralized track advancement — single entry point for ALL skip/next paths
  const advanceTo = useCallback((nextIndex: number, manual = false) => {
    ++currentToken
    const myToken = currentToken
    const hadHowl = !!_howl
    const store = useStore.getState()
    const fromItem = store.currentItem
    const toItem = store.queue[nextIndex]
    const delay = transitionDelay(fromItem, toItem, manual)
    playerLog('advanceTo idx=', nextIndex, 'token=', myToken, 'hadHowl=', hadHowl, 'delay=', delay)

    if (_howl) {
      const sounds: Array<{ _node?: HTMLAudioElement }> = (_howl as any)._sounds || []
      playerLog('advanceTo destroying Howl, _sounds.length=', sounds.length,
        sounds.map((s, i) => `[${i}]:muted=${s._node?.muted},paused=${s._node?.paused}`).join(' '))
      if (manual) {
        _howl.fade(_howl.volume(), 0.01, 180)
      }
      const oldHowl = _howl
      _howl = null
      _soundId = null
      sharedAudioEl.current = null
      playerLog('howlRef → null (advanceTo cleanup)')
      setTimeout(() => destroyHowl(oldHowl), manual ? 190 : 0)
    }
    if (progressRef.current) { clearInterval(progressRef.current); progressRef.current = undefined }
    if (loadTimerRef.current) { clearTimeout(loadTimerRef.current); loadTimerRef.current = undefined }
    setIsAudioLoading(false); setIsPlaying(false); setCurrentTime(0); setDuration(0)

    if (nextIndex >= store.queue.length) {
      radioWS.send({ type: 'refill' })
      return
    }

    setTimeout(() => playItem(nextIndex, myToken), delay)
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
      if (item.status !== 'ready') {
        playerLog('[Player] playItem — item not ready, skipping id=', item.id, 'status=', item.status)
        if (item.status === 'error') {
          useStore.getState().setNotice(item.recovery_hint || '???????AI DJ ????????')
        }
        advanceTo(index + 1, true)
        return
      }
      playerLog('playItem idx=', index, 'id=', item.id, 'type=', item.item_type, 'token=', token)

      setCurrentItem(item)
      setCurrentIndex(index)
      currentIdxRef.current = index
      _playingSession = useStore.getState().session?.id ?? null

      const isTTS = item.item_type.startsWith('tts')
      const src = isTTS ? item.tts_audio_url : `/api/audio/music/${item.song_id}?qid=${item.id}&cid=${getClientId()}`

      if (!src) {
        playerLog('[Player] playItem — no src, advancing')
        radioWS.send({ type: 'error_report', queue_item_id: item.id, reason: 'no_url' })
        useStore.getState().setNotice('?????????????AI DJ ?????')
        advanceTo(index + 1, true)
        return
      }

      setIsAudioLoading(true)
      const store = useStore.getState()

      playerLog('[Player] playItem — creating Howl, src:', src.substring(0, 80), 'token:', token, 'volume:', store.volume)

      if (loadTimerRef.current) clearTimeout(loadTimerRef.current)
      loadTimerRef.current = setTimeout(() => {
        console.warn('[Player] load TIMEOUT — id:', item.id)
        advanceTo(currentIdxRef.current + 1, true)
        useStore.getState().setNotice('加载超时，已自动跳过')
      }, 30000)

      const clearLoadTimer = () => {
        if (loadTimerRef.current) {
          clearTimeout(loadTimerRef.current)
          loadTimerRef.current = undefined
        }
      }

      const targetVolume = store.volume
      const startVolume = introVolume(item, targetVolume)
      const howl = new Howl({
        src: [src],
        html5: true,
        volume: startVolume,
        format: ['mp3'],
        onplay: (soundId) => {
          bindSoundId(howl, soundId)
          if (token !== currentToken) { playerLog('[Player] onplay IGNORED — stale token:', token); return }
          clearLoadTimer()
          playerLog('onplay id=', item.id, 'type=', item.item_type, 'dur=', howl.duration().toFixed(1), 'token=', token)

          autoPlayBlockNoticeShown = false
          const getPlayingNode = () => getSoundNode(howl, _soundId)
          const playingNode = getPlayingNode()
          if (playingNode) sharedAudioEl.current = playingNode
          if (targetVolume > startVolume) {
            howl.fade(startVolume, targetVolume, fadeInDuration(item))
          } else {
            howl.volume(targetVolume)
          }

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
            if (token !== currentToken || howl !== _howl) {
              clearInterval(progressRef.current!); progressRef.current = undefined
              return
            }
            const node = getPlayingNode() || ((howl as any)._sounds?.[0]?._node)
            const seek = node ? node.currentTime : howlSeek(howl, _soundId)
            setCurrentTime(seek)
            radioWS.send({ type: 'progress_report', queue_item_id: item.id, position_seconds: seek })
            const activelyPlaying = _soundId != null ? howl.playing(_soundId) : howl.playing()
            if (activelyPlaying && seek < 0.05) {
              stuckSeconds++
              if (stuckSeconds >= 5) {
                playerLog('[Player] STUCK at index', currentIdxRef.current, '— skipping')
                clearInterval(progressRef.current!); progressRef.current = undefined
                advanceTo(currentIdxRef.current + 1, true)
                skipTrack()
              }
            } else { stuckSeconds = 0 }
          }, 1000)
        },
        onplayerror: () => {
          if (token !== currentToken) return
          clearLoadTimer()
          console.warn('[Player] onplayerror — id:', item.id)
          useStore.getState().setNotice('??????AI DJ ????????')
          advanceTo(currentIdxRef.current + 1, true)
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
          clearSoundId(howl)
          if (progressRef.current) { clearInterval(progressRef.current); progressRef.current = undefined }

          advanceTo(currentIdxRef.current + 1)
          skipTrack()
        },
        onloaderror: (_id, err) => {
          if (token !== currentToken) return
          clearLoadTimer()
          console.error('[Player] onloaderror — id:', item.id, 'error:', err)
          radioWS.send({ type: 'error_report', queue_item_id: item.id, reason: `howler_error_${err}` })
          useStore.getState().setNotice('???????AI DJ ??????')
          advanceTo(currentIdxRef.current + 1, true)
          skipTrack()
        },
        onpause: () => {
          if (token !== currentToken) return
          setIsPlaying(false)
        },
        onunlock: () => {
          if (token !== currentToken) return
          playerLog('[Player] onunlock — id:', item.id)
          if (_howl === howl && !howl.playing()) {
            const nextSoundId = _soundId != null ? howl.play(_soundId) : howl.play()
            bindSoundId(howl, nextSoundId)
          }
          if (!autoPlayBlockNoticeShown) {
            autoPlayBlockNoticeShown = true
            useStore.getState().setNotice('点击开始播放')
          }
        },
      })

      _howl = howl
      _soundId = howl.play()
      playerLog('howlRef → Howl id=', item.id, 'type=', item.item_type)
    },
    [queue.length],
  )

  // Auto-play when queue updates (page refresh / new session)
  useEffect(() => {
    if (queue.length > 0 && !_howl && !globalAutoPlayed && !autoPlayedRef.current) {
      playerLog('[Player] auto-play triggered — queue length:', queue.length, 'currentIndex:', useStore.getState().currentIndex)
      autoPlayedRef.current = true
      globalAutoPlayed = true
      // Short delay to survive React StrictMode double-mount cycle
      // and ensure all batched state updates have flushed before starting playback.
      // globalAutoPlayed (module-level) handles the double-mount guard, so 30ms is enough.
      const timer = setTimeout(() => {
        if (_howl) {
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
      if (_howl) {
        playerLog('howlRef → null (queue empty cleanup)')
        destroyHowl(_howl)
        _howl = null
        _soundId = null
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
      if (items && items.length > 0 && newSessionId !== undefined && newSessionId !== _playingSession) {
        // Dedup: if we already processed this session (duplicate WS message or handler),
        // skip — otherwise two playItem chains race and kill each other's Howls.
        if (newSessionId === lastProcessedNewSession) {
          playerLog('[Player] WS new session — id', newSessionId, 'already processed, skipping duplicate')
          return
        }
        lastProcessedNewSession = newSessionId
        playerLog('[Player] WS new session detected — id:', newSessionId, 'prev playingSession:', _playingSession)
        // Page refresh recovery: if playingSessionRef was null (just refreshed) AND
        // the store already has a queue (hydrate completed), skip — auto-play handles it.
        // Use getState() not autoPlayedRef because the WS message may arrive before
        // React re-renders (Zustand state is synchronous, refs update in effects).
        const wasNull = _playingSession === null
        _playingSession = newSessionId
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
          if (_howl) {
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
    if (_howl) {
      _howl.volume(volume)
    }
  }, [volume])

  const skip = useCallback(() => {
    if (isSkippingRef.current) return
    isSkippingRef.current = true
    playerLog('SKIP currentIdx=', currentIdxRef.current)

    const store = useStore.getState()
    if (_howl && store.currentItem && store.currentItem.item_type === 'song') {
      recordListenEvent(store.currentItem.id, 'skipped', store.currentTime)
    }

    radioWS.send({ type: 'command', action: 'skip' })
    skipTrack()

    const baseIdx = currentIdxRef.current === -1 ? queueIdxBeforeHistory.current : currentIdxRef.current
    advanceTo(baseIdx + 1, true)

    setTimeout(() => { isSkippingRef.current = false }, 300)
  }, [queue, advanceTo])

  const skipTo = useCallback(
    (queueItemId: number) => {
      const store = useStore.getState()
      const idx = store.queue.findIndex((item) => item.id === queueItemId)
      if (idx < 0 || idx === store.currentIndex) return

      // Track skip for current item
      if (_howl && store.currentItem && store.currentItem.item_type === 'song') {
        recordListenEvent(store.currentItem.id, 'skipped', store.currentTime)
      }

      skipToTrack(queueItemId)
      currentIdxRef.current = idx
      setCurrentIndex(idx)
      advanceTo(idx, true)
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
    if (_howl) {
      destroyHowl(_howl)
      _howl = null
      _soundId = null
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
    _playingSession = store.session?.id ?? null

    const src = `/api/audio/music/${lastSong.song_id}?qid=${lastSong.id}&cid=${getClientId()}`

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
      onplay: (soundId) => {
        bindSoundId(howl, soundId)
        if (prevGen !== prevGenerationRef.current) return  // F3: generation guard
        clearLoadTimer()
        // F3: Expose audio element for visualizer
        const audioNode = getSoundNode(howl, _soundId)
        if (audioNode) sharedAudioEl.current = audioNode
        setIsAudioLoading(false)
        setIsPlaying(true)
        const dur = howl.duration()
        setDuration(dur)
        recordListenEvent(lastSong.id, 'started')
        if (progressRef.current) { clearInterval(progressRef.current); progressRef.current = undefined }
        progressRef.current = setInterval(() => {
          const audioNode = getSoundNode(howl, _soundId)
          const seek = audioNode ? audioNode.currentTime : howlSeek(howl, _soundId)
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
        if (_howl === howl) {
          _howl = null
          _soundId = null
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
        clearSoundId(howl)
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
        if (_howl === howl) {
          _howl = null
          _soundId = null
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
        if (_howl === howl && !howl.playing()) {
          const nextSoundId = _soundId != null ? howl.play(_soundId) : howl.play()
          bindSoundId(howl, nextSoundId)
        }
      },
    })
    _howl = howl
    _soundId = howl.play()
    setCurrentItem(lastSong)

    setTimeout(() => { isSkippingRef.current = false }, 300)
  }, [queue, advanceTo])

  const togglePause = useCallback(() => {
    if (!_howl) return
    const activeSoundId = _soundId
    const isPlaying = activeSoundId != null ? _howl.playing(activeSoundId) : _howl.playing()
    if (isPlaying) {
      if (activeSoundId != null) _howl.pause(activeSoundId)
      else _howl.pause()
      setIsPlaying(false)
    } else {
      const savedPosition = activeSoundId != null ? howlSeek(_howl, activeSoundId) : useStore.getState().currentTime
      const nextSoundId = activeSoundId != null ? _howl.play(activeSoundId) : _howl.play()
      bindSoundId(_howl, nextSoundId)
      if (savedPosition > 0.05) {
        _howl.seek(savedPosition, nextSoundId)
      }
      setIsPlaying(true)
    }
  }, [setIsPlaying])

  const stop = useCallback(() => {
    playerLog('[Player] stop')
    ++currentToken
    if (_howl) {
      destroyHowl(_howl)
      _howl = null
      _soundId = null
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
    if (_howl) {
      if (_soundId != null) _howl.seek(time, _soundId)
      else _howl.seek(time)
      setCurrentTime(time)
    }
  }, [setCurrentTime])

  return { skip, skipTo, stop, togglePause, seek, previous }
}
