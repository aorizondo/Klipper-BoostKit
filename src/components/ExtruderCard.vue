<script setup lang="ts">
import { computed } from 'vue'
import { state, gcode, ready, savePrefs, printing } from '../store/printer'
import { extrude } from '../composables/jog'
import BkSlider from './BkSlider.vue'

const ex = computed(() => state.status.extruder ?? {})
const cold = computed(() => ex.value.can_extrude === false)
const fr = computed(() => state.status.firmware_retraction)
function setLen(v: number) {
  state.prefs.extrudeLen = v
  savePrefs()
}
function setSpeed(v: number) {
  state.prefs.extrudeSpeed = v
  savePrefs()
}
</script>

<template>
  <section class="card">
    <h2>Extrusor <span class="spacer" /><span v-if="cold" class="pill warn">frío: no extruye</span></h2>
    <div class="row">
      <div class="seg">
        <button v-for="l in [1, 5, 10, 25, 50, 100]" :key="l" :class="{ on: state.prefs.extrudeLen === l }" @click="setLen(l)">{{ l }}</button>
      </div>
      <span class="mute small">mm a</span>
      <input class="num" style="width: 60px" type="number" min="0.5" step="0.5" :value="state.prefs.extrudeSpeed"
             @change="setSpeed(+($event.target as HTMLInputElement).value)" />
      <span class="mute small">mm/s</span>
    </div>
    <div class="row" style="margin-top: 10px">
      <button class="btn grow" :disabled="!ready || cold || printing" @click="extrude(-1)">⤒ Retraer</button>
      <button class="btn primary grow" :disabled="!ready || cold || printing" @click="extrude(1)">⤓ Extruir</button>
    </div>

    <div class="sep" />
    <h2>Pressure advance</h2>
    <BkSlider label="Advance" :min="0" :max="1" :step="0.005" :decimals="3" :value="ex.pressure_advance ?? 0"
              :presets="[0, 0.04, 0.08, 0.2, 0.5]" :disabled="!ready"
              @commit="(v) => gcode(`SET_PRESSURE_ADVANCE ADVANCE=${v}`)" />
    <BkSlider label="Smooth time" unit=" s" :min="0" :max="0.2" :step="0.005" :decimals="3" :value="ex.smooth_time ?? 0.04"
              :disabled="!ready" @commit="(v) => gcode(`SET_PRESSURE_ADVANCE SMOOTH_TIME=${v}`)" />
    <p class="hint">El Linear Advance (M900 K) de Marlin. Para fijarlo: pressure_advance en [extruder] de printer.cfg.
      Para encontrar el valor: Calibración → torre de PA.</p>

    <template v-if="fr">
      <div class="sep" />
      <h2>Retracción por firmware (G10/G11)</h2>
      <BkSlider label="Longitud" unit=" mm" :min="0" :max="10" :step="0.1" :decimals="1" :value="fr.retract_length ?? 0"
                :disabled="!ready" @commit="(v) => gcode(`SET_RETRACTION RETRACT_LENGTH=${v}`)" />
      <BkSlider label="Velocidad" unit=" mm/s" :min="5" :max="80" :step="1" :value="fr.retract_speed ?? 20"
                :disabled="!ready" @commit="(v) => gcode(`SET_RETRACTION RETRACT_SPEED=${v}`)" />
    </template>
  </section>
</template>

<style scoped>
.pill { font-size: 11px; padding: 2px 8px; border-radius: 99px; letter-spacing: 0; text-transform: none; }
.pill.warn { background: color-mix(in srgb, var(--warn) 15%, transparent); color: var(--warn); }
</style>
