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
    _apiName: "temp", // ✅ From API: "urn:dev:9003718EEB3F:temp"
    name: "Ambient Temperature",
    title: "Ambient Temperature",
    location: "Greenhouse",
    unit: "°C",
    icon: "thermometer-outline",
    color: "#FF5722",
    maxValue: 50,
    min: 18,
    max: 32,
    statusLabel: "Normal",
    range: "18 - 32 °C",
    stats: [
      { label: "Average", value: "25.3°C", color: "#FF5722" },
      { label: "Peak", value: "27°C", color: "#FF9800" },
      { label: "Lowest", value: "24°C", color: "#2196F3" },
    ],
    recommendIcon: "checkmark-circle",
    recommendText: "Temperature is within the ideal range",
  },
  {
    key: "ambient-humidity",
    dataKey: "ambientHumidity",
    _apiName: "temphumidity", // ✅ From API: "urn:dev:9003718EEB3F:temphumidity"
    name: "Ambient Humidity",
    title: "Ambient Humidity",
    location: "Greenhouse",
    unit: "%",
    icon: "water-outline",
    color: "#2196F3",
    maxValue: 100,
    min: 40,
    max: 70,
    statusLabel: "Normal",
    range: "40 - 70 %",
    stats: [
      { label: "Average", value: "56.9%", color: "#2196F3" },
      { label: "Peak", value: "59%", color: "#FF9800" },
      { label: "Lowest", value: "55%", color: "#9C27B0" },
    ],
    recommendIcon: "checkmark-circle",
    recommendText: "Humidity levels are within a healthy range",
  },
  {
    key: "co2",
    dataKey: "co2Level",
    _apiName: "tempco2", // ✅ From API: "urn:dev:9003718EEB3F:tempco2"
    name: "CO₂ Level",
    title: "CO₂ Level",
    location: "Greenhouse",
    unit: "ppm",
    icon: "leaf",
    color: "#9C27B0",
    maxValue: 2000,
    min: 400,
    max: 450,
    statusLabel: "Normal",
    range: "400-450 ppm",
    stats: [
      { label: "Average", value: "418 ppm", color: "#9C27B0" },
      { label: "Peak", value: "425 ppm", color: "#FF9800" },
      { label: "Lowest", value: "410 ppm", color: "#2196F3" },
    ],
    recommendIcon: "leaf",
    recommendText: "CO₂ levels are optimal for plant growth",
  },
  {
    key: "light-level",
    dataKey: "lightLevel",
    _apiName: "templux", // ✅ From API: "urn:dev:9003718EEB3F:templux"
    name: "Light Level",
    title: "Light Level",
    location: "Greenhouse",
    unit: "lux",
    icon: "sunny-outline",
    color: "#FFC107",
    maxValue: 100000,
    min: 3000,
    max: 8000,
    statusLabel: "Normal",
    range: "3000 - 8000 lux",
    stats: [
      { label: "Average", value: "5540 lux", color: "#FFC107" },
      { label: "Peak", value: "6000 lux", color: "#FF9800" },
      { label: "Lowest", value: "5200 lux", color: "#2196F3" },
    ],
    recommendIcon: "checkmark-circle",
    recommendText: "Light levels support healthy photosynthesis",
  },
  {
    key: "ph-level",
    dataKey: "phValue",
    _apiName: "tempph", // ✅ From API: "urn:dev:9003718EEB3F:tempph"
    name: "pH Value",
    title: "pH Level",
    location: "Field A",
    unit: "pH",
    icon: "flask",
    color: "#4CAF50",
    maxValue: 14,
    min: 6.5,
    max: 7.0,
    statusLabel: "Optimal",
    range: "6.5 - 7.0 pH",
    stats: [
      { label: "Average", value: "6.8 pH", color: "#4CAF50" },
      { label: "High", value: "6.9 pH", color: "#FF9800" },
      { label: "Low", value: "6.7 pH", color: "#2196F3" },
    ],
    recommendIcon: "checkmark-circle",
    recommendText: "pH levels are ideal for most crops",
  },
  {
    key: "ec-value",
    dataKey: "ecValue",
    _apiName: "tempec", // ✅ From API: "urn:dev:9003718EEB3F:tempec"
    name: "EC Value",
    title: "EC Value",
    location: "Field A",
    unit: "mS/cm",
    icon: "flash",
    color: "#00BCD4",
    maxValue: 10,
    min: 1.5,
    max: 2.0,
    statusLabel: "Optimal",
    range: "1.5 - 2.0 mS/cm",
    stats: [
      { label: "Average", value: "1.73 mS/cm", color: "#00BCD4" },
      { label: "Peak", value: "1.9 mS/cm", color: "#FF9800" },
      { label: "Lowest", value: "1.6 mS/cm", color: "#2196F3" },
    ],
    recommendIcon: "checkmark-circle",
    recommendText: "EC levels are optimal for nutrient uptake",
  },
  {
    key: "water-temperature",
    dataKey: "waterTemperature",
    _apiName: "tempwater_temp", // ✅ From API: "urn:dev:9003718EEB3F:tempwater_temp"
    name: "Water Temperature",
    title: "Water Temperature",
    location: "Water Tank",
    unit: "°C",
    icon: "thermometer-outline",
    color: "#03A9F4",
    maxValue: 50,
    min: 18,
    max: 26,
    statusLabel: "Normal",
    range: "18 - 26 °C",
    stats: [
      { label: "Average", value: "21.9°C", color: "#03A9F4" },
      { label: "Peak", value: "23°C", color: "#FF9800" },
      { label: "Lowest", value: "21°C", color: "#2196F3" },
    ],
    recommendIcon: "checkmark-circle",
    recommendText: "Water temperature is within a safe range",
  },
  {
    key: "water-level",
    dataKey: "waterLevel",
    _apiName: "templevel", // ✅ From API: "urn:dev:9003718EEB3F:templevel"
    name: "Water Level",
    title: "Water Level",
    location: "Water Tank",
    unit: "%",
    icon: "water",
    color: "#2E7D32",
    maxValue: 100,
    min: 30,
    max: 90,
    statusLabel: "Normal",
    range: "Above 30%",
    stats: [
      { label: "Average", value: "61.4%", color: "#2E7D32" },
      { label: "Peak", value: "72%", color: "#FF9800" },
      { label: "Lowest", value: "52%", color: "#2196F3" },
    ],
    recommendIcon: "alert-circle",
    recommendText: "Tank is trending down — refill recommended soon",
  },
  {
    key: "soil-moisture",
    dataKey: "soilMoisture",
    _apiName: "soil_moisture", // ⚠️ Check if this exists in API
    name: "Soil Moisture",
    title: "Soil Moisture",
    location: "Field A",
    unit: "%",
    icon: "leaf-outline",
    color: "#8BC34A",
    maxValue: 100,
    min: 40,
    max: 70,
    statusLabel: "Low",
    range: "40 - 70 %",
    stats: [
      { label: "Average", value: "38.4%", color: "#8BC34A" },
      { label: "Peak", value: "45%", color: "#FF9800" },
      { label: "Lowest", value: "33%", color: "#2196F3" },
    ],
    recommendIcon: "alert-circle",
    recommendText: "Soil moisture is dropping — irrigation advised",
  },
  // {
  //   key: "device-status",
  //   dataKey: "deviceStatus",
  //   _apiName: "tempdevice_status", // ✅ From API: "urn:dev:9003718EEB3F:tempdevice_status"
  //   name: "Device Status",
  //   title: "Device Status",
  //   location: "System",
  //   unit: "",
  //   icon: "hardware-chip-outline",
  //   color: "#607D8B",
  //   maxValue: 1,
  //   min: 0,
  //   max: 1,
  //   statusLabel: "Online",
  //   range: "0 - 1",
  //   stats: [
  //     { label: "Status", value: "Online", color: "#4CAF50" },
  //     { label: "Uptime", value: "99.9%", color: "#2196F3" },
  //     { label: "Last Seen", value: "Now", color: "#FF9800" },
  //   ],
  //   recommendIcon: "checkmark-circle",
  //   recommendText: "Device is online and functioning normally",
  // },
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