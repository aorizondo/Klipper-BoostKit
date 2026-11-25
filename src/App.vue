<script setup lang="ts">
import { state } from './store/printer'
import StatusBar from './components/StatusBar.vue'
import MoveCard from './components/MoveCard.vue'
import ExtruderCard from './components/ExtruderCard.vue'
import TelemetryCard from './components/TelemetryCard.vue'
import TempCard from './components/TempCard.vue'
import TuneCard from './components/TuneCard.vue'
import ZCard from './components/ZCard.vue'
import ConsoleDrawer from './components/ConsoleDrawer.vue'
import PromptDialog from './components/PromptDialog.vue'
</script>

<template>
  <StatusBar />
  <main class="grid">
    <div class="col c1">
      <MoveCard />
      <TempCard />
    </div>
    <div class="col c2">
      <TelemetryCard />
    </div>
    <div class="col c3">
      <TuneCard />
      <ZCard />
      <ExtruderCard />
    </div>
  </main>
  <ConsoleDrawer />
  <PromptDialog />
  <div class="toasts">
    <div v-for="t in state.toasts" :key="t.id" class="toast" :class="t.kind">{{ t.text }}</div>
  </div>
</template>

<style>
.grid { display: grid; grid-template-columns: minmax(510px, 1fr) minmax(420px, 1.15fr) minmax(400px, 1fr); gap: 12px; padding: 12px 14px 46px; align-items: start; }
.col { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
@media (max-width: 1450px) {
  .grid { grid-template-columns: minmax(500px, 1fr) minmax(380px, 1fr); }
  .c3 { grid-column: 1 / -1; display: grid; grid-template-columns: 1fr 1fr; align-items: start; }
}
@media (max-width: 960px) {
  .grid { grid-template-columns: 1fr; }
  .c3 { display: flex; }
}
.toasts { position: fixed; right: 18px; bottom: 42px; display: flex; flex-direction: column; gap: 8px; z-index: 60; max-width: 420px; }
.toast { padding: 9px 13px; border-radius: 12px; background: var(--card2); border: 1px solid var(--line); box-shadow: 0 8px 30px rgba(0, 0, 0, .4); font-size: 13px; animation: tin .18s ease-out; }
.toast.err { border-color: color-mix(in srgb, var(--err) 60%, var(--line)); color: #ffd0d0; }
.toast.ok { border-color: color-mix(in srgb, var(--ok) 60%, var(--line)); }
@keyframes tin { from { transform: translateY(8px); opacity: 0; } }
</style>
