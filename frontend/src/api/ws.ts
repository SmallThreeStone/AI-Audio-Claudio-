type WSHandler = (msg: Record<string, unknown>) => void

class RadioWebSocket {
  private ws: WebSocket | null = null
  private handlers: Map<string, Set<WSHandler>> = new Map()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private pingTimer: ReturnType<typeof setInterval> | null = null
  private pongTimer: ReturnType<typeof setTimeout> | null = null
  private manualClose = false

  connect(userId: number = 0) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${protocol}//${window.location.host}/ws/radio?user_id=${userId}`

    this.ws = new WebSocket(url)

    this.ws.onopen = () => {
      // Start heartbeat
      this.pingTimer = setInterval(() => {
        this.send({ type: 'ping' })
        // Expect pong within 10s, otherwise reconnect
        this.pongTimer = setTimeout(() => {
          if (this.ws) {
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
        const handlers = this.handlers.get(msg.type)
        if (handlers) {
          handlers.forEach((h) => h(msg))
        }
      } catch (e) {
        if (import.meta.env.DEV) console.error('[WS] Parse error:', e)
      }
    }

    this.ws.onclose = () => {
      this.clearTimers()
      if (this.manualClose) {
        this.manualClose = false
        return
      }
      this.reconnectTimer = setTimeout(() => this.connect(userId), 3000)
    }

    this.ws.onerror = () => {
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
      this.ws.send(JSON.stringify(msg))
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
