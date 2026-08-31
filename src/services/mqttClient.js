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
let isReconnectingOnForeground = false;
let isMqttPersistent = false;

// ── Track App State ──────────────────────────────────────────────────────────
if (typeof AppState !== 'undefined') {
  AppState.addEventListener('change', (nextAppState) => {
    const wasBackground = isAppInBackground;
    isAppInBackground = nextAppState === 'background' || nextAppState === 'inactive';
    console.log(`📱 App state: ${nextAppState}, isBackground: ${isAppInBackground}`);

    // ✅ When app comes back to foreground, ALWAYS force a fresh reconnect.
    // IMPORTANT: client.connected cannot be trusted here. When the app is
    // backgrounded, the JS thread is suspended and the OS can silently kill
    // the underlying socket without ever firing a 'close'/'offline' event.
    // That leaves client.connected == true even though the connection is
    // actually dead ("zombie" connection). So we don't branch on it — we
    // just tear down and reconnect every time we come to foreground.
    if (wasBackground && !isAppInBackground) {
      console.log('🔄 App came to FOREGROUND - forcing fresh MQTT connection');
      reconnectAttempts = 0;
      setTimeout(() => {
        forceReconnectOnForeground();
      }, 300);
    }
  });
}

// ── Force reconnect on foreground ──
const forceReconnectOnForeground = async () => {
  if (isReconnectingOnForeground) {
    console.log('⏳ Already reconnecting on foreground, skipping...');
    return;
  }

  isReconnectingOnForeground = true;
  console.log('🔄 Force reconnecting on foreground...');

  try {
    // Always tear down the existing client, even if it *looks* connected.
    // Reconnecting a genuinely-live connection is cheap and safe; trusting
    // a possibly-zombie connection is what causes the "breaks after
    // minimize" symptom.
    if (client) {
      console.log('🧹 Cleaning up old client...');
      try {
        client.removeAllListeners();
        client.end(true);
      } catch (e) {}
      client = null;
    }

    isConnecting = false;

    console.log('🔌 Getting fresh MQTT connection...');
    await getMqttClient();

    console.log('✅ Foreground reconnection kicked off');
  } catch (error) {
    console.error('❌ Foreground reconnection failed:', error);
    connectionCallbacks.forEach(cb => {
      try { cb(false); } catch (e) {}
    });
  } finally {
    isReconnectingOnForeground = false; 
  }
};

// ── Stable client ID (real per-device identifier) ────────────────────────
// clean: false only gives you a persistent session (queued QoS1 messages,
// subscriptions retained) if the broker sees the SAME client ID reconnect.
// A real hardware MAC address is NOT obtainable on modern iOS/Android
// (both return a dummy 02:00:00:00:00:00 for privacy reasons since
// iOS 7 / Android 6) — so we use the OS-provided stable device identifier
// instead, which is the correct replacement for that use case:
//   iOS     -> identifierForVendor (via getIosIdForVendorAsync)
//   Android -> ANDROID_ID           (via getAndroidId)
// These are already persisted by the OS itself, so we don't need to store
// them in AsyncStorage — just cache in memory to avoid re-calling the
// native API on every reconnect within the same app session.
// Requires: npx expo install expo-application
let cachedClientId = null;

const getStableClientId = async () => {
  if (cachedClientId) return cachedClientId;

  try {
    const Application = require("expo-application");
    let deviceId = null;

    if (Platform.OS === "ios") {
      deviceId = await Application.getIosIdForVendorAsync();
    } else if (Platform.OS === "android") {
      deviceId = Application.getAndroidId(); // synchronous on Android
    }

    // Prefix so it's a valid/readable MQTT clientId and namespaced per app,
    // in case the same broker also serves other apps.
    cachedClientId = deviceId
      ? `expo_${Platform.OS}_${deviceId}`
      : `expo_${Math.random().toString(16).slice(2, 8)}_${Date.now()}`; // fallback if native id unavailable (e.g. simulator edge cases)

    return cachedClientId;
  } catch (e) {
    console.error("❌ Error resolving device id for MQTT clientId:", e);
    // Fallback: still connects, just won't be tied to the physical device
    cachedClientId = `expo_${Math.random().toString(16).slice(2, 8)}_${Date.now()}`;
    return cachedClientId;
  }
};

// ── Connection options for 24/7 persistence ──────────────────────────────
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

  // ✅ 24/7 PERSISTENT CONNECTION OPTIONS
  const options = {
    clientId,
    username: "external",
    password: password,
    reconnectPeriod: 3000,              // ✅ Retry every 3s if disconnected
    connectTimeout: 15000,              // ✅ 15s timeout for connection attempts
    // ✅ keepalive MUST be non-zero. It's the mechanism mqtt.js uses to
    // detect a dead socket (ping sent, pong expected). keepalive: 0
    // disables that detection entirely, so a zombie connection from
    // backgrounding never gets flagged as broken.
    keepalive: 20,
    clean: false,                       // ✅ Maintain session across reconnects (needs stable clientId above)
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
    ...(Platform.OS === 'android' && {
      // Android specific options for better background handling
    }),
  };

  console.log("📋 Connection Options (24/7 Persistent):");
  console.log("   Client ID:", options.clientId);
  console.log("   Username:", options.username);
  console.log("   Password:", options.password.substring(0, 4) + "...");
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
  if (isAppInBackground && client) {
    console.log('⏸️ App in background - using existing client');
    return client;
  }

  if (client && client.connected) {
    console.log("✅ Using existing MQTT connection (24/7 persistent)");
    return client;
  }

  if (client) {
    console.log("🔄 Cleaning up old/disconnected MQTT client");
    try {
      client.removeAllListeners();
      client.end(true);
    } catch (e) {}
    client = null;
  }

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

    console.log(`🔌 Connecting to MQTT (24/7 persistent): ${wsUrl}`);

    client = mqtt.connect(wsUrl, options);

    client.on("connect", () => {
      console.log("✅ MQTT Connected successfully (24/7 persistent)");
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

// ── Reconnect MQTT ──────────────────────────────────────────────────────────
export const reconnectMqtt = async (newPassword) => {
  console.log("🔄 Reconnecting MQTT (24/7 persistent)...");

  reconnectAttempts = 0;
  isMqttPersistent = false;

  await disconnectMqtt(true);

  if (newPassword) {
    try {
      await AsyncStorage.setItem("external_key", newPassword);
      console.log("✅ Updated external_key for MQTT:", newPassword.substring(0, 4) + "...");
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
    console.log("✅ MQTT password updated in storage:", newPassword.substring(0, 4) + "...");
    return true;
  } catch (error) {
    console.error("❌ Error updating MQTT password:", error);
    return false;
  }
};

// ── Publish with retry ──────────────────────────────────────────────────────
export const publishWithRetry = async (topic, message, maxRetries = 3) => {
  if (isAppInBackground) {
    console.log('⏸️ Skipping publish (app in background)');
    return false;
  }

  let attempts = 0;

  while (attempts < maxRetries) {
    attempts++;
    try {
      if (!client || !client.connected) {
        console.log(`🔄 Attempt ${attempts}: Reconnecting MQTT...`);
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