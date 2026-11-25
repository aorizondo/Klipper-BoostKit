<script setup lang="ts">
import { computed } from 'vue'
import { state, heaters, sensors, gcode, prettyName, ready, savePrefs } from '../store/printer'
import BkSlider from './BkSlider.vue'

const maxOf = (h: string) => state.settings[h]?.max_temp ?? 300
const presetsOf = (h: string) =>
  h.startsWith('extruder') ? [0, 180, 200, 210, 230, 250] : h === 'heater_bed' ? [0, 50, 60, 70, 80, 100] : [0, 40, 60]
const hasBed = computed(() => heaters.value.includes('heater_bed'))

function setTemp(h: string, v: number) {
  gcode(`SET_HEATER_TEMPERATURE HEATER=${h.replace(/^heater_generic /, '')} TARGET=${Math.round(v)}`)
}
function preset(p: { extruder: number; bed: number }) {
  for (const h of heaters.value) {
    if (h === 'extruder') setTemp(h, p.extruder)
    if (h === 'heater_bed') setTemp(h, p.bed)
  }
}
function addPreset() {
  const name = window.prompt('Nombre del perfil (p.ej. ASA):')
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
    <h2>
      Temperaturas
      <span v-for="s in sensors" :key="s" class="sensor" :title="s">{{ prettyName(s) }} <b class="mono">{{ state.status[s]?.temperature?.toFixed(0) ?? '—' }}°</b></span>
      <span class="spacer" />
      <button class="btn sm danger" :disabled="!ready" @click="gcode('TURN_OFF_HEATERS')">Apagar</button>
    </h2>
    <BkSlider
      v-for="h in heaters" :key="h" :label="prettyName(h) + ' ' + ((state.status[h]?.power ?? 0) * 100).toFixed(0) + '%'"
      unit="°" :min="0" :max="maxOf(h)" :step="1"
      :value="state.status[h]?.temperature ?? 0" :target="state.status[h]?.target ?? 0"
      :presets="presetsOf(h)" :disabled="!ready" @commit="(v) => setTemp(h, v)"
    />
    <div class="row presets">
      <span v-for="(p, i) in state.prefs.presets" :key="p.name" class="chip">
        <button class="btn sm" :disabled="!ready" @click="preset(p)">{{ p.name }} <span class="mute">{{ p.extruder }}{{ hasBed ? '/' + p.bed : '' }}</span></button>
        <button class="x" title="borrar" @click="delPreset(i)">×</button>
      </span>
      <button class="btn sm" title="Guardar las consignas actuales como perfil" @click="addPreset">+</button>
    </div>
  </section>
</template>

<style scoped>
.presets { margin-top: 6px; gap: 4px; }
.chip { display: inline-flex; align-items: center; }
.chip .x { background: none; border: 0; color: var(--mute); cursor: pointer; padding: 0 3px; }
.chip .x:hover { color: var(--err); }
.sensor { text-transform: none; letter-spacing: 0; font-weight: 400; font-size: 11.5px; background: var(--bg); border: 1px solid var(--line); border-radius: 99px; padding: 0 8px; }
.sensor b { color: var(--text); }
</style>
