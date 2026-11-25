// Movimientos manuales. Usa SAVE/RESTORE_GCODE_STATE como Mainsail para no
// alterar G90/G91 ni la velocidad del trabajo.
import { computed, reactive } from 'vue'
import { state, gcode, homed, printing, ready, toast } from '../store/printer'

export type Axis = 'X' | 'Y' | 'Z'

/** Paso actual, teclado activo y última tecla (para iluminarla en pantalla). */
export const jogUi = reactive({ step: 10, keyboard: true, flash: '' })

export function stepIndex(): number {
  const s = state.prefs.jogSteps
  const i = s.indexOf(jogUi.step)
  return i < 0 ? 0 : i
}
export function stepBy(delta: number) {
  const s = state.prefs.jogSteps
  jogUi.step = s[Math.min(s.length - 1, Math.max(0, stepIndex() + delta))]
}
const IDX: Record<Axis, number> = { X: 0, Y: 1, Z: 2 }

export const canJog = computed(() => ready.value && !printing.value)

function limits(axis: Axis): [number, number] | null {
  const th = state.status.toolhead
  if (!th?.axis_minimum) return null
  return [th.axis_minimum[IDX[axis]], th.axis_maximum[IDX[axis]]]
}

/** Ajusta la distancia para no salirse de position_min/max. */
function clampDist(axis: Axis, d: number): number {
  const lim = limits(axis)
  const pos = state.status.toolhead?.position?.[IDX[axis]]
  if (!lim || pos === undefined) return d
  const target = Math.min(lim[1], Math.max(lim[0], pos + d))
  return Math.round((target - pos) * 1000) / 1000
}

export async function jog(moves: Partial<Record<Axis, number>>) {
  if (!canJog.value) return
  const parts: string[] = []
  let z = false
  for (const [ax, d0] of Object.entries(moves) as [Axis, number][]) {
    if (!homed.value.includes(ax.toLowerCase())) {
      toast(`${ax} sin homing: pulsa Home antes de moverlo`, 'err')
      return
    }
    const d = clampDist(ax, d0)
    if (d === 0) {
      toast(`${ax} ya está en el límite`, 'info', 2000)
      continue
    }
    if (ax === 'Z') z = true
    parts.push(`${ax}${d}`)
  }
  if (!parts.length) return
  const f = z && parts.length === 1 ? state.prefs.jogFeedZ : state.prefs.jogFeedXY
  await gcode(
    `SAVE_GCODE_STATE NAME=_bk_jog\nG91\nG1 ${parts.join(' ')} F${f}\nRESTORE_GCODE_STATE NAME=_bk_jog`,
  )
}

export function home(axes = '') {
  if (!ready.value || printing.value) return
  return gcode(axes ? `G28 ${axes.split('').join(' ')}` : 'G28')
}

export function motorsOff() {
  if (!ready.value || printing.value) return
  return gcode('M84')
}

export async function extrude(sign: 1 | -1) {
  const e = state.status.extruder
  if (e && e.can_extrude === false) {
    toast('Hotend demasiado frío para extruir (min_extrude_temp)', 'err')
    return
  }
  const len = state.prefs.extrudeLen * sign
  const f = state.prefs.extrudeSpeed * 60
  await gcode(`SAVE_GCODE_STATE NAME=_bk_ext\nM83\nG1 E${len} F${f}\nRESTORE_GCODE_STATE NAME=_bk_ext`)
}
