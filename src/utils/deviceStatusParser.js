/**
 * Device Status Parser Utility
 * Parses 32-bit device status flags from the device
 * All values default to '_ _' when no data available
 * 
 * 32-bit Status Bit Mapping:
 * Bit 0:   tank_low      (0x00000001)
 * Bit 1:   tank_high     (0x00000002)
 * Bit 2:   ec_high       (0x00000004)
 * Bit 3:   ec_low        (0x00000008)
 * Bit 4:   ph_high       (0x00000010)
 * Bit 5:   ph_low        (0x00000020)
 * Bit 6:   lux_low       (0x00000040)
 * Bit 7:   lux_high      (0x00000080)
 * Bit 8:   co2_high      (0x00000100)
 * Bit 9:   co2_low       (0x00000200)
 * Bit 10:  inlet_valve   (0x00000400)  - 1=OPEN, 0=CLOSED
 * Bit 11:  outlet_valve  (0x00000800)  - 1=OPEN, 0=CLOSED
 * Bit 12:  water_pump    (0x00001000)  - 1=ON, 0=OFF
 * Bit 13:  nutrient_pump (0x00002000)  - 1=ON, 0=OFF
 * Bit 14:  ac_status     (0x00004000)  - 1=ON, 0=OFF
 * Bit 15:  reboot_ok     (0x00008000)  - 1=ACK, 0=NO
 * Bit 16:  mode          (0x00010000)  - 1=AUTO, 0=MANUAL
 * Bit 17:  online        (0x00020000)  - 1=ONLINE, 0=OFFLINE
 * Bit 18:  buzzer_status (0x00040000)  - 1=ON, 0=OFF
 * Bit 19:  spare_bit1    (0x00080000)  - RESERVED
 * Bit 20-23: sensor_fault (0x00F00000) - 4 bits fault code
 * Bit 24-30: dimming_level (0x7F000000) - 7 bits (0-127)
 * Bit 31:  spare_bit2    (0x80000000)  - RESERVED
 */

/**
 * Parse 32-bit device status flags
 * @param {number} statusValue - 32-bit integer from device
 * @returns {Object} Parsed status object with all fields
 */
export const parseDeviceStatus = (statusValue) => {
  console.log("🔍 parseDeviceStatus called with:", statusValue);
  console.log("   Type:", typeof statusValue);
  console.log("   Value:", statusValue);
  
  if (statusValue === null || statusValue === undefined) {
    console.log("⚠️ statusValue is null or undefined, returning default");
    return getDefaultDeviceStatus();
  }

  // Ensure it's a 32-bit integer
  const status = statusValue >>> 0;
  console.log("📊 Parsed status (32-bit):", status);
  console.log("   Hex:", `0x${status.toString(16).padStart(8, '0').toUpperCase()}`);
  console.log("   Binary:", status.toString(2).padStart(32, '0'));

  const result = {
    // ── STATUS FLAGS (Bit 0-18) ──
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
    // Bit 10: Inlet Valve (0x00000400) - 1=OPEN, 0=CLOSED
    inletValve: !!(status & 0x00000400),
    // Bit 11: Outlet Valve (0x00000800) - 1=OPEN, 0=CLOSED
    outletValve: !!(status & 0x00000800),
    // Bit 12: Water Pump (0x00001000) - 1=ON, 0=OFF
    waterPump: !!(status & 0x00001000),
    // Bit 13: Nutrient Pump (0x00002000) - 1=ON, 0=OFF
    nutrientPump: !!(status & 0x00002000),
    // Bit 14: AC Status (0x00004000) - 1=ON, 0=OFF
    acStatus: !!(status & 0x00004000),
    // Bit 15: Reboot ACK (0x00008000) - 1=ACK, 0=NO
    rebootAck: !!(status & 0x00008000),
    // Bit 16: Mode (0x00010000) - 1=AUTO, 0=MANUAL
    mode: !!(status & 0x00010000),
    // Bit 17: Online (0x00020000) - 1=ONLINE, 0=OFFLINE
    online: !!(status & 0x00020000),
    // Bit 18: Buzzer (0x00040000) - 1=ON, 0=OFF
    buzzer: !!(status & 0x00040000),
    // Bit 19: spare_bit1 (0x00080000) - RESERVED
    spareBit1: !!(status & 0x00080000),
    // Bit 20-23: Sensor Fault (0x00F00000) - 4 bits
    sensorFault: (status >> 20) & 0x0F,
    // Bit 24-30: Dimming Level (0x7F000000) - 7 bits (0-127)
    dimmingLevel: (status >> 24) & 0x7F,
    // Bit 31: spare_bit2 (0x80000000) - RESERVED
    spareBit2: !!(status & 0x80000000),
    // Raw status for debugging
    rawStatus: `0x${status.toString(16).padStart(8, '0').toUpperCase()}`,
  };

  console.log("📊 Parsed device status result:");
  console.log("   Online:", result.online);
  console.log("   Mode:", result.mode ? 'AUTO' : 'MANUAL');
  console.log("   Water Pump:", result.waterPump ? 'ON' : 'OFF');
  console.log("   Nutrient Pump:", result.nutrientPump ? 'ON' : 'OFF');
  console.log("   Inlet Valve:", result.inletValve ? 'OPEN' : 'CLOSED');
  console.log("   Outlet Valve:", result.outletValve ? 'OPEN' : 'CLOSED');
  console.log("   AC Status:", result.acStatus ? 'ON' : 'OFF');
  console.log("   Buzzer:", result.buzzer ? 'ON' : 'OFF');
  console.log("   Reboot ACK:", result.rebootAck ? 'YES' : 'NO');
  console.log("   Sensor Fault:", result.sensorFault);
  console.log("   Dimming Level:", result.dimmingLevel);
  console.log("   Raw Status:", result.rawStatus);
  console.log("   Tank Low:", result.tankLow);
  console.log("   Tank High:", result.tankHigh);
  console.log("   EC High:", result.ecHigh);
  console.log("   EC Low:", result.ecLow);
  console.log("   pH High:", result.phHigh);
  console.log("   pH Low:", result.phLow);
  console.log("   Lux Low:", result.luxLow);
  console.log("   Lux High:", result.luxHigh);
  console.log("   CO2 High:", result.co2High);
  console.log("   CO2 Low:", result.co2Low);

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
  rebootAck: null,
  mode: null,
  online: null,
  buzzer: null,
  spareBit1: null,
  sensorFault: null,
  dimmingLevel: null,
  spareBit2: null,
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
    rebootAck: status.rebootAck !== null ? (status.rebootAck ? 'YES' : 'NO') : '_ _',
    mode: status.mode !== null 
      ? (status.mode ? 'AUTO' : 'MANUAL') 
      : '_ _',
    online: status.online !== null 
      ? (status.online ? 'ONLINE' : 'OFFLINE') 
      : '_ _',
    buzzer: status.buzzer !== null ? (status.buzzer ? 'ON' : 'OFF') : '_ _',
    spareBit1: status.spareBit1 !== null ? (status.spareBit1 ? 'YES' : 'NO') : '_ _',
    sensorFault: status.sensorFault !== null 
      ? `0x${status.sensorFault.toString(16).padStart(1, '0')}` 
      : '_ _',
    dimmingLevel: status.dimmingLevel !== null 
      ? `${Math.round((status.dimmingLevel / 127) * 100)}%` 
      : '_ _',
    spareBit2: status.spareBit2 !== null ? (status.spareBit2 ? 'YES' : 'NO') : '_ _',
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
  mode: '_ _',
  online: '_ _',
  buzzer: '_ _',
  spareBit1: '_ _',
  sensorFault: '_ _',
  dimmingLevel: '_ _',
  spareBit2: '_ _',
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