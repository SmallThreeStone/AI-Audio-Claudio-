import { useEffect, useCallback } from 'react'
import { radioWS } from '../api/ws'
import { useStore } from '../store'
import { getQueue } from '../api/radio'
import type { QueueItem, DJSession } from '../types'

export function useWebSocket() {
  const { user, setQueue, setCurrentIndex, setSession, setIsGenerating, setCurrentItem, setGenerationProgress, setIsRestoring } = useStore()

  // Hydrate queue on mount (in case of page refresh mid-session)
  const hydrate = useCallback(async () => {
    setIsRestoring(true)
    try {
      const data = await getQueue()
      if (data.session) {
        setSession(data.session as DJSession)
      }
      if (data.items?.length > 0) {
        setQueue(data.items as QueueItem[])
        setCurrentIndex(data.playing_index || 0)
        const current = (data.items as QueueItem[]).find(
          (i: QueueItem) => i.position === (data.playing_index || 0)
        )
        if (current) setCurrentItem(current)
      }
    } catch {
      // silent - no active session
    } finally {
      setIsRestoring(false)
    }
  }, [])

  useEffect(() => {
    hydrate()
    const userId = user?.id || 0
    radioWS.connect(userId)

    const unsub1 = radioWS.on('queue_update', (msg) => {
      const items = msg.items as QueueItem[]
      const playingIndex = msg.playing_index as number
      setQueue(items)
      setCurrentIndex(playingIndex)

      // Set current item
      const current = items.find((i) => i.position === playingIndex)
      if (current) {
        setCurrentItem(current)
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
      }
    })

    const unsub3 = radioWS.on('progress', () => {
      // Progress updates for sync display
    })

    const unsub4 = radioWS.on('error', (msg) => {
      if (import.meta.env.DEV) console.warn('[WS] Error:', msg.message)
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
