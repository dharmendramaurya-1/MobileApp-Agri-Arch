// src/utils/deviceStatusParser.js
/**
 * Device Status Parser Utility
 * Parses 32-bit device status flags from the device
 * All values default to '_ _' when no data available
 */

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

  return {
    // Bit 0: Tank Low (0x00000001)
    tankLow: !!(status & 0x00000001),
    // Bit 1: Tank High (0x00000002)
    tankHigh: !!(status & 0x00000002),
    // Bit 2: EC High (0x00000004)
    ecHigh: !!(status & 0x00000004),
    // Bit 3: EC Low (0x00000008)
    ecLow: !!(status & 0x00000008),
    // Bit 4: pH High (0x00000010)
    phHigh: !!(status & 0x00000010),
    // Bit 5: pH Low (0x00000020)
    phLow: !!(status & 0x00000020),
    // Bit 6: Lux Low (0x00000040)
    luxLow: !!(status & 0x00000040),
    // Bit 7: Lux High (0x00000080)
    luxHigh: !!(status & 0x00000080),
    // Bit 8: CO2 High (0x00000100)
    co2High: !!(status & 0x00000100),
    // Bit 9: CO2 Low (0x00000200)
    co2Low: !!(status & 0x00000200),
    // Bit 10-11: Inlet Valve (0x00000C00) - 2 bits
    inletValve: (status >> 10) & 0x03, // 0=CLOSED, 1=OPEN, 2=ERROR
    // Bit 12-13: Outlet Valve (0x00003000) - 2 bits
    outletValve: (status >> 12) & 0x03,
    // Bit 14: Water Pump (0x00004000)
    waterPump: !!(status & 0x00004000),
    // Bit 15: Nutrient Pump (0x00008000)
    nutrientPump: !!(status & 0x00008000),
    // Bit 16: AC Status (0x00010000)
    acStatus: !!(status & 0x00010000),
    // Bit 17: Reboot ACK (0x00020000)
    rebootAck: !!(status & 0x00020000),
    // Bit 18: Buzzer (0x00040000)
    buzzer: !!(status & 0x00040000),
    // Bit 19-20: Mode (0x00180000) - 2 bits
    mode: (status >> 19) & 0x03, // 0=MANUAL, 1=AUTO, 2=SCHEDULE
    // Bit 21-24: Sensor Fault (0x01E00000) - 4 bits
    sensorFault: (status >> 21) & 0x0F,
    // Bit 25-31: Dimming Level (0xFE000000) - 7 bits (0-100)
    dimmingLevel: (status >> 25) & 0x7F,
    // Raw status for debugging
    rawStatus: `0x${status.toString(16).padStart(8, '0').toUpperCase()}`,
  };
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
  rebootAck: null,
  buzzer: null,
  mode: null,
  sensorFault: null,
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
      ? ['CLOSED', 'OPEN', 'ERROR'][status.inletValve] || 'ERROR' 
      : '_ _',
    outletValve: status.outletValve !== null 
      ? ['CLOSED', 'OPEN', 'ERROR'][status.outletValve] || 'ERROR' 
      : '_ _',
    waterPump: status.waterPump !== null ? (status.waterPump ? 'ON' : 'OFF') : '_ _',
    nutrientPump: status.nutrientPump !== null ? (status.nutrientPump ? 'ON' : 'OFF') : '_ _',
    acStatus: status.acStatus !== null ? (status.acStatus ? 'ON' : 'OFF') : '_ _',
    rebootAck: status.rebootAck !== null ? (status.rebootAck ? 'YES' : 'NO') : '_ _',
    buzzer: status.buzzer !== null ? (status.buzzer ? 'ON' : 'OFF') : '_ _',
    mode: status.mode !== null 
      ? ['MANUAL', 'AUTO', 'SCHEDULE'][status.mode] || 'UNKNOWN' 
      : '_ _',
    sensorFault: status.sensorFault !== null 
      ? `0x${status.sensorFault.toString(16).padStart(2, '0')}` 
      : '_ _',
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
  rebootAck: '_ _',
  buzzer: '_ _',
  mode: '_ _',
  sensorFault: '_ _',
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