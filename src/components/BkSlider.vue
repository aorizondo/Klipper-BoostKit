<script setup lang="ts">
// Deslizador con número y atajos. Muestra el valor REAL de la impresora y
// solo envía al soltar (commit), para no saturar Klipper mientras arrastras.
import { ref, computed, watch } from 'vue'

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
    target?: number | null // valor objetivo distinto del actual (temperaturas)
  }>(),
  { step: 1, unit: '', decimals: 0, disabled: false, target: null }
)
const emit = defineEmits<{ commit: [value: number] }>()

const dragging = ref(false)
const local = ref(props.target ?? props.value)
watch(
  () => props.target ?? props.value,
  (v) => {
    if (!dragging.value) local.value = v
  }
)
const pct = computed(() => `${((local.value - props.min) / (props.max - props.min)) * 100}%`)
const fmt = (v: number) => v.toFixed(props.decimals)

function commit(v: number) {
  dragging.value = false
  const c = Math.min(props.max, Math.max(props.min, v))
  local.value = c
  emit('commit', c)
}
function onNum(ev: Event) {
  const v = parseFloat((ev.target as HTMLInputElement).value)
  if (!isNaN(v)) commit(v)
}
</script>

<template>
  <div class="bks" :class="{ disabled }">
    <div class="top">
      <span class="lbl">{{ label }}</span>
      <span class="live mono">
        {{ fmt(value) }}<small>{{ unit }}</small>
        <template v-if="target !== null"> <span class="mute">→ {{ fmt(target) }}{{ unit }}</span></template>
      </span>
    </div>
    <div class="mid">
      <input
        type="range" :min="min" :max="max" :step="step" :value="local" :disabled="disabled"
        :style="{ '--p': pct }"
        @input="dragging = true; local = +($event.target as HTMLInputElement).value"
        @change="commit(+($event.target as HTMLInputElement).value)"
      />
      <input class="num" type="number" :min="min" :max="max" :step="step" :value="fmt(local)" :disabled="disabled" @change="onNum" @keydown.enter="onNum" />
    </div>
    <div v-if="presets?.length" class="row presets">
      <button v-for="p in presets" :key="p" class="btn sm" :class="{ on: Math.abs((target ?? value) - p) < step / 2 }" :disabled="disabled" @click="commit(p)">
        {{ p }}{{ unit }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.bks + .bks { margin-top: 12px; }
.top { display: flex; justify-content: space-between; align-items: baseline; }
.lbl { font-weight: 500; }
.live { font-size: 18px; font-weight: 600; }
.live small { font-size: 12px; color: var(--mute); margin-left: 2px; }
.mid { display: flex; align-items: center; gap: 10px; }
.presets { margin-top: 4px; gap: 6px; }
.disabled { opacity: .6; }
</style>
