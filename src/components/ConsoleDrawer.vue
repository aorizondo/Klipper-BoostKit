<script setup lang="ts">
// Consola plegable abajo: muestra la última línea; se abre para ver qué G-code
// envía cada botón (y aprenderlo) o escribir comandos.
import { computed, nextTick, ref, watch } from 'vue'
import { state, gcode, ready } from '../store/printer'

const open = ref(localStorage.getItem('bk.console') === '1')
watch(open, (o) => {
  localStorage.setItem('bk.console', o ? '1' : '0')
  if (o) nextTick(scroll)
})
const box = ref<HTMLElement>()
const cmd = ref('')
const hist: string[] = []
let hi = -1
const hideNoise = ref(true)
const lastLine = computed(() => state.log[state.log.length - 1])

function scroll() {
  const el = box.value
  if (el) el.scrollTop = el.scrollHeight
}
watch(
  () => state.log.length,
  async () => {
    await nextTick()
    const el = box.value
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 80) scroll()
  }
)
function send() {
  const c = cmd.value.trim()
  if (!c) return
  hist.unshift(c)
  hi = -1
  cmd.value = ''
  gcode(c)
}
function up(d: number) {
  hi = Math.min(hist.length - 1, Math.max(-1, hi + d))
  cmd.value = hi < 0 ? '' : hist[hi]
}
const t = (ms: number) => new Date(ms).toLocaleTimeString()
const visible = (l: { text: string }) => !hideNoise.value || !/^(B|T\d?):|^ok$/.test(l.text)
</script>

<template>
  <div class="drawer" :class="{ open }">
    <div class="bar" @click="open = !open">
      <span class="tt">{{ open ? '▾' : '▴' }} Consola</span>
      <span v-if="!open && lastLine" class="last mono" :class="lastLine.kind">{{ lastLine.kind === 'cmd' ? '› ' : '' }}{{ lastLine.text.split('\n')[0] }}</span>
      <span class="grow" />
      <label v-if="open" class="small mute" @click.stop><input v-model="hideNoise" type="checkbox" /> ocultar ruido</label>
    </div>
    <template v-if="open">
      <div ref="box" class="log mono">
        <div v-for="(l, i) in state.log" v-show="visible(l)" :key="i" :class="l.kind">
          <span class="ts">{{ t(l.t) }}</span><span class="txt">{{ l.kind === 'cmd' ? '› ' : '' }}{{ l.text }}</span>
        </div>
      </div>
      <div class="row in">
        <input v-model="cmd" class="num grow" style="text-align: left" placeholder="G-code (HELP, M503, AYUDA_MARLIN…) · ↑↓ historial" :disabled="!ready"
               @keydown.enter="send" @keydown.up.prevent="up(1)" @keydown.down.prevent="up(-1)" />
        <button class="btn sm primary" :disabled="!ready" @click="send">Enviar</button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.drawer { position: fixed; left: 0; right: 0; bottom: 0; z-index: 30; background: color-mix(in srgb, var(--bg2) 96%, transparent); backdrop-filter: blur(8px); border-top: 1px solid var(--line); }
.bar { display: flex; align-items: center; gap: 12px; padding: 5px 18px; cursor: pointer; height: 30px; }
.tt { font-size: 11.5px; letter-spacing: .1em; text-transform: uppercase; color: var(--mute); font-weight: 600; white-space: nowrap; }
.last { font-size: 12px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: #aeb6c0; }
.last.err { color: var(--err); } .last.cmd { color: var(--accent2); }
.log { height: 230px; overflow: auto; padding: 4px 18px; font-size: 12px; border-top: 1px solid var(--line); }
.log > div { white-space: pre-wrap; word-break: break-word; }
.ts { color: #4a535e; margin-right: 8px; }
.cmd .txt { color: var(--accent2); } .err .txt { color: var(--err); } .resp .txt { color: #c3cad3; }
.in { padding: 6px 18px 8px; }
</style>
