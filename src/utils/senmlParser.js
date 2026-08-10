// src/utils/senmlParser.js
/**
 * SenML → Normal Object Converter
 * Converts device SenML payloads into the flat object shape the frontend uses.
 *
 * Device payload example:
 * [
 *   { "bn": "urn:dev:9003718EEB3F", "bt": 1786368377 },
 *   { "n": "ATMP", "u": "Cel", "v": 34.46 },
 *   { "n": "HUMI", "u": "%RH", "v": 64.43 },
 *   { "n": "WATTMP", "u": "Cel", "v": 0.00 },
 *   { "n": "co2", "u": "ppm", "v": 0.00 },
 *   { "n": "ec", "u": "mS/cm", "v": 0.00 },
 *   { "n": "ph", "v": 0.00 },
 *   { "n": "level", "u": "%", "v": 0.0 },
 *   { "n": "lux", "u": "lx", "v": 0.00 },
 *   { "n": "DevStat", "v": 66560 },
 *   { "n": "WatPmp", "vb": false },
 *   { "n": "Wat_ILV", "vb": false },
 *   { "n": "Wat_OLV", "vb": false },
 *   { "n": "NutPmp", "vb": false },
 *   { "n": "BootAck", "vb": false }
 * ]
 */
import { parseDeviceStatus } from "./deviceStatusParser";

// Numeric sensor fields (device name → frontend sensorData key)
const NUMERIC_FIELD_MAP = {
  // Actual names sent by the device firmware
  ATMP: "ambientTemperature",   // Ambient Temperature (°C)
  HUMI: "ambientHumidity",      // Ambient Humidity (%RH)
  WATTMP: "waterTemperature",   // Water Temperature (°C)
  co2: "co2Level",              // CO₂ (ppm)
  ec: "ecValue",                // EC (mS/cm)
  ph: "phValue",                // pH
  level: "waterLevel",          // Water Level (%)
  lux: "lightLevel",            // Light Level (lux)
  // Legacy / API names kept for backward compatibility
  temp: "ambientTemperature",
  humidity: "ambientHumidity",
  water_temp: "waterTemperature",
  soil_moisture: "soilMoisture",
};

// Status fields — the numeric value is the 32-bit device status
const STATUS_FIELDS = {
  DevStat: "deviceStatus",
  device_status: "deviceStatus",
};

// Boolean actuator fields (device name → frontend sensorData key)
const BOOLEAN_FIELD_MAP = {
  // Actual names sent by the device firmware
  WatPmp: "water_pump",
  Wat_ILV: "water_ILvalve",
  Wat_OLV: "water_OLvalve",
  NutPmp: "nutrient_pump",
  BootAck: "reboot_ack",
  // Legacy / API names kept for backward compatibility
  water_pump: "water_pump",
  water_ILvalve: "water_ILvalve",
  water_OLvalve: "water_OLvalve",
  nutrient_pump: "nutrient_pump",
  reboot_ack: "reboot_ack",
};

/**
 * Parse a SenML payload (string or array) into a normal flat object
 * matching the frontend sensorData shape.
 *
 * @param {string | Array} raw - SenML payload as JSON string or array
 * @returns {Object} e.g.
 *   {
 *     ambientTemperature: 34.46,
 *     ambientHumidity: 64.43,
 *     waterTemperature: 0,
 *     co2Level: 0,
 *     ecValue: 0,
 *     phValue: 0,
 *     waterLevel: 0,
 *     lightLevel: 0,
 *     deviceStatus: 66560,
 *     deviceStatusFlags: { ...parsed 32-bit flags... },
 *     water_pump: false,
 *     water_ILvalve: false,
 *     water_OLvalve: false,
 *     nutrient_pump: false,
 *     reboot_ack: false,
 *     _deviceId: "9003718EEB3F",
 *     _timestamp: 1786368377,
 *   }
 */
export const parseSenMLToObject = (raw) => {
  try {
    const records = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(records)) return {};

    const result = {};
    let baseName = null;
    let baseTime = null;

    for (const r of records) {
      if (!r || typeof r !== "object") continue;

      // Base name / base time are metadata, not sensor readings
      if (r.bn) baseName = r.bn;
      if (r.bt) baseTime = r.bt;

      if (!r.n) continue;
      const fieldName = r.n;

      // Numeric value → sensor reading or device status
      if (typeof r.v === "number") {
        if (STATUS_FIELDS[fieldName]) {
          result.deviceStatus = r.v;
          result.deviceStatusFlags = parseDeviceStatus(r.v);
        } else if (NUMERIC_FIELD_MAP[fieldName]) {
          result[NUMERIC_FIELD_MAP[fieldName]] = r.v;
        }
      }

      // Boolean value → actuator / switch state
      if (typeof r.vb === "boolean" && BOOLEAN_FIELD_MAP[fieldName]) {
        result[BOOLEAN_FIELD_MAP[fieldName]] = r.vb;
      }
    }

    // Keep metadata on underscore-prefixed keys so it never collides
    // with a real sensor field.
    if (baseName) {
      result._deviceId = baseName.replace(/^urn:dev:/, "").replace(/:$/, "");
    }
    if (baseTime) result._timestamp = baseTime;

    return result;
  } catch (e) {
    console.log("⚠️ SenML parse error:", e);
    return {};
  }
};

// Convenience alias matching the name used by the MQTT context
export const parseSenML = parseSenMLToObject;

export default parseSenMLToObject;
