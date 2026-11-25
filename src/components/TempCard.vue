<script setup lang="ts">
import { computed } from 'vue'
import { state, heaters, sensors, gcode, prettyName, ready, savePrefs } from '../store/printer'
import BkSlider from './BkSlider.vue'
import TempChart from './TempChart.vue'

const COLORS = ['#ff7a1a', '#4ea8ff', '#3ecf8e', '#c58cff', '#f5c542', '#ff6b9a']
const maxOf = (h: string) => state.settings[h]?.max_temp ?? 300
const presetsOf = (h: string) =>
  h.startsWith('extruder') ? [0, 180, 200, 210, 230, 250] : h === 'heater_bed' ? [0, 50, 60, 70, 80, 100] : [0, 40, 60]

function setTemp(h: string, v: number) {
  gcode(`SET_HEATER_TEMPERATURE HEATER=${h.replace(/^heater_generic /, '')} TARGET=${Math.round(v)}`)
}
function preset(p: { extruder: number; bed: number }) {
  for (const h of heaters.value) {
    if (h === 'extruder') setTemp(h, p.extruder)
    if (h === 'heater_bed') setTemp(h, p.bed)
  }
}
function allOff() {
  gcode('TURN_OFF_HEATERS')
}
const hasBed = computed(() => heaters.value.includes('heater_bed'))
function addPreset() {
  const name = prompt('Nombre del perfil (p.ej. ASA):')
  if (!name) return
  state.prefs.presets.push({
    name,
    extruder: Math.round(state.status.extruder?.target ?? 0),
    bed: Math.round(state.status.heater_bed?.target ?? 0),
  })
  savePrefs()
}
function delPreset(i: number) {
  state.prefs.presets.splice(i, 1)
  savePrefs()
}
</script>

<template>
  <section class="card">
    <h2>Temperaturas <span class="spacer" /><button class="btn sm danger" :disabled="!ready" @click="allOff">Apagar todo</button></h2>
    <TempChart :series="heaters" />
    <div class="legend row small">
      <span v-for="(h, i) in heaters" :key="h"><i :style="{ background: COLORS[i % COLORS.length] }" />{{ prettyName(h) }}
        <span class="mute">{{ ((state.status[h]?.power ?? 0) * 100).toFixed(0) }}%</span></span>
    </div>
    <BkSlider
      v-for="h in heaters" :key="h" :label="prettyName(h)" unit="°C" :min="0" :max="maxOf(h)" :step="1"
      :value="state.status[h]?.temperature ?? 0" :target="state.status[h]?.target ?? 0"
      :presets="presetsOf(h)" :disabled="!ready" @commit="(v) => setTemp(h, v)"
    />
    <div class="sep" />
    <div class="row">
      <span class="mute small">Perfiles</span>
      <span v-for="(p, i) in state.prefs.presets" :key="p.name" class="chip">
        <button class="btn sm" :disabled="!ready" @click="preset(p)">{{ p.name }} <span class="mute">{{ p.extruder }}{{ hasBed ? '/' + p.bed : '' }}</span></button>
        <button class="x" title="borrar" @click="delPreset(i)">×</button>
      </span>
      <button class="btn sm" title="Guardar los objetivos actuales como perfil" @click="addPreset">+ guardar actual</button>
    </div>
    <div v-if="sensors.length" class="sensors">
      <div v-for="s in sensors" :key="s" class="sensor">
        <span class="mute small">{{ prettyName(s) }}</span>
        <span class="mono">{{ state.status[s]?.temperature?.toFixed(1) ?? '—' }}°C</span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.legend { gap: 14px; margin: 4px 0 10px; }
.legend i { display: inline-block; width: 10px; height: 3px; border-radius: 2px; margin-right: 5px; vertical-align: middle; }
.chip { display: inline-flex; align-items: center; }
.chip .x { background: none; border: 0; color: var(--mute); cursor: pointer; padding: 0 4px; }
.chip .x:hover { color: var(--err); }
.sensors { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 10px; }
.sensor { background: var(--bg); border: 1px solid var(--line); border-radius: 8px; padding: 4px 10px; display: flex; gap: 8px; }
</style>
