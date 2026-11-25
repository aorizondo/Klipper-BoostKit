<script setup lang="ts">
// Babystep (Z en vivo) y offsets de G-code ("offset de cama", el M206/M290 de Marlin).
import { computed, ref } from 'vue'
import { state, gcode, ready, probeCfg, printing } from '../store/printer'

const off = computed<number[]>(() => state.status.gcode_move?.homing_origin ?? [0, 0, 0, 0])
const z = computed(() => off.value[2] ?? 0)

function baby(d: number) {
  gcode(`SET_GCODE_OFFSET Z_ADJUST=${d} MOVE=1`)
}
const xyz = ref({ X: '', Y: '', Z: '' })
function applyOffsets() {
  const parts = (['X', 'Y', 'Z'] as const).filter((a) => xyz.value[a] !== '').map((a) => `${a}=${parseFloat(xyz.value[a])}`)
  if (parts.length) gcode(`SET_GCODE_OFFSET ${parts.join(' ')} MOVE=1`)
  xyz.value = { X: '', Y: '', Z: '' }
}
async function saveZ() {
  // Con sonda: corrige su z_offset; sin sonda: el position_endstop de Z.
  const cmd = probeCfg.value ? 'Z_OFFSET_APPLY_PROBE' : 'Z_OFFSET_APPLY_ENDSTOP'
  if (await gcode(cmd)) state.saveConfigPending = true
}
</script>

<template>
  <section class="card">
    <h2>Babystep Z <span class="spacer" /><span class="mono zv" :class="{ neg: z < 0 }">{{ z >= 0 ? '+' : '' }}{{ z.toFixed(3) }} mm</span></h2>
    <div class="baby">
      <div class="col">
        <button v-for="s in [...state.prefs.babySteps].reverse()" :key="'u' + s" class="btn up" :disabled="!ready" @click="baby(s)">▲ +{{ s }}</button>
      </div>
      <div class="viz">
        <div class="nozzle" />
        <div class="gap" :style="{ height: 18 + Math.max(-14, Math.min(30, z * 60)) + 'px' }"><span class="mono small">{{ z.toFixed(3) }}</span></div>
        <div class="bed" />
        <div class="small mute">sube = boquilla más lejos</div>
      </div>
      <div class="col">
        <button v-for="s in state.prefs.babySteps" :key="'d' + s" class="btn dn" :disabled="!ready" @click="baby(-s)">▼ −{{ s }}</button>
      </div>
    </div>
    <div class="row" style="margin-top: 10px">
      <button class="btn sm" :disabled="!ready || z === 0" @click="gcode('SET_GCODE_OFFSET Z=0 MOVE=1')">Poner a 0</button>
      <button class="btn sm primary" :disabled="!ready || z === 0 || printing" @click="saveZ"
              :title="probeCfg ? 'Z_OFFSET_APPLY_PROBE: corrige el z_offset de la sonda' : 'Z_OFFSET_APPLY_ENDSTOP'">
        Guardar en {{ probeCfg ? 'la sonda' : 'el endstop Z' }}
      </button>
    </div>
    <p class="hint">Se aplica al momento, también imprimiendo. «Guardar» lo deja fijo (luego SAVE_CONFIG, arriba).</p>

    <div class="sep" />
    <h2>Offset de G-code (cama)</h2>
    <div class="row">
      <div v-for="(a, i) in ['X', 'Y', 'Z']" :key="a" class="offv">
        <span :class="'ax-' + a.toLowerCase()">{{ a }}</span>
        <span class="mono">{{ (off[i] ?? 0).toFixed(3) }}</span>
        <input v-model="xyz[a as 'X' | 'Y' | 'Z']" class="num" type="number" step="0.01" :placeholder="a" @keydown.enter="applyOffsets" />
      </div>
      <button class="btn sm" :disabled="!ready" @click="applyOffsets">Aplicar</button>
      <button class="btn sm" :disabled="!ready" @click="gcode('SET_GCODE_OFFSET X=0 Y=0 Z=0 MOVE=1')">Quitar</button>
    </div>
    <p class="hint">Desplaza todo lo que se imprime (como M206 en Marlin). Se pierde al reiniciar Klipper.</p>
  </section>
</template>

<style scoped>
.zv { font-size: 18px; color: var(--ok); letter-spacing: 0; text-transform: none; }
.zv.neg { color: var(--accent2); }
.baby { display: grid; grid-template-columns: 1fr auto 1fr; gap: 12px; align-items: center; }
.col { display: flex; flex-direction: column; gap: 6px; }
.btn.up { color: var(--z); } .btn.dn { color: var(--accent2); }
.viz { display: flex; flex-direction: column; align-items: center; width: 110px; }
.nozzle { width: 0; height: 0; border-left: 16px solid transparent; border-right: 16px solid transparent; border-top: 26px solid #8a939e; }
.gap { display: flex; align-items: center; justify-content: center; transition: height .2s; min-height: 4px; }
.bed { width: 100px; height: 8px; border-radius: 3px; background: linear-gradient(90deg, var(--accent), var(--accent2)); margin-bottom: 6px; }
.offv { display: flex; align-items: center; gap: 6px; background: var(--bg); border: 1px solid var(--line); border-radius: 10px; padding: 4px 6px 4px 10px; }
.offv .num { width: 70px; }
</style>
