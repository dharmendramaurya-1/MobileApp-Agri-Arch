// src/config/sensorConfigs.js

/**
 * Single source of truth for every sensor in the app.
 * - `key` is the URL slug used for routing: /sensor/<key>
 * - `dataKey` is the field name inside MQTT `sensorData`
 * - `_apiName` is internal - used for API queries
 */
const SENSOR_DATA = [
  {
    key: "ambient-temperature",
    dataKey: "ambientTemperature",
    _apiName: "ATMP",
    name: "Ambient Temperature",
    title: "Ambient Temperature",
    location: "Greenhouse",
    unit: "°C",
    icon: "thermometer-outline",
    color: "#FF5722",
  },
  {
    key: "ambient-humidity",
    dataKey: "ambientHumidity",
    _apiName: "HUMI",
    name: "Ambient Humidity",
    title: "Ambient Humidity",
    location: "Greenhouse",
    unit: "%",
    icon: "water-outline",
    color: "#2196F3",
  },
  {
    key: "co2",
    dataKey: "co2Level",
    _apiName: "co2",
    name: "CO₂ Level",
    title: "CO₂ Level",
    location: "Greenhouse",
    unit: "ppm",
    icon: "leaf",
    color: "#9C27B0",
  },
  {
    key: "light-level",
    dataKey: "lightLevel",
    _apiName: "lux",
    name: "Light Level",
    title: "Light Level",
    location: "Greenhouse",
    unit: "lux",
    icon: "sunny-outline",
    color: "#FFC107",
  },
  {
    key: "ph-level",
    dataKey: "phValue",
    _apiName: "ph",
    name: "pH Value",
    title: "pH Level",
    location: "Field A",
    unit: "pH",
    icon: "flask",
    color: "#4CAF50",
  },
  {
    key: "ec-value",
    dataKey: "ecValue",
    _apiName: "ec",
    name: "EC Value",
    title: "EC Value",
    location: "Field A",
    unit: "mS/cm",
    icon: "flash",
    color: "#00BCD4",
  },
  {
    key: "water-temperature",
    dataKey: "waterTemperature",
    _apiName: "WATTMP",
    name: "Water Temperature",
    title: "Water Temperature",
    location: "Water Tank",
    unit: "°C",
    icon: "water-outline",
    color: "#03A9F4",
  },
  {
    key: "water-level",
    dataKey: "waterLevel",
    _apiName: "level",
    name: "Water Level",
    title: "Water Level",
    location: "Water Tank",
    unit: "%",
    icon: "water",
    color: "#2E7D32",
  },
  {
    key: "soil-moisture",
    dataKey: "soilMoisture",
    _apiName: "soil_moisture",
    name: "Soil Moisture",
    title: "Soil Moisture",
    location: "Field",
    unit: "%",
    icon: "leaf",
    color: "#8D6E63",
  },
  {
    key: "device-status",
    dataKey: "deviceStatus",
    _apiName: "DevStat",
    name: "Device Status",
    title: "Device Status",
    location: "System",
    unit: "",
    icon: "hardware-chip-outline",
    color: "#4CAF50",
  },
];

/**
 * Find a sensor by its route slug, e.g. "ambient-temperature"
 */
export function getSensorByKey(key) {
  return SENSOR_DATA.find((s) => s.key === key);
}

/**
 * Find a sensor by its MQTT sensorData field name, e.g. "ambientTemperature"
 */
export function getSensorByDataKey(dataKey) {
  return SENSOR_DATA.find((s) => s.dataKey === dataKey);
}

/**
 * Get API name for a sensor by its key (internal use)
 */
export function getApiNameByKey(key) {
  const sensor = getSensorByKey(key);
  return sensor?._apiName || key;
}

/**
 * Get API name for a sensor by dataKey (internal use)
 */
export function getApiNameByDataKey(dataKey) {
  const sensor = getSensorByDataKey(dataKey);
  return sensor?._apiName || dataKey;
}

// ✅ Export the full sensor data
export const SENSORS = SENSOR_DATA;

// ✅ Default export
export default SENSORS;