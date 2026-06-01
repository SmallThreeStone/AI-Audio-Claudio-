type WSHandler = (msg: Record<string, unknown>) => void

const wsLog = (...args: unknown[]) => { if (import.meta.env.DEV) console.log('[WS]', ...args) }

class RadioWebSocket {
  private ws: WebSocket | null = null
  private handlers: Map<string, Set<WSHandler>> = new Map()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private pingTimer: ReturnType<typeof setInterval> | null = null
  private pongTimer: ReturnType<typeof setTimeout> | null = null
  private manualClose = false
  private userId = 0  // F10: store as instance property to avoid closure staleness

  connect(userId: number = 0) {
    this.userId = userId
    wsLog('connect — userId:', userId)
    // Close any existing connection before creating a new one —
    // otherwise the old WS leaks and duplicate handlers fire.
    if (this.ws) {
      this.manualClose = true
      this.ws.close()
      this.ws = null
    }
    this.manualClose = false
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${protocol}//${window.location.host}/ws/radio?user_id=${userId}`

    wsLog('connecting to:', url)
    this.ws = new WebSocket(url)

    this.ws.onopen = () => {
      wsLog('OPEN')
      // Start heartbeat
      this.pingTimer = setInterval(() => {
        this.send({ type: 'ping' })
        // Expect pong within 10s, otherwise reconnect
        this.pongTimer = setTimeout(() => {
          if (this.ws) {
            wsLog('pong timeout — closing')
            this.ws.close()
          }
        }, 10000)
      }, 30000)
    }

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === 'pong') {
          if (this.pongTimer) {
            clearTimeout(this.pongTimer)
            this.pongTimer = null
          }
          return
        }
        wsLog('rx', msg.type,
          msg.type === 'queue_update'
            ? `session=${(msg.session as Record<string,unknown>|null)?.id ?? 'null'} items=${(msg.items as unknown[])?.length ?? 0} playing=${msg.playing_index ?? '?'}`
            : msg.type === 'generation_progress'
              ? `${msg.stage}: ${msg.message}`
              : '')
        const handlers = this.handlers.get(msg.type)
        if (handlers) {
          handlers.forEach((h) => h(msg))
        } else {
          wsLog('rx', msg.type, '— NO HANDLERS registered')
        }
      } catch (e) {
        if (import.meta.env.DEV) console.error('[WS] Parse error:', e)
      }
    }

    this.ws.onclose = () => {
      wsLog('CLOSE manualClose:', this.manualClose)
      this.clearTimers()
      if (this.manualClose) {
        this.manualClose = false
        return
      }
      wsLog('reconnecting in 3s...')
      this.reconnectTimer = setTimeout(() => this.connect(this.userId), 3000)
    }

    this.ws.onerror = (e) => {
      wsLog('ERROR', e)
      // onclose will fire after this and trigger reconnect
    }
  }

  private clearTimers() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer)
      this.pingTimer = null
    }
    if (this.pongTimer) {
      clearTimeout(this.pongTimer)
      this.pongTimer = null
    }
  }

  on(type: string, handler: WSHandler) {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set())
    }
    this.handlers.get(type)!.add(handler)
    return () => {
      this.handlers.get(type)?.delete(handler)
    }
  }

  send(msg: Record<string, unknown>) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      wsLog('tx', msg.type, msg.type === 'progress_report' ? `id=${msg.queue_item_id} pos=${msg.position_seconds}` : '')
      this.ws.send(JSON.stringify(msg))
    } else {
      wsLog('tx DROPPED — WS not open, readyState:', this.ws?.readyState, 'type:', msg.type)
    }
  }

  disconnect() {
    this.manualClose = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.clearTimers()
    this.ws?.close()
    this.ws = null
  }
}

export const radioWS = new RadioWebSocket()
