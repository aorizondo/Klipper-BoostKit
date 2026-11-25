<script setup lang="ts">
import { computed } from 'vue'
import { state, gcode, ready, probeCfg, probeKind, homed, printing } from '../store/printer'

const pr = computed(() => state.status.probe ?? {})
const mp = computed(() => state.status.manual_probe ?? {})
const arm = computed(() => state.status['gcode_macro _SONDA']) // brazo manual de la MK4 (macros.cfg)
const allHomed = computed(() => ['x', 'y', 'z'].every((a) => homed.value.includes(a)))
const busy = computed(() => !ready.value || printing.value)
const testz = [-1, -0.1, -0.05, -0.01, 0.01, 0.05, 0.1, 1]
</script>

<template>
  <section class="card">
    <h2>Sonda Z <span class="spacer" /><span class="mute small" style="text-transform: none; letter-spacing: 0">{{ probeKind ?? 'sin sonda' }}</span></h2>

    <!-- Asistente de la prueba del papel: aparece solo con PROBE_CALIBRATE / Z_ENDSTOP_CALIBRATE / BED_SCREWS... -->
    <div v-if="mp.is_active" class="manual">
      <div class="row">
        <strong>Prueba del papel</strong><span class="grow" />
        <span class="mono big">Z {{ mp.z_position?.toFixed(3) }}</span>
      </div>
      <p class="hint" style="margin-top: 2px">Baja hasta que el papel roce al moverlo. Luego Aceptar y SAVE_CONFIG.</p>
      <div class="tz">
        <button v-for="d in testz" :key="d" class="btn sm" :class="d < 0 ? 'down' : 'up'" @click="gcode(`TESTZ Z=${d}`)">{{ d > 0 ? '+' : '' }}{{ d }}</button>
      </div>
      <div class="row" style="margin-top: 8px">
        <button class="btn sm" @click="gcode('TESTZ Z=-')" title="bisección hacia abajo">− mitad</button>
        <button class="btn sm" @click="gcode('TESTZ Z=+')" title="bisección hacia arriba">+ mitad</button>
        <span class="grow" />
        <button class="btn sm danger" @click="gcode('ABORT')">Cancelar</button>
        <button class="btn sm primary" @click="gcode('ACCEPT')">Aceptar</button>
      </div>
    </div>

    <template v-if="probeCfg">
      <div class="kv">
        <span>Offset X / Y</span><span class="mono">{{ probeCfg.x_offset ?? 0 }} / {{ probeCfg.y_offset ?? 0 }} mm</span>
        <span>z_offset</span><span class="mono">{{ probeCfg.z_offset }} mm</span>
        <span>Estado</span><span><span class="led" :class="{ on: pr.last_query }" /> {{ pr.last_query ? 'disparada' : 'abierta' }}</span>
        <span>Último sondeo</span><span class="mono">{{ pr.last_z_result !== undefined ? pr.last_z_result.toFixed(4) : '—' }}</span>
      </div>
      <div v-if="arm" class="armrow row">
        <span class="mute small">Brazo manual</span>
        <span class="pill" :class="arm.deployed ? 'down' : 'up'">{{ arm.deployed ? 'BAJADO' : 'recogido' }}</span>
        <span class="grow" />
        <button class="btn sm" :disabled="!ready" @click="gcode('SONDA_LISTA')">Lo he bajado</button>
        <button class="btn sm" :disabled="!ready" @click="gcode('SONDA_GUARDADA')">Lo he subido</button>
      </div>
      <div class="row" style="margin-top: 10px">
        <button class="btn sm" :disabled="!ready" @click="gcode('QUERY_PROBE')">Consultar</button>
        <button class="btn sm" :disabled="busy || !allHomed" @click="gcode('PROBE')">Sondear aquí</button>
        <button class="btn sm" :disabled="busy || !allHomed" @click="gcode('PROBE_ACCURACY SAMPLES=10')">Repetibilidad</button>
        <button class="btn sm primary" :disabled="busy || !allHomed" @click="gcode('PROBE_CALIBRATE')">Calibrar altura</button>
      </div>
      <p class="hint">«Calibrar altura» = PROBE_CALIBRATE (prueba del papel guiada arriba). Los offsets X/Y se cambian en
        Configuración (fase 3) o en printer.cfg.</p>
    </template>
    <p v-else class="mute">No hay [probe] en la configuración.</p>
  </section>
</template>

<style scoped>
.manual { background: color-mix(in srgb, var(--accent) 8%, var(--bg)); border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--line)); border-radius: 12px; padding: 10px 12px; margin-bottom: 12px; }
.big { font-size: 20px; font-weight: 700; color: var(--accent2); }
.tz { display: grid; grid-template-columns: repeat(8, 1fr); gap: 5px; }
.tz .down { color: var(--accent2); } .tz .up { color: var(--z); }
.led { display: inline-block; width: 9px; height: 9px; border-radius: 50%; background: #39424d; vertical-align: middle; }
.led.on { background: var(--ok); box-shadow: 0 0 6px var(--ok); }
.armrow { margin-top: 10px; }
.pill { font-size: 11px; padding: 2px 8px; border-radius: 99px; font-weight: 600; }
.pill.down { background: color-mix(in srgb, var(--warn) 18%, transparent); color: var(--warn); }
.pill.up { background: color-mix(in srgb, var(--ok) 15%, transparent); color: var(--ok); }
</style>
