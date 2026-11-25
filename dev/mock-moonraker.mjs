// Simulador de Moonraker + Klipper para desarrollar la interfaz sin impresora.
// Imita una MK4 (Klipper, sin cama caliente, sonda de brazo manual con diálogo).
//   npm run mock            (escucha en :7125)
//   MOCK_PRINT              G-code extra: simula una impresión para probar la UI.
import { WebSocketServer } from 'ws'
import http from 'node:http'

const PORT = +(process.env.PORT ?? 7125)
const LIM = { min: [-40, -60, -0.5, 0], max: [310, 320, 110, 0] }

const S = {
  webhooks: { state: 'ready', state_message: 'Printer is ready' },
  heaters: { available_heaters: ['extruder'], available_sensors: ['extruder', 'temperature_sensor raspberry_pi'] },
  print_stats: { state: 'standby', filename: '', print_duration: 0 },
  virtual_sdcard: { progress: 0, is_active: false },
  toolhead: {
    position: [0, 0, 0, 0], homed_axes: '', max_velocity: 150, max_accel: 2500, square_corner_velocity: 5,
    axis_minimum: LIM.min, axis_maximum: LIM.max, print_time: 0,
  },
  motion_report: { live_position: [0, 0, 0, 0], live_velocity: 0 },
  gcode_move: {
    speed_factor: 1, extrude_factor: 1, absolute_coordinates: true, absolute_extrude: true,
    homing_origin: [0, 0, 0, 0], position: [0, 0, 0, 0], gcode_position: [0, 0, 0, 0], speed: 1500,
  },
  extruder: { temperature: 24, target: 0, power: 0, pressure_advance: 0.08, smooth_time: 0.04, can_extrude: false },
  'temperature_sensor raspberry_pi': { temperature: 47.5 },
  fan: { speed: 0, rpm: null },
  idle_timeout: { state: 'Idle' },
  pause_resume: { is_paused: false },
  probe: { last_query: false, last_z_result: 0 },
  manual_probe: { is_active: false, z_position: null, z_position_lower: null, z_position_upper: null },
  'gcode_macro _SONDA': { deployed: false, pending: 0 },
}
const settings = {
  printer: { kinematics: 'cartesian', max_velocity: 150, max_accel: 2500, square_corner_velocity: 5 },
  extruder: { max_temp: 270, min_extrude_temp: 170, nozzle_diameter: 0.4, filament_diameter: 1.75 },
  probe: { x_offset: -12, y_offset: -10, z_offset: 0.7, speed: 4, samples: 3 },
  stepper_x: { position_min: -40, position_max: 310, position_endstop: -40 },
  stepper_y: { position_min: -60, position_max: 320, position_endstop: -60 },
  stepper_z: { position_min: -2, position_max: 110 },
}
let savePending = false
const db = {}
const tempHist = { extruder: { temperatures: [], targets: [], powers: [] } }

// ------------------------------------------------------------------ red
const clients = new Set()
function broadcast(method, params) {
  const msg = JSON.stringify({ jsonrpc: '2.0', method, params })
  for (const ws of clients) ws.readyState === 1 && ws.send(msg)
}
const say = (line) => broadcast('notify_gcode_response', [line])
class GError extends Error {}

// ------------------------------------------------------------------ movimiento
const st = { rel: false, relE: false, saved: {} }
let anim = null // {from,to,t0,dur}
function moveTo(target, feed) {
  const from = [...S.toolhead.position]
  const d = Math.hypot(target[0] - from[0], target[1] - from[1], target[2] - from[2])
  const v = Math.min(feed / 60, S.toolhead.max_velocity) * S.gcode_move.speed_factor
  const dur = d > 0 ? (d / Math.max(v, 1)) * 1000 : 0
  S.toolhead.position = [...target]
  anim = { from, to: [...target], t0: Date.now(), dur }
  return dur
}
function gpos() {
  const o = S.gcode_move.homing_origin
  return S.toolhead.position.map((p, i) => +(p - (o[i] ?? 0)).toFixed(4))
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function params(line) {
  const p = {}
  for (const m of line.matchAll(/([A-Z_]+)=("[^"]*"|\S+)/gi)) p[m[1].toUpperCase()] = m[2].replace(/^"|"$/g, '')
  return p
}
function words(line) {
  const p = {}
  for (const m of line.matchAll(/\b([XYZEFSPR])(-?[\d.]+)/gi)) p[m[1].toUpperCase()] = parseFloat(m[2])
  return p
}
function prompt(title, text, buttons) {
  say(`// action:prompt_begin ${title}`)
  say(`// action:prompt_text ${text}`)
  for (const b of buttons) say(`// action:prompt_footer_button ${b}`)
  say('// action:prompt_show')
}

async function homeAxes(axes) {
  for (const a of axes) {
    const i = 'XYZ'.indexOf(a)
    const t = [...S.toolhead.position]
    if (a === 'Z') {
      t[0] = 95 - settings.probe.x_offset; t[1] = 120 - settings.probe.y_offset; t[2] = 0
    } else t[i] = settings[`stepper_${a.toLowerCase()}`].position_endstop
    await sleep(moveTo(t, 3000))
    if (a !== 'Z') say(`// HOME_ACCEL ${a}: crash detected, position set to ${t[i].toFixed(3)}`)
    if (!S.toolhead.homed_axes.includes(a.toLowerCase())) {
      S.toolhead.homed_axes = 'xyz'.split('').filter((c) => c === a.toLowerCase() || S.toolhead.homed_axes.includes(c)).join('')
    }
  }
}

async function run(line) {
  const raw = line.trim()
  if (!raw || raw.startsWith(';')) return
  const cmd = raw.split(/\s+/)[0].toUpperCase()
  const p = params(raw)
  const w = words(raw)
  switch (cmd) {
    case 'SAVE_GCODE_STATE': st.saved[p.NAME ?? 'default'] = { rel: st.rel, relE: st.relE }; return
    case 'RESTORE_GCODE_STATE': Object.assign(st, st.saved[p.NAME ?? 'default'] ?? {}); return
    case 'G90': st.rel = false; return
    case 'G91': st.rel = true; return
    case 'M82': st.relE = false; return
    case 'M83': st.relE = true; return
    case 'G0': case 'G1': {
      if (w.E !== undefined) {
        if (S.extruder.temperature < settings.extruder.min_extrude_temp) throw new GError('Extrude below minimum temp\nSee the \'min_extrude_temp\' config option for details')
        await sleep(Math.abs(w.E) / ((w.F ?? 300) / 60) * 1000)
        say(`// extruded ${w.E} mm`)
      }
      const t = [...S.toolhead.position]
      let any = false
      ;['X', 'Y', 'Z'].forEach((a, i) => {
        if (w[a] === undefined) return
        any = true
        if (!S.toolhead.homed_axes.includes(a.toLowerCase())) throw new GError('Must home axis first: ' + t.map((v) => v.toFixed(3)).join(' '))
        t[i] = st.rel ? t[i] + w[a] : w[a] + S.gcode_move.homing_origin[i]
        if (t[i] < LIM.min[i] - 1e-6 || t[i] > LIM.max[i] + 1e-6) throw new GError(`Move out of range: ${t.slice(0, 3).map((v) => v.toFixed(3)).join(' ')} [0.000]`)
      })
      if (any) await sleep(moveTo(t, w.F ?? S.gcode_move.speed))
      return
    }
    case 'G28': {
      const ax = ['X', 'Y', 'Z'].filter((a) => new RegExp(`\\b${a}\\b`, 'i').test(raw.slice(3)))
      const axes = ax.length ? ax : ['X', 'Y', 'Z']
      const xy = axes.filter((a) => a !== 'Z')
      if (xy.length) await homeAxes(xy)
      if (axes.includes('Z')) {
        if (!S['gcode_macro _SONDA'].deployed) {
          S['gcode_macro _SONDA'].pending = 1
          prompt('Sonda Z', 'Baja el brazo de la sonda y pulsa Listo.', ['Cancelar|_SONDA_CANCELAR', 'Listo|SONDA_LISTA|primary'])
          say('// Sonda no confirmada: despliega el brazo y ejecuta SONDA_LISTA')
        } else await homeAxes(['Z'])
      }
      return
    }
    case 'SONDA_LISTA': {
      const pend = S['gcode_macro _SONDA'].pending
      Object.assign(S['gcode_macro _SONDA'], { deployed: true, pending: 0 })
      say('// action:prompt_end')
      if (pend === 1) {
        await homeAxes(['Z'])
        prompt('Sonda Z', 'Sondeo terminado. SUBE el brazo antes de imprimir.', ['Recogida|SONDA_GUARDADA|primary'])
      }
      return
    }
    case 'SONDA_GUARDADA': S['gcode_macro _SONDA'].deployed = false; say('// action:prompt_end'); say('// Sonda recogida'); return
    case '_SONDA_CANCELAR': S['gcode_macro _SONDA'].pending = 0; say('// action:prompt_end'); return
    case 'M84': case 'M18': S.toolhead.homed_axes = ''; return
    case 'M220': S.gcode_move.speed_factor = (w.S ?? 100) / 100; return
    case 'M221': S.gcode_move.extrude_factor = (w.S ?? 100) / 100; return
    case 'M106': S.fan.speed = Math.min(1, (w.S ?? 255) / 255); return
    case 'M107': S.fan.speed = 0; return
    case 'M104': case 'M109': S.extruder.target = w.S ?? 0; return
    case 'SET_HEATER_TEMPERATURE': if (p.HEATER === 'extruder') S.extruder.target = +(p.TARGET ?? 0); else throw new GError(`Unknown heater '${p.HEATER}'`); return
    case 'TURN_OFF_HEATERS': S.extruder.target = 0; return
    case 'SET_GCODE_OFFSET': {
      const o = [...S.gcode_move.homing_origin]
      ;['X', 'Y', 'Z'].forEach((a, i) => {
        if (p[a] !== undefined) o[i] = +p[a]
        if (p[a + '_ADJUST'] !== undefined) o[i] += +p[a + '_ADJUST']
      })
      S.gcode_move.homing_origin = o.map((v) => +v.toFixed(4))
      return
    }
    case 'SET_PRESSURE_ADVANCE':
      if (p.ADVANCE !== undefined) S.extruder.pressure_advance = +p.ADVANCE
      if (p.SMOOTH_TIME !== undefined) S.extruder.smooth_time = +p.SMOOTH_TIME
      say(`// pressure_advance: ${S.extruder.pressure_advance.toFixed(6)}\n// pressure_advance_smooth_time: ${S.extruder.smooth_time.toFixed(6)}`)
      return
    case 'SET_VELOCITY_LIMIT':
      if (p.VELOCITY) S.toolhead.max_velocity = +p.VELOCITY
      if (p.ACCEL) S.toolhead.max_accel = +p.ACCEL
      if (p.SQUARE_CORNER_VELOCITY) S.toolhead.square_corner_velocity = +p.SQUARE_CORNER_VELOCITY
      say(`// max_velocity: ${S.toolhead.max_velocity}\n// max_accel: ${S.toolhead.max_accel}`)
      return
    case 'QUERY_PROBE': say(`// probe: ${S.probe.last_query ? 'TRIGGERED' : 'open'}`); return
    case 'PROBE': {
      if (S.toolhead.homed_axes !== 'xyz') throw new GError('Must home before probe')
      await sleep(1500)
      S.probe.last_z_result = +(Math.random() * 0.04 - 0.02).toFixed(6)
      const [x, y] = S.toolhead.position
      say(`// Result: at ${(x + settings.probe.x_offset).toFixed(3)},${(y + settings.probe.y_offset).toFixed(3)} estimate contact at z=${S.probe.last_z_result.toFixed(6)}`)
      return
    }
    case 'PROBE_ACCURACY': {
      const n = +(p.SAMPLES ?? 10)
      say(`// PROBE_ACCURACY at X:${S.toolhead.position[0].toFixed(3)} Y:${S.toolhead.position[1].toFixed(3)} Z:5.000 (samples=${n})`)
      const v = []
      for (let i = 0; i < n; i++) { await sleep(300); const z = 0.7 + Math.random() * 0.015; v.push(z); say(`// probe at ... is z=${z.toFixed(6)}`) }
      const mx = Math.max(...v), mn = Math.min(...v)
      say(`// probe accuracy results: maximum ${mx.toFixed(6)}, minimum ${mn.toFixed(6)}, range ${(mx - mn).toFixed(6)}`)
      return
    }
    case 'PROBE_CALIBRATE':
      Object.assign(S.manual_probe, { is_active: true, z_position: 5, z_position_lower: null, z_position_upper: null })
      say('// Starting manual Z probe. Use TESTZ to adjust position.\n// Finish with ACCEPT or ABORT command.')
      return
    case 'TESTZ': {
      if (!S.manual_probe.is_active) throw new GError('Unknown command:"TESTZ"')
      const z = p.Z ?? '0'
      if (z === '-' || z === '+') S.manual_probe.z_position += z === '-' ? -0.05 : 0.05
      else S.manual_probe.z_position = Math.max(-2, S.manual_probe.z_position + parseFloat(z))
      S.manual_probe.z_position = +S.manual_probe.z_position.toFixed(4)
      say(`// Z position: ${S.manual_probe.z_position.toFixed(3)}`)
      return
    }
    case 'ACCEPT':
      if (!S.manual_probe.is_active) throw new GError('Unknown command:"ACCEPT"')
      settings.probe.z_offset = +(settings.probe.z_offset - S.manual_probe.z_position).toFixed(3)
      S.manual_probe.is_active = false
      savePending = true
      say(`// probe: z_offset: ${settings.probe.z_offset}\n// The SAVE_CONFIG command will update the printer config file`)
      return
    case 'ABORT': S.manual_probe.is_active = false; say('// Manual probe aborted'); return
    case 'Z_OFFSET_APPLY_PROBE':
      settings.probe.z_offset = +(settings.probe.z_offset - S.gcode_move.homing_origin[2]).toFixed(3)
      savePending = true
      say(`// probe: z_offset: ${settings.probe.z_offset}`)
      return
    case 'SAVE_CONFIG': savePending = false; await restartKlippy(); return
    case 'RESPOND': if (p.MSG) say(p.TYPE === 'command' ? `// ${p.MSG}` : `// ${p.MSG}`); return
    case 'PAUSE': S.print_stats.state = 'paused'; S.pause_resume.is_paused = true; return
    case 'RESUME': S.print_stats.state = 'printing'; S.pause_resume.is_paused = false; return
    case 'CANCEL_PRINT': S.print_stats.state = 'cancelled'; S.virtual_sdcard.is_active = false; return
    case 'MOCK_PRINT': Object.assign(S.print_stats, { state: 'printing', filename: 'benchy_0.2mm_PETG.gcode' }); S.virtual_sdcard.progress = 0; S.virtual_sdcard.is_active = true; return
    case 'HELP': say('// Available extended commands:\n// SET_GCODE_OFFSET\n// PROBE\n// ... (simulador)'); return
    case 'M503': say('// (simulador) M503'); return
    default: throw new GError(`Unknown command:"${cmd}"`)
  }
}

async function script(text) {
  for (const l of text.split('\n')) await run(l)
}

async function restartKlippy() {
  S.webhooks.state = 'startup'
  broadcast('notify_klippy_disconnected', [])
  await sleep(1200)
  S.toolhead.homed_axes = ''
  S.webhooks.state = 'ready'
  broadcast('notify_klippy_ready', [])
}

// ------------------------------------------------------------------ RPC
const subs = new Map() // ws -> objects
async function rpc(ws, method, prm) {
  switch (method) {
    case 'server.connection.identify': return { connection_id: 1 }
    case 'server.info': return { klippy_connected: true, klippy_state: S.webhooks.state, components: ['database', 'history'], moonraker_version: 'mock' }
    case 'printer.info': return { state: S.webhooks.state, state_message: S.webhooks.state_message, hostname: 'mk4-mock', software_version: 'v0.13.0-mock' }
    case 'printer.objects.list': return { objects: [...Object.keys(S), 'configfile'] }
    case 'printer.objects.query':
    case 'printer.objects.subscribe': {
      const status = {}
      for (const o of Object.keys(prm.objects)) {
        if (o === 'configfile') status.configfile = { settings, save_config_pending: savePending }
        else if (S[o]) status[o] = structuredClone(S[o])
      }
      if (method.endsWith('subscribe')) subs.set(ws, Object.keys(prm.objects))
      return { eventtime: Date.now() / 1000, status }
    }
    case 'printer.gcode.script':
      if (S.webhooks.state !== 'ready') throw new GError('Klippy not ready')
      await script(prm.script)
      return 'ok'
    case 'printer.emergency_stop':
      Object.assign(S.webhooks, { state: 'shutdown', state_message: 'Shutdown due to M112 command\nOnce the underlying issue is corrected, use the "FIRMWARE_RESTART" command to reset the firmware, reload the config, and restart the host software.' })
      S.extruder.target = 0
      broadcast('notify_klippy_shutdown', [])
      return 'ok'
    case 'printer.firmware_restart': case 'printer.restart':
      Object.assign(S.webhooks, { state_message: 'Printer is ready' }); restartKlippy(); return 'ok'
    case 'server.temperature_store': return tempHist
    case 'server.database.get_item':
      if (!(db[prm.namespace]?.[prm.key] !== undefined)) { const e = new Error(`Key '${prm.key}' in namespace '${prm.namespace}' not found`); e.code = 404; throw e }
      return { namespace: prm.namespace, key: prm.key, value: db[prm.namespace][prm.key] }
    case 'server.database.post_item': (db[prm.namespace] ??= {})[prm.key] = prm.value; return { namespace: prm.namespace, key: prm.key, value: prm.value }
    default: { const e = new Error(`Method not found: ${method}`); e.code = -32601; throw e }
  }
}

// ------------------------------------------------------------------ simulación
let last = JSON.stringify(S)
setInterval(() => {
  const e = S.extruder
  const tgt = e.target || 22
  const k = e.target > e.temperature ? 0.045 : 0.012
  e.temperature += (tgt - e.temperature) * k + (Math.random() - 0.5) * 0.25
  e.power = e.target > 0 ? Math.max(0, Math.min(1, (e.target - e.temperature) / 25 + 0.25)) : 0
  e.can_extrude = e.temperature >= settings.extruder.min_extrude_temp
  S['temperature_sensor raspberry_pi'].temperature = 46 + Math.random() * 2
  if (anim) {
    const f = anim.dur ? Math.min(1, (Date.now() - anim.t0) / anim.dur) : 1
    S.motion_report.live_position = anim.from.map((v, i) => +(v + (anim.to[i] - v) * f).toFixed(3))
    S.motion_report.live_velocity = f < 1 ? 50 : 0
    if (f >= 1) anim = null
  }
  S.gcode_move.gcode_position = gpos()
  S.gcode_move.position = [...S.toolhead.position]
  if (S.print_stats.state === 'printing') {
    S.virtual_sdcard.progress = Math.min(1, S.virtual_sdcard.progress + 0.0008)
    S.print_stats.print_duration += 0.25
  }
  // diff simple por objeto
  const now = JSON.parse(JSON.stringify(S))
  const prev = JSON.parse(last)
  const diff = {}
  for (const o of Object.keys(now)) {
    for (const [k2, v] of Object.entries(now[o])) {
      if (JSON.stringify(prev[o]?.[k2]) !== JSON.stringify(v)) (diff[o] ??= {})[k2] = v
    }
  }
  last = JSON.stringify(now)
  if (Object.keys(diff).length) broadcast('notify_status_update', [diff, Date.now() / 1000])
}, 250)
setInterval(() => {
  const h = tempHist.extruder
  h.temperatures.push(+S.extruder.temperature.toFixed(2)); h.targets.push(S.extruder.target); h.powers.push(S.extruder.power)
  for (const a of Object.values(h)) a.length > 1200 && a.shift()
}, 1000)

const server = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"result":"mock moonraker"}') })
const wss = new WebSocketServer({ server, path: '/websocket' })
wss.on('connection', (ws) => {
  clients.add(ws)
  ws.on('close', () => { clients.delete(ws); subs.delete(ws) })
  ws.on('message', async (data) => {
    const msg = JSON.parse(String(data))
    try {
      const result = await rpc(ws, msg.method, msg.params ?? {})
      ws.send(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result }))
    } catch (e) {
      if (e instanceof GError) say('!! ' + e.message)
      ws.send(JSON.stringify({ jsonrpc: '2.0', id: msg.id, error: { code: e.code ?? 400, message: e.message } }))
    }
  })
})
server.listen(PORT, () => console.log(`mock moonraker en ws://localhost:${PORT}/websocket`))
