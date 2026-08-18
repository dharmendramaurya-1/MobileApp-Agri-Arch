// src/context/MqttContext.jsx
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import {
  getActiveDevice,
  getAllThings,
  setActiveDevice
} from "../services/identify/identify";
import {
  loadLastData,
  saveLastData
} from "../services/lastDataCache";
import {
  disconnectMqtt,
  getMqttClient,
  isMqttConnected,
  publishWithRetry,
  reconnectMqtt as reconnectMqttClient,
  updateMqttPassword
} from "../services/mqttClient";
import { getDefaultDeviceStatus } from "../utils/deviceStatusParser";
import { parseSenMLToObject } from "../utils/senmlParser";
import { useAuth } from "./AuthContext";

// ── Defaults ──
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

// ── Device Configuration ──
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

const MqttContext = createContext(undefined);

// ── Storage keys ──
const STORAGE_KEYS = {
  EXTERNAL_KEY: 'external_key',
  ACTIVE_DEVICE_ID: 'active_device_id',
  PUBLISHER_ID: 'publisher_id',
  REPORT_INTERVAL: 'report_interval',
  TIMEOUT_DURATION: 'timeout_duration',
  DEVICES_DATA: 'devices_data',
  SELECTED_DEVICE_ID: 'selected_device_id',
  SELECTED_DEVICE_NAME: 'selected_device_name',
};

// ── Constants ──
const GET_STAT_ACTIVE_DURATION = 10 * 60 * 1000; // 10 minutes in milliseconds
const DATA_CHECK_INTERVAL = 30 * 1000; // 30 seconds

// ── Helper Functions ──
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

// ── Generate Request ID ──
const generateRequestId = () => {
  return Math.random().toString(16).substring(2, 10).toUpperCase();
};

// ── Build GET_STATUS payload ──
const buildGetStatusPayload = (requestId) => {
  return JSON.stringify({
    cmd: "GET_STATUS",
    request_id: requestId
  });
};

// ── Provider ──
export const MqttProvider = ({ children }) => {
  // ── Multi-device state ──
  const [devicesData, setDevicesData] = useState({});
  const [deviceConnectionStatus, setDeviceConnectionStatus] = useState({});
  const [deviceOnlineStatus, setDeviceOnlineStatus] = useState({});
  
  // ── Selected device state ──
  const [selectedDeviceId, setSelectedDeviceId] = useState(null);
  const [selectedDeviceName, setSelectedDeviceName] = useState(null);
  
  // ── Legacy single-device state (kept for compatibility) ──
  const [sensorData, setSensorData] = useState(DEFAULT_SENSOR_DATA);
  const [actuatorStatus, setActuatorStatus] = useState(DEFAULT_ACTUATOR_STATUS);
  const [cropSettings, setCropSettings] = useState(DEFAULT_CROP_SETTINGS);
  const [deviceConfig, setDeviceConfig] = useState(DEFAULT_CONFIG);
  const [devices, setDevices] = useState([]);
  const [deviceStatus, setDeviceStatus] = useState(null);
  const [deviceStatusFlags, setDeviceStatusFlags] = useState(getDefaultDeviceStatus());
  
  // ── Connection state ──
  const [isConnected, setIsConnected] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [externalKey, setExternalKey] = useState(null);
  const [mqttClient, setMqttClient] = useState(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [hasReceivedData, setHasReceivedData] = useState(false);
  const [isLiveData, setIsLiveData] = useState(false);
  const [connectionState, setConnectionState] = useState('idle');
  const [hasEverBeenOnline, setHasEverBeenOnline] = useState(false);
  
  // ── Device management ──
  const [availableDevices, setAvailableDevices] = useState([]);
  const [activeDeviceId, setActiveDeviceId] = useState(null);
  const [isSwitchingDevice, setIsSwitchingDevice] = useState(false);
  
  // ── Timeout settings ──
  const [reportInterval, setReportInterval] = useState(1800);
  const [timeoutDuration, setTimeoutDuration] = useState(3600);
  
  // ── Refs ──
  const timeoutCheckInterval = useRef(null);
  const lastDataReceivedTime = useRef(null);
  const initialResponseTimer = useRef(null);
  const hasReceivedDataRef = useRef(false);
  const activeDeviceIdRef = useRef(null);
  const hasEverBeenOnlineRef = useRef(false);
  const sensorDataKeyRef = useRef(null);
  const pendingRequestIds = useRef({});
  const isMountedRef = useRef(true);
  const connectionCheckInterval = useRef(null);
  const hasInitializedRef = useRef(false);
  const unsubscribeRef = useRef(null);
  
  // ── Hybrid status tracking refs ──
  const getStatStartTime = useRef(null);
  const isUsingGetStat = useRef(true);
  const dataCheckIntervalRef = useRef(null);
  const lastGetStatResponseTime = useRef({});
  const lastDataReceivedTimePerDevice = useRef({});
  
  const { isAuthenticated, token, isLoading: authLoading, isSignupFlow } = useAuth();

  // ── Initialize device data structure ──
  const initDeviceData = (deviceId) => {
    if (!devicesData[deviceId]) {
      setDevicesData(prev => ({
        ...prev,
        [deviceId]: {
          sensorData: { ...DEFAULT_SENSOR_DATA },
          actuatorStatus: { ...DEFAULT_ACTUATOR_STATUS },
          cropSettings: { ...DEFAULT_CROP_SETTINGS },
          deviceConfig: { ...DEFAULT_CONFIG },
          devices: [],
          deviceStatus: null,
          deviceStatusFlags: getDefaultDeviceStatus(),
          lastUpdated: null,
          lastDataReceived: null,
          hasReceivedData: false,
          isLiveData: false,
          isOnline: false,
        }
      }));
    }
  };

  // ── Check if device is online from DevStat Bit 17 ──
  const isDeviceOnlineFromDevStat = (deviceStatus) => {
    if (deviceStatus === null || deviceStatus === undefined) return false;
    // Bit 17 (0x00020000) indicates online status
    return !!(deviceStatus & 0x00020000);
  };

  // ── Load selected device from AsyncStorage ──
  const loadSelectedDevice = async () => {
    try {
      const deviceId = await AsyncStorage.getItem(STORAGE_KEYS.SELECTED_DEVICE_ID);
      const deviceName = await AsyncStorage.getItem(STORAGE_KEYS.SELECTED_DEVICE_NAME);
      
      if (deviceId) {
        console.log("📦 Loaded selected device:", deviceId, deviceName);
        setSelectedDeviceId(deviceId);
        setSelectedDeviceName(deviceName || "Device");
        return { deviceId, deviceName };
      }
      return null;
    } catch (error) {
      console.error("❌ Error loading selected device:", error);
      return null;
    }
  };

  // ── Save selected device to AsyncStorage ──
  const saveSelectedDevice = async (deviceId, deviceName) => {
    try {
      if (deviceId) {
        await AsyncStorage.setItem(STORAGE_KEYS.SELECTED_DEVICE_ID, deviceId);
        if (deviceName) {
          await AsyncStorage.setItem(STORAGE_KEYS.SELECTED_DEVICE_NAME, deviceName);
        }
        console.log("💾 Saved selected device:", deviceId, deviceName);
      }
    } catch (error) {
      console.error("❌ Error saving selected device:", error);
    }
  };

  // ── Select/Activate a device for the entire app ──
  const selectDevice = async (deviceId, deviceName) => {
    console.log(`🔌 Selecting device: ${deviceId} (${deviceName})`);
    
    setSelectedDeviceId(deviceId);
    setSelectedDeviceName(deviceName || "Device");
    await saveSelectedDevice(deviceId, deviceName);
    
    // Also update the active device in the identify service
    try {
      const allThings = await getAllThings();
      const device = allThings.find(t => t.id === deviceId);
      if (device) {
        await setActiveDevice(deviceId, device.external_key);
        setActiveDeviceId(deviceId);
        setExternalKey(device.external_key);
        await saveDevice(device.external_key, deviceId);
      }
    } catch (error) {
      console.error("Error updating active device:", error);
    }
    
    // Request status for the selected device
    setTimeout(() => {
      requestDeviceStatus(deviceId);
    }, 1000);
    
    return true;
  };

  // ── Get the currently selected device ID ──
  const getSelectedDeviceId = () => {
    return selectedDeviceId;
  };

  // ── Get the currently selected device name ──
  const getSelectedDeviceName = () => {
    return selectedDeviceName;
  };

  // ── Get data for the selected device ──
  const getSelectedDeviceData = () => {
    if (!selectedDeviceId) return null;
    return devicesData[selectedDeviceId] || null;
  };

  // ── Get sensor data for the selected device ──
  const getSelectedDeviceSensorData = () => {
    if (!selectedDeviceId) return DEFAULT_SENSOR_DATA;
    const data = devicesData[selectedDeviceId];
    return data?.sensorData || DEFAULT_SENSOR_DATA;
  };

  // ── Get actuator status for the selected device ──
  const getSelectedDeviceActuatorStatus = () => {
    if (!selectedDeviceId) return DEFAULT_ACTUATOR_STATUS;
    const data = devicesData[selectedDeviceId];
    return data?.actuatorStatus || DEFAULT_ACTUATOR_STATUS;
  };

  // ── Get crop settings for the selected device ──
  const getSelectedDeviceCropSettings = () => {
    if (!selectedDeviceId) return DEFAULT_CROP_SETTINGS;
    const data = devicesData[selectedDeviceId];
    return data?.cropSettings || DEFAULT_CROP_SETTINGS;
  };

  // ── Get device config for the selected device ──
  const getSelectedDeviceConfig = () => {
    if (!selectedDeviceId) return DEFAULT_CONFIG;
    const data = devicesData[selectedDeviceId];
    return data?.deviceConfig || DEFAULT_CONFIG;
  };

  // ── Get online status for the selected device ──
  const getSelectedDeviceOnlineStatus = () => {
    if (!selectedDeviceId) return false;
    return deviceOnlineStatus[selectedDeviceId] || false;
  };

  // ── Get status for all devices ──
  const requestStatusForAllDevices = async () => {
    const connected = isMqttConnected();
    console.log(`📡 MQTT connection check (service): ${connected}`);
    
    if (!connected) {
      console.log("⚠️ Cannot request status - MQTT not connected");
      try {
        console.log("🔄 Attempting to get fresh client...");
        const freshClient = await getMqttClient();
        if (freshClient && freshClient.connected) {
          console.log("✅ Got fresh connected client");
          setMqttClient(freshClient);
        } else {
          console.log("❌ Could not get connected client");
          return;
        }
      } catch (error) {
        console.error("❌ Error getting fresh client:", error);
        return;
      }
    }

    let currentClient = mqttClient;
    if (!currentClient || !currentClient.connected) {
      try {
        currentClient = await getMqttClient();
        if (currentClient && currentClient.connected) {
          setMqttClient(currentClient);
        } else {
          console.log("❌ MQTT client still not connected, aborting");
          return;
        }
      } catch (error) {
        console.error("❌ Failed to get MQTT client:", error);
        return;
      }
    }
    
    if (!currentClient || !currentClient.connected) {
      console.log("❌ MQTT client not connected, aborting status request");
      return;
    }

    const devices = availableDevices.length > 0 ? availableDevices : await loadAvailableDevices();
    
    if (devices.length === 0) {
      console.log("⚠️ No devices available to request status");
      return;
    }
    
    console.log(`📡 Requesting status for ${devices.length} devices via GET_STAT...`);
    
    getStatStartTime.current = Date.now();
    isUsingGetStat.current = true;
    
    for (const device of devices) {
      const requestId = generateRequestId();
      const topic = `/messages/${device.external_key}/get_stat`;
      const payload = buildGetStatusPayload(requestId);
      
      pendingRequestIds.current[device.external_key] = requestId;
      
      console.log(`📤 GET_STATUS sent to ${device.external_key} (${requestId})`);
      
      try {
        const success = await publishWithRetry(topic, payload, 2);
        if (success) {
          console.log(`✅ Status request sent to ${device.external_key}`);
        } else {
          console.log(`❌ Failed to send status request to ${device.external_key}`);
        }
      } catch (error) {
        console.error(`❌ Error sending status request to ${device.external_key}:`, error);
      }
    }
  };

  // ── Request status for a specific device ──
  const requestDeviceStatus = async (deviceKey) => {
    if (!deviceKey) {
      console.log("⚠️ No device key provided");
      return false;
    }
    
    if (!isMqttConnected()) {
      console.log("⚠️ MQTT not connected");
      return false;
    }
    
    const requestId = generateRequestId();
    const topic = `/messages/${deviceKey}/get_stat`;
    const payload = buildGetStatusPayload(requestId);
    
    pendingRequestIds.current[deviceKey] = requestId;
    
    console.log(`📤 GET_STATUS sent to ${deviceKey} (${requestId})`);
    
    try {
      return await publishWithRetry(topic, payload, 2);
    } catch (error) {
      console.error(`❌ Failed to send status request to ${deviceKey}:`, error);
      return false;
    }
  };

  // ── Subscribe to all device topics ──
  const subscribeToAllDevices = async (client) => {
    if (!client) {
      console.log("⚠️ No client provided for subscription");
      return;
    }

    if (!client.connected) {
      console.log("⏳ Client not connected, waiting...");
      let attempts = 0;
      while (attempts < 20 && !client.connected) {
        await new Promise(resolve => setTimeout(resolve, 500));
        attempts++;
      }
      if (!client.connected) {
        console.log("❌ Client still not connected after waiting");
        return;
      }
    }
    
    const devices = availableDevices.length > 0 ? availableDevices : await loadAvailableDevices();
    
    console.log(`📡 Subscribing to ${devices.length} devices...`);
    
    for (const device of devices) {
      const externalKey = device.external_key;
      
      const dataTopic = `/messages/${externalKey}/data`;
      await subscribeToTopic(client, dataTopic);
      
      const statusTopic = `/messages/${externalKey}/get_stat`;
      await subscribeToTopic(client, statusTopic);
      
      console.log(`✅ Subscribed to topics for device: ${externalKey}`);
    }
  };

  // ── Subscribe helper ──
  const subscribeToTopic = (client, topic) => {
    return new Promise((resolve) => {
      if (!client || !client.connected) {
        console.log(`⚠️ Cannot subscribe to ${topic} - client not connected`);
        resolve(false);
        return;
      }
      
      client.subscribe(topic, { qos: 1 }, (err) => {
        if (err) {
          console.log(`❌ Subscribe error for ${topic}:`, err);
          resolve(false);
        } else {
          console.log(`📡 Subscribed to ${topic}`);
          resolve(true);
        }
      });
    });
  };

  // ── Publish helper ──
  const publish = (topic, message) => {
    return publishWithRetry(topic, message, 2);
  };

  // ── Start data check interval ──
  const startDataCheckInterval = () => {
    if (dataCheckIntervalRef.current) {
      clearInterval(dataCheckIntervalRef.current);
      dataCheckIntervalRef.current = null;
    }

    console.log(`⏳ Starting data check interval (every ${DATA_CHECK_INTERVAL/1000}s)`);

    dataCheckIntervalRef.current = setInterval(() => {
      if (!isMountedRef.current) {
        clearInterval(dataCheckIntervalRef.current);
        dataCheckIntervalRef.current = null;
        return;
      }

      const devices = availableDevices.length > 0 ? availableDevices : [];
      
      for (const device of devices) {
        const deviceKey = device.external_key;
        const lastDataTime = lastDataReceivedTimePerDevice.current[deviceKey] || 0;
        const timeSinceLastData = Date.now() - lastDataTime;
        
        const timeoutMs = (reportInterval || 1800) * 2 * 1000;
        
        if (timeSinceLastData > timeoutMs && lastDataTime > 0) {
          console.log(`⚠️ Device ${deviceKey} - No data received for ${Math.round(timeSinceLastData/1000)}s, marking OFFLINE`);
          setDeviceOnlineStatus(prev => ({
            ...prev,
            [deviceKey]: false
          }));
          setDeviceConnectionStatus(prev => ({
            ...prev,
            [deviceKey]: 'offline'
          }));
          
          if (deviceKey === activeDeviceId) {
            setConnectionState('offline');
          }
        } else if (lastDataTime > 0) {
          console.log(`✅ Device ${deviceKey} - Data received ${Math.round(timeSinceLastData/1000)}s ago, still ONLINE`);
        }
      }
    }, DATA_CHECK_INTERVAL);
  };

  // ── Message Handler ──
  const handleIncomingMessage = (topic, message) => {
    if (!isMountedRef.current) return;
    
    const msgStr = message.toString();
    console.log(`📨 Received on ${topic}: ${msgStr.substring(0, 100)}...`);
    
    const topicParts = topic.split('/');
    if (topicParts.length < 3) return;
    
    const deviceKey = topicParts[2];
    const topicType = topicParts[3] || '';
    
    if (topicType === 'get_stat') {
      handleStatusResponse(deviceKey, msgStr);
      return;
    }
    
    if (topicType === 'data') {
      handleDataMessage(deviceKey, msgStr);
      return;
    }
  };

  // ── Handle Status Response ── (updated to handle JSON response)
  const handleStatusResponse = (deviceKey, msgStr) => {
    try {
      // First try to parse as JSON (for GET_STAT response)
      let parsed = {};
      let isJsonResponse = false;
      
      try {
        const jsonData = JSON.parse(msgStr);
        // If it has cmd and request_id, it's the GET_STAT response (echo)
        if (jsonData.cmd === "GET_STATUS" && jsonData.request_id) {
          console.log(`📊 GET_STAT response (JSON echo) from ${deviceKey}:`, jsonData);
          isJsonResponse = true;
          // The device responded to GET_STAT, but we need to wait for the actual data
          // The actual status will come from the data topic
          console.log(`✅ Device ${deviceKey} responded to GET_STAT (echo)`);
          // Clear pending request
          delete pendingRequestIds.current[deviceKey];
          return;
        }
      } catch (e) {
        // Not JSON, try SenML
      }
      
      // If it's not JSON, try SenML
      if (!isJsonResponse) {
        parsed = parseSenMLToObject(msgStr);
        console.log(`📊 Status response (SenML) from ${deviceKey}:`, parsed);
        
        const requestId = parsed._requestId || parsed.ReqID;
        const expectedId = pendingRequestIds.current[deviceKey];
        
        if (requestId && expectedId && requestId !== expectedId) {
          console.log(`⚠️ Request ID mismatch for ${deviceKey}: expected ${expectedId}, got ${requestId}`);
        }
        
        let isOnline = false;
        if (parsed.deviceStatus !== undefined && parsed.deviceStatus !== null) {
          isOnline = isDeviceOnlineFromDevStat(parsed.deviceStatus);
          console.log(`📡 Device ${deviceKey} online status (from DevStat Bit 17): ${isOnline}`);
        }
        
        if (parsed.deviceStatusFlags && parsed.deviceStatusFlags.online !== undefined) {
          isOnline = parsed.deviceStatusFlags.online;
          console.log(`📡 Device ${deviceKey} online status (from flags): ${isOnline}`);
        }
        
        lastGetStatResponseTime.current[deviceKey] = Date.now();
        updateDeviceData(deviceKey, parsed);
        
        setDeviceOnlineStatus(prev => ({
          ...prev,
          [deviceKey]: isOnline
        }));
        
        setDeviceConnectionStatus(prev => ({
          ...prev,
          [deviceKey]: isOnline ? 'online' : 'offline'
        }));
        
        // Update legacy state for selected device
        const isSelectedDevice = deviceKey === selectedDeviceId || deviceKey === activeDeviceId;
        if (isSelectedDevice) {
          updateLegacyState(parsed);
          setConnectionState(isOnline ? 'online' : 'offline');
          if (isOnline) {
            setHasEverBeenOnline(true);
            hasEverBeenOnlineRef.current = true;
          }
        }
        
        delete pendingRequestIds.current[deviceKey];
        
        console.log(`✅ Device ${deviceKey} status updated: ${isOnline ? 'ONLINE' : 'OFFLINE'}`);
        
        checkAndSwitchToDataMode();
      }
      
    } catch (error) {
      console.error(`❌ Error processing status response for ${deviceKey}:`, error);
    }
  };

  // ── Handle Data Message ── (updated to treat any data as online)
  const handleDataMessage = (deviceKey, msgStr) => {
    try {
      const parsed = parseSenMLToObject(msgStr);
      console.log(`📊 Data from ${deviceKey}:`, parsed);
      
      lastDataReceivedTimePerDevice.current[deviceKey] = Date.now();
      updateDeviceData(deviceKey, parsed);
      
      // ── Check online status from data ──
      let isOnline = false;
      if (parsed.deviceStatus !== undefined && parsed.deviceStatus !== null) {
        isOnline = isDeviceOnlineFromDevStat(parsed.deviceStatus);
      }
      if (parsed.deviceStatusFlags && parsed.deviceStatusFlags.online !== undefined) {
        isOnline = parsed.deviceStatusFlags.online;
      }
      
      // ✅ If we received data, the device is at least communicating
      // If Bit 17 is not set but we're getting data, consider it online
      // This handles devices that don't set Bit 17 correctly
      if (!isOnline && Object.keys(parsed).length > 0) {
        // Check if we have actual sensor data
        const hasSensorData = parsed.ambientTemperature !== undefined || 
                             parsed.ambientHumidity !== undefined ||
                             parsed.waterLevel !== undefined ||
                             parsed.deviceStatus !== undefined;
        if (hasSensorData) {
          console.log(`📡 Device ${deviceKey} has sensor data, marking ONLINE (Bit 17 may not be set)`);
          isOnline = true;
        }
      }
      
      // Update online status
      setDeviceOnlineStatus(prev => ({
        ...prev,
        [deviceKey]: isOnline
      }));
      
      setDeviceConnectionStatus(prev => ({
        ...prev,
        [deviceKey]: isOnline ? 'online' : 'offline'
      }));
      
      setDevicesData(prev => ({
        ...prev,
        [deviceKey]: {
          ...prev[deviceKey],
          lastDataReceived: Date.now(),
          hasReceivedData: true,
          isLiveData: true,
          isOnline: isOnline,
        }
      }));
      
      // Update legacy state for selected device
      const isSelectedDevice = deviceKey === selectedDeviceId || deviceKey === activeDeviceId;
      if (isSelectedDevice) {
        console.log(`📊 Updating legacy state for selected device: ${deviceKey}`);
        updateLegacyState(parsed);
        setConnectionState(isOnline ? 'online' : 'offline');
        if (isOnline) {
          setHasEverBeenOnline(true);
          hasEverBeenOnlineRef.current = true;
        }
        setHasReceivedData(true);
        hasReceivedDataRef.current = true;
        setIsLiveData(true);
        console.log(`✅ Selected device ${deviceKey} data updated, online: ${isOnline}`);
      } else {
        console.log(`📊 Data received for non-selected device: ${deviceKey} (selected: ${selectedDeviceId || activeDeviceId})`);
      }
      
      console.log(`✅ Data received from ${deviceKey}, online: ${isOnline}`);
      
      if (isUsingGetStat.current) {
        console.log(`🔄 Data received during GET_STAT mode - Switching to DATA mode for ${deviceKey}`);
        isUsingGetStat.current = false;
        startDataCheckInterval();
      }
      
    } catch (error) {
      console.error(`❌ Error processing data from ${deviceKey}:`, error);
    }
  };

  // ── Check and switch from GET_STAT to DATA mode ──
  const checkAndSwitchToDataMode = () => {
    if (!isUsingGetStat.current || !getStatStartTime.current) return;
    
    const elapsed = Date.now() - getStatStartTime.current;
    
    if (elapsed >= GET_STAT_ACTIVE_DURATION) {
      console.log(`⏰ GET_STAT mode expired after ${Math.round(elapsed/60000)} minutes - Switching to DATA mode`);
      isUsingGetStat.current = false;
      startDataCheckInterval();
    } else {
      const remaining = Math.round((GET_STAT_ACTIVE_DURATION - elapsed) / 60000);
      console.log(`⏳ GET_STAT mode active - ${remaining} minutes remaining before switching to DATA mode`);
    }
  };

  // ── Update Device Data ──
  const updateDeviceData = (deviceKey, parsed) => {
    const currentData = devicesData[deviceKey] || {
      sensorData: { ...DEFAULT_SENSOR_DATA },
      actuatorStatus: { ...DEFAULT_ACTUATOR_STATUS },
      cropSettings: { ...DEFAULT_CROP_SETTINGS },
      deviceConfig: { ...DEFAULT_CONFIG },
      devices: [],
      deviceStatus: null,
      deviceStatusFlags: getDefaultDeviceStatus(),
      lastUpdated: null,
    };
    
    let updatedSensorData = { ...currentData.sensorData };
    let updatedActuatorStatus = { ...currentData.actuatorStatus };
    let updatedDevices = [...currentData.devices];
    let newDeviceStatus = currentData.deviceStatus;
    let newDeviceStatusFlags = currentData.deviceStatusFlags;
    let hasSensorUpdate = false;
    let hasActuatorUpdate = false;
    
    for (const [key, value] of Object.entries(parsed)) {
      if (key.startsWith('_')) continue;
      
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
      
      if (key === 'deviceStatusFlags') {
        newDeviceStatusFlags = value;
      }
      
      if (['water_pump', 'water_ILvalve', 'water_OLvalve', 
           'nutrient_pump', 'reboot_ack'].includes(key)) {
        updatedActuatorStatus[key] = value;
        updatedSensorData[key] = value;
        hasActuatorUpdate = true;
        hasSensorUpdate = true;
      }
    }
    
    if (hasSensorUpdate || hasActuatorUpdate) {
      const now = new Date();
      updatedSensorData.lastUpdated = now;
      updatedActuatorStatus.lastUpdated = now;
    }
    
    if (hasActuatorUpdate) {
      updatedDevices = Object.entries(updatedActuatorStatus)
        .filter(([key]) => key in DEVICE_CONFIG && key !== 'lastUpdated')
        .map(([key, value]) => {
          const config = DEVICE_CONFIG[key];
          return {
            id: key,
            n: key,
            vb: value || false,
            displayName: config.displayName,
            icon: config.icon,
            description: config.description,
            category: config.category,
          };
        });
    }
    
    setDevicesData(prev => ({
      ...prev,
      [deviceKey]: {
        ...currentData,
        sensorData: updatedSensorData,
        actuatorStatus: updatedActuatorStatus,
        devices: updatedDevices,
        deviceStatus: newDeviceStatus,
        deviceStatusFlags: newDeviceStatusFlags,
        lastUpdated: new Date(),
        lastDataReceived: Date.now(),
        hasReceivedData: true,
        isLiveData: true,
      }
    }));
  };

  // ── Update Legacy State ──
  const updateLegacyState = (parsed) => {
    const updatedSensorData = { ...sensorData };
    const updatedActuatorStatus = { ...actuatorStatus };
    let hasSensorUpdate = false;
    let hasActuatorUpdate = false;
    let newDeviceStatus = deviceStatus;
    
    for (const [key, value] of Object.entries(parsed)) {
      if (key.startsWith('_')) continue;
      
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
      
      if (key === 'deviceStatusFlags') {
        setDeviceStatusFlags(value);
      }
      
      if (['water_pump', 'water_ILvalve', 'water_OLvalve', 
           'nutrient_pump', 'reboot_ack'].includes(key)) {
        updatedSensorData[key] = value;
        updatedActuatorStatus[key] = value;
        hasActuatorUpdate = true;
        hasSensorUpdate = true;
      }
    }
    
    if (hasSensorUpdate) {
      updatedSensorData.lastUpdated = new Date();
      setSensorData(updatedSensorData);
      console.log(`📊 Updated sensorData:`, updatedSensorData);
    }
    
    if (hasActuatorUpdate) {
      updatedActuatorStatus.lastUpdated = new Date();
      setActuatorStatus(updatedActuatorStatus);
    }
    
    if (newDeviceStatus !== null) {
      setDeviceStatus(newDeviceStatus);
    }
  };

  // ── Load Available Devices ──
  const loadAvailableDevices = async () => {
    try {
      const things = await getAllThings();
      if (things && things.length > 0) {
        setAvailableDevices(things);
        
        for (const thing of things) {
          initDeviceData(thing.external_key);
          setDeviceConnectionStatus(prev => ({
            ...prev,
            [thing.external_key]: 'connecting'
          }));
        }
        
        const savedDeviceId = await AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_DEVICE_ID);
        const savedKey = await AsyncStorage.getItem(STORAGE_KEYS.EXTERNAL_KEY);
        
        let active = null;
        if (savedDeviceId && savedKey) {
          const exists = things.find(t => t.id === savedDeviceId);
          if (exists) {
            active = { publisherId: savedDeviceId, externalKey: savedKey };
            setActiveDeviceId(savedDeviceId);
            setExternalKey(savedKey);
          }
        }
        
        if (!active) {
          active = await getActiveDevice();
        }
        
        if (active && active.publisherId) {
          const exists = things.find(t => t.id === active.publisherId);
          if (exists) {
            setActiveDeviceId(active.publisherId);
            setExternalKey(active.externalKey);
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
        
        return things;
      }
      return [];
    } catch (error) {
      console.error("Error loading available devices:", error);
      return [];
    }
  };

  // ── Save Device ──
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

  // ── Initialize MQTT ──
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
    
    await loadAvailableDevices();
    
    // Load selected device from storage
    await loadSelectedDevice();
    
    const storedKey = await AsyncStorage.getItem(STORAGE_KEYS.EXTERNAL_KEY);
    
    if (!storedKey) {
      console.log("⚠️ No external_key found - Skipping MQTT connection");
      setExternalKey(null);
      setIsReady(true);
      setConnectionState('idle');
      return;
    }

    console.log("✅ external_key found, proceeding with MQTT connection");
    setConnectionState('connecting');
    setIsInitializing(true);
    
    try {
      await restoreAllDevicesData();
      
      setExternalKey(storedKey);
      console.log("🔑 externalKey set in state:", storedKey);

      await updateMqttPassword(storedKey);
      console.log("✅ MQTT password updated");

      await cleanupMqtt();

      const client = await getMqttClient();
      console.log("📡 MQTT client obtained, connected:", client.connected);
      setMqttClient(client);

      client.removeAllListeners();
      
      client.on("connect", async () => {
        if (!isMountedRef.current) return;
        console.log("✅ MQTT Connected event fired");
        setIsConnected(true);
        setConnectionState('waiting');
        hasInitializedRef.current = true;
        
        setMqttClient(client);
        
        await new Promise(resolve => setTimeout(resolve, 1500));
        await subscribeToAllDevices(client);
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        console.log("📡 Requesting status from all devices...");
        await requestStatusForAllDevices();
      });

      client.on("close", () => {
        if (isMountedRef.current) {
          console.log("🔌 MQTT Disconnected");
          setIsConnected(false);
          setConnectionState('disconnected');
          hasInitializedRef.current = false;
        }
      });

      client.on("reconnect", () => console.log("🔄 MQTT Reconnecting..."));
      client.on("error", (err) => console.log("❌ MQTT Error:", err));
      client.on("message", handleIncomingMessage);

      if (client.connected) {
        console.log("✅ Client already connected");
        setIsConnected(true);
        setConnectionState('waiting');
        hasInitializedRef.current = true;
        
        setMqttClient(client);
        
        await new Promise(resolve => setTimeout(resolve, 1500));
        await subscribeToAllDevices(client);
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        console.log("📡 Requesting status from all devices...");
        await requestStatusForAllDevices();
        
        setIsReady(true);
        setIsInitializing(false);
      }

      setIsReady(true);

    } catch (error) {
      console.error("❌ Error in MQTT initialization:", error);
      setIsReady(true);
      setConnectionState('error');
    } finally {
      setIsInitializing(false);
    }
  };

  // ── Restore All Devices Data ──
  const restoreAllDevicesData = async () => {
    try {
      const cached = await loadLastData();
      if (!cached) {
        console.log("🗂️ No cached MQTT snapshot found");
        return false;
      }

      if (cached.devicesData) {
        setDevicesData(cached.devicesData);
        console.log("🗂️ Restored data for", Object.keys(cached.devicesData).length, "devices");
      }

      if (cached.deviceConnectionStatus) {
        setDeviceConnectionStatus(cached.deviceConnectionStatus);
      }

      if (cached.deviceOnlineStatus) {
        setDeviceOnlineStatus(cached.deviceOnlineStatus);
      }

      if (cached.sensorData) {
        const restored = { ...cached.sensorData };
        if (restored.lastUpdated) restored.lastUpdated = new Date(restored.lastUpdated);
        setSensorData(restored);
      }

      if (cached.actuatorStatus) {
        const restored = { ...cached.actuatorStatus };
        if (restored.lastUpdated) restored.lastUpdated = new Date(restored.lastUpdated);
        setActuatorStatus(restored);
      }

      if (cached.cropSettings) {
        const restored = { ...cached.cropSettings };
        if (restored.lastUpdated) restored.lastUpdated = new Date(restored.lastUpdated);
        setCropSettings(restored);
      }

      if (cached.deviceConfig) {
        const restored = { ...cached.deviceConfig };
        if (restored.lastUpdated) restored.lastUpdated = new Date(restored.lastUpdated);
        setDeviceConfig(restored);
      }

      console.log("🗂️ Restored last MQTT snapshot from AsyncStorage");
      return true;
    } catch (error) {
      console.error("❌ Error restoring last MQTT snapshot:", error);
      return false;
    }
  };

  // ── Persist Data ──
  const persistTimer = useRef(null);
  useEffect(() => {
    const hasRealData = Object.keys(devicesData).length > 0;
    if (!hasRealData) return;

    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      saveLastData({
        devicesData,
        deviceConnectionStatus,
        deviceOnlineStatus,
        sensorData,
        actuatorStatus,
        cropSettings,
        deviceConfig,
        savedAt: Date.now(),
      });
    }, 600);

    return () => {
      if (persistTimer.current) clearTimeout(persistTimer.current);
    };
  }, [devicesData, deviceConnectionStatus, deviceOnlineStatus, sensorData, actuatorStatus, cropSettings, deviceConfig]);

  // ── Cleanup ──
  const cleanupMqtt = async () => {
    if (timeoutCheckInterval.current) {
      clearInterval(timeoutCheckInterval.current);
      timeoutCheckInterval.current = null;
    }
    if (connectionCheckInterval.current) {
      clearInterval(connectionCheckInterval.current);
      connectionCheckInterval.current = null;
    }
    if (dataCheckIntervalRef.current) {
      clearInterval(dataCheckIntervalRef.current);
      dataCheckIntervalRef.current = null;
    }
    if (mqttClient) {
      try {
        const devices = availableDevices.length > 0 ? availableDevices : await loadAvailableDevices();
        for (const device of devices) {
          const topics = [
            `/messages/${device.external_key}/data`,
            `/messages/${device.external_key}/get_stat`,
          ];
          for (const topic of topics) {
            mqttClient.unsubscribe(topic, (err) => {
              if (err) console.log(`⚠️ Error unsubscribing from ${topic}:`, err);
            });
          }
        }
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
    setIsLiveData(false);
    setDeviceStatus(null);
    setConnectionState('idle');
    
    isUsingGetStat.current = true;
    getStatStartTime.current = null;
  };

  // ── Connect to Specific Device ──
  const connectToDevice = async (deviceId, externalKey) => {
    console.log(`🔌 Connecting to device: ${deviceId} (${externalKey})`);
    
    setActiveDeviceId(deviceId);
    setExternalKey(externalKey);
    await saveDevice(externalKey, deviceId);
    
    await forceReconnect(externalKey);
    
    return true;
  };

  // ── Force Reconnect ──
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
      
      await cleanupMqtt();
      setIsConnected(false);
      
      if (newKey) {
        console.log("🔄 Calling reconnectMqttClient with new key...");
        await reconnectMqttClient(newKey);
      } else {
        console.log("🔄 Calling reconnectMqttClient...");
        await reconnectMqttClient();
      }
      
      await initializeMqtt();
      
      console.log(`✅ Force reconnect completed. isConnected: ${isConnected}`);
    } catch (error) {
      console.error("❌ Force reconnect error:", error);
      throw error;
    }
  };

  // ── Switch to Device ──
  const switchToDevice = async (thingId, externalKey) => {
    console.log(`🔄 Switching to device: ${thingId} (${externalKey})`);
    
    setIsSwitchingDevice(true);
    
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.PUBLISHER_ID, String(thingId));
      await AsyncStorage.setItem(STORAGE_KEYS.EXTERNAL_KEY, externalKey);
      await AsyncStorage.setItem(STORAGE_KEYS.ACTIVE_DEVICE_ID, thingId);
      
      setActiveDeviceId(thingId);
      setExternalKey(externalKey);
      
      await forceReconnect(externalKey);
      
      console.log("✅ Successfully switched to device:", thingId);
      setIsSwitchingDevice(false);
      return true;
    } catch (error) {
      console.error("❌ Error switching device:", error);
      setIsSwitchingDevice(false);
      return false;
    }
  };

  // ── Get Device Data ──
  const getDeviceData = (deviceKey) => {
    return devicesData[deviceKey] || null;
  };

  // ── Get Device Status ──
  const getDeviceStatus = (deviceKey) => {
    return deviceOnlineStatus[deviceKey] || false;
  };

  // ── Publish Actuator Status ──
  const publishActuatorStatus = async (deviceKey, status) => {
    if (!deviceKey) {
      console.log("⚠️ No device key provided");
      return false;
    }
    
    const payload = buildActuatorPayload(status);
    const success = await publish(`/messages/${deviceKey}/actuator`, JSON.stringify(payload));
    
    if (success) {
      console.log(`✅ Actuator published to ${deviceKey}`);
      
      setDevicesData(prev => ({
        ...prev,
        [deviceKey]: {
          ...prev[deviceKey],
          actuatorStatus: { ...status, lastUpdated: new Date() },
        }
      }));
      
      if (deviceKey === activeDeviceId) {
        setActuatorStatus({ ...status, lastUpdated: new Date() });
      }
    }
    return success;
  };

  // ── Publish Settings ──
  const publishSettings = async (deviceKey, settings) => {
    if (!deviceKey) {
      console.log("⚠️ No device key provided");
      return false;
    }
    
    const payload = buildSettingsPayload(settings, deviceKey);
    const success = await publish(`/messages/${deviceKey}/settings`, JSON.stringify(payload));
    
    if (success) {
      console.log(`✅ Settings published to ${deviceKey}`);
      
      setDevicesData(prev => ({
        ...prev,
        [deviceKey]: {
          ...prev[deviceKey],
          cropSettings: { ...settings, lastUpdated: new Date() },
        }
      }));
      
      if (deviceKey === activeDeviceId) {
        setCropSettings({ ...settings, lastUpdated: new Date() });
      }
    }
    return success;
  };

  // ── Publish Config ──
  const publishConfig = async (deviceKey, config) => {
    if (!deviceKey) {
      console.log("⚠️ No device key provided");
      return false;
    }
    
    const payload = buildConfigPayload(deviceKey, config);
    const success = await publish(`/messages/${deviceKey}/cfg`, JSON.stringify(payload));
    
    if (success) {
      console.log(`✅ Config published to ${deviceKey}`);
      
      setDevicesData(prev => ({
        ...prev,
        [deviceKey]: {
          ...prev[deviceKey],
          deviceConfig: { ...config, lastUpdated: new Date() },
        }
      }));
      
      if (deviceKey === activeDeviceId) {
        setDeviceConfig({ ...config, lastUpdated: new Date() });
      }
    }
    return success;
  };

  // ── Auth Effect ──
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
    };
  }, [isAuthenticated, token, authLoading, isSignupFlow]);

  // ── Load Saved Device ──
  const loadSavedDevice = async () => {
    try {
      const savedKey = await AsyncStorage.getItem(STORAGE_KEYS.EXTERNAL_KEY);
      const savedDeviceId = await AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_DEVICE_ID);
      
      if (savedKey) {
        console.log("📦 Loaded saved external_key:", savedKey);
        setExternalKey(savedKey);
      }
      
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

  // ── Reconnect ──
  const reconnect = async () => {
    console.log("🔄 Attempting to reconnect MQTT...");
    hasInitializedRef.current = false;
    await cleanupMqtt();
    await initializeMqtt();
  };

  // ── Context Value ──
  const contextValue = {
    // Multi-device data
    devicesData,
    deviceConnectionStatus,
    deviceOnlineStatus,
    availableDevices,
    getDeviceData,
    getDeviceStatus,
    connectToDevice,
    switchToDevice,
    requestDeviceStatus,
    requestStatusForAllDevices,
    publishActuatorStatus,
    publishSettings,
    publishConfig,
    
    // Selected device
    selectedDeviceId,
    selectedDeviceName,
    selectDevice,
    getSelectedDeviceId,
    getSelectedDeviceName,
    getSelectedDeviceData,
    getSelectedDeviceSensorData,
    getSelectedDeviceActuatorStatus,
    getSelectedDeviceCropSettings,
    getSelectedDeviceConfig,
    getSelectedDeviceOnlineStatus,
    
    // Legacy single-device data
    sensorData,
    actuatorStatus,
    cropSettings,
    deviceConfig,
    devices,
    deviceStatus,
    deviceStatusFlags,
    
    // Connection state
    isConnected,
    isReady,
    externalKey,
    hasReceivedData,
    isLiveData,
    connectionState,
    hasEverBeenOnline,
    reportInterval,
    timeoutDuration,
    activeDeviceId,
    isSwitchingDevice,
    isInitializing,
    
    // Actions
    publish,
    publishWithRetry: async (topic, msg, retries = 3) => publishWithRetry(topic, msg, retries),
    reconnect,
    forceReconnect,
    loadAvailableDevices,
    debugMqttState: () => {
      console.log("=== MQTT STATE DEBUG ===");
      console.log("mqttClient exists:", !!mqttClient);
      console.log("isConnected:", isConnected);
      console.log("connectionState:", connectionState);
      console.log("availableDevices:", availableDevices.length);
      console.log("devicesData:", Object.keys(devicesData).length);
      console.log("deviceConnectionStatus:", deviceConnectionStatus);
      console.log("deviceOnlineStatus:", deviceOnlineStatus);
      console.log("selectedDeviceId:", selectedDeviceId);
      console.log("selectedDeviceName:", selectedDeviceName);
      console.log("isUsingGetStat:", isUsingGetStat.current);
      console.log("getStatStartTime:", getStatStartTime.current);
      console.log("=== END DEBUG ===");
    },
    toggleDeviceStatus: async (deviceKey, deviceName, status) => {
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
      
      const currentData = devicesData[deviceKey];
      const currentStatus = currentData?.actuatorStatus || {};
      
      const updatedStatus = {
        ...currentStatus,
        [actuatorKey]: status,
      };
      
      return await publishActuatorStatus(deviceKey, updatedStatus);
    },
    
    // Legacy setters
    updateSensorData: (data) => setSensorData(prev => ({ ...prev, ...data, lastUpdated: new Date() })),
    updateActuatorStatus: (status) => setActuatorStatus(prev => ({ ...prev, ...status, lastUpdated: new Date() })),
    updateCropSettings: async (settings) => {
      if (!activeDeviceId) return false;
      return await publishSettings(activeDeviceId, { ...cropSettings, ...settings });
    },
    updateDeviceConfig: async (config) => {
      if (!activeDeviceId) return false;
      return await publishConfig(activeDeviceId, { ...deviceConfig, ...config });
    },
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