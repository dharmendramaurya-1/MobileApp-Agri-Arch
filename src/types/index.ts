export interface User {
  id: string;
  email: string;
  name: string;
}

export interface Device {
  id: string;
  name: string;
  type: 'sensor' | 'plug' | 'pump' | 'air';
  status: 'online' | 'offline';
  room: string;
  temperature?: number;
  humidity?: number;
  soilMoisture?: number;
  airQuality?: string;
  isOn?: boolean;
  lastUpdated: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

// ── SenML / Device data types ────────────────────────────────────────────────

/**
 * A single record inside a SenML payload (as sent by the device).
 * Example: { "n": "ATMP", "u": "Cel", "v": 34.46 }
 */
export interface SenMLRecord {
  /** Base name — device URN, usually on the first record */
  bn?: string;
  /** Base time (unix seconds) */
  bt?: number;
  /** Field name sent by the device (e.g. ATMP, HUMI, DevStat, WatPmp) */
  n?: string;
  /** Unit (e.g. Cel, %RH, ppm) */
  u?: string;
  /** Numeric value */
  v?: number;
  /** Boolean value */
  vb?: boolean;
}

/**
 * Parsed 32-bit device status flags (from DevStat).
 * Mirrors src/utils/deviceStatusParser.js
 */
export interface DeviceStatusFlags {
  tankLow: boolean | null;
  tankHigh: boolean | null;
  ecHigh: boolean | null;
  ecLow: boolean | null;
  phHigh: boolean | null;
  phLow: boolean | null;
  luxLow: boolean | null;
  luxHigh: boolean | null;
  co2High: boolean | null;
  co2Low: boolean | null;
  inletValve: boolean | null;
  outletValve: boolean | null;
  waterPump: boolean | null;
  nutrientPump: boolean | null;
  acStatus: boolean | null;
  mode: boolean | null; // true = AUTO, false = MANUAL
  online: boolean | null; // Bit 16 — true = ONLINE, false = OFFLINE
  sensorFault: number | null; // Bits 17-23 — 7-bit fault code (0-127)
  buzzer: boolean | null;
  dimmingLevel: number | null;
  rawStatus: string | null;
}

/**
 * Normalized device data object (SenML converted to a flat object).
 * This is what parseSenMLToObject() produces and what MQTT sensorData holds.
 */
export interface DeviceSensorData {
  ambientTemperature: number | null;
  ambientHumidity: number | null;
  waterTemperature: number | null;
  co2Level: number | null;
  ecValue: number | null;
  phValue: number | null;
  waterLevel: number | null;
  lightLevel: number | null;
  soilMoisture: number | null;
  deviceStatus: number | null;
  deviceStatusFlags: DeviceStatusFlags | null;
  water_pump: boolean | null;
  water_ILvalve: boolean | null;
  water_OLvalve: boolean | null;
  nutrient_pump: boolean | null;
  lastUpdated: Date | string | null;
  /** Device URN suffix, e.g. "9003718EEB3F" */
  _deviceId?: string;
  /** Base time from the SenML payload */
  _timestamp?: number;
}