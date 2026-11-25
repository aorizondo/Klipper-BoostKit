<script setup lang="ts">
// Rueda de jog: cada anillo es un paso (más afuera = más lejos), cada cuadrante
// una dirección. Centro = Home XY; esquinas = Home X / Y / Z y motores fuera.
// A la derecha, la columna de Z con los mismos pasos.
import { computed, ref } from 'vue'
import { state } from '../store/printer'
import { jog, home, motorsOff, canJog, type Axis } from '../composables/jog'

const steps = computed(() => state.prefs.jogSteps.slice(0, 4))
const R0 = 34
const W = 23
const ring = (i: number) => [R0 + i * W, R0 + (i + 1) * W - 2] as const
const dirs: { ax: Axis; sign: 1 | -1; a: number; label: string; cls: string }[] = [
  { ax: 'Y', sign: 1, a: -90, label: 'Y+', cls: 'y' },
  { ax: 'X', sign: 1, a: 0, label: 'X+', cls: 'x' },
  { ax: 'Y', sign: -1, a: 90, label: 'Y−', cls: 'y' },
  { ax: 'X', sign: -1, a: 180, label: 'X−', cls: 'x' },
]
const rad = (d: number) => (d * Math.PI) / 180
function sector(r1: number, r2: number, a0: number, a1: number) {
  const p = (r: number, a: number) => `${(r * Math.cos(rad(a))).toFixed(2)} ${(r * Math.sin(rad(a))).toFixed(2)}`
  return `M ${p(r1, a0)} L ${p(r2, a0)} A ${r2} ${r2} 0 0 1 ${p(r2, a1)} L ${p(r1, a1)} A ${r1} ${r1} 0 0 0 ${p(r1, a0)} Z`
}
function at(r: number, a: number) {
  return { x: r * Math.cos(rad(a)), y: r * Math.sin(rad(a)) }
}
const hover = ref('')
const zSteps = computed(() => [...steps.value].reverse())
const fmt = (v: number) => (v < 1 ? v.toString().replace(/^0/, '') : v.toString())
</script>

<template>
  <div class="wheelbox" :class="{ off: !canJog }">
    <svg viewBox="-150 -150 300 300" class="wheel">
      <defs>
        <filter id="bkshadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity=".45" />
        </filter>
      </defs>
      <g filter="url(#bkshadow)">
        <template v-for="d in dirs" :key="d.label">
          <path
            v-for="(st, i) in steps" :key="i"
            :d="sector(ring(i)[0], ring(i)[1], d.a - 43, d.a + 43)"
            class="seg" :class="[d.cls, `r${i}`, { hov: hover === d.label + i }]"
            @mouseenter="hover = d.label + i" @mouseleave="hover = ''"
            @click="canJog && jog({ [d.ax]: d.sign * st })"
          >
            <title>{{ d.label }} {{ st }} mm</title>
          </path>
          <text :x="at(ring(steps.length - 1)[1] + 12, d.a).x" :y="at(ring(steps.length - 1)[1] + 12, d.a).y" class="dir" :class="d.cls">{{ d.label }}</text>
        </template>
        <!-- valores de cada anillo en el cuadrante superior derecho (diagonal) -->
        <text v-for="(st, i) in steps" :key="'l' + i" :x="at((ring(i)[0] + ring(i)[1]) / 2, -45).x" :y="at((ring(i)[0] + ring(i)[1]) / 2, -45).y" class="stepl">{{ fmt(st) }}</text>
        <circle r="31" class="center" @click="canJog && home('XY')"><title>Home X Y</title></circle>
        <text y="-2" class="ctext">⌂</text><text y="12" class="csub">XY</text>
      </g>
      <g class="corner" @click="canJog && home('X')"><circle cx="-128" cy="-128" r="17" /><text x="-128" y="-124">⌂X</text></g>
      <g class="corner" @click="canJog && home('Y')"><circle cx="128" cy="-128" r="17" /><text x="128" y="-124">⌂Y</text></g>
      <g class="corner" @click="canJog && home('Z')"><circle cx="-128" cy="128" r="17" /><text x="-128" y="132">⌂Z</text></g>
      <g class="corner warn" @click="canJog && motorsOff()"><circle cx="128" cy="128" r="17" /><text x="128" y="132">M84</text><title>Apagar motores</title></g>
    </svg>
    <div class="zcol">
      <button v-for="st in zSteps" :key="'+' + st" class="zb up" :disabled="!canJog" @click="jog({ Z: st })">+{{ fmt(st) }}</button>
      <div class="zlabel">Z</div>
      <button v-for="st in steps" :key="'-' + st" class="zb dn" :disabled="!canJog" @click="jog({ Z: -st })">−{{ fmt(st) }}</button>
    </div>
  </div>
</template>

<style scoped>
.wheelbox { display: flex; gap: 6px; align-items: center; }
.wheel { width: 196px; flex: none; aspect-ratio: 1; user-select: none; }
.seg { stroke: #0e1013; stroke-width: 2; cursor: pointer; transition: fill .1s, filter .1s; }
.seg.x.r0 { fill: #4a3236; } .seg.x.r1 { fill: #3f2c30; } .seg.x.r2 { fill: #35272a; } .seg.x.r3 { fill: #2c2224; }
.seg.y.r0 { fill: #2f4436; } .seg.y.r1 { fill: #293b2f; } .seg.y.r2 { fill: #233229; } .seg.y.r3 { fill: #1e2a22; }
.seg.x.hov { fill: color-mix(in srgb, var(--x) 55%, #2a2f37); }
.seg.y.hov { fill: color-mix(in srgb, var(--y) 50%, #2a2f37); }
.seg:active { fill: var(--accent) !important; }
.dir { font-size: 14px; font-weight: 700; text-anchor: middle; dominant-baseline: middle; pointer-events: none; }
.dir.x { fill: var(--x); } .dir.y { fill: var(--y); }
.stepl { font-size: 11px; fill: #e7eaee; font-weight: 600; text-anchor: middle; dominant-baseline: middle; pointer-events: none; font-family: var(--mono); }
.center { fill: #303742; stroke: var(--accent); stroke-width: 1.5; cursor: pointer; }
.center:hover { fill: color-mix(in srgb, var(--accent) 30%, #2d333c); }
.ctext { font-size: 20px; fill: var(--accent2); text-anchor: middle; dominant-baseline: middle; pointer-events: none; }
.csub { font-size: 9px; fill: var(--mute); text-anchor: middle; pointer-events: none; }
.corner circle { fill: #262c34; stroke: #3a424d; cursor: pointer; }
.corner:hover circle { stroke: var(--accent); }
.corner text { font-size: 11px; fill: var(--accent2); text-anchor: middle; pointer-events: none; font-weight: 600; }
.corner.warn text { fill: var(--warn); }
.zcol { display: flex; flex-direction: column; gap: 2px; width: 46px; }
.zb { background: #20252c; border: 1px solid var(--line); border-radius: 7px; padding: 2px 0; cursor: pointer; font-family: var(--mono); font-size: 11px; }
.zb.up { color: var(--z); } .zb.dn { color: #8fc3ff; }
.zb:hover:not(:disabled) { border-color: var(--z); }
.zb:disabled { opacity: .35; cursor: not-allowed; }
.zlabel { text-align: center; font-weight: 700; color: var(--z); padding: 2px 0; }
.off .wheel { opacity: .45; }
</style>
