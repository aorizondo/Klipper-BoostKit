<script setup lang="ts">
import { computed, ref } from 'vue'
import { state, homed, gcode, savePrefs, printing } from '../store/printer'
import { jogUi, canJog } from '../composables/jog'
import JogNumpad from './JogNumpad.vue'
import JogWheel from './JogWheel.vue'

const view = ref<'both' | 'pad' | 'wheel'>((localStorage.getItem('bk.moveView') as any) ?? 'both')
function setView(v: typeof view.value) {
  view.value = v
  localStorage.setItem('bk.moveView', v)
}

const pos = computed<number[]>(() => state.status.motion_report?.live_position ?? state.status.toolhead?.position ?? [0, 0, 0, 0])
const gpos = computed<number[]>(() => state.status.gcode_move?.gcode_position ?? pos.value)
const lim = computed(() => ({
  min: state.status.toolhead?.axis_minimum ?? [0, 0, 0],
  max: state.status.toolhead?.axis_maximum ?? [0, 0, 0],
}))
const axes = ['X', 'Y', 'Z'] as const

const goto = ref<Record<string, string>>({ X: '', Y: '', Z: '' })
async function goTo() {
  const parts = axes.filter((a) => goto.value[a] !== '').map((a) => `${a}${parseFloat(goto.value[a])}`)
  if (!parts.length) return
  const z = parts.length === 1 && parts[0].startsWith('Z')
  await gcode(`SAVE_GCODE_STATE NAME=_bk_goto\nG90\nG1 ${parts.join(' ')} F${z ? state.prefs.jogFeedZ : state.prefs.jogFeedXY}\nRESTORE_GCODE_STATE NAME=_bk_goto`)
}

function setFeed(kind: 'jogFeedXY' | 'jogFeedZ', v: string) {
  const n = parseFloat(v)
  if (n > 0) {
    state.prefs[kind] = n * 60
    savePrefs()
  }
}
</script>

<template>
  <section class="card move">
    <h2>
      Movimiento
      <span class="spacer" />
      <div class="seg">
        <button :class="{ on: view === 'both' }" @click="setView('both')">Ambos</button>
        <button :class="{ on: view === 'pad' }" @click="setView('pad')">Teclado</button>
        <button :class="{ on: view === 'wheel' }" @click="setView('wheel')">Rueda</button>
      </div>
    </h2>

    <div class="posbar">
      <div v-for="(a, i) in axes" :key="a" class="axis" :class="'ax-' + a.toLowerCase()">
        <div class="an">
          {{ a }}
          <span class="dot" :class="{ homed: homed.includes(a.toLowerCase()) }" :title="homed.includes(a.toLowerCase()) ? 'con homing' : 'sin homing'" />
        </div>
        <div class="av mono">{{ pos[i]?.toFixed(2) }}</div>
        <div class="ar mono small mute">{{ lim.min[i] }} … {{ lim.max[i] }}</div>
        <div v-if="Math.abs(gpos[i] - pos[i]) > 0.001" class="ag mono small mute" title="posición G-code (con offsets)">G {{ gpos[i]?.toFixed(2) }}</div>
      </div>
    </div>

    <div class="row stepbar">
      <span class="mute small">Paso</span>
      <div class="seg">
        <button v-for="s in state.prefs.jogSteps" :key="s" :class="{ on: jogUi.step === s }" @click="jogUi.step = s">{{ s }}</button>
      </div>
      <span class="grow" />
      <label class="small mute">XY <input class="num" style="width: 64px" type="number" :value="state.prefs.jogFeedXY / 60" @change="setFeed('jogFeedXY', ($event.target as HTMLInputElement).value)" /> mm/s</label>
      <label class="small mute">Z <input class="num" style="width: 56px" type="number" :value="state.prefs.jogFeedZ / 60" @change="setFeed('jogFeedZ', ($event.target as HTMLInputElement).value)" /> mm/s</label>
    </div>

    <div v-if="printing" class="banner">Imprimiendo: el jog está bloqueado. Usa babystep y los ajustes en vivo.</div>

    <div class="jogs" :class="view">
      <JogNumpad v-if="view !== 'wheel'" />
      <JogWheel v-if="view !== 'pad'" />
    </div>

    <div class="sep" />
    <div class="row">
      <span class="mute small">Ir a</span>
      <input v-for="a in axes" :key="a" v-model="goto[a]" class="num" style="width: 72px" type="number" :placeholder="a" @keydown.enter="goTo" />
      <button class="btn sm" :disabled="!canJog" @click="goTo">Mover</button>
    </div>
    <p class="hint">Teclado numérico: 8/2/4/6 = Y/X, 7/9/1/3 = diagonales, +/− = Z, 5 = Home XY, 0 = Home todo,
      ↵ = extruir, . = retraer, / * = paso. También flechas y Re Pág/Av Pág.</p>
  </section>
</template>

<style scoped>
.posbar { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 12px; }
.axis { background: var(--bg); border: 1px solid var(--line); border-radius: 10px; padding: 8px 10px; }
.an { font-weight: 700; display: flex; align-items: center; gap: 6px; }
.av { font-size: 22px; font-weight: 600; color: var(--text); }
.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--warn); box-shadow: 0 0 6px var(--warn); }
.dot.homed { background: var(--ok); box-shadow: 0 0 6px var(--ok); }
.stepbar { margin-bottom: 12px; }
.jogs { display: flex; gap: 18px; align-items: center; flex-wrap: wrap; justify-content: center; }
.jogs > * { flex: 0 1 330px; }
.banner { background: color-mix(in srgb, var(--warn) 12%, transparent); border: 1px solid color-mix(in srgb, var(--warn) 40%, transparent); color: var(--warn); padding: 8px 10px; border-radius: 10px; margin-bottom: 10px; font-size: 13px; }
</style>
