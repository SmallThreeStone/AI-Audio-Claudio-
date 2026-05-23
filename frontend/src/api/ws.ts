type WSHandler = (msg: Record<string, unknown>) => void

class RadioWebSocket {
  private ws: WebSocket | null = null
  private handlers: Map<string, Set<WSHandler>> = new Map()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private manualClose = false

  connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${protocol}//${window.location.host}/ws/radio`

    this.ws = new WebSocket(url)

    this.ws.onopen = () => {
      console.log('[WS] Connected')
    }

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        const handlers = this.handlers.get(msg.type)
        if (handlers) {
          handlers.forEach((h) => h(msg))
        }
      } catch (e) {
        console.error('[WS] Parse error:', e)
      }
    }

    this.ws.onclose = () => {
      if (this.manualClose) {
        this.manualClose = false
        return
      }
      console.log('[WS] Disconnected, reconnecting in 3s...')
      this.reconnectTimer = setTimeout(() => this.connect(), 3000)
    }

    this.ws.onerror = (e) => {
      console.error('[WS] Error:', e)
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
    this.ws?.close()
    this.ws = null
  }
}

export const radioWS = new RadioWebSocket()
