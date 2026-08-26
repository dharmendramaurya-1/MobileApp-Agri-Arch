// src/services/senmlService.js
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";

const BASE_URL = process.env.EXPO_PUBLIC_API_URL;

/**
 * Convert milliseconds to nanoseconds
 */
const toNanoseconds = (ms) => ms * 1000000;

/**
 * Convert nanoseconds to milliseconds
 */
const toMilliseconds = (ns) => ns / 1000000;

/**
 * Maps frontend sensor keys (dataKey) to the actual SenML record names
 * used by the device (e.g. "urn:dev:9003718EEB3F:ATMP").
 */
const SENSOR_NAME_MAP = {
  ambientTemperature: "ATMP",
  ambientHumidity: "HUMI",
  waterTemperature: "WATTMP",
  co2Level: "co2",
  ecValue: "ec",
  phValue: "ph",
  waterLevel: "level",
  lightLevel: "lux",
  soilMoisture: "soil_moisture",
  deviceStatus: "DevStat",
};

/**
 * Resolve the SenML record name for a sensor dataKey
 */
const getSenMLName = (sensorKey) => SENSOR_NAME_MAP[sensorKey] || sensorKey;

/**
 * Search SenML data from the server
 */
export const searchSenML = async (params) => {
  try {
    const authToken = await AsyncStorage.getItem("authToken");
    const publisherId = params.publisherId || await AsyncStorage.getItem("publisher_id");

    if (!authToken) {
      throw new Error("No auth token found. Please login again.");
    }

    if (!publisherId) {
      throw new Error("No publisher ID found. Please identify device first.");
    }

    const {
      from,
      to,
      limit = 100,
      offset = 0,
      name = null
    } = params;

    // Convert milliseconds to nanoseconds for API
    const fromNs = from ? toNanoseconds(from) : null;
    const toNs = to ? toNanoseconds(to) : null;

    const requestBody = {
      publisher: publisherId,
      limit: limit,
      offset: offset
    };

    if (fromNs) requestBody.from = fromNs;
    if (toNs) requestBody.to = toNs;
    if (name) requestBody.name = name;

    console.log("📡 Searching SenML data:");
    console.log("   Publisher:", publisherId);
    console.log("   From:", from ? new Date(from).toLocaleString() : "N/A");
    console.log("   To:", to ? new Date(to).toLocaleString() : "N/A");
    console.log("   Limit:", limit);
    console.log("   Name filter:", name || "All");

    const response = await axios.post(
      `${BASE_URL}/reader/senml/search`,
      [requestBody],
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("✅ SenML search successful");
    console.log("   Response status:", response.status);
    
    // ✅ Handle different response structures
    const data = response.data;
    const messages = data?.messages || [];
    const total = data?.total || 0;

    console.log("   Total records:", total);
    console.log("   Messages count:", messages.length);

    // Parse the messages - convert time from nanoseconds to milliseconds
    const parsedMessages = messages.map((msg) => ({
      ...msg,
      timeMs: msg.time ? toMilliseconds(msg.time) : null,
      // Extract the actual sensor name from the full name
      sensorName: msg.name ? msg.name.split(':').pop() : null,
    }));

    return {
      success: true,
      data: {
        ...data,
        messages: parsedMessages,
      },
      messages: parsedMessages,
      total: total,
      status: response.status,
    };

  } catch (error) {
    console.error("❌ SenML search error:");
    if (error.response) {
      console.error("   Status:", error.response.status);
      console.error("   Data:", JSON.stringify(error.response.data, null, 2));
    } else if (error.request) {
      console.error("   No response received");
    } else {
      console.error("   Error message:", error.message);
    }

    return {
      success: false,
      error: error.response?.data?.message || error.message || "Failed to search SenML data",
      messages: [],
      total: 0,
      status: error.response?.status || 500,
    };
  }
};

/**
 * Get data for a specific time range with sensor name mapping
 */
export const getSensorDataByTimeRange = async (from, to, limit = 500, sensorKey = null) => {
  // Map sensor key to its actual SenML record name if provided
  let nameFilter = null;
  if (sensorKey) {
    nameFilter = getSenMLName(sensorKey);
  }

  const result = await searchSenML({
    from: from,
    to: to,
    limit: limit,
    offset: 0,
    name: nameFilter
  });

  if (!result.success) {
    return {
      success: false,
      error: result.error,
      data: [],
      total: 0,
    };
  }

  // Group data by sensor name
  const groupedData = {};
  result.messages.forEach((msg) => {
    const sensorName = msg.sensorName || msg.name;
    if (!groupedData[sensorName]) {
      groupedData[sensorName] = [];
    }
    
    groupedData[sensorName].push({
      time: msg.timeMs,
      value: msg.value !== undefined ? msg.value : (msg.bool_value ? 1 : 0),
      unit: msg.unit || '',
      bool_value: msg.bool_value,
    });
  });

  return {
    success: true,
    data: groupedData,
    total: result.total,
    raw: result.messages,
  };
};

/**
 * Get weekly data for a specific sensor
 */
export const getWeeklySensorData = async (sensorKey, days = 7) => {
  const now = Date.now();
  const from = now - (days * 24 * 60 * 60 * 1000);

  console.log(`📊 Fetching weekly data for ${sensorKey}`);
  console.log(`   From: ${new Date(from).toLocaleString()}`);
  console.log(`   To: ${new Date(now).toLocaleString()}`);

  const result = await getSensorDataByTimeRange(from, now, 1000, sensorKey);

  if (!result.success) {
    return {
      success: false,
      error: result.error,
      data: [],
    };
  }

  // Get the specific sensor data from grouped result
  const sensorName = getSenMLName(sensorKey);
  const sensorData = result.data[sensorName] || [];

  console.log(`✅ Found ${sensorData.length} data points for ${sensorKey}`);

  return {
    success: true,
    data: sensorData,
    total: sensorData.length,
  };
};

/**
 * Fetch a single page of historical data for one sensor within a time range.
 * The API returns { messages, total, offset, limit, dir } so callers can
 * paginate through the full result set.
 */
export const getPaginatedSensorData = async ({
  sensorKey,
  from,
  to,
  limit = 10,
  offset = 0,
}) => {
  const nameFilter = getSenMLName(sensorKey);

  console.log(`📄 Fetching page for ${sensorKey} (${nameFilter})`);
  console.log(`   offset=${offset} limit=${limit}`);

  const result = await searchSenML({
    from,
    to,
    limit,
    offset,
    name: nameFilter,
  });

  if (!result.success) {
    return {
      success: false,
      error: result.error,
      data: [],
      total: 0,
      offset,
      limit,
    };
  }

  // Normalize each record to { time (ms), value, unit }
  const data = result.messages.map((msg) => ({
    time: msg.timeMs,
    value: msg.value !== undefined ? msg.value : (msg.bool_value ? 1 : 0),
    unit: msg.unit || '',
    bool_value: msg.bool_value,
  }));

  return {
    success: true,
    data,
    total: result.total || 0,
    offset,
    limit,
  };
};

/**
 * Fetch ALL historical data points for a sensor within a time range by
 * walking through every page of the API (used by the Graph tab).
 */
export const getAllHistoricalData = async ({
  sensorKey,
  from,
  to,
  pageSize = 100,
  maxPages = 50,
}) => {
  const all = [];
  let offset = 0;
  let total = 0;

  try {
    for (let page = 0; page < maxPages; page++) {
      const result = await getPaginatedSensorData({
        sensorKey,
        from,
        to,
        limit: pageSize,
        offset,
      });

      if (!result.success) {
        return { success: false, error: result.error, data: all, total: all.length };
      }

      total = result.total;
      all.push(...result.data);

      // Stop when we've collected everything
      if (all.length >= total || result.data.length < pageSize) break;
      offset += pageSize;
    }
  } catch (error) {
    console.error("❌ Error fetching all historical data:", error);
    return { success: false, error: error.message, data: all, total: all.length };
  }

  // Sort oldest → newest for charting
  all.sort((a, b) => a.time - b.time);

  return { success: true, data: all, total: total || all.length };
};


/**
 * Get all sensor data for a specific timestamp (snapshot)
 */
export const getSnapshotData = async (timestamp) => {
  const fromNs = toNanoseconds(timestamp);
  const toNs = fromNs + 1000000000; // Add 1 second in nanoseconds

  const result = await searchSenML({
    from: timestamp,
    to: timestamp + 1000, // 1 second in milliseconds
    limit: 100,
    offset: 0,
  });

  if (!result.success) {
    return {
      success: false,
      error: result.error,
      data: {},
    };
  }

  // Parse the data into a key-value map
  const snapshot = {};
  result.messages.forEach((msg) => {
    const sensorName = msg.sensorName || msg.name;
    snapshot[sensorName] = {
      value: msg.value !== undefined ? msg.value : (msg.bool_value ? 1 : 0),
      unit: msg.unit || '',
      bool_value: msg.bool_value,
      time: msg.timeMs,
    };
  });

  return {
    success: true,
    data: snapshot,
  };
};


/**
 * Get SenML data for a publisher
 *
 * API:
 * GET /reader/senml?publisher=<publisher_id>
 */
export const getSenMLByPublisher = async (publisherId = null) => {
  try {
    const authToken = await AsyncStorage.getItem("authToken");

    // If publisherId is not passed, get it from AsyncStorage
    const storedPublisherId = await AsyncStorage.getItem("publisher_id");
    const publisher = publisherId || storedPublisherId;

    if (!authToken) {
      throw new Error("No auth token found. Please login again.");
    }

    if (!publisher) {
      throw new Error("No publisher ID found. Please identify device first.");
    }

    console.log("📡 Fetching SenML data");
    console.log("   Publisher:", publisher);

    const response = await axios.get(
      `${BASE_URL}/reader/senml`,
      {
        params: {
          publisher: publisher,
        },
        headers: {
          Authorization: `Bearer ${authToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("✅ SenML GET successful");
    console.log("   Response status:", response.status);

    return {
      success: true,
      data: response.data,
      status: response.status,
    };

  } catch (error) {
    console.error("❌ Get SenML error:");

    if (error.response) {
      console.error("   Status:", error.response.status);
      console.error(
        "   Data:",
        JSON.stringify(error.response.data, null, 2)
      );
    } else if (error.request) {
      console.error("   No response received");
    } else {
      console.error("   Error message:", error.message);
    }

    return {
      success: false,
      error:
        error.response?.data?.message ||
        error.message ||
        "Failed to get SenML data",
      data: null,
      status: error.response?.status || 500,
    };
  }
};


/**
 * Fetch historical data for a single sensor using GET /reader/senml
 * with the full URN name filter.
 *
 * Example URL:
 *   GET /reader/senml?publisher=<publisher_id>&name=urn:dev:<ext_key>:ATMP
 *
 * This is the primary fetch function — it constructs the full SenML URN
 * (e.g. urn:dev:9003718EEB3F:ATMP) and returns paginated results.
 */
export const fetchSensorHistorical = async ({
  sensorKey,
  limit = 10,
  offset = 0,
  from = null,
  to = null,
  publisherId: publisherIdOverride = null,
  externalKey: externalKeyOverride = null,
}) => {
  try {
    const authToken = await AsyncStorage.getItem("authToken");
    const publisherId = publisherIdOverride || await AsyncStorage.getItem("publisher_id");
    const externalKey = externalKeyOverride || await AsyncStorage.getItem("external_key");

    if (!authToken) throw new Error("No auth token found. Please login again.");
    if (!publisherId) throw new Error("No publisher ID found. Please identify device first.");
    if (!externalKey) throw new Error("No external key found. Please identify device first.");

    const shortName = getSenMLName(sensorKey);
    const fullName = `urn:dev:${externalKey}:${shortName}`;

    console.log(`📡 Fetch sensor historical: ${sensorKey} (${fullName})`);
    console.log(`   Publisher: ${publisherId} | limit=${limit} offset=${offset}`);

    const params = {
      publisher: publisherId,
      name: fullName,
      limit,
      offset,
    };
    if (from) params.from = toNanoseconds(from);
    if (to) params.to = toNanoseconds(to);

    const response = await axios.get(`${BASE_URL}/reader/senml`, {
      params,
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });

    const data = response.data;
    const messages = (data.messages || []).map((msg) => ({
      time: msg.time ? toMilliseconds(msg.time) : null,
      value: msg.value !== undefined ? msg.value : (msg.bool_value ? 1 : 0),
      unit: msg.unit || "",
      sensorName: msg.name ? msg.name.split(":").pop() : null,
    }));

    // ✅ Log API response for debugging total mismatch
    console.log(`📡 API Response for ${fullName}:`);
    console.log(`   messages count: ${messages.length}`);
    console.log(`   API total: ${data.total}`);
    console.log(`   API limit: ${data.limit}, offset: ${data.offset}`);
    console.log(`   Request params: limit=${limit}, offset=${offset}`);
    if (messages.length > 0) {
      console.log(`   First msg time: ${messages[0].time ? new Date(messages[0].time).toLocaleString() : 'N/A'}`);
      console.log(`   Last msg time: ${messages[messages.length-1].time ? new Date(messages[messages.length-1].time).toLocaleString() : 'N/A'}`);
    }

    return {
      success: true,
      data: messages,
      total: data.total || 0,
      limit: data.limit || limit,
      offset: data.offset || offset,
    };
  } catch (error) {
    console.error(`❌ fetchSensorHistorical error:`, error.message);
    return {
      success: false,
      error: error.response?.data?.message || error.message,
      data: [],
      total: 0,
    };
  }
};

/**
 * Fetch ALL historical data for a sensor by walking through every page.
 * Used by the Graph tab so the chart gets every data point.
 */
export const fetchAllSensorHistorical = async ({
  sensorKey,
  from = null,
  to = null,
  pageSize = 100,
  maxPages = 50,
  publisherId = null,
  externalKey = null,
}) => {
  const all = [];
  let offset = 0;
  let total = 0;

  try {
    for (let page = 0; page < maxPages; page++) {
      const result = await fetchSensorHistorical({
        sensorKey,
        from,
        to,
        limit: pageSize,
        offset,
        publisherId: publisherId,
        externalKey: externalKey,
      });

      if (!result.success) {
        return { success: false, error: result.error, data: all, total: all.length };
      }

      total = result.total;
      all.push(...result.data);

      // Stop when we've collected everything
      if (all.length >= total || result.data.length < pageSize) break;
      offset += pageSize;
    }
  } catch (error) {
    console.error("❌ fetchAllSensorHistorical error:", error.message);
    return { success: false, error: error.message, data: all, total: all.length };
  }

  // Sort oldest → newest for charting
  all.sort((a, b) => (a.time || 0) - (b.time || 0));

  return { success: true, data: all, total: total || all.length };
};


/**
 * Downsample an array of { time, value, ... } objects so that at most
 * `maxPoints` evenly-spaced entries are returned.
 *
 * Algorithm: divide the time range into `maxPoints` equal buckets and
 * pick the entry closest to the centre of each bucket.
 */
export const downsampleData = (data, maxPoints = 200) => {
  if (!data || data.length <= maxPoints) return data;

  const sorted = [...data].sort((a, b) => (a.time || 0) - (b.time || 0));
  const step = sorted.length / maxPoints;
  const sampled = [];

  for (let i = 0; i < maxPoints; i++) {
    const start = Math.floor(i * step);
    const end = Math.floor((i + 1) * step);
    const mid = Math.floor((start + end) / 2);
    sampled.push(sorted[mid]);
  }

  return sampled;
};

export default {
  searchSenML,
  getSensorDataByTimeRange,
  getWeeklySensorData,
  getPaginatedSensorData,
  getAllHistoricalData,
  fetchSensorHistorical,
  fetchAllSensorHistorical,
  getSnapshotData,
  getSenMLByPublisher,
  downsampleData,
};