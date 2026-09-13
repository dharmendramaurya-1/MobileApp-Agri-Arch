// src/utils/senmlParser.js
/**
 * SenML → Normal Object Converter
 * Converts device SenML payloads into the flat object shape the frontend uses.
 * ✅ NO HARDCODED LOGIC - just parses and maps what the server sends
 */

// ✅ Numeric sensor fields - pure mapping only
const NUMERIC_FIELD_MAP = {
  ATMP: "ambientTemperature",
  HUMI: "ambientHumidity",
  WATTMP: "waterTemperature",
  co2: "co2Level",
  CO2: "co2Level",
  ec: "ecValue",
  EC: "ecValue",
  ECValue: "ecValue",
  ECV: "ecValue",
  ph: "phValue",
  PH: "phValue",
  pH: "phValue",
  PHValue: "phValue",
  level: "waterLevel",
  Level: "waterLevel",
  LEVEL: "waterLevel",
  waterLevel: "waterLevel",
  WaterLevel: "waterLevel",
  WL: "waterLevel",
  lux: "lightLevel",
  LUX: "lightLevel",
  LightLevel: "lightLevel",
  CropId: "cropId",
  temp: "ambientTemperature",
  humidity: "ambientHumidity",
  water_temp: "waterTemperature",
  soil_moisture: "soilMoisture",
};

// ✅ Status fields - pure mapping only
const STATUS_FIELDS = {
  DevStat: "deviceStatus",
  device_status: "deviceStatus",
};

// ✅ Boolean actuator fields - pure mapping only
const BOOLEAN_FIELD_MAP = {
  WatPmp: "water_pump",
  Wat_ILV: "water_ILvalve",
  Wat_OLV: "water_OLvalve",
  NutPmp: "nutrient_pump",
  water_pump: "water_pump",
  water_ILvalve: "water_ILvalve",
  water_OLvalve: "water_OLvalve",
  nutrient_pump: "nutrient_pump",
};

// ✅ String fields - pure mapping only
const STRING_FIELD_MAP = {
  ReqID: "_requestId",
  req_id: "_requestId",
};

/**
 * Attempt to fix incomplete JSON by closing brackets and braces
 */
const fixIncompleteJSON = (str) => {
  if (!str || typeof str !== 'string') return str;
  
  let fixed = str.trim();
  
  try {
    JSON.parse(fixed);
    return fixed;
  } catch (e) {
    // Not valid, try to fix
  }
  
  const openBrackets = (fixed.match(/\[/g) || []).length;
  const closeBrackets = (fixed.match(/\]/g) || []).length;
  const openBraces = (fixed.match(/\{/g) || []).length;
  const closeBraces = (fixed.match(/\}/g) || []).length;
  
  if (openBraces > closeBraces) {
    const diff = openBraces - closeBraces;
    if (fixed.endsWith(',')) {
      fixed = fixed.slice(0, -1);
    }
    fixed += '}'.repeat(diff);
  }
  
  if (openBrackets > closeBrackets) {
    const diff = openBrackets - closeBrackets;
    if (fixed.endsWith(',')) {
      fixed = fixed.slice(0, -1);
    }
    fixed += ']'.repeat(diff);
  }
  
  try {
    JSON.parse(fixed);
    return fixed;
  } catch (e) {
    return str;
  }
};

/**
 * Extract partial data from incomplete JSON using regex
 * ✅ Extracts raw values only - NO status calculation
 */
const extractPartialData = (str) => {
  const result = {};
  
  // Extract numeric values - raw only
  const numericPatterns = {
    ambientTemperature: [
      /["']ATMP["'][^}]*"v":\s*([\d.]+)/,
      /["']temp["'][^}]*"v":\s*([\d.]+)/
    ],
    ambientHumidity: [
      /["']HUMI["'][^}]*"v":\s*([\d.]+)/,
      /["']humidity["'][^}]*"v":\s*([\d.]+)/
    ],
    waterTemperature: [
      /["']WATTMP["'][^}]*"v":\s*([\d.]+)/,
      /["']water_temp["'][^}]*"v":\s*([\d.]+)/
    ],
    co2Level: [/["']co2["'][^}]*"v":\s*([\d.]+)/],
    ecValue: [/["']ec["'][^}]*"v":\s*([\d.]+)/],
    phValue: [/["']ph["'][^}]*"v":\s*([\d.]+)/],
    waterLevel: [/["']level["'][^}]*"v":\s*([\d.]+)/],
    lightLevel: [/["']lux["'][^}]*"v":\s*([\d.]+)/],
    cropId: [/["']CropId["'][^}]*"v":\s*(\d+)/],
  };
  
  for (const [key, patterns] of Object.entries(numericPatterns)) {
    for (const pattern of patterns) {
      const match = str.match(pattern);
      if (match) {
        result[key] = parseFloat(match[1]);
        break;
      }
    }
  }
  
  // ✅ Extract device status - raw value only, NO parsing
  const devStatMatch = str.match(/["']DevStat["'][^}]*"v":\s*([\d.]+)/);
  if (devStatMatch) {
    result.deviceStatus = parseInt(devStatMatch[1]);
  }
  
  // Extract boolean values - raw only
  const boolPatterns = {
    water_pump: [
      /["']WatPmp["'][^}]*"vb":\s*(true|false)/,
      /["']water_pump["'][^}]*"vb":\s*(true|false)/
    ],
    water_ILvalve: [
      /["']Wat_ILV["'][^}]*"vb":\s*(true|false)/,
      /["']water_ILvalve["'][^}]*"vb":\s*(true|false)/
    ],
    water_OLvalve: [
      /["']Wat_OLV["'][^}]*"vb":\s*(true|false)/,
      /["']water_OLvalve["'][^}]*"vb":\s*(true|false)/
    ],
    nutrient_pump: [
      /["']NutPmp["'][^}]*"vb":\s*(true|false)/,
      /["']nutrient_pump["'][^}]*"vb":\s*(true|false)/
    ],
  };
  
  for (const [key, patterns] of Object.entries(boolPatterns)) {
    for (const pattern of patterns) {
      const match = str.match(pattern);
      if (match) {
        result[key] = match[1] === 'true';
        break;
      }
    }
  }
  
  // Extract string values - raw only
  const reqIdMatch = str.match(/["']ReqID["'][^}]*"vs":\s*"([^"]*)"/);
  if (reqIdMatch) {
    result._requestId = reqIdMatch[1];
  }
  
  return result;
};

/**
 * Parse a SenML payload into a normal flat object
 * Handles incomplete/malformed JSON gracefully
 * ✅ NO HARDCODED STATUS LOGIC
 */
export const parseSenMLToObject = (raw) => {
  try {
    if (!raw) {
      console.log("⚠️ SenML parse: Empty input");
      return {};
    }
    
    let data = raw;
    
    if (typeof data === 'string') {
      let parsed = null;
      try {
        parsed = JSON.parse(data);
        if (Array.isArray(parsed)) {
          return parseSenMLRecords(parsed);
        }
        return parseSenMLRecords([parsed]);
      } catch (e) {
        console.log(`🔧 Attempting to fix incomplete JSON (length: ${data.length})`);
        
        const fixed = fixIncompleteJSON(data);
        try {
          parsed = JSON.parse(fixed);
          if (Array.isArray(parsed)) {
            console.log(`✅ Successfully fixed and parsed JSON`);
            return parseSenMLRecords(parsed);
          }
          return parseSenMLRecords([parsed]);
        } catch (e2) {
          console.log(`⚠️ Cannot parse JSON, extracting partial data via regex`);
          const partialData = extractPartialData(data);
          if (Object.keys(partialData).length > 0) {
            console.log(`✅ Extracted partial data:`, partialData);
            return partialData;
          }
          
          console.log(`⚠️ No data could be extracted, returning empty object`);
          return {};
        }
      }
    }
    
    if (Array.isArray(data)) {
      return parseSenMLRecords(data);
    }
    
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
 * ✅ Just maps fields - NO logic, NO calculations
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

    if (r.bn) baseName = r.bn;
    if (r.bt) baseTime = r.bt;

    if (!r.n) continue;
    const fieldName = r.n;

    // ✅ Numeric value - just map, NO parsing
    if (typeof r.v === "number") {
      if (STATUS_FIELDS[fieldName]) {
        result.deviceStatus = r.v;
      } else if (NUMERIC_FIELD_MAP[fieldName]) {
        result[NUMERIC_FIELD_MAP[fieldName]] = r.v;
      }
    }

    // ✅ Boolean value - just map
    if (typeof r.vb === "boolean" && BOOLEAN_FIELD_MAP[fieldName]) {
      result[BOOLEAN_FIELD_MAP[fieldName]] = r.vb;
    }

    // ✅ String value - just map
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