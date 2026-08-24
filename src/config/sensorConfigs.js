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
    _apiName: "temp",
    name: "Ambient Temperature",
    title: "Ambient Temperature",
    location: "Greenhouse",
    unit: "°C",
    icon: "thermometer-outline",
    color: "#FF5722",
    maxValue: 50,
    min: 18,
    max: 32,
  },
  {
    key: "ambient-humidity",
    dataKey: "ambientHumidity",
    _apiName: "temphumidity",
    name: "Ambient Humidity",
    title: "Ambient Humidity",
    location: "Greenhouse",
    unit: "%",
    icon: "water-outline",
    color: "#2196F3",
    maxValue: 100,
    min: 40,
    max: 70,
  },
  {
    key: "co2",
    dataKey: "co2Level",
    _apiName: "tempco2",
    name: "CO₂ Level",
    title: "CO₂ Level",
    location: "Greenhouse",
    unit: "ppm",
    icon: "leaf",
    color: "#9C27B0",
    maxValue: 2000,
    min: 400,
    max: 450,
  },
  {
    key: "light-level",
    dataKey: "lightLevel",
    _apiName: "templux",
    name: "Light Level",
    title: "Light Level",
    location: "Greenhouse",
    unit: "lux",
    icon: "sunny-outline",
    color: "#FFC107",
    maxValue: 100000,
    min: 3000,
    max: 8000,
  },
  {
    key: "ph-level",
    dataKey: "phValue",
    _apiName: "tempph",
    name: "pH Value",
    title: "pH Level",
    location: "Field A",
    unit: "pH",
    icon: "flask",
    color: "#4CAF50",
    maxValue: 14,
    min: 6.5,
    max: 7.0,
  },
  {
    key: "ec-value",
    dataKey: "ecValue",
    _apiName: "tempec",
    name: "EC Value",
    title: "EC Value",
    location: "Field A",
    unit: "mS/cm",
    icon: "flash",
    color: "#00BCD4",
    maxValue: 10,
    min: 1.5,
    max: 2.0,
  },
  {
    key: "water-temperature",
    dataKey: "waterTemperature",
    _apiName: "tempwater_temp",
    name: "Water Temperature",
    title: "Water Temperature",
    location: "Water Tank",
    unit: "°C",
    icon: "water-outline",
    color: "#03A9F4",
    maxValue: 50,
    min: 18,
    max: 26,
  },
  {
    key: "water-level",
    dataKey: "waterLevel",
    _apiName: "templevel",
    name: "Water Level",
    title: "Water Level",
    location: "Water Tank",
    unit: "%",
    icon: "water",
    color: "#2E7D32",
    maxValue: 100,
    min: 30,
    max: 90,
  },
];

/**
 * Find a sensor by its route slug, e.g. "co2"
 */
export function getSensorByKey(key) {
  return SENSOR_DATA.find((s) => s.key === key);
}

/**
 * Find a sensor by its MQTT sensorData field name, e.g. "co2Level"
 */
export function getSensorByDataKey(dataKey) {
  return SENSOR_DATA.find((s) => s.dataKey === dataKey);
}

/**
 * Get API name for a sensor (internal use)
 */
export function getApiNameByDataKey(dataKey) {
  const sensor = getSensorByDataKey(dataKey);
  return sensor?._apiName || dataKey;
}

/**
 * Get API name for a sensor by its key (internal use)
 */
export function getApiNameByKey(key) {
  const sensor = getSensorByKey(key);
  return sensor?._apiName || key;
}

// ✅ Export the full sensor data (including internal fields)
export const SENSORS = SENSOR_DATA;

export default SENSORS;