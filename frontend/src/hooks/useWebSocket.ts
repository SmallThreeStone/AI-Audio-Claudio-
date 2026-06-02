import { useEffect, useCallback } from 'react'
import { radioWS } from '../api/ws'
import { useStore } from '../store'
import { getQueue } from '../api/radio'
import type { QueueItem, DJSession } from '../types'

let playbackErrorStreak = 0

export function useWebSocket() {
  const { user, setQueue, setSession, setIsGenerating, setCurrentItem, setCurrentIndex, setGenerationProgress, setIsRestoring, setNotice } = useStore()

  // Hydrate queue on mount (in case of page refresh mid-session)
  const hydrate = useCallback(async () => {
    const store = useStore.getState()
    store.setIsRestoring(true)
    try {
      const data = await getQueue()
      if (data.session) {
        store.setSession(data.session as DJSession)
      }
      if (data.items?.length > 0) {
        store.setQueue(data.items as QueueItem[])
        store.setCurrentIndex(data.playing_index || 0)
        const current = (data.items as QueueItem[]).find(
          (i: QueueItem) => i.position === (data.playing_index || 0)
        )
        if (current) store.setCurrentItem(current)
      }
    } catch {
      // silent - no active session
    } finally {
      useStore.getState().setIsRestoring(false)
    }
  }, [])

  useEffect(() => {
    // Wait until we have a real user ID before connecting
    const userId = user?.id
    if (!userId) return

    hydrate()
    radioWS.connect(userId)

    const unsub1 = radioWS.on('queue_update', (msg) => {
      const items = msg.items as QueueItem[]
      const prevLen = useStore.getState().queue.length

      setQueue(items)
      // Do NOT setCurrentIndex here — the backend's playing_index can lag
      // behind the frontend's actual position (e.g. after onloaderror skip).
      // useRadioPlayer.playItem() is the sole authority for currentIndex/currentItem.

      // F12: Detect refill completion — queue grew with new songs
      const newLen = items.length
      if (prevLen > 0 && newLen > prevLen && items[newLen - 1]?.position > prevLen) {
        const store = useStore.getState()
        const status = (msg.session as DJSession)?.status
        if (status !== 'generating') {
          store.setNotice(`续杯完成，新增 ${newLen - prevLen} 首歌曲`)
        }
      }

      // Session is now included in queue_update
      if (msg.session) {
        setSession(msg.session as DJSession)
        const status = (msg.session as DJSession).status
        setIsGenerating(status === 'generating' || status === 'refilling')
      }

      // Clear generation progress
      setGenerationProgress('', '')
    })

    const unsub2 = radioWS.on('session_status', (msg) => {
      if (msg.session) {
        setSession(msg.session as DJSession)
        const status = (msg.session as DJSession).status
        setIsGenerating(status === 'generating' || status === 'refilling')
        // Session ended — clear queue and notify user
        if (status === 'completed') {
          const store = useStore.getState()
          store.setQueue([])
          store.setCurrentItem(null)
          store.setCurrentTime(0)
          store.setDuration(0)
          store.setIsPlaying(false)
          store.setNotice(msg.message as string || '本期电台已结束')
        }
      }
    })

    const unsub3 = radioWS.on('progress', () => {
      playbackErrorStreak = 0
    })

    const unsub4 = radioWS.on('error', (msg) => {
      console.warn('[WS] Error:', msg.message, 'queue_item_id:', msg.queue_item_id)
      const raw = String(msg.message || '')
      const errMsg = raw.includes('howler') || raw.includes('Song URL')
        ? '这首歌暂时拿不到播放链接'
        : raw || '歌曲加载失败'
      playbackErrorStreak += 1
      if (playbackErrorStreak >= 3) {
        setNotice('连续多首歌曲无法播放，网易云登录可能已过期，建议重新登录或刷新歌单')
      } else {
        setNotice(`${errMsg}，已自动切到下一项`)
      }
    })

    const unsub5 = radioWS.on('generation_progress', (msg) => {
      setGenerationProgress(msg.stage as string, msg.message as string)
    })

    return () => {
      unsub1()
      unsub2()
      unsub3()
      unsub4()
      unsub5()
      radioWS.disconnect()
    }
  }, [user?.id])
}
