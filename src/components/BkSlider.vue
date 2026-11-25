<script setup lang="ts">
// Deslizador compacto en una fila: nombre · valor real · barra · consigna · ▾ atajos.
// Envía solo al soltar (commit) para no saturar Klipper mientras arrastras.
import { ref, computed, watch, onBeforeUnmount } from 'vue'

const props = withDefaults(
  defineProps<{
    label: string
    value: number
    min: number
    max: number
    step?: number
    unit?: string
    presets?: number[]
    decimals?: number
    disabled?: boolean
    target?: number | null // consigna distinta del valor real (temperaturas)
    color?: string
  }>(),
  { step: 1, unit: '', decimals: 0, disabled: false, target: null, color: '' }
)
const emit = defineEmits<{ commit: [value: number] }>()

const dragging = ref(false)
const set = computed(() => props.target ?? props.value)
const local = ref(set.value)
watch(set, (v) => {
  if (!dragging.value) local.value = v
})
const pct = computed(() => `${((local.value - props.min) / (props.max - props.min)) * 100}%`)
const fmt = (v: number) => (isFinite(v) ? v.toFixed(props.decimals) : '—')

function commit(v: number) {
  dragging.value = false
  const c = Math.min(props.max, Math.max(props.min, v))
  local.value = c
  emit('commit', c)
  menu.value = false
}
function onNum(ev: Event) {
  const v = parseFloat((ev.target as HTMLInputElement).value)
  if (!isNaN(v)) commit(v)
}
const menu = ref(false)
const root = ref<HTMLElement>()
function outside(ev: MouseEvent) {
  if (menu.value && root.value && !root.value.contains(ev.target as Node)) menu.value = false
}
document.addEventListener('mousedown', outside)
onBeforeUnmount(() => document.removeEventListener('mousedown', outside))
</script>

<template>
  <div ref="root" class="bks" :class="{ disabled }" :style="color ? { '--accent': color } : {}">
    <span class="lbl" :title="label">{{ label }}</span>
    <span class="live mono" :class="{ hot: target !== null && target > 0 }">{{ fmt(value) }}<small>{{ unit }}</small></span>
    <input
      type="range" :min="min" :max="max" :step="step" :value="local" :disabled="disabled"
      :style="{ '--p': pct }"
      @input="dragging = true; local = +($event.target as HTMLInputElement).value"
      @change="commit(+($event.target as HTMLInputElement).value)"
    />
    <input class="num" type="number" :min="min" :max="max" :step="step" :value="fmt(local)" :disabled="disabled"
           :title="target !== null ? 'consigna' : ''" @change="onNum" @keydown.enter="onNum" />
    <button v-if="presets?.length" class="more" :disabled="disabled" title="atajos" @click="menu = !menu">▾</button>
    <span v-else class="more-sp" />
    <div v-if="menu" class="pop">
      <button v-for="p in presets" :key="p" class="btn sm" :class="{ on: Math.abs(set - p) < step / 2 }" @click="commit(p)">{{ p }}{{ unit }}</button>
    </div>
  </div>
</template>

<style scoped>
.bks { position: relative; display: grid; grid-template-columns: 86px 62px 1fr 64px 20px; align-items: center; gap: 8px; height: 30px; }
.lbl { font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.live { font-size: 13px; font-weight: 600; text-align: right; }
.live.hot { color: var(--accent2); }
.live small { font-size: 10px; color: var(--mute); margin-left: 1px; font-weight: 400; }
.num { width: 64px; padding: 3px 6px; font-size: 12px; }
.more { background: none; border: 1px solid var(--line); border-radius: 6px; color: var(--mute); cursor: pointer; padding: 0; height: 22px; font-size: 11px; }
.more:hover:not(:disabled) { color: var(--text); border-color: var(--accent); }
.pop { position: absolute; right: 0; top: 30px; z-index: 20; display: flex; gap: 4px; flex-wrap: wrap; max-width: 300px; justify-content: flex-end;
  background: var(--card2); border: 1px solid var(--line); border-radius: 10px; padding: 6px; box-shadow: 0 10px 30px rgba(0, 0, 0, .45); }
.disabled { opacity: .6; }
input[type=range] { height: 20px; }
</style>
