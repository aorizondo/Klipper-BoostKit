// Estado de la impresora (espejo de los objetos de Klipper vía Moonraker).
import { reactive, computed } from 'vue'
import { Moonraker } from '../api/moonraker'

export type Status = Record<string, any>

interface LogLine {
  t: number
  kind: 'cmd' | 'resp' | 'err'
  text: string
}
interface Toast {
  id: number
  kind: 'info' | 'ok' | 'err'
  text: string
}

const SUBSCRIBE_PREFIXES = [
  'webhooks', 'heaters', 'print_stats', 'virtual_sdcard', 'toolhead', 'gcode_move', 'motion_report',
  'extruder', 'heater_bed', 'heater_generic ', 'temperature_sensor ', 'temperature_fan ',
  'fan', 'fan_generic ', 'heater_fan ', 'controller_fan ', 'idle_timeout', 'pause_resume',
  'probe', 'bed_mesh', 'screws_tilt_adjust', 'exclude_object', 'gcode_macro _', 'output_pin ',
  'query_endstops', 'manual_probe', 'system_stats', 'accel_endstop', 'firmware_retraction', 'boostkit',
]

export const state = reactive({
  connected: false,
  klippy: 'disconnected' as string, // ready | startup | shutdown | error | disconnected
  klippyMessage: '',
  objects: [] as string[],
  status: {} as Status,
  settings: {} as Status, // configfile.settings
  saveConfigPending: false,
  log: [] as LogLine[],
  toasts: [] as Toast[],
  busy: 0,
  prefs: {
    presets: [
      { name: 'PLA', extruder: 205, bed: 60 },
      { name: 'PETG', extruder: 235, bed: 75 },
      { name: 'TPU', extruder: 225, bed: 50 },
    ] as { name: string; extruder: number; bed: number }[],
    jogSteps: [0.1, 1, 10, 50] as number[],
    jogFeedXY: 3000,
    jogFeedZ: 600,
    babySteps: [0.01, 0.025, 0.05, 0.1] as number[],
    extrudeLen: 10,
    extrudeSpeed: 5,
  },
})

export const api = new Moonraker(Moonraker.defaultUrl())

let toastId = 1
export function toast(text: string, kind: Toast['kind'] = 'info', ms = 4000) {
  if (state.toasts.some((t) => t.text === text)) return // Klipper repite el error (respuesta + RPC)
  const id = toastId++
  state.toasts.push({ id, kind, text })
  setTimeout(() => {
    const i = state.toasts.findIndex((t) => t.id === id)
    if (i >= 0) state.toasts.splice(i, 1)
  }, ms)
}

function pushLog(kind: LogLine['kind'], text: string) {
  const last = state.log[state.log.length - 1]
  if (kind === 'err' && last?.kind === 'err' && last.text === text) return
  state.log.push({ t: Date.now(), kind, text })
  if (state.log.length > 500) state.log.splice(0, state.log.length - 500)
}

function merge(target: Status, diff: Status) {
  for (const [obj, fields] of Object.entries(diff)) {
    if (!target[obj]) target[obj] = {}
    Object.assign(target[obj], fields)
  }
}

/** Envía G-code. Devuelve true si Klipper respondió ok. */
export async function gcode(script: string, opts: { quiet?: boolean; silent?: boolean } = {}): Promise<boolean> {
  if (!opts.silent) pushLog('cmd', script)
  state.busy++
  try {
    await api.call('printer.gcode.script', { script })
    return true
  } catch (e: any) {
    const msg = String(e.message ?? e).replace(/^!!\s*/, '')
    pushLog('err', msg)
    if (!opts.quiet) toast(msg, 'err', 7000)
    return false
  } finally {
    state.busy--
  }
}

async function loadPrefs() {
  try {
    const r = await api.call('server.database.get_item', { namespace: 'boostkit', key: 'prefs' })
    Object.assign(state.prefs, r.value ?? {})
  } catch {
    const local = localStorage.getItem('boostkit.prefs')
    if (local) Object.assign(state.prefs, JSON.parse(local))
  }
}

export async function savePrefs() {
  const value = JSON.parse(JSON.stringify(state.prefs))
  localStorage.setItem('boostkit.prefs', JSON.stringify(value))
  try {
    await api.call('server.database.post_item', { namespace: 'boostkit', key: 'prefs', value })
  } catch {
    /* sin base de datos: queda en localStorage */
  }
}

async function initKlippy() {
  const info = await api.call('server.info')
  state.klippy = info.klippy_state ?? (info.klippy_connected ? 'startup' : 'disconnected')
  if (state.klippy !== 'ready') {
    try {
      const pi = await api.call('printer.info')
      state.klippy = pi.state
      state.klippyMessage = pi.state_message ?? ''
    } catch {
      /* klippy no conectado todavía */
    }
    return
  }
  const { objects } = await api.call('printer.objects.list')
  state.objects = objects
  const wanted: Record<string, null> = {}
  for (const o of objects as string[]) {
    if (SUBSCRIBE_PREFIXES.some((p) => o === p.trim() || o.startsWith(p))) wanted[o] = null
  }
  const sub = await api.call('printer.objects.subscribe', { objects: wanted })
  state.status = {}
  merge(state.status, sub.status)
  const cfg = await api.call('printer.objects.query', {
    objects: { configfile: ['settings', 'save_config_pending'] },
  })
  state.settings = cfg.status.configfile.settings
  state.saveConfigPending = cfg.status.configfile.save_config_pending
  try {
    hooks.tempStore(await api.call('server.temperature_store'))
  } catch {
    /* sin historial */
  }
}

/** Enganches para otros módulos (evita importaciones circulares). */
export const hooks = { tempStore: (_store: any) => {} }

export function start() {
  api.onOpen = async () => {
    state.connected = true
    try {
      await api.call('server.connection.identify', {
        client_name: 'BoostKit', version: '0.1.0', type: 'web', url: 'https://github.com/aorizondo/Klipper-BoostKit',
      })
    } catch {
      /* versiones antiguas de Moonraker */
    }
    await loadPrefs()
    await initKlippy().catch((e) => toast(String(e.message ?? e), 'err'))
  }
  api.onClose = () => {
    state.connected = false
    state.klippy = 'disconnected'
  }
  api.on('notify_status_update', (p) => merge(state.status, p[0]))
  api.on('notify_gcode_response', (p) => {
    const line = String(p[0])
    const m = /^\/\/ action:(prompt_\w+)\s?(.*)$/.exec(line)
    if (m) return onPrompt(m[1], m[2])
    if (line.startsWith('!!')) {
      pushLog('err', line.slice(2).trim())
      toast(line.slice(2).trim(), 'err', 7000)
    } else pushLog('resp', line.replace(/^\/\/\s?/, ''))
  })
  api.on('notify_klippy_ready', () => {
    state.klippy = 'ready'
    initKlippy()
  })
  api.on('notify_klippy_shutdown', () => {
    state.klippy = 'shutdown'
    api.call('printer.info').then((pi) => (state.klippyMessage = pi.state_message)).catch(() => {})
  })
  api.on('notify_klippy_disconnected', () => {
    state.klippy = 'disconnected'
  })
  api.connect()
}

// --------------------------------------------- diálogos de macros (action:prompt_*)
// Protocolo de Mainsail/Fluidd: las macros (p.ej. la sonda manual) abren
// diálogos con botones que ejecutan G-code.
export interface PromptButton { label: string; gcode: string; color: string }
export interface PromptItem { kind: 'text' | 'button' | 'group'; text?: string; button?: PromptButton; buttons?: PromptButton[] }

export const prompt = reactive({
  open: false,
  title: '',
  items: [] as PromptItem[],
  footer: [] as PromptButton[],
  group: null as PromptButton[] | null,
})

function parseButton(arg: string): PromptButton {
  const [label, gc, color] = arg.split('|')
  return { label: label.trim(), gcode: (gc ?? label).trim(), color: (color ?? '').trim() }
}

function onPrompt(cmd: string, arg: string) {
  switch (cmd) {
    case 'prompt_begin':
      Object.assign(prompt, { open: false, title: arg, items: [], footer: [], group: null })
      break
    case 'prompt_text':
      prompt.items.push({ kind: 'text', text: arg })
      break
    case 'prompt_button':
      if (prompt.group) prompt.group.push(parseButton(arg))
      else prompt.items.push({ kind: 'button', button: parseButton(arg) })
      break
    case 'prompt_button_group_start':
      prompt.group = []
      break
    case 'prompt_button_group_end':
      if (prompt.group) prompt.items.push({ kind: 'group', buttons: prompt.group })
      prompt.group = null
      break
    case 'prompt_footer_button':
      prompt.footer.push(parseButton(arg))
      break
    case 'prompt_show':
      prompt.open = true
      break
    case 'prompt_end':
      prompt.open = false
      break
  }
}

export function closePrompt() {
  prompt.open = false
  gcode('RESPOND TYPE=command MSG="action:prompt_end"', { quiet: true })
}

// ------------------------------------------------------------------ derivados
export const heaters = computed<string[]>(() =>
  ((state.status.heaters?.available_heaters as string[]) ??
    state.objects.filter((o) => o === 'extruder' || /^extruder\d+$/.test(o) || o === 'heater_bed' || o.startsWith('heater_generic ')))
)
export const sensors = computed<string[]>(() =>
  state.objects.filter((o) => o.startsWith('temperature_sensor ') || o.startsWith('temperature_fan '))
)
export const fans = computed<string[]>(() =>
  state.objects.filter((o) => o === 'fan' || o.startsWith('fan_generic '))
)
export const homed = computed<string>(() => state.status.toolhead?.homed_axes ?? '')
export const printing = computed(() => ['printing', 'paused'].includes(state.status.print_stats?.state))
export const ready = computed(() => state.connected && state.klippy === 'ready')
export const probeCfg = computed<Status | null>(() => state.settings.accel_probe ?? state.settings.probe ?? null)
export const probeKind = computed(() =>
  state.settings.accel_probe ? 'boquilla (ADXL)' : state.settings.probe ? 'sonda' : state.settings.bltouch ? 'BLTouch' : null
)

export function prettyName(obj: string): string {
  if (obj === 'extruder') return 'Hotend'
  if (obj === 'heater_bed') return 'Cama'
  if (obj === 'fan') return 'Capa'
  const parts = obj.split(' ')
  return (parts[1] ?? parts[0]).replace(/_/g, ' ')
}
