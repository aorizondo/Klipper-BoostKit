<script setup lang="ts">
// Consola mínima: para ver qué G-code genera cada botón (y aprenderlo).
import { nextTick, ref, watch } from 'vue'
import { state, gcode, ready } from '../store/printer'

const box = ref<HTMLElement>()
const cmd = ref('')
const hist: string[] = []
let hi = -1
const hideTemps = ref(true)

watch(
  () => state.log.length,
  async () => {
    await nextTick()
    const el = box.value
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 80) el.scrollTop = el.scrollHeight
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
const visible = (l: { text: string }) => !hideTemps.value || !/^(B|T\d?):|^ok$/.test(l.text)
</script>

<template>
  <section class="card console">
    <h2>Consola <span class="spacer" />
      <label class="small mute" style="text-transform: none; letter-spacing: 0"><input v-model="hideTemps" type="checkbox" /> ocultar ruido</label>
    </h2>
    <div ref="box" class="log mono">
      <div v-for="(l, i) in state.log" v-show="visible(l)" :key="i" :class="l.kind">
        <span class="ts">{{ t(l.t) }}</span><span class="txt">{{ l.kind === 'cmd' ? '› ' : '' }}{{ l.text }}</span>
      </div>
    </div>
    <div class="row" style="margin-top: 8px">
      <input v-model="cmd" class="num grow" style="text-align: left" placeholder="G-code (p.ej. HELP, M503, AYUDA_MARLIN)…" :disabled="!ready"
             @keydown.enter="send" @keydown.up.prevent="up(1)" @keydown.down.prevent="up(-1)" />
      <button class="btn sm primary" :disabled="!ready" @click="send">Enviar</button>
    </div>
  </section>
</template>

<style scoped>
.log { height: 220px; overflow: auto; background: var(--bg); border: 1px solid var(--line); border-radius: 10px; padding: 6px 8px; font-size: 12px; }
.log > div { white-space: pre-wrap; word-break: break-word; }
.ts { color: #4a535e; margin-right: 8px; }
.cmd .txt { color: var(--accent2); }
.err .txt { color: var(--err); }
.resp .txt { color: #c3cad3; }
</style>
