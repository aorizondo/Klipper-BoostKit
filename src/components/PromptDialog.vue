<script setup lang="ts">
// Diálogos que abren las macros (action:prompt_*), p.ej. "Baja el brazo de la sonda".
import { prompt, closePrompt, gcode, type PromptButton } from '../store/printer'

function run(b: PromptButton) {
  gcode(b.gcode)
}
const cls = (c: string) => (c === 'primary' ? 'primary' : c === 'error' ? 'danger' : '')
</script>

<template>
  <div v-if="prompt.open" class="veil" @click.self="closePrompt">
    <div class="dlg">
      <div class="title">{{ prompt.title }} <button class="x" @click="closePrompt">×</button></div>
      <div class="body">
        <template v-for="(it, i) in prompt.items" :key="i">
          <p v-if="it.kind === 'text'">{{ it.text }}</p>
          <button v-else-if="it.kind === 'button'" class="btn" :class="cls(it.button!.color)" @click="run(it.button!)">{{ it.button!.label }}</button>
          <div v-else class="row">
            <button v-for="b in it.buttons" :key="b.label" class="btn grow" :class="cls(b.color)" @click="run(b)">{{ b.label }}</button>
          </div>
        </template>
      </div>
      <div v-if="prompt.footer.length" class="foot">
        <button v-for="b in prompt.footer" :key="b.label" class="btn" :class="cls(b.color)" @click="run(b)">{{ b.label }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.veil { position: fixed; inset: 0; background: rgba(0, 0, 0, .55); display: grid; place-items: center; z-index: 50; backdrop-filter: blur(2px); }
.dlg { width: min(440px, 92vw); background: var(--card); border: 1px solid var(--line); border-radius: 16px; box-shadow: 0 20px 60px rgba(0, 0, 0, .5); }
.title { padding: 14px 16px; font-weight: 700; border-bottom: 1px solid var(--line); display: flex; justify-content: space-between; }
.x { background: none; border: 0; color: var(--mute); font-size: 20px; cursor: pointer; line-height: 1; }
.body { padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }
.body p { margin: 0; }
.foot { padding: 12px 16px; border-top: 1px solid var(--line); display: flex; gap: 8px; justify-content: flex-end; }
</style>
