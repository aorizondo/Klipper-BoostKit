import { createApp } from 'vue'
import App from './App.vue'
import { start, hooks } from './store/printer'
import { startTelemetry, seedTemps } from './store/telemetry'
import './style.css'

hooks.tempStore = seedTemps
start()
startTelemetry()
createApp(App).mount('#app')
