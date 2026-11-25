import { createApp } from 'vue'
import App from './App.vue'
import { start } from './store/printer'
import './style.css'

start()
createApp(App).mount('#app')
