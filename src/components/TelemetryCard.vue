<script setup lang="ts">
// Gráficas apiladas con el mismo eje de tiempo (como un osciloscopio):
// temperatura, velocidad, aceleración (ordenada vs medida), flujo,
// acelerómetro y factores M220/M221. Pasa el ratón para leer todos a la vez.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { state, heaters, prettyName } from '../store/printer'
import { tele, tick, accelStream } from '../store/telemetry'

interface Series { key: string; label: string; color: string; dash?: boolean; fmt?: number }
interface Lane { id: string; title: string; unit: string; series: Series[]; min?: number; needs?: string }

const C = { orange: '#ff7a1a', blue: '#4ea8ff', green: '#3ecf8e', violet: '#c58cff', yellow: '#f5c542', pink: '#ff6b9a', red: '#ff6b6b', grey: '#8b94a0' }
const HEAT = [C.orange, C.blue, C.pink, C.yellow]

const hasBk = computed(() => state.objects.includes('boostkit'))
const hasChip = computed(() => !!state.settings.boostkit?.accel_chip)

const lanes = computed<Lane[]>(() => [
  {
    id: 'temp', title: 'Temperatura', unit: '°C',
    series: heaters.value.flatMap((h, i) => [
      { key: 'temp:' + h, label: prettyName(h), color: HEAT[i % HEAT.length], fmt: 1 },
      { key: 'target:' + h, label: 'objetivo', color: HEAT[i % HEAT.length], dash: true, fmt: 0 },
    ]),
  },
  { id: 'vel', title: 'Velocidad', unit: 'mm/s', series: [{ key: 'vel', label: 'real', color: C.green, fmt: 1 }] },
  {
    id: 'acc', title: 'Aceleración', unit: 'mm/s²', needs: 'boostkit',
    series: [
      { key: 'acc_cmd', label: 'ordenada', color: C.yellow, fmt: 0 },
      { key: 'acc_meas', label: 'medida XY', color: C.violet, fmt: 0 },
    ],
  },
  { id: 'flow', title: 'Flujo', unit: 'mm³/s', series: [{ key: 'flow', label: 'volumétrico', color: C.blue, fmt: 2 }] },
  {
    id: 'adxl', title: 'Acelerómetro', unit: 'mm/s²', needs: 'chip',
    series: [
      { key: 'ax', label: 'X', color: C.red, fmt: 0 },
      { key: 'ay', label: 'Y', color: C.green, fmt: 0 },
      { key: 'az', label: 'Z', color: C.blue, fmt: 0 },
    ],
  },
  {
    id: 'fac', title: 'Factores', unit: '%',
    series: [
      { key: 'speed_f', label: 'velocidad', color: C.green, fmt: 0 },
      { key: 'flow_f', label: 'flujo', color: C.blue, fmt: 0 },
    ],
  },
])

const saved = JSON.parse(localStorage.getItem('bk.tele') ?? '{}')
const visible = ref<string[]>(saved.visible ?? ['temp', 'vel', 'acc', 'flow'])
const minutes = ref<number>(saved.minutes ?? 5)
const paused = ref(false)
watch([visible, minutes], () => localStorage.setItem('bk.tele', JSON.stringify({ visible: visible.value, minutes: minutes.value })), { deep: true })

function toggle(id: string) {
  const i = visible.value.indexOf(id)
  if (i >= 0) visible.value.splice(i, 1)
  else visible.value.push(id)
}
const shown = computed(() => lanes.value.filter((l) => visible.value.includes(l.id)))
const missing = (l: Lane) => (l.needs === 'boostkit' && !hasBk.value) || (l.needs === 'chip' && !hasChip.value)

// El acelerómetro solo emite mientras su gráfica está visible.
const wantAccel = computed(() => visible.value.includes('adxl') || visible.value.includes('acc'))
watch([wantAccel, hasChip, () => state.klippy], () => accelStream(wantAccel.value && state.klippy === 'ready'), { immediate: true })
onBeforeUnmount(() => accelStream(false))

// ------------------------------------------------------------- dibujo
const cv = ref<HTMLCanvasElement>()
const hoverX = ref<number | null>(null)
const LANE_H = 74
const HEAD = 15
const L = 40
const height = computed(() => shown.value.length * LANE_H)

function niceMax(v: number) {
  if (!(v > 0)) return 1
  const p = 10 ** Math.floor(Math.log10(v))
  for (const m of [1, 2, 2.5, 5, 10]) if (v <= m * p) return m * p
  return 10 * p
}
const fmtNum = (v: number, d = 1) => (isFinite(v) ? v.toFixed(d) : '—')

function draw() {
  const c = cv.value
  if (!c) return
  const dpr = window.devicePixelRatio || 1
  const w = c.clientWidth
  const h = height.value
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
    c.width = Math.round(w * dpr)
    c.height = Math.round(h * dpr)
  }
  const g = c.getContext('2d')!
  g.setTransform(dpr, 0, 0, dpr, 0, 0)
  g.clearRect(0, 0, w, h)
  const T = tele.t
  const tEnd = T.length ? T[T.length - 1] : Date.now()
  const span = minutes.value * 60000
  const t0 = tEnd - span
  let i0 = T.length
  while (i0 > 0 && T[i0 - 1] >= t0) i0--
  const W = w - L - 4
  const xOf = (t: number) => L + ((t - t0) / span) * W
  // índice bajo el cursor
  let hi = T.length - 1
  if (hoverX.value !== null && T.length) {
    const th = t0 + ((hoverX.value - L) / W) * span
    let lo = i0, up = T.length - 1
    while (lo < up) { const m = (lo + up) >> 1; if (T[m] < th) lo = m + 1; else up = m }
    hi = lo
  }
  g.font = '10px ui-monospace, monospace'
  shown.value.forEach((lane, li) => {
    const y0 = li * LANE_H
    const top = y0 + HEAD + 3
    const bot = y0 + LANE_H - 6
    // máximo visible
    let mx = 0
    for (const s of lane.series) {
      const a = tele.s[s.key]
      if (!a) continue
      for (let i = i0; i < a.length; i++) if (a[i] > mx) mx = a[i]
    }
    mx = niceMax(mx * 1.08)
    const yOf = (v: number) => bot - (v / mx) * (bot - top)
    // fondo y rejilla
    g.fillStyle = li % 2 ? 'rgba(255,255,255,0.012)' : 'rgba(255,255,255,0.025)'
    g.fillRect(L, top, W, bot - top)
    g.strokeStyle = '#262c34'
    g.lineWidth = 1
    for (const f of [0, 0.5, 1]) {
      const y = Math.round(yOf(mx * f)) + 0.5
      g.beginPath(); g.moveTo(L, y); g.lineTo(L + W, y); g.stroke()
    }
    g.fillStyle = '#6b7480'
    g.textAlign = 'right'
    g.fillText(mx >= 1000 ? (mx / 1000).toFixed(mx % 1000 ? 1 : 0) + 'k' : String(+mx.toFixed(2)), L - 4, top + 8)
    g.fillText('0', L - 4, bot)
    g.textAlign = 'left'
    // título + lecturas
    g.font = '600 11px Inter, system-ui, sans-serif'
    g.fillStyle = '#c6ccd4'
    g.fillText(lane.title, L, y0 + 11)
    let x = L + g.measureText(lane.title).width + 8
    g.font = '10.5px ui-monospace, monospace'
    if (missing(lane)) {
      g.fillStyle = '#6b7480'
      g.fillText(lane.needs === 'chip' ? 'necesita [boostkit] accel_chip:' : 'necesita el extra [boostkit]', x, y0 + 11)
    }
    for (const s of lane.series) {
      const a = tele.s[s.key]
      const v = a ? a[hi] : NaN
      if (s.dash && !(v > 0)) continue
      const txt = `${s.label} ${fmtNum(v, s.fmt ?? 1)}`
      g.fillStyle = s.color
      g.fillRect(x, y0 + 6, 8, s.dash ? 1 : 3)
      g.fillStyle = s.dash ? '#8b94a0' : '#e7eaee'
      g.fillText(txt, x + 11, y0 + 11)
      x += g.measureText(txt).width + 22
    }
    g.fillStyle = '#6b7480'
    g.fillText(lane.unit, Math.max(x, L + W - g.measureText(lane.unit).width), y0 + 11)
    // series
    g.save()
    g.beginPath(); g.rect(L, top - 1, W, bot - top + 2); g.clip()
    for (const s of lane.series) {
      const a = tele.s[s.key]
      if (!a) continue
      g.beginPath()
      g.setLineDash(s.dash ? [4, 4] : [])
      g.strokeStyle = s.color
      g.globalAlpha = s.dash ? 0.6 : 1
      g.lineWidth = s.dash ? 1 : 1.6
      let pen = false
      for (let i = i0; i < a.length; i++) {
        const v = a[i]
        if (!isFinite(v)) { pen = false; continue }
        const px = xOf(T[i]), py = yOf(v)
        if (pen) g.lineTo(px, py)
        else { g.moveTo(px, py); pen = true }
      }
      g.stroke()
      if (!s.dash) {
        // relleno suave bajo la primera serie
        g.globalAlpha = 1
      }
    }
    g.restore()
    g.setLineDash([])
    g.globalAlpha = 1
  })
  // eje de tiempo (abajo) y cursor
  if (hoverX.value !== null && T.length && hi >= i0) {
    const x = Math.round(xOf(T[hi])) + 0.5
    g.strokeStyle = 'rgba(255,176,102,0.7)'
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke()
    const ago = (tEnd - T[hi]) / 1000
    const lbl = ago < 1 ? 'ahora' : `-${ago >= 60 ? Math.floor(ago / 60) + 'm' + String(Math.round(ago % 60)).padStart(2, '0') : ago.toFixed(0) + 's'}`
    g.fillStyle = '#ffb066'
    g.font = '10px ui-monospace, monospace'
    g.textAlign = x > w - 60 ? 'right' : 'left'
    g.fillText(lbl, x + (x > w - 60 ? -4 : 4), h - 2)
    g.textAlign = 'left'
  }
}

let raf = 0
function schedule() {
  if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw() })
}
watch(tick, () => !paused.value && schedule())
watch([shown, minutes, hoverX, paused], schedule, { deep: true })
let ro: ResizeObserver | undefined
onMounted(() => { ro = new ResizeObserver(schedule); ro.observe(cv.value!); schedule() })
onBeforeUnmount(() => ro?.disconnect())
function onMove(ev: MouseEvent) {
  const r = cv.value!.getBoundingClientRect()
  hoverX.value = ev.clientX - r.left >= L ? ev.clientX - r.left : null
}
</script>

<template>
  <section class="card tele">
    <h2>
      Gráficas
      <span class="spacer" />
      <div class="seg mini">
        <button v-for="m in [1, 5, 15, 30]" :key="m" :class="{ on: minutes === m }" @click="minutes = m">{{ m }}m</button>
      </div>
      <button class="btn sm" :class="{ on: paused }" :title="paused ? 'Reanudar' : 'Congelar'" @click="paused = !paused">{{ paused ? '▶' : '❚❚' }}</button>
    </h2>
    <div class="chips">
      <button v-for="l in lanes" :key="l.id" class="chip" :class="{ on: visible.includes(l.id) }" @click="toggle(l.id)">{{ l.title }}</button>
    </div>
    <canvas ref="cv" :style="{ height: height + 'px' }" @mousemove="onMove" @mouseleave="hoverX = null" />
  </section>
</template>

<style scoped>
canvas { width: 100%; display: block; cursor: crosshair; }
.chips { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 6px; }
.chip { background: transparent; border: 1px solid var(--line); border-radius: 99px; padding: 1px 9px; font-size: 11.5px; color: var(--mute); cursor: pointer; }
.chip.on { border-color: color-mix(in srgb, var(--accent) 60%, var(--line)); color: var(--text); background: color-mix(in srgb, var(--accent) 12%, transparent); }
.seg.mini button { padding: 2px 8px; font-size: 11.5px; }
</style>
