// src/utils/deviceStatusParser.js

/**
 * Device Status Bit Mapping - EXACT MATCH to firmware DeviceStatus_t union
 * 
 * typedef union
 * {
 *     struct
 *     {
 *       uint32_t tank_low            :1;  // Bit0  === 0x00000001
 *       uint32_t tank_high           :1;  // Bit1  === 0x00000002
 *       uint32_t ec_high             :1;  // Bit2  === 0x00000004
 *       uint32_t ec_low              :1;  // Bit3  === 0x00000008
 *       uint32_t ph_high             :1;  // Bit4  === 0x00000010
 *       uint32_t ph_low              :1;  // Bit5  === 0x00000020
 *       uint32_t lux_low             :1;  // Bit6  === 0x00000040
 *       uint32_t lux_high            :1;  // Bit7  === 0x00000080
 *
 *       uint32_t co2_high            :1;  // Bit8  === 0x00000100
 *       uint32_t co2_low             :1;  // Bit9  === 0x00000200
 *       uint32_t inlet_valve         :1;  // Bit10 === 0x00000400
 *       uint32_t outlet_valve        :1;  // Bit11 === 0x00000800
 *       uint32_t water_pump_status   :1;  // Bit12 === 0x00001000
 *       uint32_t nutrient_pump       :1;  // Bit13 === 0x00002000
 *       uint32_t ac_status           :1;  // Bit14 === 0x00004000
 *       uint32_t mode                :1;  // Bit15 === 0x00008000
 *
 *       uint32_t led_status          :1;  // Bit16 === 0x00010000 (LED Light Status)
 *       uint32_t air_temp_high       :1;  // Bit17 === 0x00020000
 *       uint32_t air_temp_low        :1;  // Bit18 === 0x00040000
 *       uint32_t humidity_high       :1;  // Bit19 === 0x00080000
 *       uint32_t humidity_low        :1;  // Bit20 === 0x00100000
 *       uint32_t water_temp_high     :1;  // Bit21 === 0x00200000
 *       uint32_t water_temp_low      :1;  // Bit22 === 0x00400000
 *       uint32_t bypaslvl            :1;  // Bit23 === 0x00800000 (Bypass Level / clean_tank)
 *
 *       uint32_t buzzer_status       :1;  // Bit24 === 0x01000000 (Buzzer Audible Alarm)
 *       uint32_t dimming_level       :7;  // Bits25-31 === 0xFE000000
 *     };
 *     uint32_t all;
 * } DeviceStatus_t;
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
      // LED Light Status (Bit 16)
      ledStatus: false,
      led: false,
      // Environment flags
      airTempHigh: false,
      airTempLow: false,
      humidityHigh: false,
      humidityLow: false,
      waterTempHigh: false,
      waterTempLow: false,
      // System flags
      cleanTank: false,
      sensorFault: false,
      bypaslvl: false,
      bypassLevel: false,
      buzzer: false,
      buzzerStatus: false,
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
    // Bit 16: led_status (LED Light Status)
    ledStatus: (status & 0x00010000) !== 0,
    led: (status & 0x00010000) !== 0,
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
    // Bit 23: bypaslvl (Bypass Level - 0-indexed Bit 23, mask 0x00800000)
    bypaslvl: (status & 0x00800000) !== 0,
    bypassLevel: (status & 0x00800000) !== 0,
    cleanTank: (status & 0x00800000) !== 0,
    sensorFault: (status & 0x00800000) !== 0,
    // Bit 24: buzzer_status
    buzzer: (status & 0x01000000) !== 0,
    buzzerStatus: (status & 0x01000000) !== 0,
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
    ledStatus: false,
    led: false,
    airTempHigh: false,
    airTempLow: false,
    humidityHigh: false,
    humidityLow: false,
    waterTempHigh: false,
    waterTempLow: false,
    cleanTank: false,
    sensorFault: false,
    bypaslvl: false,
    bypassLevel: false,
    buzzer: false,
    buzzerStatus: false,
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
    return { text: 'Unknown', color: '#757575', icon: 'power-outline' };
  }

  if (parsed.cleanTank) {
    return { text: 'Cleaning', color: '#2196F3', icon: 'refresh-circle-outline' };
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

  if (hasAlert || parsed.buzzer) {
    return { text: 'Alert', color: '#FFA500', icon: 'warning-outline' };
  }

  if (parsed.waterPump || parsed.inletValve || parsed.outletValve || 
      parsed.nutrientPump || parsed.acStatus || parsed.buzzer || parsed.ledStatus) {
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
  if (parsed.buzzer) alerts.push('Buzzer Sounding');
  
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
    { label: 'LED Light', value: parsed.ledStatus, icon: 'sunny-outline' },
    { label: 'Buzzer', value: parsed.buzzer, icon: 'volume-high-outline' },
    { label: 'Mode', value: parsed.mode ? 'AUTO' : 'MANUAL', icon: 'settings-outline' },
  ];
};

// Helper functions
export const getStatusColor = (status) => getDisplayStatus(status).color;
export const getStatusText = (status) => getDisplayStatus(status).text;
export const getStatusIcon = (status) => getDisplayStatus(status).icon;

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

// ── Event Mask Bit Definitions (EventBits_t) ─────────────────────────────────
export const EVENT_BITS = {
  EVENT_AIR_TEMP_HIGH: 1 << 0,
  EVENT_AIR_TEMP_LOW: 1 << 1,
  EVENT_HUMIDITY_HIGH: 1 << 2,
  EVENT_HUMIDITY_LOW: 1 << 3,
  EVENT_PH_HIGH: 1 << 4,
  EVENT_PH_LOW: 1 << 5,
  EVENT_EC_HIGH: 1 << 6,
  EVENT_EC_LOW: 1 << 7,
  EVENT_CO2_HIGH: 1 << 8,
  EVENT_CO2_LOW: 1 << 9,
  EVENT_LUX_HIGH: 1 << 10,
  EVENT_LUX_LOW: 1 << 11,
  EVENT_WATER_TEMP_HIGH: 1 << 12,
  EVENT_WATER_TEMP_LOW: 1 << 13,
  EVENT_TANK_LEVEL_LOW: 1 << 14,
  EVENT_TANK_LEVEL_HIGH: 1 << 15,
  EVENT_WATER_PUMP_ON: 1 << 16,
  EVENT_WATER_PUMP_OFF: 1 << 17,
  EVENT_INLET_VALVE_OPEN: 1 << 18,
  EVENT_INLET_VALVE_CLOSED: 1 << 19,
  EVENT_OUTLET_VALVE_OPEN: 1 << 20,
  EVENT_OUTLET_VALVE_CLOSED: 1 << 21,
  EVENT_NUTRIENT_PUMP_ON: 1 << 22,
  EVENT_NUTRIENT_PUMP_OFF: 1 << 23,
  EVENT_LED_LIGHT_ON: 1 << 24,
  EVENT_LED_LIGHT_OFF: 1 << 25,
  EVENT_AC_ON: 1 << 26,
  EVENT_AC_OFF: 1 << 27,
  EVENT_MODE_AUTO: 1 << 28,
  EVENT_MODE_MANUAL: 1 << 29,
  EVENT_CLEAN_TANK_CHANGED: 1 << 30,
  EVENT_ALARM_STATE_CHANGED: 0x80000000,
};

/**
 * Parse an EventMask bitfield (EventBits_t)
 */
export const parseEventMask = (mask) => {
  if (mask === null || mask === undefined || typeof mask !== 'number' || isNaN(mask)) {
    return {
      rawMask: 0,
      activeEvents: [],
      waterPump: null,
      nutrientPump: null,
      inletValve: null,
      outletValve: null,
      ledStatus: null,
      acStatus: null,
      mode: null,
      cleanTankChanged: false,
      alarmStateChanged: false,
    };
  }

  let waterPump = null;
  if ((mask & EVENT_BITS.EVENT_WATER_PUMP_ON) !== 0) waterPump = true;
  else if ((mask & EVENT_BITS.EVENT_WATER_PUMP_OFF) !== 0) waterPump = false;

  let inletValve = null;
  if ((mask & EVENT_BITS.EVENT_INLET_VALVE_OPEN) !== 0) inletValve = true;
  else if ((mask & EVENT_BITS.EVENT_INLET_VALVE_CLOSED) !== 0) inletValve = false;

  let outletValve = null;
  if ((mask & EVENT_BITS.EVENT_OUTLET_VALVE_OPEN) !== 0) outletValve = true;
  else if ((mask & EVENT_BITS.EVENT_OUTLET_VALVE_CLOSED) !== 0) outletValve = false;

  let nutrientPump = null;
  if ((mask & EVENT_BITS.EVENT_NUTRIENT_PUMP_ON) !== 0) nutrientPump = true;
  else if ((mask & EVENT_BITS.EVENT_NUTRIENT_PUMP_OFF) !== 0) nutrientPump = false;

  let ledStatus = null;
  if ((mask & EVENT_BITS.EVENT_LED_LIGHT_ON) !== 0) ledStatus = true;
  else if ((mask & EVENT_BITS.EVENT_LED_LIGHT_OFF) !== 0) ledStatus = false;

  let acStatus = null;
  if ((mask & EVENT_BITS.EVENT_AC_ON) !== 0) acStatus = true;
  else if ((mask & EVENT_BITS.EVENT_AC_OFF) !== 0) acStatus = false;

  let mode = null;
  if ((mask & EVENT_BITS.EVENT_MODE_AUTO) !== 0) mode = true;
  else if ((mask & EVENT_BITS.EVENT_MODE_MANUAL) !== 0) mode = false;

  const cleanTankChanged = (mask & EVENT_BITS.EVENT_CLEAN_TANK_CHANGED) !== 0;
  const alarmStateChanged = (mask & EVENT_BITS.EVENT_ALARM_STATE_CHANGED) !== 0;

  const activeEvents = [];
  if ((mask & EVENT_BITS.EVENT_AIR_TEMP_HIGH) !== 0) activeEvents.push("Air Temp HIGH");
  if ((mask & EVENT_BITS.EVENT_AIR_TEMP_LOW) !== 0) activeEvents.push("Air Temp LOW");
  if ((mask & EVENT_BITS.EVENT_HUMIDITY_HIGH) !== 0) activeEvents.push("Humidity HIGH");
  if ((mask & EVENT_BITS.EVENT_HUMIDITY_LOW) !== 0) activeEvents.push("Humidity LOW");
  if ((mask & EVENT_BITS.EVENT_PH_HIGH) !== 0) activeEvents.push("pH HIGH");
  if ((mask & EVENT_BITS.EVENT_PH_LOW) !== 0) activeEvents.push("pH LOW");
  if ((mask & EVENT_BITS.EVENT_EC_HIGH) !== 0) activeEvents.push("EC HIGH");
  if ((mask & EVENT_BITS.EVENT_EC_LOW) !== 0) activeEvents.push("EC LOW");
  if ((mask & EVENT_BITS.EVENT_CO2_HIGH) !== 0) activeEvents.push("CO₂ HIGH");
  if ((mask & EVENT_BITS.EVENT_CO2_LOW) !== 0) activeEvents.push("CO₂ LOW");
  if ((mask & EVENT_BITS.EVENT_LUX_HIGH) !== 0) activeEvents.push("Light HIGH");
  if ((mask & EVENT_BITS.EVENT_LUX_LOW) !== 0) activeEvents.push("Light LOW");
  if ((mask & EVENT_BITS.EVENT_WATER_TEMP_HIGH) !== 0) activeEvents.push("Water Temp HIGH");
  if ((mask & EVENT_BITS.EVENT_WATER_TEMP_LOW) !== 0) activeEvents.push("Water Temp LOW");
  if ((mask & EVENT_BITS.EVENT_TANK_LEVEL_LOW) !== 0) activeEvents.push("Tank Level LOW");
  if ((mask & EVENT_BITS.EVENT_TANK_LEVEL_HIGH) !== 0) activeEvents.push("Tank Level HIGH");
  if ((mask & EVENT_BITS.EVENT_WATER_PUMP_ON) !== 0) activeEvents.push("Water Pump ON");
  if ((mask & EVENT_BITS.EVENT_WATER_PUMP_OFF) !== 0) activeEvents.push("Water Pump OFF");
  if ((mask & EVENT_BITS.EVENT_INLET_VALVE_OPEN) !== 0) activeEvents.push("Inlet Valve OPEN");
  if ((mask & EVENT_BITS.EVENT_INLET_VALVE_CLOSED) !== 0) activeEvents.push("Inlet Valve CLOSED");
  if ((mask & EVENT_BITS.EVENT_OUTLET_VALVE_OPEN) !== 0) activeEvents.push("Outlet Valve OPEN");
  if ((mask & EVENT_BITS.EVENT_OUTLET_VALVE_CLOSED) !== 0) activeEvents.push("Outlet Valve CLOSED");
  if ((mask & EVENT_BITS.EVENT_NUTRIENT_PUMP_ON) !== 0) activeEvents.push("Nutrient Pump ON");
  if ((mask & EVENT_BITS.EVENT_NUTRIENT_PUMP_OFF) !== 0) activeEvents.push("Nutrient Pump OFF");
  if ((mask & EVENT_BITS.EVENT_LED_LIGHT_ON) !== 0) activeEvents.push("LED Light ON");
  if ((mask & EVENT_BITS.EVENT_LED_LIGHT_OFF) !== 0) activeEvents.push("LED Light OFF");
  if ((mask & EVENT_BITS.EVENT_AC_ON) !== 0) activeEvents.push("AC ON");
  if ((mask & EVENT_BITS.EVENT_AC_OFF) !== 0) activeEvents.push("AC OFF");
  if ((mask & EVENT_BITS.EVENT_MODE_AUTO) !== 0) activeEvents.push("Mode AUTO");
  if ((mask & EVENT_BITS.EVENT_MODE_MANUAL) !== 0) activeEvents.push("Mode MANUAL");
  if (cleanTankChanged) activeEvents.push("Clean Tank Changed");
  if (alarmStateChanged) activeEvents.push("Alarm State Changed");

  return {
    rawMask: mask,
    activeEvents,
    waterPump,
    nutrientPump,
    inletValve,
    outletValve,
    ledStatus,
    acStatus,
    mode,
    cleanTankChanged,
    alarmStateChanged,
    airTempHigh: (mask & EVENT_BITS.EVENT_AIR_TEMP_HIGH) !== 0,
    airTempLow: (mask & EVENT_BITS.EVENT_AIR_TEMP_LOW) !== 0,
    humidityHigh: (mask & EVENT_BITS.EVENT_HUMIDITY_HIGH) !== 0,
    humidityLow: (mask & EVENT_BITS.EVENT_HUMIDITY_LOW) !== 0,
    phHigh: (mask & EVENT_BITS.EVENT_PH_HIGH) !== 0,
    phLow: (mask & EVENT_BITS.EVENT_PH_LOW) !== 0,
    ecHigh: (mask & EVENT_BITS.EVENT_EC_HIGH) !== 0,
    ecLow: (mask & EVENT_BITS.EVENT_EC_LOW) !== 0,
    co2High: (mask & EVENT_BITS.EVENT_CO2_HIGH) !== 0,
    co2Low: (mask & EVENT_BITS.EVENT_CO2_LOW) !== 0,
    luxHigh: (mask & EVENT_BITS.EVENT_LUX_HIGH) !== 0,
    luxLow: (mask & EVENT_BITS.EVENT_LUX_LOW) !== 0,
    waterTempHigh: (mask & EVENT_BITS.EVENT_WATER_TEMP_HIGH) !== 0,
    waterTempLow: (mask & EVENT_BITS.EVENT_WATER_TEMP_LOW) !== 0,
    tankLevelLow: (mask & EVENT_BITS.EVENT_TANK_LEVEL_LOW) !== 0,
    tankLevelHigh: (mask & EVENT_BITS.EVENT_TANK_LEVEL_HIGH) !== 0,
  };
};

// ── Clean Tank States (Bits 8-12 of SensFlt, Mask: 0x00001F00) ───────────────
export const CLEAN_TANK_STATES = {
  0: { code: 0, key: "CLEAN_TANK_IDLE", label: "Idle", color: "#757575", isActive: false },
  1: { code: 1, key: "CLEAN_TANK_DRAINING", label: "Draining", color: "#FF9800", isActive: true },
  2: { code: 2, key: "CLEAN_TANK_FILLING", label: "Filling", color: "#2196F3", isActive: true },
  3: { code: 3, key: "CLEAN_TANK_COMPLETE", label: "Complete", color: "#4CAF50", isActive: false },
  4: { code: 4, key: "CLEAN_TANK_ERROR", label: "Error", color: "#F44336", isActive: false },
};

/**
 * Parse Clean Tank State from SensFlt (Bits 8-12, Mask: 0x00001F00)
 */
export const parseCleanTankState = (sensFlt) => {
  if (sensFlt === null || sensFlt === undefined || typeof sensFlt !== "number" || isNaN(sensFlt)) {
    return CLEAN_TANK_STATES[0];
  }
  const code = (sensFlt & 0x00001F00) >>> 8;
  return (
    CLEAN_TANK_STATES[code] || {
      code,
      key: `CLEAN_TANK_UNKNOWN_${code}`,
      label: `State ${code}`,
      color: "#9E9E9E",
      isActive: false,
    }
  );
};

/**
 * Parse Sensor Faults and Clean Tank state from SensFlt
 * Bits 0-7: Sensor faults
 * Bits 8-12: Tank cleaning states
 */
export const parseSensorFaults = (sensFlt) => {
  if (sensFlt === null || sensFlt === undefined || typeof sensFlt !== "number" || isNaN(sensFlt)) {
    return {
      co2: false,
      waterLevel: false,
      light: false,
      ec: false,
      ph: false,
      waterTemp: false,
      airTemp: false,
      humidity: false,
      rawMask: 0,
      hasAnyFault: false,
      cleanTank: CLEAN_TANK_STATES[0],
    };
  }
  const sensorBits = sensFlt & 0x00FF; // Bits 0-7
  const cleanTank = parseCleanTankState(sensFlt); // Bits 8-12

  return {
    co2: (sensorBits & 0x01) !== 0,
    waterLevel: (sensorBits & 0x02) !== 0,
    light: (sensorBits & 0x04) !== 0,
    ec: (sensorBits & 0x08) !== 0,
    ph: (sensorBits & 0x10) !== 0,
    waterTemp: (sensorBits & 0x20) !== 0,
    airTemp: (sensorBits & 0x40) !== 0,
    humidity: (sensorBits & 0x80) !== 0,
    rawMask: sensorBits,
    hasAnyFault: sensorBits !== 0,
    cleanTank,
  };
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
  isAutoMode,
  getDimmingLevel,
  hasActiveAlerts,
  EVENT_BITS,
  parseEventMask,
  CLEAN_TANK_STATES,
  parseCleanTankState,
  parseSensorFaults,
};