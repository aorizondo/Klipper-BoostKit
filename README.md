# Klipper-BoostKit

**Tablero visual para Klipper.** Sustituye las operaciones de terminal por paneles:
jog con el teclado numérico, rueda de jog, babystep, temperaturas, velocidad y flujo,
ventiladores, offsets, pressure advance, sonda. Es el BoostKit de
[OctoPrint](https://github.com/aorizondo/OctoPrint-BoostKit) llevado a Klipper.

Funciona **junto a Mainsail o Fluidd**, no los sustituye: es otra web en el mismo host
(`http://<impresora>.local:82`) que usa la misma Moonraker. Mainsail la muestra en su menú
lateral. Mainsail y Fluidd no admiten plugins, por eso va aparte.

Es genérico (cualquier impresora con Klipper): detecta calentadores, ventiladores, sonda,
retracción por firmware, etc. Se probó primero en la MK4 de la
[frankenprinter](https://github.com/aorizondo/frankenprinter).

## Panel de control

| Tarjeta | Qué hace | G-code que envía |
|---|---|---|
| Movimiento | Teclado numérico (físico y en pantalla), rueda de jog, Z por pasos, ir a coordenadas, posición en vivo y ejes con homing | `G91`/`G1` dentro de `SAVE/RESTORE_GCODE_STATE`, `G28`, `M84` |
| Extrusor | Extruir/retraer (bloqueado en frío), pressure advance y smooth time, retracción por firmware | `M83`+`G1 E`, `SET_PRESSURE_ADVANCE`, `SET_RETRACTION` |
| Temperaturas | Gráfico, deslizadores con objetivo, perfiles de material guardables | `SET_HEATER_TEMPERATURE`, `TURN_OFF_HEATERS` |
| Ajustes en vivo | Velocidad %, flujo %, ventiladores, velocidad/aceleración máx., velocidad en esquinas | `M220`, `M221`, `M106`/`SET_FAN_SPEED`, `SET_VELOCITY_LIMIT` |
| Babystep Z | Pasos ±0.01…0.1, poner a 0, guardar en la sonda o en el endstop | `SET_GCODE_OFFSET Z_ADJUST= MOVE=1`, `Z_OFFSET_APPLY_PROBE` |
| Offset de G-code | X/Y/Z (el M206 de Marlin) | `SET_GCODE_OFFSET X= Y= Z=` |
| Sonda Z | Offsets, estado, sondear, repetibilidad, prueba del papel guiada | `QUERY_PROBE`, `PROBE`, `PROBE_ACCURACY`, `PROBE_CALIBRATE`, `TESTZ`, `ACCEPT` |
| Gráficas | Pistas apiladas con el mismo eje de tiempo (1/5/15/30 min, congelar, cursor que lee todas a la vez): temperatura, velocidad real, aceleración ordenada vs medida, flujo volumétrico (mm³/s), acelerómetro X/Y/Z y factores M220/M221 | `BK_ACCEL_MONITOR` (solo con la gráfica del acelerómetro abierta) |
| Consola (abajo, plegable) | Ver qué G-code genera cada botón y escribir los tuyos | — |

También muestra los diálogos de las macros (`action:prompt_*`), como hacen Mainsail y Fluidd,
y en la barra superior tiene la parada de emergencia, `SAVE_CONFIG` cuando hay algo pendiente
y `FIRMWARE_RESTART` tras un apagado.

Todo cabe en una pantalla de 1600×900 sin scroll. Los deslizadores van en una fila
(nombre · valor real · barra · consigna · ▾ atajos) y lo de Z (babystep, offsets, sonda)
comparte una tarjeta con pestañas.

### Extra de Klipper `[boostkit]` (gráficas)

`klipper/boostkit.py` publica el objeto `boostkit` con lo que Klipper **ordena** (velocidad,
aceleración, flujo del extrusor, sacados de la cola de movimientos) y, con `accel_chip:`, lo
que el acelerómetro **mide** (media, pico dinámico por eje y RMS cada 0.25 s). El chip solo emite
mientras la gráfica está abierta (keepalive cada 15 s; se apaga solo a los 30 s) y otros extras que
reprogramen el chip deben llamar a `suspend_accel()`/`resume_accel()` (el homing por choque de la
MK4 lo hace).

```ini
[boostkit]
accel_chip: adxl345 # o adxl345_i2c cabezal, lis2dw, mpu9250... (opcional)
```
Sin el extra, Velocidad y Flujo salen de `motion_report` (menos preciso) y Aceleración/Acelerómetro
no aparecen.

### Teclado numérico

```
 [⌨ on/off] [/ paso−] [* paso+] [− Z−]
 [7 ↖]      [8 Y+]    [9 ↗]     [+ Z+]
 [4 X−]     [5 Home XY][6 X+]
 [1 ↙]      [2 Y−]    [3 ↘]     [↵ Extruir]
 [0 Home todo       ] [. Retraer]
```
Funciona con Bloq Num encendido o apagado. Alias: flechas, Re Pág / Av Pág (Z), Inicio (Home XY).
No actúa mientras escribes en un campo ni con un diálogo abierto.

## Hoja de ruta

- **Fase 2**: nivelación (tramado con `SCREWS_TILT_CALCULATE` en visual, malla con mapa de
  calor), alineación de los carros Z por choque con corriente baja configurable (como `G34` de
  Marlin), calibración (torres de temperatura, PA, flujo, retracción…).
- **Fase 3**: dimensiones y límites de la máquina, límites software on/off (`M211`), estado de
  endstops y método de homing por eje, red (Wi-Fi), extrusión volumétrica (`M200`). Lo que
  Klipper no trae irá como extras de Klipper y un componente de Moonraker.

## Instalar (en la Raspberry Pi)

```bash
git clone https://github.com/aorizondo/Klipper-BoostKit ~/Klipper-BoostKit-src
~/Klipper-BoostKit-src/deploy/install.sh
sudo systemctl restart moonraker
```
Descarga la última release, la sirve con nginx en el puerto 82, enlaza el extra
`boostkit.py` en `~/klipper/klippy/extras/`, añade «BoostKit» al menú de Mainsail
(`.theme/navi.json`) y los bloques de `update_manager` (web + extra) para actualizarlo desde la
interfaz como Mainsail/Fluidd. Añade `[boostkit]` a tu `printer.cfg` y `FIRMWARE_RESTART`. Fluidd no admite enlaces propios: guárdalo como marcador.

## Desarrollo (sin impresora)

```bash
npm install
npm run mock      # simulador de Moonraker+Klipper en :7125 (imita una MK4)
npm run dev       # http://localhost:5180
MOONRAKER=mk4.local:7125 npm run dev   # contra la impresora real
node dev/shot.mjs # capturas automáticas en Chromium headless (/tmp/opencode/shots)
SCENARIO=tele W=1600 H=900 node dev/shot.mjs   # impresión simulada con todas las gráficas
npm run build     # dist/
```
El simulador entiende el G-code de los paneles, la sonda manual con diálogo y `MOCK_PRINT`
(simula una impresión). Release: `git tag vX.Y.Z && git push --tags` → la Action publica
`klipper-boostkit.zip`.

Licencia GPLv3.
