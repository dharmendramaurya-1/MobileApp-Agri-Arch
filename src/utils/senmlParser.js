// src/utils/senmlParser.js
/**
 * SenML → Normal Object Converter
 * Converts device SenML payloads into the flat object shape the frontend uses.
 */
import { parseDeviceStatus } from "./deviceStatusParser";

// Numeric sensor fields
const NUMERIC_FIELD_MAP = {
  ATMP: "ambientTemperature",
  HUMI: "ambientHumidity",
  WATTMP: "waterTemperature",
  co2: "co2Level",
  ec: "ecValue",
  ph: "phValue",
  level: "waterLevel",
  lux: "lightLevel",
  temp: "ambientTemperature",
  humidity: "ambientHumidity",
  water_temp: "waterTemperature",
  soil_moisture: "soilMoisture",
};

// Status fields
const STATUS_FIELDS = {
  DevStat: "deviceStatus",
  device_status: "deviceStatus",
};

// Boolean actuator fields
const BOOLEAN_FIELD_MAP = {
  WatPmp: "water_pump",
  Wat_ILV: "water_ILvalve",
  Wat_OLV: "water_OLvalve",
  NutPmp: "nutrient_pump",
  BootAck: "reboot_ack",
  water_pump: "water_pump",
  water_ILvalve: "water_ILvalve",
  water_OLvalve: "water_OLvalve",
  nutrient_pump: "nutrient_pump",
  reboot_ack: "reboot_ack",
};

// String fields (like Request ID)
const STRING_FIELD_MAP = {
  ReqID: "_requestId",
  req_id: "_requestId",
};

/**
 * Attempt to fix incomplete JSON by closing brackets and braces
 */
const fixIncompleteJSON = (str) => {
  if (!str || typeof str !== 'string') return str;
  
  // Remove trailing whitespace
  let fixed = str.trim();
  
  // Check if it's already valid
  try {
    JSON.parse(fixed);
    return fixed;
  } catch (e) {
    // Not valid, try to fix
  }
  
  // Count opening and closing brackets
  const openBrackets = (fixed.match(/\[/g) || []).length;
  const closeBrackets = (fixed.match(/\]/g) || []).length;
  const openBraces = (fixed.match(/\{/g) || []).length;
  const closeBraces = (fixed.match(/\}/g) || []).length;
  
  // Add missing closing braces (for incomplete objects)
  if (openBraces > closeBraces) {
    const diff = openBraces - closeBraces;
    // If the string ends with a comma, remove it
    if (fixed.endsWith(',')) {
      fixed = fixed.slice(0, -1);
    }
    // Add missing closing braces
    fixed += '}'.repeat(diff);
  }
  
  // Add missing closing brackets (for incomplete arrays)
  if (openBrackets > closeBrackets) {
    const diff = openBrackets - closeBrackets;
    // If the string ends with a comma, remove it
    if (fixed.endsWith(',')) {
      fixed = fixed.slice(0, -1);
    }
    // Add missing closing brackets
    fixed += ']'.repeat(diff);
  }
  
  // Try parsing again
  try {
    JSON.parse(fixed);
    return fixed;
  } catch (e) {
    // If still invalid, return original
    return str;
  }
};

/**
 * Extract partial data from incomplete JSON using regex
 */
const extractPartialData = (str) => {
  const result = {};
  
  // Try to extract temperature (ATMP)
  const tempMatch = str.match(/"ATMP"[^}]*"v":\s*([\d.]+)/);
  if (tempMatch) {
    result.ambientTemperature = parseFloat(tempMatch[1]);
  }
  
  // Try to extract humidity (HUMI)
  const humidityMatch = str.match(/"HUMI"[^}]*"v":\s*([\d.]+)/);
  if (humidityMatch) {
    result.ambientHumidity = parseFloat(humidityMatch[1]);
  }
  
  // Try to extract water temperature (WATTMP)
  const waterTempMatch = str.match(/"WATTMP"[^}]*"v":\s*([\d.]+)/);
  if (waterTempMatch) {
    result.waterTemperature = parseFloat(waterTempMatch[1]);
  }
  
  // Try to extract CO2
  const co2Match = str.match(/"co2"[^}]*"v":\s*([\d.]+)/);
  if (co2Match) {
    result.co2Level = parseFloat(co2Match[1]);
  }
  
  // Try to extract EC
  const ecMatch = str.match(/"ec"[^}]*"v":\s*([\d.]+)/);
  if (ecMatch) {
    result.ecValue = parseFloat(ecMatch[1]);
  }
  
  // Try to extract pH
  const phMatch = str.match(/"ph"[^}]*"v":\s*([\d.]+)/);
  if (phMatch) {
    result.phValue = parseFloat(phMatch[1]);
  }
  
  // Try to extract water level
  const levelMatch = str.match(/"level"[^}]*"v":\s*([\d.]+)/);
  if (levelMatch) {
    result.waterLevel = parseFloat(levelMatch[1]);
  }
  
  // Try to extract light level
  const luxMatch = str.match(/"lux"[^}]*"v":\s*([\d.]+)/);
  if (luxMatch) {
    result.lightLevel = parseFloat(luxMatch[1]);
  }
  
  // Try to extract device status (DevStat)
  const devStatMatch = str.match(/"DevStat"[^}]*"v":\s*([\d.]+)/);
  if (devStatMatch) {
    result.deviceStatus = parseInt(devStatMatch[1]);
    result.deviceStatusFlags = parseDeviceStatus(parseInt(devStatMatch[1]));
  }
  
  // Try to extract boolean values
  const boolFields = {
    WatPmp: "water_pump",
    Wat_ILV: "water_ILvalve",
    Wat_OLV: "water_OLvalve",
    NutPmp: "nutrient_pump",
    BootAck: "reboot_ack"
  };
  
  for (const [senmlKey, resultKey] of Object.entries(boolFields)) {
    const match = str.match(new RegExp(`"${senmlKey}"[^}]*"vb":\\s*(true|false)`));
    if (match) {
      result[resultKey] = match[1] === 'true';
    }
  }
  
  return result;
};

/**
 * Parse a SenML payload into a normal flat object
 * Handles incomplete/malformed JSON gracefully
 */
export const parseSenMLToObject = (raw) => {
  try {
    // Handle empty or undefined input
    if (!raw) {
      console.log("⚠️ SenML parse: Empty input");
      return {};
    }
    
    let data = raw;
    
    // If it's a string, try to parse it
    if (typeof data === 'string') {
      // Check if it's already valid JSON
      let parsed = null;
      try {
        parsed = JSON.parse(data);
        // If it parses successfully and is an array, use it
        if (Array.isArray(parsed)) {
          return parseSenMLRecords(parsed);
        }
        // If it's not an array but parsed successfully, wrap it
        return parseSenMLRecords([parsed]);
      } catch (e) {
        // JSON parsing failed - try to fix it
        console.log(`🔧 Attempting to fix incomplete JSON (length: ${data.length})`);
        
        // Try to fix the JSON
        const fixed = fixIncompleteJSON(data);
        try {
          parsed = JSON.parse(fixed);
          if (Array.isArray(parsed)) {
            console.log(`✅ Successfully fixed and parsed JSON`);
            return parseSenMLRecords(parsed);
          }
          return parseSenMLRecords([parsed]);
        } catch (e2) {
          // Still can't parse - try to extract partial data
          console.log(`⚠️ Cannot parse JSON, extracting partial data via regex`);
          const partialData = extractPartialData(data);
          if (Object.keys(partialData).length > 0) {
            console.log(`✅ Extracted partial data:`, partialData);
            return partialData;
          }
          
          // Last resort - try to find any numeric values
          console.log(`⚠️ No data could be extracted, returning empty object`);
          return {};
        }
      }
    }
    
    // If it's already an array
    if (Array.isArray(data)) {
      return parseSenMLRecords(data);
    }
    
    // If it's an object, wrap it
    if (typeof data === 'object') {
      return parseSenMLRecords([data]);
    }
    
    return {};
  } catch (e) {
    console.log("⚠️ SenML parse error:", e);
    return {};
  }
};

/**
 * Parse SenML records into a flat object
 */
const parseSenMLRecords = (records) => {
  if (!Array.isArray(records) || records.length === 0) {
    return {};
  }

  const result = {};
  let baseName = null;
  let baseTime = null;

  for (const r of records) {
    if (!r || typeof r !== "object") continue;

    // Base name / base time
    if (r.bn) baseName = r.bn;
    if (r.bt) baseTime = r.bt;

    if (!r.n) continue;
    const fieldName = r.n;

    // Numeric value
    if (typeof r.v === "number") {
      if (STATUS_FIELDS[fieldName]) {
        result.deviceStatus = r.v;
        result.deviceStatusFlags = parseDeviceStatus(r.v);
      } else if (NUMERIC_FIELD_MAP[fieldName]) {
        result[NUMERIC_FIELD_MAP[fieldName]] = r.v;
      }
    }

    // Boolean value
    if (typeof r.vb === "boolean" && BOOLEAN_FIELD_MAP[fieldName]) {
      result[BOOLEAN_FIELD_MAP[fieldName]] = r.vb;
    }

    // String value (e.g., Request ID)
    if (typeof r.vs === "string" && STRING_FIELD_MAP[fieldName]) {
      result[STRING_FIELD_MAP[fieldName]] = r.vs;
    }
  }

  if (baseName) {
    result._deviceId = baseName.replace(/^urn:dev:/, "").replace(/:$/, "");
  }
  if (baseTime) result._timestamp = baseTime;

  return result;
};

export const parseSenML = parseSenMLToObject;
export default parseSenMLToObject;