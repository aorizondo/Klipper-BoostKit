<script setup lang="ts">
// Todo lo de Z en una tarjeta con pestañas: babystep, offsets de G-code y sonda.
// La prueba del papel (PROBE_CALIBRATE, BED_SCREWS_ADJUST…) salta sola al frente.
import { computed, ref, watch } from 'vue'
import { state, gcode, ready, probeCfg, probeKind, homed, printing } from '../store/printer'

const tab = ref<'baby' | 'off' | 'probe'>((localStorage.getItem('bk.ztab') as any) ?? 'baby')
watch(tab, (t) => localStorage.setItem('bk.ztab', t))

const off = computed<number[]>(() => state.status.gcode_move?.homing_origin ?? [0, 0, 0, 0])
const z = computed(() => off.value[2] ?? 0)
const baby = (d: number) => gcode(`SET_GCODE_OFFSET Z_ADJUST=${d} MOVE=1`)
async function saveZ() {
  const cmd = probeCfg.value ? 'Z_OFFSET_APPLY_PROBE' : 'Z_OFFSET_APPLY_ENDSTOP'
  if (await gcode(cmd)) state.saveConfigPending = true
}
const xyz = ref({ X: '', Y: '', Z: '' })
function applyOffsets() {
  const parts = (['X', 'Y', 'Z'] as const).filter((a) => xyz.value[a] !== '').map((a) => `${a}=${parseFloat(xyz.value[a])}`)
  if (parts.length) gcode(`SET_GCODE_OFFSET ${parts.join(' ')} MOVE=1`)
  xyz.value = { X: '', Y: '', Z: '' }
}

const pr = computed(() => state.status.probe ?? {})
const mp = computed(() => state.status.manual_probe ?? {})
const arm = computed(() => state.status['gcode_macro _SONDA'])
const allHomed = computed(() => ['x', 'y', 'z'].every((a) => homed.value.includes(a)))
const busy = computed(() => !ready.value || printing.value)
const testz = [-1, -0.1, -0.05, -0.01, 0.01, 0.05, 0.1, 1]
</script>

<template>
  <section class="card">
    <h2>
      <div class="seg tabs">
        <button :class="{ on: tab === 'baby' }" @click="tab = 'baby'">Babystep</button>
        <button :class="{ on: tab === 'off' }" @click="tab = 'off'">Offset</button>
        <button :class="{ on: tab === 'probe' }" @click="tab = 'probe'">Sonda</button>
      </div>
      <span class="spacer" />
      <span class="mono zv" :class="{ neg: z < 0 }" title="offset Z actual (babystep)">Z {{ z >= 0 ? '+' : '' }}{{ z.toFixed(3) }}</span>
    </h2>

    <!-- prueba del papel: aparece en cualquier pestaña -->
    <div v-if="mp.is_active" class="manual">
      <div class="row">
        <strong>Prueba del papel</strong><span class="mute small">baja hasta que el papel roce</span><span class="grow" />
        <span class="mono big">Z {{ mp.z_position?.toFixed(3) }}</span>
      </div>
      <div class="tz">
        <button v-for="d in testz" :key="d" class="btn sm" :class="d < 0 ? 'down' : 'up'" @click="gcode(`TESTZ Z=${d}`)">{{ d > 0 ? '+' : '' }}{{ d }}</button>
      </div>
      <div class="row" style="margin-top: 6px">
        <button class="btn sm" @click="gcode('TESTZ Z=-')">− mitad</button>
        <button class="btn sm" @click="gcode('TESTZ Z=+')">+ mitad</button>
        <span class="grow" />
        <button class="btn sm danger" @click="gcode('ABORT')">Cancelar</button>
        <button class="btn sm primary" @click="gcode('ACCEPT')">Aceptar</button>
      </div>
    </div>

    <template v-if="tab === 'baby'">
      <div class="baby">
        <button v-for="s in [...state.prefs.babySteps].reverse()" :key="'d' + s" class="btn sm dn" :disabled="!ready" @click="baby(-s)">−{{ s }}</button>
        <span class="mid" title="− acerca la boquilla a la cama · + la aleja">|</span>
        <button v-for="s in state.prefs.babySteps" :key="'u' + s" class="btn sm up" :disabled="!ready" @click="baby(s)">+{{ s }}</button>
      </div>
      <div class="row" style="margin-top: 8px">
        <button class="btn sm" :disabled="!ready || z === 0" @click="gcode('SET_GCODE_OFFSET Z=0 MOVE=1')">Poner a 0</button>
        <button class="btn sm primary" :disabled="!ready || z === 0 || printing" @click="saveZ"
                :title="probeCfg ? 'Z_OFFSET_APPLY_PROBE: corrige el z_offset de la sonda' : 'Z_OFFSET_APPLY_ENDSTOP'">
          Guardar en {{ probeCfg ? 'la sonda' : 'el endstop Z' }}
        </button>
        <span class="mute small">vale imprimiendo; «Guardar» + SAVE_CONFIG lo fija</span>
      </div>
    </template>

    <template v-else-if="tab === 'off'">
      <div class="row">
        <div v-for="(a, i) in ['X', 'Y', 'Z']" :key="a" class="offv">
          <span :class="'ax-' + a.toLowerCase()">{{ a }}</span>
          <span class="mono">{{ (off[i] ?? 0).toFixed(3) }}</span>
          <input v-model="xyz[a as 'X' | 'Y' | 'Z']" class="num" type="number" step="0.01" placeholder="nuevo" @keydown.enter="applyOffsets" />
        </div>
      </div>
      <div class="row" style="margin-top: 8px">
        <button class="btn sm primary" :disabled="!ready" @click="applyOffsets">Aplicar</button>
        <button class="btn sm" :disabled="!ready" @click="gcode('SET_GCODE_OFFSET X=0 Y=0 Z=0 MOVE=1')">Quitar todos</button>
        <span class="mute small">desplaza la impresión (M206); se pierde al reiniciar</span>
      </div>
    </template>

    <template v-else>
      <template v-if="probeCfg">
        <div class="probe">
          <div class="kv">
            <span>Tipo</span><span>{{ probeKind }}</span>
            <span>Offset X/Y</span><span class="mono">{{ probeCfg.x_offset ?? 0 }} / {{ probeCfg.y_offset ?? 0 }}</span>
            <span>z_offset</span><span class="mono">{{ probeCfg.z_offset }}</span>
          </div>
          <div class="kv">
            <span>Estado</span><span><span class="led" :class="{ on: pr.last_query }" /> {{ pr.last_query ? 'disparada' : 'abierta' }}</span>
            <span>Último</span><span class="mono">{{ pr.last_z_result !== undefined ? pr.last_z_result.toFixed(4) : '—' }}</span>
            <template v-if="arm"><span>Brazo</span><span class="pill" :class="arm.deployed ? 'down' : 'up'">{{ arm.deployed ? 'BAJADO' : 'recogido' }}</span></template>
          </div>
        </div>
        <div class="row" style="margin-top: 8px">
          <template v-if="arm">
            <button class="btn sm" :disabled="!ready" @click="gcode('SONDA_LISTA')">Bajado</button>
            <button class="btn sm" :disabled="!ready" @click="gcode('SONDA_GUARDADA')">Subido</button>
            <span class="vsep" />
          </template>
          <button class="btn sm" :disabled="!ready" @click="gcode('QUERY_PROBE')">Consultar</button>
          <button class="btn sm" :disabled="busy || !allHomed" @click="gcode('PROBE')">Sondear</button>
          <button class="btn sm" :disabled="busy || !allHomed" @click="gcode('PROBE_ACCURACY SAMPLES=10')">Repetibilidad</button>
          <button class="btn sm primary" :disabled="busy || !allHomed" @click="gcode('PROBE_CALIBRATE')">Calibrar altura</button>
        </div>
      </template>
      <p v-else class="mute">No hay [probe] en la configuración.</p>
    </template>
  </section>
</template>

<style scoped>
.tabs button { padding: 3px 10px; font-size: 12px; text-transform: none; letter-spacing: 0; }
.zv { font-size: 15px; color: var(--ok); letter-spacing: 0; text-transform: none; }
.zv.neg { color: var(--accent2); }
.baby { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)) 14px repeat(4, minmax(0, 1fr)); gap: 4px; align-items: center; }
.baby .btn { padding: 4px 0; font-family: var(--mono); font-size: 11.5px; }
.baby .mid { font-size: 11px; color: var(--mute); text-align: center; }
.btn.up { color: var(--z); } .btn.dn { color: var(--accent2); }
.offv { display: flex; align-items: center; gap: 6px; background: var(--bg); border: 1px solid var(--line); border-radius: 10px; padding: 3px 4px 3px 9px; }
.offv .num { width: 64px; padding: 3px 6px; }
.manual { background: color-mix(in srgb, var(--accent) 8%, var(--bg)); border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--line)); border-radius: 12px; padding: 8px 10px; margin-bottom: 10px; }
.big { font-size: 17px; font-weight: 700; color: var(--accent2); }
.tz { display: grid; grid-template-columns: repeat(8, 1fr); gap: 4px; margin-top: 6px; }
.tz .down { color: var(--accent2); } .tz .up { color: var(--z); }
.probe { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.led { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #39424d; vertical-align: middle; }
.led.on { background: var(--ok); box-shadow: 0 0 6px var(--ok); }
.pill { font-size: 10.5px; padding: 0 7px; border-radius: 99px; font-weight: 600; justify-self: start; }
.pill.down { background: color-mix(in srgb, var(--warn) 18%, transparent); color: var(--warn); }
.pill.up { background: color-mix(in srgb, var(--ok) 15%, transparent); color: var(--ok); }
.vsep { width: 1px; height: 20px; background: var(--line); }
</style>
