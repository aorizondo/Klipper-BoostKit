# AGENTS.md — Klipper-BoostKit

Web app (Vue 3 + Vite + TS, sin librería de UI) que habla con **Moonraker por WebSocket
JSON-RPC**, como Mainsail/Fluidd. Se sirve aparte (nginx :82) porque Mainsail y Fluidd **no
tienen sistema de plugins** (solo CSS y, en Mainsail, enlaces en `.theme/navi.json`).
Port del [OctoPrint-BoostKit](../OctoPrint-BoostKit). Genérica; primera máquina: MK4 de
`aorizondo/frankenprinter` (Klipper v0.13, Pi 4, sin cama caliente, sonda de brazo manual).

## Layout

```
src/api/moonraker.ts      cliente JSON-RPC (reconexión, notify_*)
klipper/boostkit.py       extra de Klipper [boostkit]: telemetría (trapq) + acelerómetro bajo
                          demanda (BK_ACCEL_MONITOR, suspend_accel/resume_accel)
src/store/telemetry.ts    muestras a 4 Hz fuera de la reactividad (markRaw) + `tick`
src/store/printer.ts      estado reactivo: objetos suscritos, settings, log, toasts,
                          prefs (BD de Moonraker, namespace "boostkit"), diálogos prompt_*
src/composables/jog.ts    jog/home/extruir (SAVE/RESTORE_GCODE_STATE, recorta a límites)
src/components/*.vue      una tarjeta por función; BkSlider = deslizador reutilizable
dev/mock-moonraker.mjs    simulador (npm run mock) — mantenerlo al día con cada G-code nuevo
dev/shot.mjs              capturas + pasos por CDP en Chromium headless
deploy/                   nginx :82, install.sh (web + navi.json + update_manager)
.github/workflows/        tag vX.Y.Z → release con klipper-boostkit.zip (tipo "web" de Moonraker)
```

## Hechos load-bearing

- **Deslizadores envían al soltar** (`change`), no en `input`: arrastrar no debe inundar Klipper.
  Muestran el valor REAL del objeto de Klipper, no el local.
- **Jog**: siempre dentro de `SAVE_GCODE_STATE`/`RESTORE_GCODE_STATE` (no tocar G90/G91 del
  trabajo); bloqueado imprimiendo; recorta la distancia a `axis_minimum/maximum`.
- **Diálogos `action:prompt_*`**: imprescindibles — en la MK4 `G28` y la malla esperan a
  «Listo» del diálogo de la sonda. Llegan como `// action:prompt_...` en `notify_gcode_response`.
- **Errores**: Klipper los manda dos veces (respuesta `!!` + error RPC): `toast()` deduplica.
- Comandos de una macro de Klipper no pueden empezar por letra+dígito+`_` (`G28_X` inválido).
- **Verificar con el simulador y `dev/shot.mjs`** antes de subir; leer las capturas.
- Probar en la MK4: `MOONRAKER=mk4.local:7125 npm run dev` (cors `*://localhost:*` ya está en su
  moonraker.conf). Nunca reiniciar Klipper/Moonraker con una impresión en curso.

- **Acelerómetro compartido**: el streaming del chip y quien lo reprograma (homing por choque,
  sonda de boquilla) no pueden coincidir. `suspend_accel()` para el stream **síncronamente**
  (`batch_bulk._stop()`) antes de tocar registros. Probado en el smoke test de frankenprinter
  (`klipper-config/mk4/test/smoke.sh`: fake_accel falla si se reprograma emitiendo).
- **Layout**: debe caber en 1600×900 sin scroll (`SCENARIO=tele W=1600 H=900 node dev/shot.mjs`).

## Convenciones

- UI y docs en español; código e identificadores en inglés. Commits en español `tipo: descripción`.
- Sin dependencias nuevas de runtime sin motivo (hoy solo `vue`).
- `npm run build` (incluye `vue-tsc`) debe pasar.
