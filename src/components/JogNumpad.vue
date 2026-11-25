<script setup lang="ts">
// Teclado numérico: la misma disposición que el físico. Funciona con el
// teclado real (event.code, da igual Bloq Num) y también pulsando en pantalla.
import { onMounted, onBeforeUnmount } from 'vue'
import { jog, home, extrude, jogUi, stepBy, canJog } from '../composables/jog'
import { prompt } from '../store/printer'

interface Key {
  code: string
  label: string
  act: string
  cls?: string
  run: () => void
  area: string
}
const s = () => jogUi.step
const keys: Key[] = [
  { code: 'NumpadDivide', label: '/', act: 'paso −', run: () => stepBy(-1), area: 'div', cls: 'fn' },
  { code: 'NumpadMultiply', label: '*', act: 'paso +', run: () => stepBy(1), area: 'mul', cls: 'fn' },
  { code: 'NumpadSubtract', label: '−', act: 'Z−', run: () => jog({ Z: -s() }), area: 'sub', cls: 'z' },
  { code: 'Numpad7', label: '7', act: '↖', run: () => jog({ X: -s(), Y: s() }), area: 'n7', cls: 'diag' },
  { code: 'Numpad8', label: '8', act: 'Y+', run: () => jog({ Y: s() }), area: 'n8', cls: 'y' },
  { code: 'Numpad9', label: '9', act: '↗', run: () => jog({ X: s(), Y: s() }), area: 'n9', cls: 'diag' },
  { code: 'NumpadAdd', label: '+', act: 'Z+', run: () => jog({ Z: s() }), area: 'add', cls: 'z' },
  { code: 'Numpad4', label: '4', act: 'X−', run: () => jog({ X: -s() }), area: 'n4', cls: 'x' },
  { code: 'Numpad5', label: '5', act: 'Home XY', run: () => home('XY'), area: 'n5', cls: 'home' },
  { code: 'Numpad6', label: '6', act: 'X+', run: () => jog({ X: s() }), area: 'n6', cls: 'x' },
  { code: 'Numpad1', label: '1', act: '↙', run: () => jog({ X: -s(), Y: -s() }), area: 'n1', cls: 'diag' },
  { code: 'Numpad2', label: '2', act: 'Y−', run: () => jog({ Y: -s() }), area: 'n2', cls: 'y' },
  { code: 'Numpad3', label: '3', act: '↘', run: () => jog({ X: s(), Y: -s() }), area: 'n3', cls: 'diag' },
  { code: 'NumpadEnter', label: '↵', act: 'Extruir', run: () => extrude(1), area: 'ent', cls: 'e' },
  { code: 'Numpad0', label: '0', act: 'Home todo', run: () => home(), area: 'n0', cls: 'home' },
  { code: 'NumpadDecimal', label: '.', act: 'Retraer', run: () => extrude(-1), area: 'dec', cls: 'e' },
]
// Alias para teclados sin bloque numérico.
const alias: Record<string, string> = {
  ArrowUp: 'Numpad8', ArrowDown: 'Numpad2', ArrowLeft: 'Numpad4', ArrowRight: 'Numpad6',
  PageUp: 'NumpadAdd', PageDown: 'NumpadSubtract', Home: 'Numpad5',
}
const byCode = new Map(keys.map((k) => [k.code, k]))

function press(k: Key) {
  jogUi.flash = k.code
  setTimeout(() => jogUi.flash === k.code && (jogUi.flash = ''), 180)
  k.run()
}
function onKey(ev: KeyboardEvent) {
  if (!jogUi.keyboard || prompt.open || ev.repeat || ev.ctrlKey || ev.altKey || ev.metaKey) return
  const t = ev.target as HTMLElement
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
  const k = byCode.get(alias[ev.code] ?? ev.code)
  if (!k) return
  ev.preventDefault()
  press(k)
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="pad" :class="{ off: !canJog }">
    <div class="key lock" :class="{ on: jogUi.keyboard }" style="grid-area: lock" @click="jogUi.keyboard = !jogUi.keyboard"
         title="Activar/desactivar el teclado físico">
      <span class="big">⌨</span><span class="act">{{ jogUi.keyboard ? 'teclado ON' : 'teclado OFF' }}</span>
    </div>
    <button v-for="k in keys" :key="k.code" class="key" :class="[k.cls, { flash: jogUi.flash === k.code }]"
            :style="{ gridArea: k.area }" :disabled="!canJog && k.cls !== 'fn'" @click="press(k)">
      <span class="big">{{ k.label }}</span><span class="act">{{ k.act }}</span>
    </button>
  </div>
</template>

<style scoped>
.pad {
  display: grid; gap: 7px;
  grid-template-columns: repeat(4, 1fr);
  grid-template-rows: repeat(5, 54px);
  grid-template-areas:
    'lock div mul sub'
    'n7 n8 n9 add'
    'n4 n5 n6 add'
    'n1 n2 n3 ent'
    'n0 n0 dec ent';
  max-width: 330px;
}
.key {
  background: linear-gradient(180deg, #262b33, #1c2027); border: 1px solid var(--line);
  border-bottom-width: 3px; border-radius: 10px; cursor: pointer; display: flex; flex-direction: column;
  align-items: center; justify-content: center; user-select: none; transition: transform .05s, background .1s, border-color .1s;
  padding: 0;
}
.key:hover:not(:disabled) { border-color: #3c4550; }
.key:active:not(:disabled), .key.flash { transform: translateY(2px); border-bottom-width: 1px; background: color-mix(in srgb, var(--accent) 25%, #1c2027); border-color: var(--accent); }
.key:disabled { opacity: .35; cursor: not-allowed; }
.big { font-size: 18px; font-weight: 600; line-height: 1; }
.act { font-size: 10.5px; color: var(--mute); margin-top: 3px; letter-spacing: .02em; }
.x .act { color: var(--x); } .y .act { color: var(--y); } .z .act { color: var(--z); } .e .act { color: var(--e); }
.home .act { color: var(--accent2); }
.diag .act { color: #9aa3ad; font-size: 13px; }
.lock.on { border-color: color-mix(in srgb, var(--ok) 60%, var(--line)); }
.lock.on .act { color: var(--ok); }
.off .lock { opacity: 1; }
</style>
