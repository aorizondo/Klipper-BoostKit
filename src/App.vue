<script setup lang="ts">
import { state } from './store/printer'
import StatusBar from './components/StatusBar.vue'
import MoveCard from './components/MoveCard.vue'
import TempCard from './components/TempCard.vue'
import TuneCard from './components/TuneCard.vue'
import OffsetCard from './components/OffsetCard.vue'
import ExtruderCard from './components/ExtruderCard.vue'
import ProbeCard from './components/ProbeCard.vue'
import ConsoleCard from './components/ConsoleCard.vue'
import PromptDialog from './components/PromptDialog.vue'
</script>

<template>
  <StatusBar />
  <main class="grid">
    <div class="col">
      <MoveCard />
      <ExtruderCard />
    </div>
    <div class="col">
      <TempCard />
      <TuneCard />
    </div>
    <div class="col">
      <OffsetCard />
      <ProbeCard />
      <ConsoleCard />
    </div>
  </main>
  <PromptDialog />
  <div class="toasts">
    <div v-for="t in state.toasts" :key="t.id" class="toast" :class="t.kind">{{ t.text }}</div>
  </div>
</template>

<style>
.grid { display: grid; grid-template-columns: minmax(340px, 1.25fr) minmax(320px, 1fr) minmax(320px, 1fr); gap: 16px; padding: 16px 18px 40px; align-items: start; }
.col { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
@media (max-width: 1280px) { .grid { grid-template-columns: 1fr 1fr; } .col:nth-child(3) { grid-column: 1 / -1; display: grid; grid-template-columns: 1fr 1fr; } }
@media (max-width: 820px) { .grid { grid-template-columns: 1fr; } .col:nth-child(3) { display: flex; } }
.toasts { position: fixed; right: 18px; bottom: 18px; display: flex; flex-direction: column; gap: 8px; z-index: 60; max-width: 420px; }
.toast { padding: 10px 14px; border-radius: 12px; background: var(--card2); border: 1px solid var(--line); box-shadow: 0 8px 30px rgba(0, 0, 0, .4); font-size: 13px; animation: tin .18s ease-out; }
.toast.err { border-color: color-mix(in srgb, var(--err) 60%, var(--line)); color: #ffd0d0; }
.toast.ok { border-color: color-mix(in srgb, var(--ok) 60%, var(--line)); }
@keyframes tin { from { transform: translateY(8px); opacity: 0; } }
</style>
