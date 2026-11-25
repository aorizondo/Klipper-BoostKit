// Telemetría: muestras a 4 Hz de temperaturas, velocidad, aceleración, flujo,
// factores (M220/M221) y acelerómetro. Arrays fuera de la reactividad de Vue
// (miles de puntos); `tick` avisa a las gráficas de que hay datos nuevos.
import { ref, markRaw } from 'vue'
import { state, heaters, gcode } from './printer'

export const RATE_HZ = 4
const MAX = 30 * 60 * RATE_HZ // 30 min

export const tele = markRaw({
  t: [] as number[],
  s: {} as Record<string, number[]>,
})
export const tick = ref(0)

function push(key: string, v: number, n: number) {
  const a = (tele.s[key] ??= [])
  while (a.length < n - 1) a.push(NaN) // serie nueva: rellena huecos
  a.push(v)
}

const num = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : NaN)

function sample() {
  const st = state.status
  if (!st.toolhead) return
  tele.t.push(Date.now())
  const n = tele.t.length
  for (const h of heaters.value) {
    push('temp:' + h, num(st[h]?.temperature), n)
    push('target:' + h, num(st[h]?.target), n)
  }
  const bk = st.boostkit
  const mr = st.motion_report ?? {}
  push('vel', num(bk?.velocity_peak ?? Math.abs(mr.live_velocity ?? NaN)), n)
  push('acc_cmd', num(bk?.accel_peak), n)
  const area = Math.PI * ((state.settings.extruder?.filament_diameter ?? 1.75) / 2) ** 2
  push('flow', num(bk?.flow_peak ?? (mr.live_extruder_velocity ?? NaN) * area), n)
  push('speed_f', num((st.gcode_move?.speed_factor ?? NaN) * 100), n)
  push('flow_f', num((st.gcode_move?.extrude_factor ?? NaN) * 100), n)
  const ch = bk?.accel_chip
  const on = ch?.enabled && ch.samples > 0
  push('ax', on ? num(ch.x_peak) : NaN, n)
  push('ay', on ? num(ch.y_peak) : NaN, n)
  push('az', on ? num(ch.z_peak) : NaN, n)
  push('acc_meas', on ? Math.hypot(ch.x_peak, ch.y_peak) : NaN, n)
  if (n > MAX) {
    const cut = n - MAX
    tele.t.splice(0, cut)
    for (const a of Object.values(tele.s)) a.splice(0, cut)
  }
  tick.value++
}

let timer: number | undefined
export function startTelemetry() {
  clearInterval(timer)
  timer = window.setInterval(sample, 1000 / RATE_HZ)
}

/** Siembra las temperaturas con el historial de Moonraker (1 muestra/s). */
export function seedTemps(store: Record<string, { temperatures?: number[]; targets?: number[] }>) {
  if (tele.t.length) return
  const len = Math.max(0, ...Object.values(store).map((d) => d.temperatures?.length ?? 0))
  const now = Date.now()
  for (let i = 0; i < len; i++) tele.t.push(now - (len - i) * 1000)
  for (const [name, d] of Object.entries(store)) {
    const pad = len - (d.temperatures?.length ?? 0)
    tele.s['temp:' + name] = [...Array(pad).fill(NaN), ...(d.temperatures ?? [])]
    tele.s['target:' + name] = [...Array(pad).fill(NaN), ...(d.targets ?? [])]
  }
  tick.value++
}

// ------------------------------------------- acelerómetro bajo demanda
// Solo emite mientras la gráfica lo muestra (BK_ACCEL_MONITOR con keepalive).
let keep: number | undefined
export function accelStream(on: boolean) {
  clearInterval(keep)
  if (!state.objects.includes('boostkit') || !state.settings.boostkit?.accel_chip) return
  if (on) {
    const send = () => gcode('BK_ACCEL_MONITOR ENABLE=1', { quiet: true, silent: true })
    send()
    keep = window.setInterval(send, 15000)
  } else gcode('BK_ACCEL_MONITOR ENABLE=0', { quiet: true, silent: true })
}
