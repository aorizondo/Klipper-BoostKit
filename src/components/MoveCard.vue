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
  goto.value = { X: '', Y: '', Z: '' }
}
function setFeed(kind: 'jogFeedXY' | 'jogFeedZ', v: string) {
  const n = parseFloat(v)
  if (n > 0) {
    state.prefs[kind] = n * 60
    savePrefs()
  }
}
const help = 'Teclado numérico: 8/2/4/6 = Y/X · 7/9/1/3 = diagonales · +/− = Z · 5 = Home XY · 0 = Home todo · ↵ = extruir · . = retraer · / * = paso. También flechas y Re Pág/Av Pág.'
</script>

<template>
  <section class="card move">
    <h2>
      Movimiento <span class="help" :title="help">?</span>
      <span class="spacer" />
      <div class="seg mini">
        <button :class="{ on: view === 'both' }" @click="setView('both')">Ambos</button>
        <button :class="{ on: view === 'pad' }" @click="setView('pad')">Teclado</button>
        <button :class="{ on: view === 'wheel' }" @click="setView('wheel')">Rueda</button>
      </div>
    </h2>

    <div class="posbar">
      <div v-for="(a, i) in axes" :key="a" class="axis" :class="'ax-' + a.toLowerCase()"
           :title="`límites ${lim.min[i]} … ${lim.max[i]}` + (Math.abs(gpos[i] - pos[i]) > 0.001 ? ` · G-code ${gpos[i]?.toFixed(2)}` : '')">
        <span class="an">{{ a }}<i class="dot" :class="{ homed: homed.includes(a.toLowerCase()) }" /></span>
        <span class="av mono">{{ pos[i]?.toFixed(2) }}</span>
        <input v-model="goto[a]" class="go num" type="number" placeholder="ir a" :disabled="!canJog" @keydown.enter="goTo" />
      </div>
    </div>

    <div class="row stepbar">
      <span class="mute small">Paso</span>
      <div class="seg mini">
        <button v-for="s in state.prefs.jogSteps" :key="s" :class="{ on: jogUi.step === s }" @click="jogUi.step = s">{{ s }}</button>
      </div>
      <span class="grow" />
      <label class="small mute">XY <input class="num f" type="number" :value="state.prefs.jogFeedXY / 60" @change="setFeed('jogFeedXY', ($event.target as HTMLInputElement).value)" /></label>
      <label class="small mute">Z <input class="num f" type="number" :value="state.prefs.jogFeedZ / 60" @change="setFeed('jogFeedZ', ($event.target as HTMLInputElement).value)" /> mm/s</label>
    </div>

    <div v-if="printing" class="banner">Imprimiendo: jog bloqueado (usa babystep y ajustes en vivo).</div>

    <div class="jogs">
      <JogNumpad v-if="view !== 'wheel'" />
      <JogWheel v-if="view !== 'pad'" />
    </div>
  </section>
</template>

<style scoped>
.help { display: inline-grid; place-items: center; width: 16px; height: 16px; border-radius: 50%; border: 1px solid var(--line); font-size: 10px; cursor: help; letter-spacing: 0; }
.seg.mini button { padding: 3px 9px; font-size: 12px; text-transform: none; letter-spacing: 0; }
.posbar { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-bottom: 8px; }
.axis { background: var(--bg); border: 1px solid var(--line); border-radius: 9px; padding: 4px 6px 4px 9px; display: flex; align-items: center; gap: 6px; }
.an { font-weight: 700; display: flex; align-items: center; gap: 4px; }
.av { font-size: 17px; font-weight: 600; color: var(--text); flex: 1; }
.go { width: 58px; padding: 2px 5px; font-size: 11.5px; }
.dot { width: 7px; height: 7px; border-radius: 50%; background: var(--warn); box-shadow: 0 0 5px var(--warn); display: inline-block; }
.dot.homed { background: var(--ok); box-shadow: 0 0 5px var(--ok); }
.stepbar { margin-bottom: 8px; gap: 6px; }
.num.f { width: 48px; padding: 2px 5px; font-size: 12px; }
.jogs { display: flex; gap: 10px; align-items: center; justify-content: space-between; flex-wrap: wrap; }
.banner { background: color-mix(in srgb, var(--warn) 12%, transparent); border: 1px solid color-mix(in srgb, var(--warn) 40%, transparent); color: var(--warn); padding: 5px 10px; border-radius: 9px; margin-bottom: 8px; font-size: 12.5px; }
</style>
