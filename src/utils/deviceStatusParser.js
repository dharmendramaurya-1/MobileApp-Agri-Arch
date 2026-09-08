// src/utils/deviceStatusParser.js

/**
 * Device Status Bit Mapping - EXACT MATCH to firmware struct
 * 
 * struct {
 *   uint32_t tank_low             : 1;  // Bit 0  = 0x00000001
 *   uint32_t tank_high            : 1;  // Bit 1  = 0x00000002
 *   uint32_t ec_high              : 1;  // Bit 2  = 0x00000004
 *   uint32_t ec_low               : 1;  // Bit 3  = 0x00000008
 *   uint32_t ph_high              : 1;  // Bit 4  = 0x00000010
 *   uint32_t ph_low               : 1;  // Bit 5  = 0x00000020
 *   uint32_t lux_low              : 1;  // Bit 6  = 0x00000040
 *   uint32_t lux_high             : 1;  // Bit 7  = 0x00000080
 *   uint32_t co2_high             : 1;  // Bit 8  = 0x00000100
 *   uint32_t co2_low              : 1;  // Bit 9  = 0x00000200
 *   uint32_t inlet_valve          : 1;  // Bit 10 = 0x00000400
 *   uint32_t outlet_valve         : 1;  // Bit 11 = 0x00000800
 *   uint32_t water_pump_status    : 1;  // Bit 12 = 0x00001000
 *   uint32_t nutrient_pump        : 1;  // Bit 13 = 0x00002000
 *   uint32_t ac_status            : 1;  // Bit 14 = 0x00004000
 *   uint32_t mode                 : 1;  // Bit 15 = 0x00008000
 *   uint32_t online               : 1;  // Bit 16 = 0x00010000
 *   uint32_t air_temp_high        : 1;  // Bit 17 = 0x00020000
 *   uint32_t air_temp_low         : 1;  // Bit 18 = 0x00040000
 *   uint32_t humidity_high        : 1;  // Bit 19 = 0x00080000
 *   uint32_t humidity_low         : 1;  // Bit 20 = 0x00100000
 *   uint32_t water_temp_high      : 1;  // Bit 21 = 0x00200000
 *   uint32_t water_temp_low       : 1;  // Bit 22 = 0x00400000
 *   uint32_t sensor_fault         : 1;  // Bit 23 = 0x00800000
 *   uint32_t buzzer_status        : 1;  // Bit 24 = 0x01000000
 *   uint32_t dimming_level        : 7;  // Bits 25-31 = 0xFE000000
 * };
 */

export const parseDeviceStatus = (status) => {
  if (status === null || status === undefined || typeof status !== 'number' || isNaN(status)) {
    return {
      // Alert flags
      tankLow: false,
      tankHigh: false,
      ecHigh: false,
      ecLow: false,
      phHigh: false,
      phLow: false,
      luxLow: false,
      luxHigh: false,
      co2High: false,
      co2Low: false,
      // Actuator flags
      inletValve: false,
      outletValve: false,
      waterPump: false,
      nutrientPump: false,
      acStatus: false,
      mode: false,
      online: false,
      // Environment flags
      airTempHigh: false,
      airTempLow: false,
      humidityHigh: false,
      humidityLow: false,
      waterTempHigh: false,
      waterTempLow: false,
      // System flags
      sensorFault: false,
      buzzer: false,
      dimmingLevel: 0,
      rawStatus: 0,
    };
  }

  // EXACT bit mapping from firmware struct
  return {
    // Bit 0: tank_low
    tankLow: (status & 0x00000001) !== 0,
    // Bit 1: tank_high
    tankHigh: (status & 0x00000002) !== 0,
    // Bit 2: ec_high
    ecHigh: (status & 0x00000004) !== 0,
    // Bit 3: ec_low
    ecLow: (status & 0x00000008) !== 0,
    // Bit 4: ph_high
    phHigh: (status & 0x00000010) !== 0,
    // Bit 5: ph_low
    phLow: (status & 0x00000020) !== 0,
    // Bit 6: lux_low
    luxLow: (status & 0x00000040) !== 0,
    // Bit 7: lux_high
    luxHigh: (status & 0x00000080) !== 0,
    // Bit 8: co2_high
    co2High: (status & 0x00000100) !== 0,
    // Bit 9: co2_low
    co2Low: (status & 0x00000200) !== 0,
    // Bit 10: inlet_valve
    inletValve: (status & 0x00000400) !== 0,
    // Bit 11: outlet_valve
    outletValve: (status & 0x00000800) !== 0,
    // Bit 12: water_pump_status
    waterPump: (status & 0x00001000) !== 0,
    // Bit 13: nutrient_pump
    nutrientPump: (status & 0x00002000) !== 0,
    // Bit 14: ac_status
    acStatus: (status & 0x00004000) !== 0,
    // Bit 15: mode (1 = AUTO, 0 = MANUAL)
    mode: (status & 0x00008000) !== 0,
    // Bit 16: online
    online: (status & 0x00010000) !== 0,
    // Bit 17: air_temp_high
    airTempHigh: (status & 0x00020000) !== 0,
    // Bit 18: air_temp_low
    airTempLow: (status & 0x00040000) !== 0,
    // Bit 19: humidity_high
    humidityHigh: (status & 0x00080000) !== 0,
    // Bit 20: humidity_low
    humidityLow: (status & 0x00100000) !== 0,
    // Bit 21: water_temp_high
    waterTempHigh: (status & 0x00200000) !== 0,
    // Bit 22: water_temp_low
    waterTempLow: (status & 0x00400000) !== 0,
    // Bit 23: sensor_fault
    sensorFault: (status & 0x00800000) !== 0,
    // Bit 24: buzzer_status
    buzzer: (status & 0x01000000) !== 0,
    // Bits 25-31: dimming_level (0-127)
    dimmingLevel: (status >> 25) & 0x7F,
    rawStatus: status,
  };
};

/**
 * Get default device status (all false/off)
 */
export const getDefaultDeviceStatus = () => {
  return {
    tankLow: false,
    tankHigh: false,
    ecHigh: false,
    ecLow: false,
    phHigh: false,
    phLow: false,
    luxLow: false,
    luxHigh: false,
    co2High: false,
    co2Low: false,
    inletValve: false,
    outletValve: false,
    waterPump: false,
    nutrientPump: false,
    acStatus: false,
    mode: false,
    online: false,
    airTempHigh: false,
    airTempLow: false,
    humidityHigh: false,
    humidityLow: false,
    waterTempHigh: false,
    waterTempLow: false,
    sensorFault: false,
    buzzer: false,
    dimmingLevel: 0,
    rawStatus: 0,
  };
};

/**
 * Get display status for UI
 */
export const getDisplayStatus = (status) => {
  const parsed = typeof status === 'number' ? parseDeviceStatus(status) : status;
  
  if (!parsed) {
    return { text: 'Offline', color: '#FF4444', icon: 'power-outline' };
  }

  if (!parsed.online) {
    return { text: 'Offline', color: '#FF4444', icon: 'power-outline' };
  }

  if (parsed.sensorFault) {
    return { text: 'Fault', color: '#FF4444', icon: 'alert-circle-outline' };
  }

  // Check ANY alert from device
  const hasAlert = parsed.tankLow || parsed.tankHigh || 
                   parsed.ecHigh || parsed.ecLow ||
                   parsed.phHigh || parsed.phLow ||
                   parsed.luxLow || parsed.luxHigh ||
                   parsed.co2High || parsed.co2Low ||
                   parsed.waterTempHigh || parsed.waterTempLow ||
                   parsed.airTempHigh || parsed.airTempLow ||
                   parsed.humidityHigh || parsed.humidityLow;

  if (hasAlert) {
    return { text: 'Alert', color: '#FFA500', icon: 'warning-outline' };
  }

  if (parsed.waterPump || parsed.inletValve || parsed.outletValve || 
      parsed.nutrientPump || parsed.acStatus || parsed.buzzer) {
    return { text: 'Active', color: '#4CAF50', icon: 'play-circle-outline' };
  }

  return { text: 'Online', color: '#4CAF50', icon: 'checkmark-circle-outline' };
};

/**
 * Get all active alerts from device
 */
export const getActiveAlerts = (status) => {
  const parsed = typeof status === 'number' ? parseDeviceStatus(status) : status;
  if (!parsed) return [];
  
  const alerts = [];
  
  // Alert flags (Bits 0-9, 17-22)
  if (parsed.tankLow) alerts.push('Tank Low');
  if (parsed.tankHigh) alerts.push('Tank High');
  if (parsed.ecHigh) alerts.push('EC High');
  if (parsed.ecLow) alerts.push('EC Low');
  if (parsed.phHigh) alerts.push('pH High');
  if (parsed.phLow) alerts.push('pH Low');
  if (parsed.luxLow) alerts.push('Light Low');
  if (parsed.luxHigh) alerts.push('Light High');
  if (parsed.co2High) alerts.push('CO₂ High');
  if (parsed.co2Low) alerts.push('CO₂ Low');
  if (parsed.airTempHigh) alerts.push('Air Temp High');
  if (parsed.airTempLow) alerts.push('Air Temp Low');
  if (parsed.humidityHigh) alerts.push('Humidity High');
  if (parsed.humidityLow) alerts.push('Humidity Low');
  if (parsed.waterTempHigh) alerts.push('Water Temp High');
  if (parsed.waterTempLow) alerts.push('Water Temp Low');
  
  return alerts;
};

/**
 * Get actuator status
 */
export const getActuatorStatus = (status) => {
  const parsed = typeof status === 'number' ? parseDeviceStatus(status) : status;
  if (!parsed) return [];
  
  return [
    { label: 'Water Pump', value: parsed.waterPump, icon: 'water-outline' },
    { label: 'Inlet Valve', value: parsed.inletValve, icon: 'arrow-down-outline' },
    { label: 'Outlet Valve', value: parsed.outletValve, icon: 'arrow-up-outline' },
    { label: 'Nutrient Pump', value: parsed.nutrientPump, icon: 'leaf-outline' },
    { label: 'AC Status', value: parsed.acStatus, icon: 'thermometer-outline' },
    { label: 'Buzzer', value: parsed.buzzer, icon: 'volume-high-outline' },
    { label: 'Mode', value: parsed.mode ? 'AUTO' : 'MANUAL', icon: 'settings-outline' },
  ];
};

// Helper functions
export const getStatusColor = (status) => getDisplayStatus(status).color;
export const getStatusText = (status) => getDisplayStatus(status).text;
export const getStatusIcon = (status) => getDisplayStatus(status).icon;
export const isDeviceOnline = (status) => {
  if (typeof status !== 'number' || isNaN(status)) return false;
  return (status & 0x00010000) !== 0;
};
export const isAutoMode = (status) => {
  if (typeof status !== 'number' || isNaN(status)) return false;
  return (status & 0x00008000) !== 0;
};
export const getDimmingLevel = (status) => {
  if (typeof status !== 'number' || isNaN(status)) return 0;
  return (status >> 25) & 0x7F;
};
export const hasActiveAlerts = (status) => {
  const alerts = getActiveAlerts(status);
  return alerts.length > 0;
};

export default {
  parseDeviceStatus,
  getDefaultDeviceStatus,
  getDisplayStatus,
  getStatusColor,
  getStatusText,
  getStatusIcon,
  getActiveAlerts,
  getActuatorStatus,
  isDeviceOnline,
  isAutoMode,
  getDimmingLevel,
  hasActiveAlerts,
};