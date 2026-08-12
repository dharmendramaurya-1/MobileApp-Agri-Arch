// src/context/MqttContext.jsx
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import {
  getActiveDevice,
  getAllThings,
  setActiveDevice
} from "../services/identify/identify";
import {
  disconnectMqtt,
  getMqttClient,
  isMqttConnected,
  onMqttConnectionChange,
  publishWithRetry,
  reconnectMqtt as reconnectMqttClient,
  updateMqttPassword
} from "../services/mqttClient";
import { getDefaultDeviceStatus } from "../utils/deviceStatusParser";
import { parseSenMLToObject } from "../utils/senmlParser";
import { useAuth } from "./AuthContext";

// ── Defaults ── All null/undefined ─────────────────────────────────────────
const DEFAULT_SENSOR_DATA = {
  ambientTemperature: null,
  ambientHumidity: null,
  waterTemperature: null,
  co2Level: null,
  ecValue: null,
  phValue: null,
  waterLevel: null,
  lightLevel: null,
  deviceStatus: null,
  water_pump: null,
  water_ILvalve: null,
  water_OLvalve: null,
  nutrient_pump: null,
  reboot_ack: null,
  soilMoisture: null,
  lastUpdated: null,
};

const DEFAULT_ACTUATOR_STATUS = {
  water_pump: null,
  water_ILvalve: null,
  water_OLvalve: null,
  nutrient_pump: null,
  reboot_ack: null,
  lastUpdated: null,
};

const DEFAULT_CROP_SETTINGS = {
  cropName: null,
  variety: null,
  tempLow: null,
  tempHigh: null,
  humidityLow: null,
  humidityHigh: null,
  waterTempLow: null,
  waterTempHigh: null,
  waterLevelLow: null,
  waterLevelHigh: null,
  phLow: null,
  phHigh: null,
  co2Low: null,
  co2High: null,
  luxLow: null,
  luxHigh: null,
  ecLow: null,
  ecHigh: null,
  dimming: null,
  germinationRate: null,
  durationDays: null,
  photoperiod: null,
  expectedYield: null,
  lastUpdated: null,
};

const DEFAULT_CONFIG = {
  report_interval: null,
  sampling_interval: null,
  auto_mode: null,
  lastUpdated: null,
};

// ── Device Configuration ──────────────────────────────────────────────────────
const DEVICE_CONFIG = {
  water_pump: {
    displayName: "Water Pump",
    icon: "water",
    description: "Main water circulation pump",
    category: "pump",
  },
  water_ILvalve: {
    displayName: "Inlet Valve",
    icon: "arrow-down-circle",
    description: "Water inlet control valve",
    category: "valve",
  },
  water_OLvalve: {
    displayName: "Outlet Valve",
    icon: "arrow-up-circle",
    description: "Water outlet control valve",
    category: "valve",
  },
  nutrient_pump: {
    displayName: "Nutrient Pump",
    icon: "leaf",
    description: "Nutrient solution pump",
    category: "pump",
  },
  reboot_ack: {
    displayName: "Reboot Acknowledged",
    icon: "refresh",
    description: "System reboot acknowledgment",
    category: "system",
  },
};

const DEVICE_ORDER = [
  "water_pump",
  "water_ILvalve",
  "water_OLvalve",
  "nutrient_pump",
  "reboot_ack",
];

const MqttContext = createContext(undefined);

// ── State Preservation ────────────────────────────────────────────────────────
let lastKnownActuatorState = {
  water_pump: false,
  water_ILvalve: false,
  water_OLvalve: false,
  nutrient_pump: false,
  reboot_ack: false,
};

let lastKnownConfigState = {
  report_interval: 120,
  sampling_interval: 30,
  auto_mode: false,
};

// ✅ Storage keys
const STORAGE_KEYS = {
  EXTERNAL_KEY: 'external_key',
  ACTIVE_DEVICE_ID: 'active_device_id',
  PUBLISHER_ID: 'publisher_id',
  REPORT_INTERVAL: 'report_interval',
  TIMEOUT_DURATION: 'timeout_duration',
};

function parseActuatorToDevices(raw) {
  try {
    const records = JSON.parse(raw);
    const result = [];
    for (const r of records) {
      if (!r.n || r.vb === undefined) continue;
      const deviceName = r.n;
      if (deviceName in DEVICE_CONFIG) {
        const config = DEVICE_CONFIG[deviceName];
        result.push({
          id: deviceName,
          n: deviceName,
          vb: r.vb,
          displayName: config.displayName,
          icon: config.icon,
          description: config.description,
          category: config.category,
        });
      }
    }
    return result;
  } catch (e) {
    console.log("⚠️ Device parse error:", e);
    return [];
  }
}

// ── Payload Builders ──────────────────────────────────────────────────────────
function buildActuatorPayload(status) {
  const payload = [
    { bn: "urn:dev:9003718EEB3F:", bt: Math.floor(Date.now() / 1000) }
  ];
  
  const actuatorFields = [
    { n: "WatPmp", vb: status.water_pump },
    { n: "Wat_ILV", vb: status.water_ILvalve },
    { n: "Wat_OLV", vb: status.water_OLvalve },
    { n: "NUT_PMP", vb: status.nutrient_pump },
    { n: "BootAck", vb: status.reboot_ack }
  ];
  
  for (const field of actuatorFields) {
    if (field.vb !== undefined && field.vb !== null) {
      payload.push(field);
    }
  }
  
  return payload;
}

function buildSettingsPayload(settings, externalKey) {
  return [
    { bn: `urn:dev:${externalKey}:`, bt: Math.floor(Date.now() / 1000) },
    { n: "AMBTL", v: settings.tempLow },
    { n: "AMTHI", v: settings.tempHigh },
    { n: "HUMLO", v: settings.humidityLow },
    { n: "HUMHI", v: settings.humidityHigh },
    { n: "WTLO", v: settings.waterTempLow },
    { n: "WTHI", v: settings.waterTempHigh },
    { n: "WLLP", v: settings.waterLevelLow || 20 },
    { n: "WLHP", v: settings.waterLevelHigh || 80 },
    { n: "pHLO", v: settings.phLow },
    { n: "pHHI", v: settings.phHigh },
    { n: "Co2LO", v: settings.co2Low },
    { n: "Co2HI", v: settings.co2High },
    { n: "LUXLO", v: settings.luxLow },
    { n: "LUXHI", v: settings.luxHigh },
    { n: "ECL", v: settings.ecLow },
    { n: "ECH", v: settings.ecHigh },
    { n: "Dimm", v: settings.dimming || 75 },
  ];
}

function buildConfigPayload(deviceId, config) {
  return [
    { bn: `urn:dev:${deviceId}:cfg/`, bt: Math.floor(Date.now() / 1000) },
    { n: "RPT_INT", v: config.report_interval },
    { n: "SAMP_INT", v: config.sampling_interval },
    { n: "AutoMode", vb: config.auto_mode },
  ];
}

// ── Provider ──────────────────────────────────────────────────────────────────
export const MqttProvider = ({ children }) => {
  const [sensorData, setSensorData] = useState(DEFAULT_SENSOR_DATA);
  const [actuatorStatus, setActuatorStatus] = useState(DEFAULT_ACTUATOR_STATUS);
  const [cropSettings, setCropSettings] = useState(DEFAULT_CROP_SETTINGS);
  const [deviceConfig, setDeviceConfig] = useState(DEFAULT_CONFIG);
  const [devices, setDevices] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [externalKey, setExternalKey] = useState(null);
  const [mqttClient, setMqttClient] = useState(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [hasReceivedData, setHasReceivedData] = useState(false);
  const [deviceStatus, setDeviceStatus] = useState(null);
  const [deviceStatusFlags, setDeviceStatusFlags] = useState(getDefaultDeviceStatus());
  const [connectionState, setConnectionState] = useState('idle');
  const [hasEverBeenOnline, setHasEverBeenOnline] = useState(false);
  
  // ✅ Default report interval: 1800 seconds (30 minutes)
  const [reportInterval, setReportInterval] = useState(1800);
  const [timeoutDuration, setTimeoutDuration] = useState(3600);
  
  const timeoutCheckInterval = useRef(null);
  const lastDataReceivedTime = useRef(null);
  const initialResponseTimer = useRef(null);
  const hasReceivedDataRef = useRef(false);
  const activeDeviceIdRef = useRef(null);
  const hasEverBeenOnlineRef = useRef(false);
  
  const [availableDevices, setAvailableDevices] = useState([]);
  const [activeDeviceId, setActiveDeviceId] = useState(null);
  const [deviceConnectionStatus, setDeviceConnectionStatus] = useState({});
  const [isSwitchingDevice, setIsSwitchingDevice] = useState(false);
  
  const { isAuthenticated, token, isLoading: authLoading, isSignupFlow } = useAuth();
  const isMountedRef = useRef(true);
  const connectionCheckInterval = useRef(null);
  const hasInitializedRef = useRef(false);
  const unsubscribeRef = useRef(null);

  // Keep latest values available inside timers/callbacks
  useEffect(() => {
    activeDeviceIdRef.current = activeDeviceId;
  }, [activeDeviceId]);
  useEffect(() => {
    hasEverBeenOnlineRef.current = hasEverBeenOnline;
  }, [hasEverBeenOnline]);
  
  const getTopics = (key) => ({
    data: `/messages/${key}/data`,
    settings: `/messages/${key}/settings`,
    config: `/messages/${key}/cfg`,
    actuator: `/messages/${key}/actuator`,
  });

  // ── Debug ──────────────────────────────────────────────────────────────────
  const debugMqttState = () => {
    console.log("=== MQTT STATE DEBUG ===");
    console.log("mqttClient exists:", !!mqttClient);
    console.log("mqttClient connected:", mqttClient?.connected);
    console.log("isConnected state:", isConnected);
    console.log("connectionState:", connectionState);
    console.log("externalKey:", externalKey);
    console.log("activeDeviceId:", activeDeviceId);
    console.log("hasReceivedData:", hasReceivedData);
    console.log("hasEverBeenOnline:", hasEverBeenOnline);
    console.log("deviceStatus:", deviceStatus);
    console.log("reportInterval:", reportInterval);
    console.log("timeoutDuration:", timeoutDuration);
    console.log("=== END DEBUG ===");
  };

  // ── Load saved device from AsyncStorage ──────────────────────────────────
  const loadSavedDevice = async () => {
    try {
      // ✅ Load external_key
      const savedKey = await AsyncStorage.getItem(STORAGE_KEYS.EXTERNAL_KEY);
      if (savedKey) {
        console.log("📦 Loaded saved external_key:", savedKey);
        setExternalKey(savedKey);
      }

      // ✅ Load active device ID
      const savedDeviceId = await AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_DEVICE_ID);
      if (savedDeviceId) {
        console.log("📦 Loaded saved activeDeviceId:", savedDeviceId);
        setActiveDeviceId(savedDeviceId);
      }

      return { savedKey, savedDeviceId };
    } catch (error) {
      console.error("❌ Error loading saved device:", error);
      return { savedKey: null, savedDeviceId: null };
    }
  };

  // ── Save device to AsyncStorage ──────────────────────────────────────────
  const saveDevice = async (key, deviceId) => {
    try {
      if (key) {
        await AsyncStorage.setItem(STORAGE_KEYS.EXTERNAL_KEY, key);
        console.log("💾 Saved external_key:", key);
      }
      if (deviceId) {
        await AsyncStorage.setItem(STORAGE_KEYS.ACTIVE_DEVICE_ID, deviceId);
        console.log("💾 Saved activeDeviceId:", deviceId);
      }
    } catch (error) {
      console.error("❌ Error saving device:", error);
    }
  };

  // ── Update timeout based on report interval ──────────────────────────────
  const updateTimeoutFromReportInterval = (interval) => {
    if (interval && interval > 0) {
      const newTimeout = Math.max(interval * 2, 3600); // Minimum 1 hour
      setReportInterval(interval);
      setTimeoutDuration(newTimeout);
      console.log(`📡 Report interval: ${interval}s, Timeout set to: ${newTimeout}s (${Math.round(newTimeout/60)} minutes)`);
      
      AsyncStorage.setItem(STORAGE_KEYS.REPORT_INTERVAL, String(interval)).catch(console.error);
      AsyncStorage.setItem(STORAGE_KEYS.TIMEOUT_DURATION, String(newTimeout)).catch(console.error);
      
      return newTimeout;
    }
    return timeoutDuration;
  };

  // ── Load saved timeout values ────────────────────────────────────────────
  useEffect(() => {
    const loadSavedValues = async () => {
      try {
        const savedInterval = await AsyncStorage.getItem(STORAGE_KEYS.REPORT_INTERVAL);
        const savedTimeout = await AsyncStorage.getItem(STORAGE_KEYS.TIMEOUT_DURATION);
        
        if (savedInterval) {
          setReportInterval(Number(savedInterval));
        }
        if (savedTimeout) {
          setTimeoutDuration(Number(savedTimeout));
        }
        console.log(`📡 Loaded saved values - Report: ${savedInterval || 1800}s, Timeout: ${savedTimeout || 3600}s`);
      } catch (error) {
        console.error('Error loading saved timeout values:', error);
      }
    };
    loadSavedValues();
  }, []);

  // ── Monitor deviceConfig for report_interval changes ────────────────────
  useEffect(() => {
    if (deviceConfig && deviceConfig.report_interval) {
      const interval = deviceConfig.report_interval;
      if (interval !== reportInterval) {
        updateTimeoutFromReportInterval(interval);
      }
    }
  }, [deviceConfig]);

  // ── Connection callback ──────────────────────────────────────────────────
  useEffect(() => {
    let isMounted = true;
    console.log("📡 Registering MQTT connection callback...");
    
    const unsubscribe = onMqttConnectionChange((connected) => {
      if (isMounted) {
        console.log(`📡 MQTT Broker connection state changed: ${connected}`);
        setIsConnected(connected);
        
        if (activeDeviceId) {
          setDeviceConnectionStatus(prev => ({
            ...prev,
            [activeDeviceId]: connected ? 'waiting' : 'disconnected'
          }));
        }
        
        if (connected) {
          if (hasEverBeenOnline) {
            setConnectionState('waiting');
            startTimeoutCheck();
          } else {
            setConnectionState('waiting');
            console.log('⏳ First connection - Waiting for data with no timeout');
          }
        }
        
        if (connected && connectionCheckInterval.current) {
          clearInterval(connectionCheckInterval.current);
          connectionCheckInterval.current = null;
        }
      }
    });
    
    unsubscribeRef.current = unsubscribe;

    return () => {
      console.log("🧹 Unregistering MQTT connection callback...");
      isMounted = false;
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      if (connectionCheckInterval.current) {
        clearInterval(connectionCheckInterval.current);
        connectionCheckInterval.current = null;
      }
    };
  }, [activeDeviceId]);

  // ── Cleanup ──────────────────────────────────────────────────────────────
  const cleanupMqtt = async () => {
    if (timeoutCheckInterval.current) {
      clearInterval(timeoutCheckInterval.current);
      timeoutCheckInterval.current = null;
    }
    if (connectionCheckInterval.current) {
      clearInterval(connectionCheckInterval.current);
      connectionCheckInterval.current = null;
    }
    if (mqttClient) {
      try {
        mqttClient.removeAllListeners();
        await disconnectMqtt(true);
        console.log("🧹 MQTT cleaned up");
      } catch (error) {
        console.error("Error cleaning up MQTT:", error);
      }
    }
    setIsConnected(false);
    setMqttClient(null);
    setHasReceivedData(false);
    hasReceivedDataRef.current = false;
    setDeviceStatus(null);
    setConnectionState('idle');
    clearInitialResponseCheck();
  };

  // ── Load External Key ────────────────────────────────────────────────────
  const loadExternalKey = async () => {
    try {
      let storedKey = await AsyncStorage.getItem(STORAGE_KEYS.EXTERNAL_KEY);
      
      if (!storedKey) {
        console.log("ℹ️ No external_key found in storage.");
        return null;
      }
      console.log("✅ Found stored external_key:", storedKey);
      return storedKey;
    } catch (error) {
      console.error("❌ Error loading externalKey:", error);
      return null;
    }
  };
  
  // ── Connection Check ─────────────────────────────────────────────────────
  const startConnectionCheck = () => {
    if (connectionCheckInterval.current) {
      clearInterval(connectionCheckInterval.current);
      connectionCheckInterval.current = null;
    }
    if (isConnected) return;

    connectionCheckInterval.current = setInterval(() => {
      if (!isMountedRef.current) {
        clearInterval(connectionCheckInterval.current);
        connectionCheckInterval.current = null;
        return;
      }
      if (isConnected) {
        clearInterval(connectionCheckInterval.current);
        connectionCheckInterval.current = null;
        return;
      }
      if (isMqttConnected()) {
        setIsConnected(true);
        setConnectionState('waiting');
        if (activeDeviceId) {
          setDeviceConnectionStatus(prev => ({
            ...prev,
            [activeDeviceId]: 'waiting'
          }));
        }
        clearInterval(connectionCheckInterval.current);
        connectionCheckInterval.current = null;
        
        if (hasEverBeenOnline) {
          startTimeoutCheck();
        } else {
          console.log('⏳ First connection - Waiting for data with no timeout');
        }
      }
    }, 5000);
  };

  // ── Start Timeout Check ──────────────────────────────────────────────────
  const startTimeoutCheck = () => {
    if (timeoutCheckInterval.current) {
      clearInterval(timeoutCheckInterval.current);
      timeoutCheckInterval.current = null;
    }

    if (!hasEverBeenOnlineRef.current) {
      console.log('⏳ Device never online - No timeout check');
      return;
    }

    console.log(`⏳ Starting timeout check - Timeout: ${timeoutDuration}s (${Math.round(timeoutDuration/60)} minutes)`);

    timeoutCheckInterval.current = setInterval(() => {
      if (!isMountedRef.current) {
        clearInterval(timeoutCheckInterval.current);
        timeoutCheckInterval.current = null;
        return;
      }

      if (hasReceivedData) {
        lastDataReceivedTime.current = Date.now();
        return;
      }

      if (lastDataReceivedTime.current) {
        const timeSinceLastData = (Date.now() - lastDataReceivedTime.current) / 1000;
        
        if (timeSinceLastData >= timeoutDuration) {
          setConnectionState('offline');
          if (activeDeviceId) {
            setDeviceConnectionStatus(prev => ({
              ...prev,
              [activeDeviceId]: 'offline'
            }));
          }
          console.log(`📡 Device marked OFFLINE - No data received for ${timeoutDuration}s (${Math.round(timeoutDuration/60)} minutes)`);
          
          if (timeoutCheckInterval.current) {
            clearInterval(timeoutCheckInterval.current);
            timeoutCheckInterval.current = null;
          }
        } else {
          if (connectionState !== 'waiting') {
            setConnectionState('waiting');
          }
          const remaining = Math.round((timeoutDuration - timeSinceLastData) / 60);
          console.log(`⏳ Waiting for data... ${remaining} minutes remaining`);
        }
      }

    }, 30000);
  };

  // ── Initial Response Check ────────────────────────────────────────────────
  const clearInitialResponseCheck = () => {
    if (initialResponseTimer.current) {
      clearTimeout(initialResponseTimer.current);
      initialResponseTimer.current = null;
    }
  };

  const startInitialResponseCheck = (timeoutMs = getInitialResponseTimeout()) => {
    clearInitialResponseCheck();
    if (hasReceivedDataRef.current) {
      console.log('⏳ Data already received this session — skipping initial response check');
      return;
    }
    console.log(`⏳ Starting initial response check — waiting ${Math.round(timeoutMs / 1000)}s (${Math.round(timeoutMs / 3600)} hours) for device data...`);
    initialResponseTimer.current = setTimeout(() => {
      initialResponseTimer.current = null;
      if (!isMountedRef.current) return;
      if (!hasReceivedDataRef.current) {
        console.log('❌ Initial response check expired — device sent NO response, marking OFFLINE');
        setConnectionState('offline');
        if (activeDeviceIdRef.current) {
          setDeviceConnectionStatus(prev => ({
            ...prev,
            [activeDeviceIdRef.current]: 'offline'
          }));
        }
      }
    }, timeoutMs);
  };

  // ✅ Updated: Initial response timeout - minimum 1 hour (3600 seconds)
  const getInitialResponseTimeout = () => {
    const intervalMs = reportInterval > 0 ? reportInterval * 1000 : 0;
    // ✅ Minimum 1 hour (3600 seconds), maximum 5 hours (18000000 seconds)
    return Math.min(Math.max(intervalMs, 3600000), 18000000);
  };

  // ── Publish ──────────────────────────────────────────────────────────────
  const doPublish = (client, topic, message, resolve) => {
    if (!client || !client.connected) {
      console.log("❌ Client not connected");
      resolve(false);
      return;
    }
    
    console.log(`📤 Publishing to: ${topic}`);
    console.log(`📤 Message preview: ${message.substring(0, 150)}...`);
    
    client.publish(topic, message, { qos: 1 }, (err) => {
      if (err) {
        console.error("❌ Publish error:", err);
        resolve(false);
      } else {
        console.log(`✅ Published successfully to ${topic}`);
        resolve(true);
      }
    });
  };

  const publish = (topic, message) => {
    return new Promise((resolve) => {
      console.log(`📤 Publishing to: ${topic}`);
      
      let clientToUse = mqttClient;
      
      if (!clientToUse || !clientToUse.connected) {
        console.log("⚠️ Client not available, trying to get fresh client...");
        getMqttClient().then((freshClient) => {
          if (freshClient && freshClient.connected) {
            console.log("✅ Got fresh connected client");
            clientToUse = freshClient;
            setMqttClient(freshClient);
            doPublish(clientToUse, topic, message, resolve);
          } else {
            console.log("❌ Could not get fresh client");
            resolve(false);
          }
        }).catch((err) => {
          console.error("❌ Error getting fresh client:", err);
          resolve(false);
        });
        return;
      }
      
      doPublish(clientToUse, topic, message, resolve);
    });
  };

  // ── Subscribe ────────────────────────────────────────────────────────────
  const subscribeToTopic = (topic) => {
    if (!externalKey) {
      console.log("⚠️ Cannot subscribe: No external key");
      return;
    }
    
    const fullTopic = `/messages/${externalKey}/${topic}`;
    
    if (!mqttClient || !mqttClient.connected) {
      console.log("⚠️ Cannot subscribe: MQTT not connected");
      return;
    }
    
    mqttClient.subscribe(fullTopic, (err) => {
      if (!err) {
        console.log(`📡 Subscribed to ${fullTopic}`);
      } else {
        console.log(`❌ Subscribe error:`, err);
      }
    });
  };

  // ── Publish Message ─────────────────────────────────────────────────────
  const publishMessage = async (topic, message) => {
    if (!externalKey) {
      console.log("⚠️ No external_key available");
      return false;
    }
    const fullTopic = `/messages/${externalKey}/${topic}`;
    return await publish(fullTopic, message);
  };

  // ── Toggle Device Status ────────────────────────────────────────────────────
  const toggleDeviceStatus = async (deviceName, status) => {
    try {
      const currentState = lastKnownActuatorState;
      
      const actuatorMap = {
        water_pump: "water_pump",
        water_ILvalve: "water_ILvalve",
        water_OLvalve: "water_OLvalve",
        nutrient_pump: "nutrient_pump",
        reboot_ack: "reboot_ack",
      };
      
      const actuatorKey = actuatorMap[deviceName];
      if (!actuatorKey) {
        console.log(`⚠️ Unknown device: ${deviceName}`);
        return false;
      }
      
      const updatedState = {
        ...currentState,
        [actuatorKey]: status,
      };
      
      const success = await publishActuatorStatus(updatedState);
      
      if (success) {
        setDevices(prev => prev.map(d => 
          d.n === deviceName ? { ...d, vb: status } : d
        ));
      }
      
      return success;
    } catch (error) {
      console.error("❌ Set device status error:", error);
      return false;
    }
  };

  // ── Force Reconnect ──────────────────────────────────────────────────────
  const forceReconnect = async (newKey) => {
    console.log("🔄 Force reconnecting MQTT...");
    
    try {
      if (newKey) {
        console.log("   New external key:", newKey);
        await AsyncStorage.setItem(STORAGE_KEYS.EXTERNAL_KEY, newKey);
        setExternalKey(newKey);
        await updateMqttPassword(newKey);
      }
      
      hasInitializedRef.current = false;
      
      if (connectionCheckInterval.current) {
        clearInterval(connectionCheckInterval.current);
        connectionCheckInterval.current = null;
      }
      
      await cleanupMqtt();
      setIsConnected(false);
      
      if (activeDeviceId) {
        setDeviceConnectionStatus(prev => ({
          ...prev,
          [activeDeviceId]: 'connecting'
        }));
      }
      
      if (newKey) {
        console.log("🔄 Calling reconnectMqttClient with new key...");
        await reconnectMqttClient(newKey);
      } else {
        console.log("🔄 Calling reconnectMqttClient...");
        await reconnectMqttClient();
      }
      
      await initializeMqtt();
      
      startInitialResponseCheck();
      
      console.log(`✅ Force reconnect completed. isConnected: ${isConnected}`);
      
      if (activeDeviceId && isConnected) {
        setDeviceConnectionStatus(prev => ({
          ...prev,
          [activeDeviceId]: 'waiting'
        }));
      }
    } catch (error) {
      console.error("❌ Force reconnect error:", error);
      if (activeDeviceId) {
        setDeviceConnectionStatus(prev => ({
          ...prev,
          [activeDeviceId]: 'error'
        }));
      }
      throw error;
    }
  };

  // ── SWITCH TO DEVICE ──────────────────────────────────────────────────────
  const switchToDevice = async (thingId, externalKey) => {
    console.log(`🔄 Switching to device: ${thingId} (${externalKey})`);
    
    setIsSwitchingDevice(true);
    
    try {
      setDeviceConnectionStatus(prev => ({
        ...prev,
        [thingId]: 'connecting'
      }));
      
      await AsyncStorage.setItem(STORAGE_KEYS.PUBLISHER_ID, String(thingId));
      await AsyncStorage.setItem(STORAGE_KEYS.EXTERNAL_KEY, externalKey);
      await AsyncStorage.setItem(STORAGE_KEYS.ACTIVE_DEVICE_ID, thingId);
      
      setExternalKey(externalKey);
      setActiveDeviceId(thingId);
      
      await forceReconnect(externalKey);
      
      console.log("✅ Successfully switched to device:", thingId);
      
      setDeviceConnectionStatus(prev => ({
        ...prev,
        [thingId]: isConnected ? 'waiting' : 'connecting'
      }));
      
      return true;
    } catch (error) {
      console.error("❌ Error switching device:", error);
      setDeviceConnectionStatus(prev => ({
        ...prev,
        [thingId]: 'error'
      }));
      return false;
    } finally {
      setIsSwitchingDevice(false);
    }
  };

  // ── LOAD AVAILABLE DEVICES ────────────────────────────────────────────────
  const loadAvailableDevices = async () => {
    try {
      const things = await getAllThings();
      if (things && things.length > 0) {
        setAvailableDevices(things);
        
        // ✅ Try to get active device from storage first
        const savedDeviceId = await AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_DEVICE_ID);
        const savedKey = await AsyncStorage.getItem(STORAGE_KEYS.EXTERNAL_KEY);
        
        console.log("📦 Saved device - ID:", savedDeviceId, "Key:", savedKey);
        
        let active = null;
        
        // ✅ Check if saved device exists
        if (savedDeviceId && savedKey) {
          const exists = things.find(t => t.id === savedDeviceId);
          if (exists) {
            active = { publisherId: savedDeviceId, externalKey: savedKey };
            console.log("✅ Using saved device:", savedDeviceId);
          } else {
            console.log("⚠️ Saved device not found in list");
          }
        }
        
        // ✅ If no saved device, get from API
        if (!active) {
          active = await getActiveDevice();
        }
        
        if (active && active.publisherId) {
          const exists = things.find(t => t.id === active.publisherId);
          if (exists) {
            setActiveDeviceId(active.publisherId);
            setExternalKey(active.externalKey);
            // ✅ Save for future
            await saveDevice(active.externalKey, active.publisherId);
          } else {
            const firstThing = things[0];
            await setActiveDevice(firstThing.id, firstThing.external_key);
            setActiveDeviceId(firstThing.id);
            setExternalKey(firstThing.external_key);
            await saveDevice(firstThing.external_key, firstThing.id);
          }
        } else if (things.length > 0) {
          const firstThing = things[0];
          await setActiveDevice(firstThing.id, firstThing.external_key);
          setActiveDeviceId(firstThing.id);
          setExternalKey(firstThing.external_key);
          await saveDevice(firstThing.external_key, firstThing.id);
        }
        
        const statusMap = {};
        things.forEach(t => {
          statusMap[t.id] = t.id === activeDeviceId ? (isConnected ? 'waiting' : 'disconnected') : 'disconnected';
        });
        setDeviceConnectionStatus(statusMap);
      }
      return things;
    } catch (error) {
      console.error("Error loading available devices:", error);
      return [];
    }
  };

  // ── Initialize MQTT ──────────────────────────────────────────────────────
  const initializeMqtt = async () => {
    if (!isAuthenticated || !token) {
      console.log("⏳ Not authenticated, skipping MQTT init");
      setIsReady(true);
      setConnectionState('idle');
      return;
    }
    
    if (isSignupFlow) {
      console.log("⏳ In signup flow - skipping MQTT initialization");
      setIsReady(true);
      return;
    }
    
    if (isInitializing) {
      console.log("⏳ Already initializing, skipping...");
      return;
    }

    console.log("🔧 initializeMqtt called");
    
    // ✅ Check if external_key exists in AsyncStorage
    const storedKey = await loadExternalKey();
    
    if (!storedKey) {
      console.log("⚠️ No external_key found in AsyncStorage - Skipping MQTT connection");
      setExternalKey(null);
      setIsReady(true);
      setConnectionState('idle');
      // ✅ Set isReady to true but don't connect
      return;
    }

    // ✅ Only connect if external_key exists
    console.log("✅ external_key found, proceeding with MQTT connection");
    setConnectionState('connecting');
    setIsInitializing(true);
    
    try {
      await loadAvailableDevices();
      
      setExternalKey(storedKey);
      console.log("🔑 externalKey set in state:", storedKey);

      await updateMqttPassword(storedKey);
      console.log("✅ MQTT password updated");

      const topics = getTopics(storedKey);
      console.log("📡 Topics configured:", topics);

      await cleanupMqtt();

      const client = await getMqttClient();
      console.log("📡 MQTT client obtained, connected:", client.connected);
      setMqttClient(client);

      // ── Enhanced Message Handler ──────────────────────────────────────────
      const onMessage = (topic, message) => {
        if (!isMountedRef.current) return;
        
        const msgStr = message.toString();
        console.log(`📨 Received on ${topic}: ${msgStr.substring(0, 100)}...`);
        
        const parsed = parseSenMLToObject(msgStr);
        console.log("📊 Parsed data:", parsed);
        
        // ✅ Data received! Mark device online
        setHasReceivedData(true);
        hasReceivedDataRef.current = true;
        setConnectionState('online');
        lastDataReceivedTime.current = Date.now();
        
        clearInitialResponseCheck();
        
        if (!hasEverBeenOnlineRef.current) {
          setHasEverBeenOnline(true);
          hasEverBeenOnlineRef.current = true;
          console.log('✅ First data received from device! Device is ONLINE');
          startTimeoutCheck();
        }
        
        if (activeDeviceId) {
          setDeviceConnectionStatus(prev => ({
            ...prev,
            [activeDeviceId]: 'online'
          }));
        }
        
        if (parsed.deviceStatusFlags) {
          setDeviceStatusFlags(parsed.deviceStatusFlags);
          console.log("📊 Device Status Flags:", parsed.deviceStatusFlags);
          
          const isOnline = parsed.deviceStatusFlags.online;
          if (isOnline !== null && isOnline !== undefined) {
            if (isOnline) {
              setConnectionState('online');
              setHasEverBeenOnline(true);
              hasEverBeenOnlineRef.current = true;
              console.log('✅ Device reported ONLINE from status flags (Bit 17)');
            } else {
              console.log('⚠️ Device reported OFFLINE from status flags (Bit 17)');
              setConnectionState('offline');
              if (activeDeviceIdRef.current) {
                setDeviceConnectionStatus(prev => ({
                  ...prev,
                  [activeDeviceIdRef.current]: 'offline'
                }));
              }
            }
          }
          
          const isAuto = parsed.deviceStatusFlags.mode;
          if (isAuto !== null && isAuto !== undefined) {
            console.log(`📡 Device mode from status flags: ${isAuto ? 'AUTO' : 'MANUAL'} (Bit 16)`);
          }
        }
        
        const updatedSensorData = { ...sensorData };
        let hasSensorUpdate = false;
        let hasActuatorUpdate = false;
        let newDeviceStatus = null;
        
        for (const [key, value] of Object.entries(parsed)) {
          if (['ambientTemperature', 'ambientHumidity', 'waterTemperature', 
               'co2Level', 'ecValue', 'phValue', 'waterLevel', 'lightLevel', 
               'soilMoisture'].includes(key)) {
            updatedSensorData[key] = value;
            hasSensorUpdate = true;
          }
          
          if (key === 'deviceStatus') {
            newDeviceStatus = value;
            updatedSensorData.deviceStatus = value;
            hasSensorUpdate = true;
          }
          
          if (['water_pump', 'water_ILvalve', 'water_OLvalve', 
               'nutrient_pump', 'reboot_ack'].includes(key)) {
            updatedSensorData[key] = value;
            hasActuatorUpdate = true;
          }
        }
        
        if (hasSensorUpdate || hasActuatorUpdate) {
          updatedSensorData.lastUpdated = new Date();
          setSensorData(updatedSensorData);
          console.log(`📊 Updated sensor data:`, updatedSensorData);
        }
        
        if (newDeviceStatus !== null) {
          setDeviceStatus(newDeviceStatus);
          const statusOnline = parsed.deviceStatusFlags?.online;
          console.log(`📡 Device status from data topic: ${statusOnline ? 'ONLINE' : 'OFFLINE'} (${newDeviceStatus})`);
        }
        
        if (hasActuatorUpdate) {
          const updatedActuator = {
            water_pump: parsed.water_pump !== undefined ? parsed.water_pump : actuatorStatus.water_pump,
            water_ILvalve: parsed.water_ILvalve !== undefined ? parsed.water_ILvalve : actuatorStatus.water_ILvalve,
            water_OLvalve: parsed.water_OLvalve !== undefined ? parsed.water_OLvalve : actuatorStatus.water_OLvalve,
            nutrient_pump: parsed.nutrient_pump !== undefined ? parsed.nutrient_pump : actuatorStatus.nutrient_pump,
            reboot_ack: parsed.reboot_ack !== undefined ? parsed.reboot_ack : actuatorStatus.reboot_ack,
            lastUpdated: new Date(),
          };
          
          lastKnownActuatorState = {
            water_pump: updatedActuator.water_pump !== null ? updatedActuator.water_pump : false,
            water_ILvalve: updatedActuator.water_ILvalve !== null ? updatedActuator.water_ILvalve : false,
            water_OLvalve: updatedActuator.water_OLvalve !== null ? updatedActuator.water_OLvalve : false,
            nutrient_pump: updatedActuator.nutrient_pump !== null ? updatedActuator.nutrient_pump : false,
            reboot_ack: updatedActuator.reboot_ack !== null ? updatedActuator.reboot_ack : false,
          };
          
          setActuatorStatus(updatedActuator);
          console.log(`🔧 Updated actuator status:`, updatedActuator);
          
          const actuatorFields = {};
          if (parsed.water_pump !== undefined) actuatorFields.water_pump = parsed.water_pump;
          if (parsed.water_ILvalve !== undefined) actuatorFields.water_ILvalve = parsed.water_ILvalve;
          if (parsed.water_OLvalve !== undefined) actuatorFields.water_OLvalve = parsed.water_OLvalve;
          if (parsed.nutrient_pump !== undefined) actuatorFields.nutrient_pump = parsed.nutrient_pump;
          if (parsed.reboot_ack !== undefined) actuatorFields.reboot_ack = parsed.reboot_ack;
          
          const deviceList = Object.entries(actuatorFields)
            .filter(([key]) => key in DEVICE_CONFIG)
            .map(([key, value]) => {
              const config = DEVICE_CONFIG[key];
              return {
                id: key,
                n: key,
                vb: value,
                displayName: config.displayName,
                icon: config.icon,
                description: config.description,
                category: config.category,
              };
            });
          
          if (deviceList.length > 0) {
            setDevices(deviceList);
            console.log(`📡 Updated ${deviceList.length} devices`);
          }
        }
        
        if (timeoutCheckInterval.current) {
          clearInterval(timeoutCheckInterval.current);
          timeoutCheckInterval.current = null;
        }
        setTimeout(() => {
          if (isMountedRef.current && isConnected && hasEverBeenOnline) {
            startTimeoutCheck();
          }
        }, 2000);
      };

      // ── Subscribe ONLY to data topic ──────────────────────────────────────
      if (client.connected) {
        console.log("✅ Client already connected");
        setIsConnected(true);
        setConnectionState('waiting');
        hasInitializedRef.current = true;
        setIsReady(true);
        setIsInitializing(false);
        
        if (activeDeviceId) {
          setDeviceConnectionStatus(prev => ({
            ...prev,
            [activeDeviceId]: 'waiting'
          }));
        }
        
        startInitialResponseCheck();
        
        client.subscribe(topics.data, (err) => {
          if (!err) {
            console.log(`📡 Subscribed to ${topics.data}`);
          } else {
            console.log(`❌ Subscribe error:`, err);
          }
        });
        
        client.on("message", onMessage);
        
        return;
      }

      console.log("⏳ Client not connected, starting connection check...");
      startConnectionCheck();

      const onConnect = () => {
        if (!isMountedRef.current) return;
        console.log("✅ MQTT Connected");
        setIsConnected(true);
        setConnectionState('waiting');
        hasInitializedRef.current = true;
        
        if (activeDeviceId) {
          setDeviceConnectionStatus(prev => ({
            ...prev,
            [activeDeviceId]: 'waiting'
          }));
        }
        
        if (connectionCheckInterval.current) {
          clearInterval(connectionCheckInterval.current);
          connectionCheckInterval.current = null;
        }

        startInitialResponseCheck();
        
        client.subscribe(topics.data, (err) => {
          if (!err) {
            console.log(`📡 Subscribed to ${topics.data}`);
          } else {
            console.log(`❌ Subscribe error:`, err);
          }
        });

        client.on("message", onMessage);
      };

      const onClose = () => {
        if (isMountedRef.current) {
          console.log("🔌 MQTT Disconnected");
          setIsConnected(false);
          setConnectionState('disconnected');
          if (activeDeviceId) {
            setDeviceConnectionStatus(prev => ({
              ...prev,
              [activeDeviceId]: 'disconnected'
            }));
          }
          hasInitializedRef.current = false;
          startConnectionCheck();
        }
      };

      client.removeAllListeners();
      client.on("connect", onConnect);
      client.on("close", onClose);
      client.on("message", onMessage);
      client.on("reconnect", () => console.log("🔄 MQTT Reconnecting..."));
      client.on("error", (err) => console.log("❌ MQTT Error:", err));

      setIsReady(true);

    } catch (error) {
      console.error("❌ Error in MQTT initialization:", error);
      setIsReady(true);
      setConnectionState('error');
      if (activeDeviceId) {
        setDeviceConnectionStatus(prev => ({
          ...prev,
          [activeDeviceId]: 'error'
        }));
      }
    } finally {
      setIsInitializing(false);
    }
  };

  // ── Reconnect ────────────────────────────────────────────────────────────
  const reconnect = async () => {
    console.log("🔄 Attempting to reconnect MQTT...");
    hasInitializedRef.current = false;
    if (connectionCheckInterval.current) {
      clearInterval(connectionCheckInterval.current);
      connectionCheckInterval.current = null;
    }
    if (timeoutCheckInterval.current) {
      clearInterval(timeoutCheckInterval.current);
      timeoutCheckInterval.current = null;
    }
    await cleanupMqtt();
    await initializeMqtt();
  };

  // ── UseEffect for Auth ──────────────────────────────────────────────────
  useEffect(() => {
    isMountedRef.current = true;
    const init = async () => {
      if (authLoading) {
        setIsReady(true);
        return;
      }
      
      if (isSignupFlow) {
        console.log("⏳ Signup flow active - MQTT will initialize after signup completes");
        setIsReady(true);
        return;
      }
      
      if (isAuthenticated && token) {
        // ✅ Load saved device first
        await loadSavedDevice();
        
        if (!hasInitializedRef.current) {
          await initializeMqtt();
        }
      } else {
        if (hasInitializedRef.current || mqttClient) {
          await cleanupMqtt();
          hasInitializedRef.current = false;
        }
        setExternalKey(null);
        setIsReady(true);
        setIsConnected(false);
        setConnectionState('idle');
      }
    };
    init();
    return () => {
      isMountedRef.current = false;
      if (connectionCheckInterval.current) {
        clearInterval(connectionCheckInterval.current);
        connectionCheckInterval.current = null;
      }
      if (timeoutCheckInterval.current) {
        clearInterval(timeoutCheckInterval.current);
        timeoutCheckInterval.current = null;
      }
    };
  }, [isAuthenticated, token, authLoading, isSignupFlow]);

  // ── Publish Functions ──────────────────────────────────────────────────
  const publishSenML = async (senmlData, topic = 'settings') => {
    if (!externalKey) {
      console.log("⚠️ No external_key available for SenML publish");
      return false;
    }
    
    if (!isConnected) {
      console.log("⚠️ MQTT not connected");
      return false;
    }
    
    try {
      const fullTopic = `/messages/${externalKey}/${topic}`;
      const message = JSON.stringify(senmlData);
      console.log(`📤 Publishing SenML to ${fullTopic}`);
      
      return await publish(fullTopic, message);
    } catch (error) {
      console.error("❌ Publish SenML error:", error);
      return false;
    }
  };

  const publishActuatorStatus = async (status) => {
    if (!externalKey) return false;
    
    const preservedStatus = {
      ...lastKnownActuatorState,
      ...status,
    };
    
    const cleanStatus = {
      water_pump: preservedStatus.water_pump || false,
      water_ILvalve: preservedStatus.water_ILvalve || false,
      water_OLvalve: preservedStatus.water_OLvalve || false,
      nutrient_pump: preservedStatus.nutrient_pump || false,
      reboot_ack: preservedStatus.reboot_ack || false,
    };
    
    const payload = buildActuatorPayload(cleanStatus);
    const success = await publish(`/messages/${externalKey}/actuator`, JSON.stringify(payload));
    
    if (success) {
      lastKnownActuatorState = { ...cleanStatus };
      setActuatorStatus({ ...cleanStatus, lastUpdated: new Date() });
      
      const deviceList = parseActuatorToDevices(JSON.stringify(payload));
      if (deviceList.length > 0) {
        setDevices(deviceList);
      }
      console.log("✅ Actuator published with preservation:", cleanStatus);
    }
    return success;
  };

  const publishSettings = async (settings) => {
    if (!externalKey) {
      console.log("⚠️ No external_key available");
      return false;
    }
    console.log(`📤 Publishing settings to /messages/${externalKey}/settings`);
    
    const payload = buildSettingsPayload(settings, externalKey);
    const message = JSON.stringify(payload);
    
    const success = await publish(`/messages/${externalKey}/settings`, message);
    
    if (success) {
      setCropSettings({ ...settings, lastUpdated: new Date() });
      console.log("✅ Crop settings published successfully");
    } else {
      console.log("❌ Failed to publish crop settings");
    }
    
    return success;
  };

  const publishConfig = async (config) => {
    if (!externalKey) return false;
    
    const preservedConfig = {
      ...lastKnownConfigState,
      ...config,
    };
    
    const cleanConfig = {
      report_interval: preservedConfig.report_interval || 120,
      sampling_interval: preservedConfig.sampling_interval || 30,
      auto_mode: preservedConfig.auto_mode || false,
    };
    
    const payload = buildConfigPayload(externalKey, cleanConfig);
    const success = await publish(`/messages/${externalKey}/cfg`, JSON.stringify(payload));
    
    if (success) {
      lastKnownConfigState = { ...cleanConfig };
      setDeviceConfig({ ...cleanConfig, lastUpdated: new Date() });
      
      if (cleanConfig.report_interval) {
        updateTimeoutFromReportInterval(cleanConfig.report_interval);
      }
      
      console.log("✅ Config published with preservation:", cleanConfig);
    }
    return success;
  };

  // ── Context Value ──────────────────────────────────────────────────────────
  const contextValue = {
    sensorData,
    actuatorStatus,
    cropSettings,
    deviceConfig,
    devices,
    isConnected,
    isReady,
    externalKey,
    hasReceivedData,
    deviceStatus,
    deviceStatusFlags,
    connectionState,
    hasEverBeenOnline,
    reportInterval,
    timeoutDuration,
    availableDevices,
    activeDeviceId,
    deviceConnectionStatus,
    isSwitchingDevice,
    switchToDevice,
    loadAvailableDevices,
    publish,
    publishWithRetry: async (topic, msg, retries = 3) => publishWithRetry(topic, msg, retries),
    publishActuatorStatus,
    setActuatorStatus: async (status) => {
      const mergedStatus = { ...lastKnownActuatorState, ...status };
      const updated = { ...mergedStatus, lastUpdated: new Date() };
      return await publishActuatorStatus(updated);
    },
    publishSettings,
    publishSenML,
    updateCropSettings: async (settings) => {
      const updated = { ...cropSettings, ...settings, lastUpdated: new Date() };
      return await publishSettings(updated);
    },
    publishConfig,
    updateDeviceConfig: async (config) => {
      const mergedConfig = { ...lastKnownConfigState, ...config };
      const updated = { ...mergedConfig, lastUpdated: new Date() };
      return await publishConfig(updated);
    },
    reconnect,
    forceReconnect,
    debugMqttState,
    updateSensorData: (data) => setSensorData(prev => ({ ...prev, ...data, lastUpdated: new Date() })),
    updateActuatorStatus: (status) => {
      const merged = { ...lastKnownActuatorState, ...status };
      setActuatorStatus(prev => ({ ...prev, ...merged, lastUpdated: new Date() }));
    },
    subscribeToTopic,
    publishMessage,
    toggleDeviceStatus,
    getLastKnownActuatorState: () => lastKnownActuatorState,
    getLastKnownConfigState: () => lastKnownConfigState,
  };

  return (
    <MqttContext.Provider value={contextValue}>
      {children}
    </MqttContext.Provider>
  );
};

export const useMqtt = () => {
  const context = useContext(MqttContext);
  if (!context) throw new Error("useMqtt must be used within a MqttProvider");
  return context;
};