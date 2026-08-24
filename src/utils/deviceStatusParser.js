/**
 * Device Status Parser Utility
 * Parses 32-bit device status flags from the device
 * All values default to '_ _' when no data available
 * 
 * 32-bit Status Bit Mapping (NEW firmware layout):
 * Bit 0:   tank_low       (0x00000001)
 * Bit 1:   tank_high      (0x00000002)
 * Bit 2:   ec_high        (0x00000004)
 * Bit 3:   ec_low         (0x00000008)
 * Bit 4:   ph_high        (0x00000010)
 * Bit 5:   ph_low         (0x00000020)
 * Bit 6:   lux_low        (0x00000040)
 * Bit 7:   lux_high       (0x00000080)
 * Bit 8:   co2_high       (0x00000100)
 * Bit 9:   co2_low        (0x00000200)
 * Bit 10:  inlet_valve    (0x00000400)  - 1=OPEN, 0=CLOSED
 * Bit 11:  outlet_valve   (0x00000800)  - 1=OPEN, 0=CLOSED
 * Bit 12:  water_pump     (0x00001000)  - 1=ON, 0=OFF
 * Bit 13:  nutrient_pump  (0x00002000)  - 1=ON, 0=OFF
 * Bit 14:  ac_status      (0x00004000)  - 1=ON, 0=OFF
 * Bit 15:  mode           (0x00008000)  - 1=AUTO, 0=MANUAL
 * Bit 16:  online         (0x00010000)  - 1=ONLINE, 0=OFFLINE
 * Bits17-23: sensor_fault (0x00FE0000)  - 7 bits sensor fault code
 * Bit 24:  buzzer_status  (0x01000000)  - 1=ON, 0=OFF
 * Bits25-31: dimming_level(0xFE000000)  - 7 bits (0-127)
 */

// ── Sensor Fault Code Definitions (Bits 17-23) ──
const SENSOR_FAULT_CODES = {
  0:   { name: 'None',           description: 'All sensors OK' },
  1:   { name: 'ATMP Fault',     description: 'Ambient temperature sensor fault' },
  2:   { name: 'HUMI Fault',     description: 'Ambient humidity sensor fault' },
  3:   { name: 'WATMP Fault',    description: 'Water temperature sensor fault' },
  4:   { name: 'PH Fault',       description: 'pH sensor fault' },
  5:   { name: 'EC Fault',       description: 'EC (TDS) sensor fault' },
  6:   { name: 'WLV Fault',      description: 'Water level sensor fault' },
  7:   { name: 'LUX Fault',      description: 'Light/lux sensor fault' },
  8:   { name: 'CO2 Fault',      description: 'CO2 sensor fault' },
  9:   { name: 'SOIL Fault',     description: 'Soil moisture sensor fault' },
  10:  { name: 'Multi Fault',    description: 'Multiple sensor faults' },
  127: { name: 'Comm Fault',     description: 'Communication bus fault' },
};

/**
 * Get sensor fault info by code
 * @param {number} faultCode - 7-bit fault code (0-127)
 * @returns {Object} Fault info with name and description
 */
export const getSensorFaultInfo = (faultCode) => {
  if (faultCode === null || faultCode === undefined || faultCode === 0) {
    return { name: 'None', description: 'All sensors OK', code: 0 };
  }
  const known = SENSOR_FAULT_CODES[faultCode];
  if (known) {
    return { ...known, code: faultCode };
  }
  return { name: `Fault ${faultCode}`, description: `Unknown fault code: ${faultCode}`, code: faultCode };
};

/**
 * Parse 32-bit device status flags
 * @param {number} statusValue - 32-bit integer from device
 * @returns {Object} Parsed status object with all fields
 */
export const parseDeviceStatus = (statusValue) => {
  if (statusValue === null || statusValue === undefined) {
    return getDefaultDeviceStatus();
  }

  // Ensure it's a 32-bit integer
  const status = statusValue >>> 0;

  const result = {
    // ── STATUS FLAGS (Bit 0-14) — unchanged ──
    tankLow: !!(status & 0x00000001),
    tankHigh: !!(status & 0x00000002),
    ecHigh: !!(status & 0x00000004),
    ecLow: !!(status & 0x00000008),
    phHigh: !!(status & 0x00000010),
    phLow: !!(status & 0x00000020),
    luxLow: !!(status & 0x00000040),
    luxHigh: !!(status & 0x00000080),
    co2High: !!(status & 0x00000100),
    co2Low: !!(status & 0x00000200),
    inletValve: !!(status & 0x00000400),
    outletValve: !!(status & 0x00000800),
    waterPump: !!(status & 0x00001000),
    nutrientPump: !!(status & 0x00002000),
    acStatus: !!(status & 0x00004000),

    // ── NEW bit positions ──
    // Bit 15: Mode (moved from Bit 16)
    mode: !!(status & 0x00008000),
    // Bit 16: Online (moved from Bit 17)
    online: !!(status & 0x00010000),
    // Bits 17-23: Sensor Fault (NEW - 7 bits, 0-127)
    sensorFault: (status >> 17) & 0x7F,
    // Bit 24: Buzzer (moved from Bit 18)
    buzzer: !!(status & 0x01000000),
    // Bits 25-31: Dimming Level (moved from Bits 24-30)
    dimmingLevel: (status >> 25) & 0x7F,

    // Raw status for debugging
    rawStatus: `0x${status.toString(16).padStart(8, '0').toUpperCase()}`,
  };

  return result;
};

/**
 * Get default device status (all fields null)
 */
export const getDefaultDeviceStatus = () => ({
  tankLow: null,
  tankHigh: null,
  ecHigh: null,
  ecLow: null,
  phHigh: null,
  phLow: null,
  luxLow: null,
  luxHigh: null,
  co2High: null,
  co2Low: null,
  inletValve: null,
  outletValve: null,
  waterPump: null,
  nutrientPump: null,
  acStatus: null,
  mode: null,
  online: null,
  sensorFault: null,
  buzzer: null,
  dimmingLevel: null,
  rawStatus: null,
});

/**
 * Get display friendly status values (shows '_ _' for null values)
 */
export const getDisplayStatus = (status) => {
  if (!status) return getDefaultDisplayStatus();

  return {
    tankLow: status.tankLow !== null ? (status.tankLow ? 'YES' : 'NO') : '_ _',
    tankHigh: status.tankHigh !== null ? (status.tankHigh ? 'YES' : 'NO') : '_ _',
    ecHigh: status.ecHigh !== null ? (status.ecHigh ? 'YES' : 'NO') : '_ _',
    ecLow: status.ecLow !== null ? (status.ecLow ? 'YES' : 'NO') : '_ _',
    phHigh: status.phHigh !== null ? (status.phHigh ? 'YES' : 'NO') : '_ _',
    phLow: status.phLow !== null ? (status.phLow ? 'YES' : 'NO') : '_ _',
    luxLow: status.luxLow !== null ? (status.luxLow ? 'YES' : 'NO') : '_ _',
    luxHigh: status.luxHigh !== null ? (status.luxHigh ? 'YES' : 'NO') : '_ _',
    co2High: status.co2High !== null ? (status.co2High ? 'YES' : 'NO') : '_ _',
    co2Low: status.co2Low !== null ? (status.co2Low ? 'YES' : 'NO') : '_ _',
    inletValve: status.inletValve !== null 
      ? (status.inletValve ? 'OPEN' : 'CLOSED') 
      : '_ _',
    outletValve: status.outletValve !== null 
      ? (status.outletValve ? 'OPEN' : 'CLOSED') 
      : '_ _',
    waterPump: status.waterPump !== null ? (status.waterPump ? 'ON' : 'OFF') : '_ _',
    nutrientPump: status.nutrientPump !== null ? (status.nutrientPump ? 'ON' : 'OFF') : '_ _',
    acStatus: status.acStatus !== null ? (status.acStatus ? 'ON' : 'OFF') : '_ _',
    mode: status.mode !== null 
      ? (status.mode ? 'AUTO' : 'MANUAL') 
      : '_ _',
    online: status.online !== null 
      ? (status.online ? 'ONLINE' : 'OFFLINE') 
      : '_ _',
    sensorFault: status.sensorFault !== null
      ? getSensorFaultInfo(status.sensorFault).name
      : '_ _',
    buzzer: status.buzzer !== null ? (status.buzzer ? 'ON' : 'OFF') : '_ _',
    dimmingLevel: status.dimmingLevel !== null 
      ? `${Math.round((status.dimmingLevel / 127) * 100)}%` 
      : '_ _',
    rawStatus: status.rawStatus || '_ _',
  };
};

/**
 * Get default display status (all '_ _')
 */
export const getDefaultDisplayStatus = () => ({
  tankLow: '_ _',
  tankHigh: '_ _',
  ecHigh: '_ _',
  ecLow: '_ _',
  phHigh: '_ _',
  phLow: '_ _',
  luxLow: '_ _',
  luxHigh: '_ _',
  co2High: '_ _',
  co2Low: '_ _',
  inletValve: '_ _',
  outletValve: '_ _',
  waterPump: '_ _',
  nutrientPump: '_ _',
  acStatus: '_ _',
  mode: '_ _',
  online: '_ _',
  sensorFault: '_ _',
  buzzer: '_ _',
  dimmingLevel: '_ _',
  rawStatus: '_ _',
});

/**
 * Format any value with '_ _' for null
 */
export const formatValue = (value, options = {}) => {
  const { prefix = '', suffix = '', fallback = '_ _', decimals = null } = options;
  
  if (value === null || value === undefined) {
    return fallback;
  }
  
  if (typeof value === 'boolean') {
    return value ? 'YES' : 'NO';
  }
  
  if (typeof value === 'number') {
    if (decimals !== null) {
      return `${prefix}${value.toFixed(decimals)}${suffix}`;
    }
    return `${prefix}${value}${suffix}`;
  }
  
  return String(value);
};

/**
 * Check if device is online based on status
 */
export const isDeviceOnline = (status) => {
  if (!status || status.online === null || status.online === undefined) {
    return false;
  }
  return status.online === true;
};

/**
 * Check if device is in AUTO mode
 */
export const isAutoMode = (status) => {
  if (!status || status.mode === null || status.mode === undefined) {
    return false;
  }
  return status.mode === true;
};

/**
 * Check if device is in MANUAL mode
 */
export const isManualMode = (status) => {
  if (!status || status.mode === null || status.mode === undefined) {
    return false;
  }
  return status.mode === false;
};