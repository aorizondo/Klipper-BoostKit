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

## Panel de control (v0.1)

| Tarjeta | Qué hace | G-code que envía |
|---|---|---|
| Movimiento | Teclado numérico (físico y en pantalla), rueda de jog, Z por pasos, ir a coordenadas, posición en vivo y ejes con homing | `G91`/`G1` dentro de `SAVE/RESTORE_GCODE_STATE`, `G28`, `M84` |
| Extrusor | Extruir/retraer (bloqueado en frío), pressure advance y smooth time, retracción por firmware | `M83`+`G1 E`, `SET_PRESSURE_ADVANCE`, `SET_RETRACTION` |
| Temperaturas | Gráfico, deslizadores con objetivo, perfiles de material guardables | `SET_HEATER_TEMPERATURE`, `TURN_OFF_HEATERS` |
| Ajustes en vivo | Velocidad %, flujo %, ventiladores, velocidad/aceleración máx., velocidad en esquinas | `M220`, `M221`, `M106`/`SET_FAN_SPEED`, `SET_VELOCITY_LIMIT` |
| Babystep Z | Pasos ±0.01…0.1, poner a 0, guardar en la sonda o en el endstop | `SET_GCODE_OFFSET Z_ADJUST= MOVE=1`, `Z_OFFSET_APPLY_PROBE` |
| Offset de G-code | X/Y/Z (el M206 de Marlin) | `SET_GCODE_OFFSET X= Y= Z=` |
| Sonda Z | Offsets, estado, sondear, repetibilidad, prueba del papel guiada | `QUERY_PROBE`, `PROBE`, `PROBE_ACCURACY`, `PROBE_CALIBRATE`, `TESTZ`, `ACCEPT` |
| Consola | Ver qué G-code genera cada botón y escribir los tuyos | — |

También muestra los diálogos de las macros (`action:prompt_*`), como hacen Mainsail y Fluidd,
y en la barra superior tiene la parada de emergencia, `SAVE_CONFIG` cuando hay algo pendiente
y `FIRMWARE_RESTART` tras un apagado.

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
Descarga la última release, la sirve con nginx en el puerto 82, añade «BoostKit» al menú de
Mainsail (`.theme/navi.json`) y el bloque de `update_manager` para actualizarlo desde la
interfaz como Mainsail/Fluidd. Fluidd no admite enlaces propios: guárdalo como marcador.

## Desarrollo (sin impresora)

```bash
npm install
npm run mock      # simulador de Moonraker+Klipper en :7125 (imita una MK4)
npm run dev       # http://localhost:5180
MOONRAKER=mk4.local:7125 npm run dev   # contra la impresora real
node dev/shot.mjs # capturas automáticas en Chromium headless (/tmp/opencode/shots)
npm run build     # dist/
```
El simulador entiende el G-code de los paneles, la sonda manual con diálogo y `MOCK_PRINT`
(simula una impresión). Release: `git tag vX.Y.Z && git push --tags` → la Action publica
`klipper-boostkit.zip`.

Licencia GPLv3.
