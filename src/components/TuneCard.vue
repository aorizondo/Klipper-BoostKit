<script setup lang="ts">
// Ajustes en vivo: valen también imprimiendo (Klipper los aplica con ~0.5 s de
// retraso, lo que tarde en vaciarse lo ya planificado).
import { computed } from 'vue'
import { state, fans, gcode, prettyName, ready } from '../store/printer'
import BkSlider from './BkSlider.vue'

const gm = computed(() => state.status.gcode_move ?? {})
const th = computed(() => state.status.toolhead ?? {})
const cfgMax = computed(() => ({
  vel: state.settings.printer?.max_velocity ?? 300,
  accel: state.settings.printer?.max_accel ?? 3000,
}))

function fanSet(f: string, pct: number) {
  if (f === 'fan') gcode(`M106 S${Math.round((pct / 100) * 255)}`)
  else gcode(`SET_FAN_SPEED FAN=${f.replace(/^fan_generic /, '')} SPEED=${(pct / 100).toFixed(2)}`)
}
</script>

<template>
  <section class="card">
    <h2>Ajustes en vivo</h2>
    <BkSlider label="Velocidad" unit="%" :min="10" :max="300" :step="1" :presets="[50, 75, 100, 125, 150]"
              :value="(gm.speed_factor ?? 1) * 100" :disabled="!ready" @commit="(v) => gcode(`M220 S${Math.round(v)}`)" />
    <BkSlider label="Flujo (extrusión)" unit="%" :min="50" :max="150" :step="1" :presets="[90, 95, 100, 105, 110]"
              :value="(gm.extrude_factor ?? 1) * 100" :disabled="!ready" @commit="(v) => gcode(`M221 S${Math.round(v)}`)" />
    <BkSlider v-for="f in fans" :key="f" :label="'Ventilador ' + prettyName(f)" unit="%" :min="0" :max="100" :step="1"
              :presets="[0, 30, 50, 75, 100]" :value="(state.status[f]?.speed ?? 0) * 100" :disabled="!ready"
              @commit="(v) => fanSet(f, v)" />
    <div class="sep" />
    <BkSlider label="Velocidad máx." unit=" mm/s" :min="10" :max="cfgMax.vel" :step="5"
              :value="th.max_velocity ?? 0" :disabled="!ready" @commit="(v) => gcode(`SET_VELOCITY_LIMIT VELOCITY=${v}`)" />
    <BkSlider label="Aceleración máx." unit=" mm/s²" :min="100" :max="cfgMax.accel" :step="100"
              :value="th.max_accel ?? 0" :disabled="!ready" @commit="(v) => gcode(`SET_VELOCITY_LIMIT ACCEL=${v}`)" />
    <BkSlider label="Velocidad en esquinas" unit=" mm/s" :min="1" :max="20" :step="0.5" :decimals="1"
              :value="th.square_corner_velocity ?? 5" :disabled="!ready"
              @commit="(v) => gcode(`SET_VELOCITY_LIMIT SQUARE_CORNER_VELOCITY=${v}`)" />
    <p class="hint">Velocidad/aceleración máx. vuelven a lo de printer.cfg al reiniciar. «Velocidad en esquinas»
      es lo que en Marlin era el jerk.</p>
  </section>
</template>
