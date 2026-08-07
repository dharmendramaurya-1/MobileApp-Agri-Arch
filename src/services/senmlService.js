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
 * Search SenML data from the server
 */
export const searchSenML = async (params) => {
  try {
    const authToken = await AsyncStorage.getItem("authToken");
    const publisherId = await AsyncStorage.getItem("publisher_id");

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
  console.log(`📊 Fetching sensor data from ${new Date(from).toLocaleString()} to ${new Date(to).toLocaleString()}`);
  
  // Map sensor key to API name if provided
  let nameFilter = null;
  if (sensorKey) {
    const nameMap = {
      ambientTemperature: "temp",
      ambientHumidity: "humidity",
      waterTemperature: "water_temp",
      co2Level: "co2",
      ecValue: "ec",
      phValue: "ph",
      waterLevel: "level",
      lightLevel: "lux",
      deviceStatus: "device_status",
    };
    nameFilter = nameMap[sensorKey] || sensorKey;
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
  const nameMap = {
    ambientTemperature: "temp",
    ambientHumidity: "humidity",
    waterTemperature: "water_temp",
    co2Level: "co2",
    ecValue: "ec",
    phValue: "ph",
    waterLevel: "level",
    lightLevel: "lux",
    deviceStatus: "device_status",
  };
  
  const sensorName = nameMap[sensorKey] || sensorKey;
  const sensorData = result.data[sensorName] || [];

  console.log(`✅ Found ${sensorData.length} data points for ${sensorKey}`);

  return {
    success: true,
    data: sensorData,
    total: sensorData.length,
  };
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

export default {
  searchSenML,
  getSensorDataByTimeRange,
  getWeeklySensorData,
  getSnapshotData,
};