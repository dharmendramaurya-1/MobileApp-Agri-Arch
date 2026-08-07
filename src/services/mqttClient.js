// src/services/mqttClient.js
import AsyncStorage from "@react-native-async-storage/async-storage";
import mqtt from "mqtt";

const BASE_URL = process.env.EXPO_PUBLIC_Ip_URL;
console.log("📡 MQTT IP:", BASE_URL);

let client = null;
let reconnectTimer = null;
let isConnecting = false;
let connectionCallbacks = [];
let callbackIds = 0;

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
      // ✅ Throw error instead of using hardcoded fallback
      throw new Error("No external_key found. Please add a device first.");
    }
  } catch (error) {
    console.error("❌ Error getting external_key:", error);
    throw error;
  }

  const options = {
    clientId: `expo_${Math.random().toString(16).slice(2, 8)}_${Date.now()}`,
    username: "external",
    password: password,
    reconnectPeriod: 5000,
    connectTimeout: 10000,
    keepalive: 60,
    clean: true,
    protocolVersion: 4,
    rejectUnauthorized: false,
  };

  console.log("📋 Connection Options:");
  console.log("   Client ID:", options.clientId);
  console.log("   Username:", options.username);
  console.log("   Password:", options.password.substring(0, 4) + "...");

  return options;
};

// ── Register connection callback with ID ──────────────────────────────────
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
  if (client && client.connected) {
    console.log("✅ Using existing MQTT connection");
    return client;
  }

  if (client) {
    console.log("🔄 Cleaning up old MQTT client");
    try {
      client.end(true);
    } catch (e) {
      // Ignore
    }
    client = null;
  }

  if (isConnecting) {
    console.log("⏳ Connection already in progress, waiting...");
    await new Promise(resolve => setTimeout(resolve, 2000));
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
      connectionCallbacks.forEach(cb => cb(false));
    });

    client.on("reconnect", () => {
      console.log("🔄 MQTT Reconnecting...");
    });

    client.on("close", () => {
      console.log("🔌 MQTT Connection closed");
      isConnecting = false;
      connectionCallbacks.forEach(cb => cb(false));
    });

    client.on("offline", () => {
      console.log("📡 MQTT Offline");
      isConnecting = false;
      connectionCallbacks.forEach(cb => cb(false));
    });

    const timeoutId = setTimeout(() => {
      if (client && !client.connected) {
        console.log("⏰ MQTT Connection timeout");
        isConnecting = false;
        connectionCallbacks.forEach(cb => cb(false));
        try {
          client.end(true);
        } catch (e) {
          // Ignore
        }
        client = null;
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
          client = null;
          isConnecting = false;
          connectionCallbacks.forEach(cb => cb(false));
          resolve();
        });
      } catch (error) {
        console.error("❌ Error disconnecting MQTT:", error);
        client = null;
        isConnecting = false;
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
  console.log("🔄 Reconnecting MQTT...");
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

// ── Get client status ──────────────────────────────────────────────────────
export const getMqttStatus = () => {
  if (!client) {
    return {
      connected: false,
      clientId: null,
      reconnectPeriod: null,
      isConnecting: isConnecting,
    };
  }
  
  return {
    connected: client.connected,
    clientId: client.options?.clientId || null,
    reconnectPeriod: client.options?.reconnectPeriod || null,
    isConnecting: isConnecting,
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
  console.log("Is Connecting:", isConnecting);
  
  const externalKey = await AsyncStorage.getItem("external_key");
  console.log("external_key in AsyncStorage:", externalKey);
  
  if (client) {
    console.log("Client options:", {
      clientId: client.options?.clientId,
      username: client.options?.username,
      password: client.options?.password ? "***" : "undefined",
    });
  }
  console.log("=== END DEBUG ===");
};