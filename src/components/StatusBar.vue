<script setup lang="ts">
import { computed } from 'vue'
import { state, api, gcode, ready, printing } from '../store/printer'

const ps = computed(() => state.status.print_stats ?? {})
const progress = computed(() => (state.status.virtual_sdcard?.progress ?? 0) * 100)
const label = computed(() => {
  if (!state.connected) return 'Sin conexión con Moonraker'
  if (state.klippy !== 'ready') return `Klipper: ${state.klippy}`
  return (
    { standby: 'En espera', printing: 'Imprimiendo', paused: 'En pausa', complete: 'Terminado', cancelled: 'Cancelado', error: 'Error' } as Record<string, string>
  )[ps.value.state] ?? 'Lista'
})
const tone = computed(() =>
  !state.connected || ['shutdown', 'error'].includes(state.klippy) ? 'err' : state.klippy !== 'ready' ? 'warn' : printing.value ? 'busy' : 'ok'
)
function estop() {
  api.call('printer.emergency_stop').catch(() => {})
}
function restart() {
  api.call('printer.firmware_restart').catch(() => {})
}
const mainsail = computed(() => `${location.protocol}//${location.hostname}`)
const fluidd = computed(() => `${location.protocol}//${location.hostname}:81`)
</script>

<template>
  <header class="bar">
    <div class="brand"><span class="logo">▲</span> BoostKit <span class="mute small">Klipper</span></div>
    <div class="state" :class="tone"><span class="led" />{{ label }}</div>
    <div v-if="printing" class="job">
      <span class="small mono ellipsis">{{ ps.filename }}</span>
      <div class="pbar"><div :style="{ width: progress + '%' }" /></div>
      <span class="mono small">{{ progress.toFixed(1) }}%</span>
      <button v-if="ps.state === 'printing'" class="btn sm" @click="gcode('PAUSE')">Pausa</button>
      <button v-else class="btn sm primary" @click="gcode('RESUME')">Reanudar</button>
      <button class="btn sm danger" @click="gcode('CANCEL_PRINT')">Cancelar</button>
    </div>
    <span class="grow" />
    <span v-if="state.busy" class="spin" title="ejecutando…" />
    <button v-if="state.saveConfigPending && ready && !printing" class="btn sm primary" @click="gcode('SAVE_CONFIG')"
            title="Guarda las calibraciones en printer.cfg y reinicia Klipper">SAVE_CONFIG</button>
    <button v-if="['shutdown', 'error'].includes(state.klippy)" class="btn sm primary" @click="restart">FIRMWARE_RESTART</button>
    <a class="btn sm" :href="mainsail" target="_blank">Mainsail</a>
    <a class="btn sm" :href="fluidd" target="_blank">Fluidd</a>
    <button class="btn estop" title="Parada de emergencia (M112)" @click="estop">⏻ PARAR</button>
  </header>
  <div v-if="['shutdown', 'error', 'startup'].includes(state.klippy) && state.klippyMessage" class="kmsg">{{ state.klippyMessage }}</div>
</template>

<style scoped>
.bar { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; gap: 10px; padding: 7px 14px;
  background: color-mix(in srgb, var(--bg) 88%, transparent); backdrop-filter: blur(8px); border-bottom: 1px solid var(--line); flex-wrap: wrap; }
.brand { font-weight: 700; font-size: 16px; display: flex; align-items: center; gap: 6px; }
.logo { color: var(--accent); }
.state { display: flex; align-items: center; gap: 7px; font-weight: 500; padding: 4px 10px; border-radius: 99px; background: var(--card2); }
.led { width: 9px; height: 9px; border-radius: 50%; }
.ok .led { background: var(--ok); box-shadow: 0 0 8px var(--ok); }
.warn .led { background: var(--warn); } .err .led { background: var(--err); box-shadow: 0 0 8px var(--err); }
.busy .led { background: var(--accent); box-shadow: 0 0 8px var(--accent); }
.job { display: flex; align-items: center; gap: 8px; }
.ellipsis { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pbar { width: 140px; height: 6px; background: var(--line); border-radius: 3px; overflow: hidden; }
.pbar div { height: 100%; background: var(--accent); }
.estop { background: var(--err); border-color: var(--err); color: #fff; font-weight: 700; }
.estop:hover { background: #ff7676 !important; }
a.btn { text-decoration: none; }
.spin { width: 16px; height: 16px; border: 2px solid var(--line); border-top-color: var(--accent); border-radius: 50%; animation: s .7s linear infinite; }
@keyframes s { to { transform: rotate(360deg); } }
.kmsg { margin: 10px 18px 0; padding: 10px 12px; border-radius: 10px; background: color-mix(in srgb, var(--err) 12%, transparent); border: 1px solid color-mix(in srgb, var(--err) 40%, transparent); white-space: pre-wrap; font-family: var(--mono); font-size: 12px; }
</style>
