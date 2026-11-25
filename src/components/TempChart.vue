<script setup lang="ts">
// Gráfico de temperatura en canvas (sin librerías). Línea = real, discontinua = objetivo.
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { state } from '../store/printer'

const props = defineProps<{ series: string[]; minutes?: number }>()
const cv = ref<HTMLCanvasElement>()
const COLORS = ['#ff7a1a', '#4ea8ff', '#3ecf8e', '#c58cff', '#f5c542', '#ff6b9a']
let raf = 0

function draw() {
  const c = cv.value
  if (!c) return
  const dpr = window.devicePixelRatio || 1
  const w = c.clientWidth, h = c.clientHeight
  if (c.width !== w * dpr) { c.width = w * dpr; c.height = h * dpr }
  const g = c.getContext('2d')!
  g.setTransform(dpr, 0, 0, dpr, 0, 0)
  g.clearRect(0, 0, w, h)
  const n = (props.minutes ?? 10) * 60
  let max = 50
  for (const s of props.series) {
    const d = state.temps[s]
    if (!d) continue
    for (const v of d.t.slice(-n)) max = Math.max(max, v)
    for (const v of d.target.slice(-n)) max = Math.max(max, v)
  }
  max = Math.ceil((max + 10) / 50) * 50
  const L = 30, B = h - 16
  g.font = '10px ui-monospace, monospace'
  g.fillStyle = '#6b7480'
  g.strokeStyle = '#242a32'
  g.lineWidth = 1
  for (let v = 0; v <= max; v += 50) {
    const y = B - (v / max) * (B - 6)
    g.beginPath(); g.moveTo(L, y); g.lineTo(w, y); g.stroke()
    g.fillText(String(v), 2, y + 3)
  }
  for (let m = 0; m <= (props.minutes ?? 10); m += 2) {
    const x = w - (m * 60 / n) * (w - L)
    g.fillText(m ? `-${m}m` : 'ahora', Math.max(L, x - 14), h - 3)
  }
  props.series.forEach((s, i) => {
    const d = state.temps[s]
    if (!d) return
    const col = COLORS[i % COLORS.length]
    const plot = (arr: number[], dash: boolean) => {
      const a = arr.slice(-n)
      if (a.length < 2) return
      g.beginPath()
      g.setLineDash(dash ? [4, 4] : [])
      g.strokeStyle = col
      g.globalAlpha = dash ? 0.55 : 1
      g.lineWidth = dash ? 1 : 2
      a.forEach((v, j) => {
        const x = w - ((a.length - 1 - j) / n) * (w - L)
        const y = B - (v / max) * (B - 6)
        j ? g.lineTo(x, y) : g.moveTo(x, y)
      })
      g.stroke()
      g.globalAlpha = 1
      g.setLineDash([])
    }
    plot(d.target, true)
    plot(d.t, false)
  })
}
function loop() {
  draw()
  raf = window.setTimeout(() => requestAnimationFrame(loop), 1000) as unknown as number
}
onMounted(loop)
onBeforeUnmount(() => clearTimeout(raf))
watch(() => props.series, draw)
defineExpose({ COLORS })
</script>

<template><canvas ref="cv" class="chart" /></template>

<style scoped>
.chart { width: 100%; height: 150px; display: block; }
</style>
