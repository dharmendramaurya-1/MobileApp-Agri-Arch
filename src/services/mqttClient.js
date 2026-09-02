// src/services/mqttClient.js
import AsyncStorage from "@react-native-async-storage/async-storage";
import mqtt from "mqtt";
import { AppState, Platform } from "react-native";

const BASE_URL = process.env.EXPO_PUBLIC_Ip_URL;
console.log("📡 MQTT IP:", BASE_URL);

let client = null;
let reconnectTimer = null;
let isConnecting = false;
let connectionCallbacks = [];
let callbackIds = 0;
let isAppInBackground = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
let isMqttPersistent = false;

// ── Track App State ──────────────────────────────────────────────────────────
if (typeof AppState !== 'undefined') {
  AppState.addEventListener('change', (nextAppState) => {
    isAppInBackground = nextAppState === 'background' || nextAppState === 'inactive';
    console.log(`📱 App state: ${nextAppState}, isBackground: ${isAppInBackground}`);

    // ✅ MQTT will auto-reconnect if needed via reconnectPeriod: 3000
    // No manual reconnect needed on foreground
    if (!isAppInBackground) {
      console.log('🔄 App came to FOREGROUND');
      if (client && client.connected) {
        console.log('✅ MQTT connection is healthy');
        connectionCallbacks.forEach(cb => {
          try { cb(true); } catch (e) {}
        });
      }
    }
  });
}

// ── Stable client ID ────────────────────────────────────────────────────────
let cachedClientId = null;

const getStableClientId = async () => {
  if (cachedClientId) return cachedClientId;

  try {
    const Application = require("expo-application");
    let deviceId = null;

    if (Platform.OS === "ios") {
      deviceId = await Application.getIosIdForVendorAsync();
    } else if (Platform.OS === "android") {
      deviceId = Application.getAndroidId();
    }

    cachedClientId = deviceId
      ? `expo_${Platform.OS}_${deviceId}`
      : `expo_${Math.random().toString(16).slice(2, 8)}_${Date.now()}`;

    return cachedClientId;
  } catch (e) {
    console.error("❌ Error resolving device id for MQTT clientId:", e);
    cachedClientId = `expo_${Math.random().toString(16).slice(2, 8)}_${Date.now()}`;
    return cachedClientId;
  }
};

// ── Connection options ──────────────────────────────────────────────────────
const getConnectionOptions = async () => {
  let password = "";

  try {
    const storedKey = await AsyncStorage.getItem("external_key");
    console.log("🔑 Retrieved external_key from AsyncStorage:", storedKey);

    if (storedKey) {
      password = storedKey;
      console.log("✅ Using stored external_key as password");
    } else {
      console.log("❌ No external_key found in AsyncStorage");
      throw new Error("No external_key found. Please add a device first.");
    }
  } catch (error) {
    console.error("❌ Error getting external_key:", error);
    throw error;
  }

  const clientId = await getStableClientId();

  const options = {
    clientId,
    username: "external",
    password: password,
    reconnectPeriod: 3000,              // ✅ Auto-reconnect if disconnected
    connectTimeout: 15000,
    keepalive: 20,                      // ✅ Keep connection alive
    clean: false,                       // ✅ Maintain session
    protocolVersion: 4,
    rejectUnauthorized: false,
    reschedulePing: true,
    queueQoSZero: false,
    will: {
      topic: '/messages/status',
      payload: 'offline',
      qos: 0,
      retain: false
    },
  };

  console.log("📋 Connection Options:");
  console.log("   Client ID:", options.clientId);
  console.log("   Keepalive:", options.keepalive, "s");
  console.log("   Clean Session:", options.clean, "(false = persistent)");
  console.log("   Reconnect Period:", options.reconnectPeriod, "ms");

  return options;
};

// ── Register connection callback ──────────────────────────────────────────
export const onMqttConnectionChange = (callback) => {
  const id = ++callbackIds;
  connectionCallbacks.push(callback);
  console.log(`📡 Registered connection callback ${id}`);

  return () => {
    const index = connectionCallbacks.indexOf(callback);
    if (index > -1) {
      connectionCallbacks.splice(index, 1);
      console.log(`📡 Unregistered connection callback ${id}`);
    }
  };
};

// ── Get or create MQTT client ──────────────────────────────────────────────
export const getMqttClient = async () => {
  // ✅ If client is connected, return it (NO unnecessary reconnects)
  if (client && client.connected) {
    console.log("✅ Using existing MQTT connection");
    return client;
  }

  // ✅ If client exists but disconnected, clean it up
  if (client) {
    console.log("🔄 Cleaning up disconnected MQTT client");
    try {
      client.removeAllListeners();
      client.end(true);
    } catch (e) {}
    client = null;
    isMqttPersistent = false;
  }

  // ✅ If already connecting, wait
  if (isConnecting) {
    console.log("⏳ Connection already in progress, waiting...");
    let attempts = 0;
    while (attempts < 15 && !client?.connected) {
      await new Promise(resolve => setTimeout(resolve, 500));
      attempts++;
    }
    if (client && client.connected) {
      return client;
    }
  }

  isConnecting = true;

  try {
    const options = await getConnectionOptions();
    const wsUrl = `ws://${BASE_URL}/mqtt`;

    console.log(`🔌 Connecting to MQTT: ${wsUrl}`);

    client = mqtt.connect(wsUrl, options);

    client.on("connect", () => {
      console.log("✅ MQTT Connected successfully");
      isConnecting = false;
      reconnectAttempts = 0;
      isMqttPersistent = true;

      connectionCallbacks.forEach(cb => {
        try {
          cb(true);
        } catch (e) {
          console.error("Callback error:", e);
        }
      });

      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    });

    client.on("error", (err) => {
      console.error("❌ MQTT Error:", err.message);
      isConnecting = false;
      isMqttPersistent = false;
      connectionCallbacks.forEach(cb => cb(false));
    });

    client.on("reconnect", () => {
      reconnectAttempts++;
      console.log(`🔄 MQTT Reconnecting... (attempt ${reconnectAttempts})`);

      if (reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
        console.log('⚠️ Too many reconnect attempts - resetting client');
        try {
          client.removeAllListeners();
          client.end(true);
        } catch (e) {}
        client = null;
        isConnecting = false;
        reconnectAttempts = 0;
        isMqttPersistent = false;
      }
    });

    client.on("close", () => {
      console.log("🔌 MQTT Connection closed");
      isConnecting = false;
      isMqttPersistent = false;
      connectionCallbacks.forEach(cb => cb(false));
    });

    client.on("offline", () => {
      console.log("📡 MQTT Offline");
      isConnecting = false;
      isMqttPersistent = false;
      connectionCallbacks.forEach(cb => cb(false));
    });

    client.on("disconnect", () => {
      console.log("📡 MQTT Disconnected - will auto-reconnect");
      isMqttPersistent = false;
    });

    const timeoutId = setTimeout(() => {
      if (client && !client.connected) {
        console.log("⏰ MQTT Connection timeout");
        isConnecting = false;
        connectionCallbacks.forEach(cb => cb(false));
        try {
          client.removeAllListeners();
          client.end(true);
        } catch (e) {}
        client = null;
        isMqttPersistent = false;
      }
    }, options.connectTimeout + 2000);

    client.once("connect", () => {
      clearTimeout(timeoutId);
      isConnecting = false;
    });

    return client;
  } catch (error) {
    console.error("❌ Failed to create MQTT client:", error);
    isConnecting = false;
    isMqttPersistent = false;
    throw error;
  }
};

// ── Disconnect MQTT ──────────────────────────────────────────────────────────
export const disconnectMqtt = (force = false) => {
  return new Promise((resolve) => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    if (client) {
      console.log("🔌 Disconnecting MQTT...");
      try {
        client.end(force, () => {
          console.log("✅ MQTT Disconnected");
          client.removeAllListeners();
          client = null;
          isConnecting = false;
          isMqttPersistent = false;
          connectionCallbacks.forEach(cb => cb(false));
          resolve();
        });
      } catch (error) {
        console.error("❌ Error disconnecting MQTT:", error);
        client = null;
        isConnecting = false;
        isMqttPersistent = false;
        connectionCallbacks.forEach(cb => cb(false));
        resolve();
      }
    } else {
      console.log("ℹ️ No MQTT client to disconnect");
      isConnecting = false;
      resolve();
    }
  });
};

// ── Reconnect MQTT (only when explicitly called) ────────────────────────────
export const reconnectMqtt = async (newPassword) => {
  console.log("🔄 Reconnecting MQTT (explicit)...");

  reconnectAttempts = 0;
  isMqttPersistent = false;

  await disconnectMqtt(true);

  if (newPassword) {
    try {
      await AsyncStorage.setItem("external_key", newPassword);
      console.log("✅ Updated external_key for MQTT");
    } catch (error) {
      console.error("❌ Error saving external_key:", error);
    }
  }

  return await getMqttClient();
};

// ── Check connection status ──────────────────────────────────────────────────
export const isMqttConnected = () => {
  return client !== null && client.connected;
};

// ── Check if persistent connection is active ────────────────────────────────
export const isMqttPersistentConnection = () => {
  return isMqttPersistent && client !== null && client.connected;
};

// ── Get client status ──────────────────────────────────────────────────────
export const getMqttStatus = () => {
  if (!client) {
    return {
      connected: false,
      persistent: false,
      clientId: null,
      reconnectPeriod: null,
      isConnecting: isConnecting,
      isAppInBackground: isAppInBackground,
      reconnectAttempts: reconnectAttempts,
    };
  }

  return {
    connected: client.connected,
    persistent: isMqttPersistent && client.connected,
    clientId: client.options?.clientId || null,
    reconnectPeriod: client.options?.reconnectPeriod || null,
    isConnecting: isConnecting,
    isAppInBackground: isAppInBackground,
    reconnectAttempts: reconnectAttempts,
    keepalive: client.options?.keepalive,
    clean: client.options?.clean,
  };
};

// ── Update MQTT password ──────────────────────────────────────────────────
export const updateMqttPassword = async (newPassword) => {
  try {
    await AsyncStorage.setItem("external_key", newPassword);
    console.log("✅ MQTT password updated in storage");
    return true;
  } catch (error) {
    console.error("❌ Error updating MQTT password:", error);
    return false;
  }
};

// ── Publish with retry ──────────────────────────────────────────────────────
export const publishWithRetry = async (topic, message, maxRetries = 3) => {
  let attempts = 0;

  while (attempts < maxRetries) {
    attempts++;
    try {
      // ✅ Only reconnect if client is null or disconnected
      if (!client || !client.connected) {
        console.log(`🔄 Attempt ${attempts}: Connecting MQTT...`);
        await getMqttClient();
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      if (client && client.connected) {
        return new Promise((resolve) => {
          client.publish(topic, message, { qos: 1 }, (err) => {
            if (err) {
              console.error(`❌ Publish error (attempt ${attempts}):`, err);
              resolve(false);
            } else {
              console.log(`✅ Published: ${topic}`);
              resolve(true);
            }
          });
        });
      }
    } catch (error) {
      console.error(`❌ Publish attempt ${attempts} failed:`, error);
    }

    if (attempts < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, 2000 * attempts));
    }
  }

  console.error(`❌ Failed to publish after ${maxRetries} attempts`);
  return false;
};

// ── Debug function ──────────────────────────────────────────────────────────
export const debugMqtt = async () => {
  console.log("=== MQTT DEBUG ===");
  console.log("BASE_URL:", BASE_URL);
  console.log("Client exists:", !!client);
  console.log("Client connected:", client?.connected);
  console.log("Persistent Connection:", isMqttPersistent);
  console.log("Is Connecting:", isConnecting);
  console.log("Is App in Background:", isAppInBackground);
  console.log("Reconnect Attempts:", reconnectAttempts);

  const externalKey = await AsyncStorage.getItem("external_key");
  console.log("external_key in AsyncStorage:", externalKey);

  if (client) {
    console.log("Client options:", {
      clientId: client.options?.clientId,
      username: client.options?.username,
      password: client.options?.password ? "***" : "undefined",
      keepalive: client.options?.keepalive,
      reconnectPeriod: client.options?.reconnectPeriod,
      clean: client.options?.clean,
    });
  }
  console.log("=== END DEBUG ===");
};