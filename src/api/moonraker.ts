// Cliente JSON-RPC de Moonraker por WebSocket (el mismo canal que usan
// Mainsail y Fluidd). Reconecta solo y re-suscribe los objetos.

type Pending = { resolve: (v: any) => void; reject: (e: Error) => void }
type Handler = (params: any) => void

export class RpcError extends Error {
  code: number
  constructor(message: string, code: number) {
    super(message)
    this.code = code
  }
}

export class Moonraker {
  private ws: WebSocket | null = null
  private nextId = 1
  private pending = new Map<number, Pending>()
  private handlers = new Map<string, Set<Handler>>()
  private retry = 0
  private closedByUser = false
  readonly url: string

  onOpen: () => void = () => {}
  onClose: () => void = () => {}

  constructor(url: string) {
    this.url = url
  }

  /** ws://host/websocket por defecto; ?moonraker=host:puerto para otra máquina. */
  static defaultUrl(): string {
    const q = new URLSearchParams(location.search).get('moonraker')
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    return q ? `${proto}://${q}/websocket` : `${proto}://${location.host}/websocket`
  }

  connect() {
    this.closedByUser = false
    const ws = new WebSocket(this.url)
    this.ws = ws
    ws.onopen = () => {
      this.retry = 0
      this.onOpen()
    }
    ws.onclose = () => {
      for (const p of this.pending.values()) p.reject(new Error('Conexión perdida'))
      this.pending.clear()
      this.onClose()
      if (!this.closedByUser) {
        const delay = Math.min(1000 * 2 ** this.retry++, 8000)
        setTimeout(() => this.connect(), delay)
      }
    }
    ws.onmessage = (ev) => this.dispatch(JSON.parse(ev.data))
  }

  close() {
    this.closedByUser = true
    this.ws?.close()
  }

  get connected() {
    return this.ws?.readyState === WebSocket.OPEN
  }

  private dispatch(msg: any) {
    if (msg.id !== undefined && this.pending.has(msg.id)) {
      const p = this.pending.get(msg.id)!
      this.pending.delete(msg.id)
      if (msg.error) p.reject(new RpcError(msg.error.message ?? String(msg.error), msg.error.code ?? -1))
      else p.resolve(msg.result)
      return
    }
    if (msg.method) {
      for (const h of this.handlers.get(msg.method) ?? []) h(msg.params)
    }
  }

  call<T = any>(method: string, params?: Record<string, unknown>): Promise<T> {
    if (!this.connected) return Promise.reject(new Error('Sin conexión con Moonraker'))
    const id = this.nextId++
    const body: any = { jsonrpc: '2.0', method, id }
    if (params) body.params = params
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws!.send(JSON.stringify(body))
    })
  }

  on(method: string, h: Handler): () => void {
    if (!this.handlers.has(method)) this.handlers.set(method, new Set())
    this.handlers.get(method)!.add(h)
    return () => this.handlers.get(method)!.delete(h)
  }
}
