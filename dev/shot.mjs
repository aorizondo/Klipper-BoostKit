// Prueba visual: abre la app en Chromium headless, ejecuta pasos y hace capturas.
//   node dev/shot.mjs [url] [salida-dir]
// Pasos en STEPS: {js} se evalúa en la página, {key} pulsa una tecla (code),
// {wait} ms, {shot} nombre de la captura.
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'

const URL = process.argv[2] ?? 'http://localhost:5180/'
const OUT = process.argv[3] ?? '/tmp/opencode/shots'
mkdirSync(OUT, { recursive: true })
const PORT = 9333
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const click = (text) => `(() => { const b=[...document.querySelectorAll('button,.key,g.corner')].find(e=>e.textContent.replace(/\\s+/g,' ').trim().includes(${JSON.stringify(text)})); if(!b) return 'NO '+${JSON.stringify(text)}; b.dispatchEvent(new MouseEvent('click',{bubbles:true})); return 'ok' })()`

const SCENARIOS = {}
SCENARIOS.tele = [
  { js: `localStorage.setItem('bk.tele', JSON.stringify({visible:['temp','vel','acc','flow','adxl','fac'],minutes:1})); location.reload(); 'ok'` },
  { wait: 2500 },
  { js: `fetch; 'ok'` },
  { gcode: 'SET_HEATER_TEMPERATURE HEATER=extruder TARGET=210' },
  { gcode: 'MOCK_PRINT' },
  { wait: 20000 },
  { gcode: 'M220 S150' },
  { wait: 6000 },
  { mouse: [900, 330] },
  { wait: 400 },
  { shot: 'tele-1600x900', full: false },
  { shot: 'tele-full' },
]
SCENARIOS.default = [
  { wait: 2500 },
  { shot: '01-inicio' },
  { js: click('Home todo') }, { wait: 2500 },
  { shot: '02-dialogo-sonda' },
  { js: click('Listo') }, { wait: 5500 },
  { js: click('Recogida') }, { wait: 500 },
  { key: 'Numpad6' }, { wait: 600 }, { key: 'Numpad8' }, { wait: 600 }, { key: 'NumpadAdd' }, { wait: 800 },
  { js: click('+0.05') }, { wait: 400 },
  { js: click('Calibrar altura') }, { wait: 600 },
  { key: 'Numpad4' }, { wait: 50 },
  { shot: '03-tras-jog' },
  { js: `document.querySelector('.log')?.innerText.slice(-1500)` },
]
const STEPS = SCENARIOS[process.env.SCENARIO ?? 'default']
const W = +(process.env.W ?? 1600), H = +(process.env.H ?? 1500)

const chrome = spawn('chromium', ['--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, `--window-size=${W},${H}`, 'about:blank'], { stdio: 'ignore' })
try {
  let targets
  for (let i = 0; i < 40; i++) {
    try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); break } catch { await sleep(250) }
  }
  const page = targets.find((t) => t.type === 'page')
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((r) => (ws.onopen = r))
  let id = 0
  const pend = new Map()
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data)
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) }
    if (m.method === 'Runtime.exceptionThrown') console.log('EXC', m.params.exceptionDetails.exception?.description)
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') console.log('CONSOLE', m.params.args.map((a) => a.value ?? a.description).join(' '))
  }
  const cdp = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
  await cdp('Runtime.enable')
  await cdp('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false })
  await cdp('Page.navigate', { url: URL })
  for (const s of STEPS) {
    if (s.wait) await sleep(s.wait)
    if (s.js) {
      const r = await cdp('Runtime.evaluate', { expression: s.js, returnByValue: true })
      console.log('js:', JSON.stringify(r.result?.result?.value ?? r.result?.exceptionDetails?.text))
    }
    if (s.gcode) {
      // via la propia app: misma conexión que los botones
      const r = await cdp('Runtime.evaluate', { expression: `(async()=>{const ws=new WebSocket('ws://'+location.host+'/websocket');await new Promise(r=>ws.onopen=r);ws.send(JSON.stringify({jsonrpc:'2.0',id:1,method:'printer.gcode.script',params:{script:${JSON.stringify(s.gcode)}}}));await new Promise(r=>setTimeout(r,300));ws.close();return 'sent'})()`, awaitPromise: true, returnByValue: true })
      console.log('gcode:', s.gcode, r.result?.result?.value)
    }
    if (s.mouse) await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: s.mouse[0], y: s.mouse[1] })
    if (s.key) {
      for (const type of ['keyDown', 'keyUp']) await cdp('Input.dispatchKeyEvent', { type, code: s.key, key: s.key })
    }
    if (s.shot) {
      const r = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: s.full !== false })
      writeFileSync(`${OUT}/${s.shot}.png`, Buffer.from(r.result.data, 'base64'))
      console.log('shot', `${OUT}/${s.shot}.png`)
    }
  }
  ws.close()
} finally {
  chrome.kill()
}
