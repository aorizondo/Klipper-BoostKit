# BoostKit: telemetry for the Klipper-BoostKit web panel.
#
# Exposes printer.boostkit (subscribed through Moonraker like any object):
#   velocity / velocity_peak      toolhead speed now / max in the last 0.25 s (mm/s)
#   accel / accel_peak            commanded acceleration now (signed) / max |a| (mm/s^2)
#   e_velocity / flow / flow_peak filament speed (mm/s) and volumetric flow (mm^3/s)
#   accel_chip: {enabled, x, y, z, x_peak, y_peak, z_peak, rms, samples}
#       accelerometer readings over the last window (mm/s^2): mean and max |a|
#       per axis, AC RMS of the magnitude. Only while monitoring is enabled.
#
# Velocity/accel come from the toolhead trapq (what Klipper commanded), the
# chip from the accelerometer (what the machine really did).
#
#   [boostkit]
#   #accel_chip: adxl345_i2c cabezal   # optional, enables BK_ACCEL_MONITOR
#   #accel_timeout: 30                 # s without keepalive before it stops
#
# BK_ACCEL_MONITOR ENABLE=1|0   start/stop streaming the accelerometer. The web
#   panel re-sends ENABLE=1 as a keepalive while the chart is visible.
# Other extras that reprogram the chip (crash homing, nozzle probe) must call
# suspend_accel()/resume_accel() around it (accel_endstop.py does).
#
# This file may be distributed under the terms of the GNU GPLv3 license.
import logging, math

WINDOW = 0.25


class AccelMonitor:
    def __init__(self, printer, chip_name, timeout):
        self.printer = printer
        self.chip_name = chip_name
        self.timeout = timeout
        self.chip = None
        self.enabled = False      # wanted by the user
        self.running = False      # our client is registered in batch_bulk
        self.suspended = 0
        self.last_keepalive = 0.
        self.samples = []         # (time, x, y, z) of the last window
        self.stats = {'enabled': False}

    def lookup(self):
        if self.chip is None:
            self.chip = self.printer.lookup_object(self.chip_name)
        return self.chip

    def _handle_batch(self, msg):
        if not self.running:
            return False
        data = msg.get('data', [])
        if data:
            self.samples.extend(data)
            t_end = data[-1][0]
            cut = 0
            while cut < len(self.samples) and self.samples[cut][0] < t_end - WINDOW:
                cut += 1
            del self.samples[:cut]
            self._update_stats()
        reactor = self.printer.get_reactor()
        if reactor.monotonic() - self.last_keepalive > self.timeout:
            logging.info("boostkit: accelerometer monitor timed out")
            self.enabled = self.running = False
            self.stats = {'enabled': False}
            return False
        return True

    def _update_stats(self):
        s = self.samples
        n = len(s)
        if not n:
            return
        mean = [sum(p[i] for p in s) / n for i in (1, 2, 3)]
        peak = [max(abs(p[i]) for p in s) for i in (1, 2, 3)]
        # AC rms of the vector (vibration), gravity removed by the mean
        ac = sum((p[1] - mean[0]) ** 2 + (p[2] - mean[1]) ** 2
                 + (p[3] - mean[2]) ** 2 for p in s) / n
        self.stats = {
            'enabled': True, 'samples': n,
            'x': round(mean[0], 1), 'y': round(mean[1], 1), 'z': round(mean[2], 1),
            'x_peak': round(peak[0], 1), 'y_peak': round(peak[1], 1),
            'z_peak': round(peak[2], 1), 'rms': round(math.sqrt(ac), 1)}

    def _start(self):
        if self.running or self.suspended:
            return
        chip = self.lookup()
        self.samples = []
        self.running = True
        self.stats = {'enabled': True, 'samples': 0}
        try:
            chip.batch_bulk.add_client(self._handle_batch)
        except self.printer.command_error:
            self.running = False
            raise

    def _stop_now(self):
        # Synchronous: whoever suspends us is about to reprogram the chip.
        if not self.running:
            return
        self.running = False
        bb = self.lookup().batch_bulk
        if self._handle_batch in bb.client_cbs:
            bb.client_cbs.remove(self._handle_batch)
        if not bb.client_cbs and bb.is_started:
            bb._stop()
        self.stats = {'enabled': self.enabled,
                      'suspended': bool(self.suspended)}

    def set_enabled(self, on):
        self.last_keepalive = self.printer.get_reactor().monotonic()
        self.enabled = on
        if on:
            self._start()
        else:
            self._stop_now()
            self.stats = {'enabled': False}

    def suspend(self):
        self.suspended += 1
        self._stop_now()

    def resume(self):
        self.suspended = max(0, self.suspended - 1)
        if not self.suspended and self.enabled:
            self.last_keepalive = self.printer.get_reactor().monotonic()
            try:
                self._start()
            except self.printer.command_error:
                logging.exception("boostkit: cannot resume accelerometer")


class BoostKit:
    def __init__(self, config):
        self.printer = config.get_printer()
        chip = config.get('accel_chip', None)
        self.accel = None
        if chip:
            self.accel = AccelMonitor(self.printer, chip,
                                      config.getfloat('accel_timeout', 30., minval=5.))
        self.filament_area = None
        self.last = {}
        self.next_time = 0.
        self.printer.register_event_handler('klippy:ready', self._ready)
        gcode = self.printer.lookup_object('gcode')
        gcode.register_command('BK_ACCEL_MONITOR', self.cmd_BK_ACCEL_MONITOR,
                               desc="BoostKit: stream the accelerometer for the web chart")

    def _ready(self):
        self.mcu = self.printer.lookup_object('mcu')
        self.motion = self.printer.lookup_object('motion_report', None)
        ex = self.printer.lookup_object('extruder', None)
        if ex is not None:
            d = self.printer.lookup_object('configfile').get_status(0)[
                'settings'].get('extruder', {}).get('filament_diameter', 1.75)
            self.filament_area = math.pi * (float(d) / 2.) ** 2
        if self.accel is not None:
            self.accel.lookup()

    # --- accelerometer API for other extras
    def suspend_accel(self):
        if self.accel is not None:
            self.accel.suspend()

    def resume_accel(self):
        if self.accel is not None:
            self.accel.resume()

    def cmd_BK_ACCEL_MONITOR(self, gcmd):
        if self.accel is None:
            raise gcmd.error("BoostKit: add accel_chip: to [boostkit]")
        self.accel.set_enabled(bool(gcmd.get_int('ENABLE', 1)))

    # --- trapq telemetry
    def _window(self, name, print_time):
        dtrapq = (self.motion.dtrapqs.get(name) if self.motion else None)
        if dtrapq is None:
            return 0., 0., 0., 0.
        moves, _ = dtrapq.extract_trapq(print_time - WINDOW, print_time)
        v_now = a_now = v_peak = a_peak = 0.
        for m in moves:
            v_end = m.start_v + m.accel * m.move_t
            v_peak = max(v_peak, abs(m.start_v), abs(v_end))
            if m.accel:
                a_peak = max(a_peak, abs(m.accel))
            rel = print_time - m.print_time
            if 0. <= rel <= m.move_t:
                v_now = m.start_v + m.accel * rel
                a_now = m.accel
        return v_now, a_now, v_peak, a_peak

    def get_status(self, eventtime):
        if eventtime < self.next_time:
            return self.last
        self.next_time = eventtime + WINDOW
        st = {}
        try:
            pt = self.mcu.estimated_print_time(eventtime)
            v, a, vp, ap = self._window('toolhead', pt)
            ev, _, evp, _ = self._window('extruder', pt)
            area = self.filament_area or 0.
            st = {'velocity': round(v, 2), 'velocity_peak': round(vp, 2),
                  'accel': round(a, 1), 'accel_peak': round(ap, 1),
                  'e_velocity': round(ev, 3), 'flow': round(ev * area, 2),
                  'flow_peak': round(evp * area, 2)}
        except Exception:
            logging.exception("boostkit: telemetry")
        if self.accel is not None:
            st['accel_chip'] = dict(self.accel.stats)
        self.last = st
        return st


def load_config(config):
    return BoostKit(config)
