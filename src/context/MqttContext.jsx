// src/context/MqttContext.jsx
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
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
import { getDefaultDeviceStatus, parseDeviceStatus } from "../utils/deviceStatusParser";
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
  ac_stat: null,
  soilMoisture: null,
  cropId: null,
  lastUpdated: null,
};

const DEFAULT_ACTUATOR_STATUS = {
  water_pump: null,
  water_ILvalve: null,
  water_OLvalve: null,
  nutrient_pump: null,
  ac_stat: null,
  // Timing fields (milliseconds)
  water_pump_on_time: null,   // WPONT
  water_pump_interval: null,  // WPINT
  nutrient_pump_duration: null, // NP_DI
  nutrient_pump_on_time: null,  // NP_OT
  lastUpdated: null,
};

const DEFAULT_CROP_SETTINGS = {
  CropId: null,
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
  ac_stat: {
    displayName: "AC Status",
    icon: "thermometer",
    description: "AC control status",
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
  SELECTED_EXTERNAL_KEY: 'selected_external_key',
};

// ── Constants ──
const GET_STAT_ACTIVE_DURATION = 10 * 60 * 1000;
const DATA_CHECK_INTERVAL = 30 * 1000;
const OFFLINE_GRACE_PERIOD = 120 * 1000; // 120s grace before marking offline (prevents flicker on reconnect)

// ── Helper Functions ──
function parseActuatorToDevices(raw) {
  try {
    const records = JSON.parse(raw);
    const result = [];
    const actuatorNameMap = {
      WatPmp: "water_pump",
      Wat_ILV: "water_ILvalve",
      Wat_OLV: "water_OLvalve",
      NUT_PMP: "nutrient_pump",
      AC_Stat: "ac_stat",
    };
    const timingNameMap = {
      WPONT: "water_pump_on_time",
      WPINT: "water_pump_interval",
      NP_DI: "nutrient_pump_duration",
      NP_OT: "nutrient_pump_on_time",
    };
    for (const r of records) {
      if (!r.n) continue;
      // Handle timing fields
      if (r.n in timingNameMap && r.v !== undefined) {
        result.push({ timingKey: timingNameMap[r.n], value: r.v });
        continue;
      }
      if (r.vb === undefined) continue;
      const deviceName = actuatorNameMap[r.n] || r.n;
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

function buildActuatorPayload(status, externalKey, previousStatus = {}) {
  const p = (key, def) => status[key] ?? previousStatus[key] ?? def;
  const payload = [
    { n: "WatPmp", vb: p('water_pump', false) },
    { n: "WPONT", v: p('water_pump_on_time', 10) },
    { n: "WPINT", v: p('water_pump_interval', 60) },
    { n: "Wat_ILV", vb: p('water_ILvalve', false) },
    { n: "Wat_OLV", vb: p('water_OLvalve', false) },
    { n: "NUT_PMP", vb: p('nutrient_pump', false) },
    { n: "NP_DI", v: p('nutrient_pump_duration', 120) },
    { n: "NP_OT", v: p('nutrient_pump_on_time', 5) },
    { n: "AC_Stat", vb: p('ac_stat', false) },
  ];
  return payload;
}

function buildSettingsPayload(settings, externalKey) {
  return [
    { bn: `urn:dev:${externalKey}:`, bt: Math.floor(Date.now() / 1000) },
    { n: "CropId", v: settings.CropId ?? 0 },
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

function buildConfigPayload(deviceId, config, previousConfig = {}) {
  const reportInterval = config.report_interval ?? previousConfig.report_interval ?? 120;
  const samplingInterval = config.sampling_interval ?? previousConfig.sampling_interval ?? 30;
  const autoMode = config.auto_mode ?? previousConfig.auto_mode ?? false;
  // ✅ Always default BootAck to false — only publishReboot should set this to true
  const bootAck = config.boot_ack ?? false;

  return [
    { n: "RPT_INT", v: reportInterval },
    { n: "SAMP_INT", v: samplingInterval },
    { n: "AutoMode", vb: autoMode },
    { n: "BootAck", vb: bootAck },
  ];
} 

const generateRequestId = () => {
  return Math.random().toString(16).substring(2, 10).toUpperCase();
};

const buildGetStatusPayload = (requestId) => {
  return JSON.stringify([
    {
      cmd: "GET_STATUS",
      request_id: requestId
    }
  ]);
};

export const MqttProvider = ({ children }) => {
  const [devicesData, setDevicesData] = useState({});
  const [deviceConnectionStatus, setDeviceConnectionStatus] = useState({});
  const [deviceOnlineStatus, setDeviceOnlineStatus] = useState({});
  
  const [selectedDeviceId, setSelectedDeviceId] = useState(null);
  const [selectedDeviceName, setSelectedDeviceName] = useState(null);
  const [selectedExternalKey, setSelectedExternalKey] = useState(null);
  
  const [sensorData, setSensorData] = useState(DEFAULT_SENSOR_DATA);
  const [actuatorStatus, setActuatorStatus] = useState(DEFAULT_ACTUATOR_STATUS);
  const [cropSettings, setCropSettings] = useState(DEFAULT_CROP_SETTINGS);
  const [deviceConfig, setDeviceConfig] = useState(DEFAULT_CONFIG);
  const [devices, setDevices] = useState([]);
  const [deviceStatus, setDeviceStatus] = useState(null);
  const [deviceStatusFlags, setDeviceStatusFlags] = useState(getDefaultDeviceStatus());
  
  const [isConnected, setIsConnected] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [externalKey, setExternalKey] = useState(null);
  const [mqttClient, setMqttClient] = useState(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [hasReceivedData, setHasReceivedData] = useState(false);
  const [isLiveData, setIsLiveData] = useState(false);
  const [connectionState, setConnectionState] = useState('idle');
  const [hasEverBeenOnline, setHasEverBeenOnline] = useState(false);
  
  const [availableDevices, setAvailableDevices] = useState([]);
  const [activeDeviceId, setActiveDeviceId] = useState(null);
  const [isSwitchingDevice, setIsSwitchingDevice] = useState(false);
  
  const [reportInterval, setReportInterval] = useState(1800);
  const [timeoutDuration, setTimeoutDuration] = useState(3600);
  
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
  
  // ✅ Refs to avoid stale closures in MQTT handlers
  const externalKeyRef = useRef(null);
  const selectedExternalKeyRef = useRef(null);
  const selectedDeviceIdRef = useRef(null);
  const availableDevicesRef = useRef([]);
  
  const getStatStartTime = useRef(null);
  const isUsingGetStat = useRef(true);
  const dataCheckIntervalRef = useRef(null);
  const lastGetStatResponseTime = useRef({});
  const lastDataReceivedTimePerDevice = useRef({});
  const lastOnlineTimePerDevice = useRef({}); // Tracks last time device was confirmed online
  
  const { isAuthenticated, token, isLoading: authLoading, isSignupFlow } = useAuth();

  // ✅ Keep refs in sync with state (avoids stale closures in MQTT handlers)
  useEffect(() => { externalKeyRef.current = externalKey; }, [externalKey]);
  useEffect(() => { selectedExternalKeyRef.current = selectedExternalKey; }, [selectedExternalKey]);
  useEffect(() => { selectedDeviceIdRef.current = selectedDeviceId; }, [selectedDeviceId]);
  useEffect(() => { availableDevicesRef.current = availableDevices; }, [availableDevices]);

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

  const isDeviceOnlineFromDevStat = (deviceStatus) => {
    if (deviceStatus === null || deviceStatus === undefined) return false;
    return !!(deviceStatus & 0x00010000); // Bit 16 = online (new firmware layout)
  };

  // ── Check if external key matches selected device ──
  const isSelectedExternalKey = useCallback((extKey) => {
    if (!extKey) return false;
    // ✅ Use refs to avoid stale closures from MQTT handlers
    const selKey = selectedExternalKeyRef.current;
    const extK = externalKeyRef.current;
    const selDevId = selectedDeviceIdRef.current;
    const devList = availableDevicesRef.current;
    if (extKey === selKey) return true;
    if (extKey === extK) return true;
    if (selDevId) {
      const device = devList.find(d => d.id === selDevId);
      if (device && device.external_key === extKey) return true;
    }
    return false;
  }, [selectedExternalKey, selectedDeviceId, availableDevices]);

  // ── Load selected device from AsyncStorage ──
  const loadSelectedDevice = async () => {
    try {
      const deviceId = await AsyncStorage.getItem(STORAGE_KEYS.SELECTED_DEVICE_ID);
      const deviceName = await AsyncStorage.getItem(STORAGE_KEYS.SELECTED_DEVICE_NAME);
      const extKey = await AsyncStorage.getItem(STORAGE_KEYS.SELECTED_EXTERNAL_KEY);
      
      console.log("📦 Loading selected device:", { deviceId, deviceName, extKey });
      
      if (deviceId) {
        setSelectedDeviceId(deviceId);
        // ✅ Resolve name: stored → device list → fallback
        let resolvedName = deviceName;
        if (!resolvedName) {
          // Try availableDevices state first (may be stale but sometimes populated)
          const dev = availableDevices.find(d => d.id === deviceId);
          resolvedName = dev?.name || dev?.device_name || `Device ${deviceId.slice(-4)}`;
        }
        setSelectedDeviceName(resolvedName);
        // ✅ Always save resolved name back to AsyncStorage
        if (resolvedName) {
          await AsyncStorage.setItem(STORAGE_KEYS.SELECTED_DEVICE_NAME, resolvedName);
        }
        
        if (extKey) {
          setSelectedExternalKey(extKey);
          console.log("✅ Using stored external key:", extKey);
          return { deviceId, deviceName: resolvedName, externalKey: extKey };
        }
        
        const device = availableDevices.find(d => d.id === deviceId);
        if (device && device.external_key) {
          setSelectedExternalKey(device.external_key);
          await AsyncStorage.setItem(STORAGE_KEYS.SELECTED_EXTERNAL_KEY, device.external_key);
          console.log("✅ Found external key from devices:", device.external_key);
          return { deviceId, deviceName: resolvedName, externalKey: device.external_key };
        }
        
        const storedKey = await AsyncStorage.getItem(STORAGE_KEYS.EXTERNAL_KEY);
        if (storedKey) {
          setSelectedExternalKey(storedKey);
          await AsyncStorage.setItem(STORAGE_KEYS.SELECTED_EXTERNAL_KEY, storedKey);
          console.log("✅ Using main external_key:", storedKey);
          return { deviceId, deviceName, externalKey: storedKey };
        }
        
        return { deviceId, deviceName, externalKey: null };
      }
      return null;
    } catch (error) {
      console.error("❌ Error loading selected device:", error);
      return null;
    }
  };

  // ── Save selected device ──
  const saveSelectedDevice = async (deviceId, deviceName, extKey) => {
    try {
      if (deviceId) {
        await AsyncStorage.setItem(STORAGE_KEYS.SELECTED_DEVICE_ID, deviceId);
        if (deviceName) {
          await AsyncStorage.setItem(STORAGE_KEYS.SELECTED_DEVICE_NAME, deviceName);
        }
        if (extKey) {
          await AsyncStorage.setItem(STORAGE_KEYS.SELECTED_EXTERNAL_KEY, extKey);
        }
        console.log("💾 Saved selected device:", deviceId, deviceName, "ext:", extKey);
      }
    } catch (error) {
      console.error("❌ Error saving selected device:", error);
    }
  };

  // ── Select/Activate a device ──
  const selectDevice = async (deviceId, deviceName) => {
    console.log(`🔌 Selecting device: ${deviceId} (${deviceName})`);
    
    let device = availableDevices.find(d => d.id === deviceId);
    if (!device) {
      console.log("🔄 Device not in availableDevices, refreshing...");
      const refreshedDevices = await loadAvailableDevices();
      device = refreshedDevices.find(d => d.id === deviceId);
      if (!device) {
        console.error("❌ Device not found after refresh:", deviceId);
        return false;
      }
    }
    
    const extKey = device.external_key;
    const resolvedName = deviceName || device.name || device.device_name || `Device ${deviceId.slice(-4)}`;
    console.log(`📌 Device external key: ${extKey}, name: ${resolvedName}`);
    
    setSelectedDeviceId(deviceId);
    setSelectedDeviceName(resolvedName);
    setSelectedExternalKey(extKey);
    await saveSelectedDevice(deviceId, resolvedName, extKey);
    
    try {
      await setActiveDevice(deviceId, extKey);
      setActiveDeviceId(deviceId);
      setExternalKey(extKey);
      await saveDevice(extKey, deviceId);
    } catch (error) {
      console.error("Error updating active device:", error);
    }
    
    setTimeout(() => {
      console.log(`📡 Requesting status for selected device: ${extKey}`);
      requestDeviceStatus(extKey);
    }, 1000);
    
    console.log(`✅ Device selected with external key: ${extKey}`);
    return true;
  };

  const getSelectedDeviceId = () => selectedDeviceId;
  const getSelectedDeviceName = () => selectedDeviceName;
  const getSelectedExternalKey = () => selectedExternalKey;

  const getSelectedDeviceData = () => {
    const key = selectedExternalKey || externalKey;
    if (!key) return null;
    return devicesData[key] || null;
  };

  // ✅ Use selectedExternalKey, falling back to externalKey
  const getSelectedDeviceSensorData = () => {
    const key = selectedExternalKey || externalKey;
    if (!key) return DEFAULT_SENSOR_DATA;
    const data = devicesData[key];
    return data?.sensorData || DEFAULT_SENSOR_DATA;
  };

  const getSelectedDeviceActuatorStatus = () => {
    const key = selectedExternalKey || externalKey;
    if (!key) return DEFAULT_ACTUATOR_STATUS;
    const data = devicesData[key];
    return data?.actuatorStatus || DEFAULT_ACTUATOR_STATUS;
  };

  const getSelectedDeviceCropSettings = () => {
    const key = selectedExternalKey || externalKey;
    if (!key) return DEFAULT_CROP_SETTINGS;
    const data = devicesData[key];
    return data?.cropSettings || DEFAULT_CROP_SETTINGS;
  };

  const getSelectedDeviceConfig = () => {
    const key = selectedExternalKey || externalKey;
    if (!key) return DEFAULT_CONFIG;
    const data = devicesData[key];
    return data?.deviceConfig || DEFAULT_CONFIG;
  };

  const getSelectedDeviceOnlineStatus = () => {
    const key = selectedExternalKey || externalKey;
    if (!key) return false;
    return deviceOnlineStatus[key] || false;
  };

  const requestStatusForAllDevices = async () => {
    const connected = isMqttConnected();
    console.log(`📡 MQTT connection check: ${connected}`);
    
    if (!connected) {
      console.log("⚠️ Cannot request status - MQTT not connected");
      try {
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
          console.log("❌ MQTT client still not connected");
          return;
        }
      } catch (error) {
        console.error("❌ Failed to get MQTT client:", error);
        return;
      }
    }
    
    if (!currentClient || !currentClient.connected) {
      console.log("❌ MQTT client not connected");
      return;
    }

    const devices = availableDevices.length > 0 ? availableDevices : await loadAvailableDevices();
    
    if (devices.length === 0) {
      console.log("⚠️ No devices available");
      return;
    }
    
    console.log(`📡 Requesting status for ${devices.length} devices`);
    
    getStatStartTime.current = Date.now();
    isUsingGetStat.current = true;
    
    for (const device of devices) {
      const requestId = generateRequestId();
      const topic = `/messages/${device.external_key}/get_stat`;
      const payload = buildGetStatusPayload(requestId);
      
      pendingRequestIds.current[device.external_key] = requestId;
      console.log(`📤 GET_STATUS to ${device.external_key} (${requestId})`);
      
      try {
        await publishWithRetry(topic, payload, 2);
      } catch (error) {
        console.error(`❌ Error sending status to ${device.external_key}:`, error);
      }
    }
  };

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
    console.log(`📤 GET_STATUS to ${deviceKey} (${requestId})`);
    
    try {
      return await publishWithRetry(topic, payload, 2);
    } catch (error) {
      console.error(`❌ Failed to send status to ${deviceKey}:`, error);
      return false;
    }
  };

  // ✅ Quick status check: sends GET_STATUS to all devices, waits 3s for responses
  // Devices that respond are marked online; others are marked offline
  const quickStatusCheck = async () => {
    console.log("⚡ Quick status check started (3s timeout)");
    
    const devices = availableDevices.length > 0 ? availableDevices : await loadAvailableDevices();
    if (devices.length === 0) {
      console.log("⚠️ No devices for quick status check");
      return;
    }
    
    // Send GET_STATUS to all devices
    for (const device of devices) {
      try {
        await requestDeviceStatus(device.external_key);
      } catch (e) {
        console.error(`❌ Quick check failed for ${device.external_key}`);
      }
    }
    
    // Wait 3 seconds for responses
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Mark devices that didn't respond as offline
    for (const device of devices) {
      const deviceKey = device.external_key;
      const lastResponse = lastGetStatResponseTime.current[deviceKey] || 0;
      const responded = lastResponse > (Date.now() - 5000); // responded within last 5s
      const hasCachedData = devicesData[deviceKey]?.hasReceivedData;
      
      if (!responded) {
        // ✅ If we have cached data, preserve the online state — don't flicker
        if (hasCachedData) {
          console.log(`⏳ Device ${deviceKey} no response but has cached data — keeping current state`);
          continue;
        }
        // ✅ Only mark offline for devices we've never heard from
        const lastOnline = lastOnlineTimePerDevice.current[deviceKey] || 0;
        const timeSinceOnline = Date.now() - lastOnline;
        if (timeSinceOnline > OFFLINE_GRACE_PERIOD || lastOnline === 0) {
          console.log(`⚠️ Device ${deviceKey} did not respond — marking OFFLINE`);
          setDeviceOnlineStatus(prev => ({ ...prev, [deviceKey]: false }));
          setDeviceConnectionStatus(prev => ({ ...prev, [deviceKey]: 'offline' }));
          setDevicesData(prev => ({
            ...prev,
            [deviceKey]: {
              ...prev[deviceKey],
              isOnline: false,
            }
          }));
        } else {
          console.log(`⏳ Device ${deviceKey} no response but within grace period`);
        }
      } else {
        console.log(`✅ Device ${deviceKey} responded — ONLINE`);
      }
    }
    
    // If selected device didn't respond, only go offline if we have no cached data
    const selKey = selectedExternalKeyRef.current;
    if (selKey) {
      const lastResponse = lastGetStatResponseTime.current[selKey] || 0;
      const hasCachedData = devicesData[selKey]?.hasReceivedData || hasReceivedDataRef.current;
      if (lastResponse < (Date.now() - 5000) && !hasCachedData) {
        console.log(`⚠️ Selected device ${selKey} — no response, no cached data → OFFLINE`);
        setConnectionState('offline');
      } else if (lastResponse < (Date.now() - 5000) && hasCachedData) {
        console.log(`⏳ Selected device ${selKey} — no response but has cached data → staying online`);
      }
    }
    
    console.log("⚡ Quick status check complete");
  };

  // ✅ Check a SINGLE new device: subscribe to its topics, send GET_STATUS, wait 2s
  const checkSingleDeviceStatus = async (externalKey) => {
    if (!externalKey) return null;
    console.log(`🔍 Checking single device status: ${externalKey}`);

    // Subscribe to the new device's topics
    let client = mqttClient;
    if (!client || !client.connected) {
      try {
        client = await getMqttClient();
      } catch (e) {
        console.error("❌ Could not get MQTT client for single check:", e);
        return null;
      }
    }

    if (!client || !client.connected) {
      console.log("⚠️ MQTT not connected, cannot check device status");
      return null;
    }

    // Subscribe to /status and /data topics for the new device
    await subscribeToTopic(client, `/messages/${externalKey}/data`);
    await subscribeToTopic(client, `/messages/${externalKey}/status`);
    console.log(`📡 Subscribed to topics for new device: ${externalKey}`);

    // Send GET_STATUS
    const sent = await requestDeviceStatus(externalKey);
    if (!sent) {
      console.log(`⚠️ Failed to send GET_STATUS to ${externalKey}`);
      return null;
    }

    // Wait 2 seconds for response
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Check if device responded
    const lastResponse = lastGetStatResponseTime.current[externalKey] || 0;
    const responded = lastResponse > (Date.now() - 4000);

    if (responded) {
      console.log(`✅ New device ${externalKey} responded — ONLINE`);
      // DeviceOnlineStatus is already set by handleStatusResponse/handleDataMessage
      return true;
    } else {
      console.log(`⚠️ New device ${externalKey} did not respond — OFFLINE`);
      setDeviceOnlineStatus((prev) => ({ ...prev, [externalKey]: false }));
      setDeviceConnectionStatus((prev) => ({ ...prev, [externalKey]: 'offline' }));
      return false;
    }
  };

  const subscribeToAllDevices = async (client) => {
    if (!client) {
      console.log("⚠️ No client provided");
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
        console.log("❌ Client still not connected");
        return;
      }
    }
    
    const devices = availableDevices.length > 0 ? availableDevices : await loadAvailableDevices();
    console.log(`📡 Subscribing to ${devices.length} devices...`);
    
    for (const device of devices) {
      const externalKey = device.external_key;
      await subscribeToTopic(client, `/messages/${externalKey}/data`);
      await subscribeToTopic(client, `/messages/${externalKey}/status`);
      console.log(`✅ Subscribed to topics for: ${externalKey}`);
    }
  };

  const subscribeToTopic = (client, topic) => {
    return new Promise((resolve) => {
      if (!client || !client.connected) {
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

  const publish = (topic, message) => {
    return publishWithRetry(topic, message, 2);
  };

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
          // ✅ Grace period: only mark offline after OFFLINE_GRACE_PERIOD of no data
          const lastOnline = lastOnlineTimePerDevice.current[deviceKey] || 0;
          const timeSinceOnline = Date.now() - lastOnline;
          
          if (timeSinceOnline < OFFLINE_GRACE_PERIOD && lastOnline > 0) {
            console.log(`⏳ Device ${deviceKey} - No data for ${Math.round(timeSinceLastData/1000)}s, but within grace period (${Math.round((OFFLINE_GRACE_PERIOD - timeSinceOnline)/1000)}s left)`);
            continue;
          }
          
          console.log(`⚠️ Device ${deviceKey} - No data for ${Math.round(timeSinceLastData/1000)}s, OFFLINE`);
          setDeviceOnlineStatus(prev => ({ ...prev, [deviceKey]: false }));
          setDeviceConnectionStatus(prev => ({ ...prev, [deviceKey]: 'offline' }));
          
          if (deviceKey === selectedExternalKeyRef.current) {
            setConnectionState('offline');
          }
        }
      }
    }, DATA_CHECK_INTERVAL);
  };

  // ── Handle Data Message ──
  const handleDataMessage = useCallback((deviceKey, msgStr) => {
    try {
      const parsed = parseSenMLToObject(msgStr);
      
      // ✅ Console the ENTIRE parsed data from data topic
      console.log(`\n════════════════════════════════════════════`);
      console.log(`📥 DATA TOPIC MESSAGE from: ${deviceKey}`);
      console.log(`📥 Raw:`, msgStr);
      console.log(`📥 Parsed:`, JSON.stringify(parsed, null, 2));
      
      // Show actuator values specifically
      const actuatorKeys = ['water_pump', 'water_ILvalve', 'water_OLvalve', 'nutrient_pump', 'ac_stat'];
      const actuatorValues = Object.entries(parsed)
        .filter(([k]) => actuatorKeys.includes(k))
        .map(([k, v]) => `${k}=${v}`);
      if (actuatorValues.length > 0) {
        console.log(`📥 🔧 Actuator values: ${actuatorValues.join(', ')}`);
      }
      
      // Show sensor values specifically
      const sensorKeys = ['ambientTemperature', 'ambientHumidity', 'waterTemperature', 'co2Level', 'ecValue', 'phValue', 'waterLevel', 'lightLevel', 'soilMoisture'];
      const sensorValues = Object.entries(parsed)
        .filter(([k]) => sensorKeys.includes(k))
        .map(([k, v]) => `${k}=${v}`);
      if (sensorValues.length > 0) {
        console.log(`📥 🌡️ Sensor values: ${sensorValues.join(', ')}`);
      }
      console.log(`════════════════════════════════════════════\n`);
      
      lastDataReceivedTimePerDevice.current[deviceKey] = Date.now();
      lastOnlineTimePerDevice.current[deviceKey] = Date.now(); // ✅ Track online time for grace period
      updateDeviceData(deviceKey, parsed);
      
      // ── Determine online status from 32-bit deviceStatus ──
      let isOnline = false;
      if (parsed.deviceStatus !== undefined && parsed.deviceStatus !== null) {
        // Parse the 32-bit status — Bit 17 = online flag
        const flags = parseDeviceStatus(parsed.deviceStatus);
        isOnline = flags.online;
        console.log(`🟢 [${deviceKey}] Online from 32-bit status: ${isOnline} (Bit 17, raw: ${flags.rawStatus})`);
      }
      // Fallback: check deviceStatusFlags if sent separately
      if (!isOnline && parsed.deviceStatusFlags && parsed.deviceStatusFlags.online !== undefined) {
        isOnline = parsed.deviceStatusFlags.online;
      }
      
      // Fallback: assume online if we got any data
      if (!isOnline && Object.keys(parsed).length > 0) {
        const hasSensorData = parsed.ambientTemperature !== undefined || 
                             parsed.ambientHumidity !== undefined ||
                             parsed.waterLevel !== undefined ||
                             parsed.deviceStatus !== undefined;
        if (hasSensorData) {
          isOnline = true;
        }
      }
      
      // ✅ We received data — device is reachable regardless of firmware online bit
      lastOnlineTimePerDevice.current[deviceKey] = Date.now();
      lastDataReceivedTimePerDevice.current[deviceKey] = Date.now();
      // ✅ Update online status + device data in ONE batch (avoids duplicate re-renders)
      setDevicesData(prev => ({
        ...prev,
        [deviceKey]: {
          ...prev[deviceKey],
          lastDataReceived: Date.now(),
          hasReceivedData: true,
          isLiveData: true,
          isOnline: true, // ✅ Received data = reachable
        }
      }));
      setDeviceOnlineStatus(prev => ({ ...prev, [deviceKey]: true }));
      setDeviceConnectionStatus(prev => ({ ...prev, [deviceKey]: 'online' }));
      
      // ✅ Use ref to avoid stale closure — always get the latest selectedExternalKey
      const currentSelectedKey = selectedExternalKeyRef.current;
      const isSelected = currentSelectedKey === deviceKey;
      
      if (isSelected) {
        updateLegacyState(parsed);
        setConnectionState('online'); // ✅ Received data = online
        if (isOnline) {
          setHasEverBeenOnline(true);
          hasEverBeenOnlineRef.current = true;
        }
        setHasReceivedData(true);
        hasReceivedDataRef.current = true;
        setIsLiveData(true);
        console.log(`✅ Selected device ${deviceKey} updated, online: ${isOnline}`);
      } else {
        console.log(`📊 Data for non-selected device: ${deviceKey} (selected: ${currentSelectedKey || 'none'})`);
      }
      
      console.log(`✅ Data received from ${deviceKey}, online: ${isOnline}`);
      
      if (isUsingGetStat.current) {
        console.log(`🔄 Switching to DATA mode for ${deviceKey}`);
        isUsingGetStat.current = false;
        startDataCheckInterval();
      }
    } catch (error) {
      console.error(`❌ Error processing data from ${deviceKey}:`, error);
    }
  }, []);

  // ── Handle Status Response ──
  const handleStatusResponse = useCallback((deviceKey, msgStr) => {
    try {
      let parsed = {};
      let isJsonResponse = false;
      
      try {
        const jsonData = JSON.parse(msgStr);
        if (jsonData.cmd === "GET_STATUS" && jsonData.request_id) {
          console.log(`📊 GET_STAT echo from ${deviceKey}:`, jsonData);
          isJsonResponse = true;
          delete pendingRequestIds.current[deviceKey];
          return;
        }
      } catch (e) {}
      
      if (!isJsonResponse) {
        parsed = parseSenMLToObject(msgStr);
        
        const requestId = parsed._requestId || parsed.ReqID;
        const expectedId = pendingRequestIds.current[deviceKey];
        
        if (requestId && expectedId && requestId !== expectedId) {
          console.log(`⚠️ Request ID mismatch for ${deviceKey}`);
        }
        
        let isOnline = false;
        if (parsed.deviceStatus !== undefined && parsed.deviceStatus !== null) {
          isOnline = isDeviceOnlineFromDevStat(parsed.deviceStatus);
        }
        if (parsed.deviceStatusFlags && parsed.deviceStatusFlags.online !== undefined) {
          isOnline = parsed.deviceStatusFlags.online;
        }
        
        lastGetStatResponseTime.current[deviceKey] = Date.now();
        if (isOnline) lastOnlineTimePerDevice.current[deviceKey] = Date.now(); // ✅ Track online time
        updateDeviceData(deviceKey, parsed);
        
        // ✅ We received data from this device — it IS reachable, regardless of firmware online bit
        lastOnlineTimePerDevice.current[deviceKey] = Date.now();
        setDeviceOnlineStatus(prev => ({ ...prev, [deviceKey]: true }));
        setDeviceConnectionStatus(prev => ({ ...prev, [deviceKey]: 'online' }));
        
        // ✅ Use ref to avoid stale closure — always get the latest selectedExternalKey
        const currentSelectedKey = selectedExternalKeyRef.current;
        const isSelected = currentSelectedKey === deviceKey;
        
        console.log(`🔍 Status check - ${deviceKey} is selected: ${isSelected} (selectedExternalKey: ${currentSelectedKey || 'none'})`);
        
        if (isSelected) {
          console.log(`📊 Updating selected device: ${deviceKey}`);
          updateLegacyState(parsed);
          setConnectionState('online'); // ✅ We received data — device is reachable
          setHasEverBeenOnline(true);
          hasEverBeenOnlineRef.current = true;
          setHasReceivedData(true);
          hasReceivedDataRef.current = true;
          setIsLiveData(true);
        }
        
        delete pendingRequestIds.current[deviceKey];
        console.log(`✅ Device ${deviceKey} status: ${isOnline ? 'ONLINE' : 'OFFLINE'}`);
        checkAndSwitchToDataMode();
      }
    } catch (error) {
      console.error(`❌ Error processing status for ${deviceKey}:`, error);
    }
  }, []);

  // ── Message Handler ──
  const handleIncomingMessage = useCallback((topic, message) => {
    if (!isMountedRef.current) return;
    
    const msgStr = message.toString();
    console.log(`📨 Received on ${topic}: ${msgStr.substring(0, 100)}...`);
    
    const topicParts = topic.split('/');
    if (topicParts.length < 3) return;
    
    const deviceKey = topicParts[2];
    const topicType = topicParts[3] || '';
    
    if (topicType === 'status') {
      handleStatusResponse(deviceKey, msgStr);
      return;
    }
    
    if (topicType === 'data') {
      handleDataMessage(deviceKey, msgStr);
      return;
    }
  }, [handleStatusResponse, handleDataMessage]);

  const checkAndSwitchToDataMode = () => {
    if (!isUsingGetStat.current || !getStatStartTime.current) return;
    
    const elapsed = Date.now() - getStatStartTime.current;
    
    if (elapsed >= GET_STAT_ACTIVE_DURATION) {
      console.log(`⏰ GET_STAT expired - Switching to DATA mode`);
      isUsingGetStat.current = false;
      startDataCheckInterval();
    }
  };

  const updateDeviceData = (deviceKey, parsed) => {
    // ✅ Use updater function to always get the latest devicesData
    setDevicesData(prev => {
      const currentData = prev[deviceKey] || {
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
      let updatedDeviceConfig = currentData.deviceConfig;
      let newDeviceStatus = currentData.deviceStatus;
      let newDeviceStatusFlags = currentData.deviceStatusFlags;
      let hasActuatorUpdate = false;
      let hasConfigUpdate = false;
      
      for (const [key, value] of Object.entries(parsed)) {
        if (key.startsWith('_')) continue;
        
        // ── Sensor values ──
        if (['ambientTemperature', 'ambientHumidity', 'waterTemperature', 
             'co2Level', 'ecValue', 'phValue', 'waterLevel', 'lightLevel', 
             'soilMoisture', 'cropId'].includes(key)) {
          updatedSensorData[key] = value;
        }
        
        // ── 32-bit deviceStatus — parse the bitmask to extract actuator states ──
        if (key === 'deviceStatus') {
          newDeviceStatus = value;
          updatedSensorData.deviceStatus = value;
          
          // Parse the 32-bit status bitmask
          const flags = parseDeviceStatus(value);
          newDeviceStatusFlags = flags;
          
          // Extract actuator states FROM the bitmask
          // Bit 12: water_pump, Bit 10: inlet_valve, Bit 11: outlet_valve
          // Bit 13: nutrient_pump, Bit 14: ac_status, Bit 15: reboot_ok
          const bitmaskActuators = {
            water_pump: flags.waterPump,
            water_ILvalve: flags.inletValve,
            water_OLvalve: flags.outletValve,
            nutrient_pump: flags.nutrientPump,
            ac_stat: flags.acStatus,
            // ✅ Do NOT include reboot_ack here — it's a firmware status flag, not a user-controlled actuator
            // Including it causes BootAck: true to leak into outbound publishes
          };
          
          console.log(`🔧 [${deviceKey}] Parsed 32-bit status:`, flags.rawStatus);
          console.log(`🔧 [${deviceKey}] Water Pump: ${flags.waterPump ? 'ON' : 'OFF'} (Bit 12)`);
          console.log(`🔧 [${deviceKey}] Inlet Valve: ${flags.inletValve ? 'OPEN' : 'CLOSED'} (Bit 10)`);
          console.log(`🔧 [${deviceKey}] Outlet Valve: ${flags.outletValve ? 'OPEN' : 'CLOSED'} (Bit 11)`);
          console.log(`🔧 [${deviceKey}] Nutrient Pump: ${flags.nutrientPump ? 'ON' : 'OFF'} (Bit 13)`);
          console.log(`🔧 [${deviceKey}] AC Status: ${flags.acStatus ? 'ON' : 'OFF'} (Bit 14)`);
          console.log(`🔧 [${deviceKey}] Mode: ${flags.mode ? 'AUTO' : 'MANUAL'} (Bit 15)`);
          console.log(`🔧 [${deviceKey}] Online: ${flags.online ? 'YES' : 'NO'} (Bit 16)`);
          console.log(`🔧 [${deviceKey}] Sensor Fault: ${flags.sensorFault} (Bits 17-23)`);
          console.log(`🔧 [${deviceKey}] Buzzer: ${flags.buzzer ? 'ON' : 'OFF'} (Bit 24)`);
          console.log(`🔧 [${deviceKey}] Dimming: ${flags.dimmingLevel}/127 (Bits 25-31)`);
          
          // Update actuator status from bitmask
          for (const [actKey, actValue] of Object.entries(bitmaskActuators)) {
            if (updatedActuatorStatus[actKey] !== actValue) {
              updatedActuatorStatus[actKey] = actValue;
              updatedSensorData[actKey] = actValue;
              hasActuatorUpdate = true;
            }
          }
          
          // ✅ Sync deviceConfig.auto_mode from firmware mode bit (Bit 15)
          // This ensures settings page and SystemModeContext stay in sync with actual device state
          const firmwareAutoMode = flags.mode; // true = AUTO, false = MANUAL
          const currentAutoMode = currentData.deviceConfig?.auto_mode;
          if (firmwareAutoMode !== null && firmwareAutoMode !== undefined && firmwareAutoMode !== currentAutoMode) {
            console.log(`🔄 [${deviceKey}] Syncing deviceConfig.auto_mode: ${currentAutoMode} → ${firmwareAutoMode}`);
            updatedDeviceConfig = { ...currentData.deviceConfig, auto_mode: firmwareAutoMode, lastUpdated: now };
            hasConfigUpdate = true;
          }
        }
        
        // ── deviceStatusFlags from MQTT (if sent separately) ──
        if (key === 'deviceStatusFlags') {
          newDeviceStatusFlags = value;
        }
        
        // ── Direct actuator values (if device sends them as separate keys) ──
        if (['water_pump', 'water_ILvalve', 'water_OLvalve', 
             'nutrient_pump', 'ac_stat'].includes(key)) {
          console.log(`🔧 [${deviceKey}] Direct actuator ${key}: ${value}`);
          updatedActuatorStatus[key] = value;
          updatedSensorData[key] = value;
          hasActuatorUpdate = true;
        }
        
        // ── Timing fields (WPONT, WPINT, NP_DI, NP_OT) ──
        if (['water_pump_on_time', 'water_pump_interval', 'nutrient_pump_duration', 'nutrient_pump_on_time'].includes(key)) {
          updatedActuatorStatus[key] = value;
          hasActuatorUpdate = true;
        }
      }
      
      const now = new Date();
      updatedSensorData.lastUpdated = now;
      updatedActuatorStatus.lastUpdated = now;
      
      // ✅ Rebuild devices list only once when actuators changed
      if (hasActuatorUpdate) {
        console.log(`✅ [${deviceKey}] All actuator values:`, JSON.stringify(updatedActuatorStatus, null, 2));
        updatedDevices = Object.entries(updatedActuatorStatus)
          .filter(([key]) => key in DEVICE_CONFIG && key !== 'lastUpdated')
          .map(([key, value]) => {
            const cfg = DEVICE_CONFIG[key];
            return {
              id: key,
              n: key,
              vb: value || false,
              displayName: cfg.displayName,
              icon: cfg.icon,
              description: cfg.description,
              category: cfg.category,
            };
          });
      }
      
      return {
        ...prev,
        [deviceKey]: {
          ...currentData,
          sensorData: updatedSensorData,
          actuatorStatus: updatedActuatorStatus,
          devices: updatedDevices,
          deviceConfig: hasConfigUpdate ? updatedDeviceConfig : currentData.deviceConfig,
          deviceStatus: newDeviceStatus,
          deviceStatusFlags: newDeviceStatusFlags,
          lastUpdated: now,
          lastDataReceived: Date.now(),
          hasReceivedData: true,
          isLiveData: true,
          isOnline: newDeviceStatusFlags?.online || false,
        }
      };
    });
  };

  const updateLegacyState = (parsed) => {
    // ✅ Use updater functions to always get the latest state
    setSensorData(prev => {
      const updatedSensorData = { ...prev };
      let hasSensorUpdate = false;
      let hasActuatorUpdate = false;
      let newDeviceStatusLocal = null;
      let newDeviceStatusFlagsLocal = null;
      
      for (const [key, value] of Object.entries(parsed)) {
        if (key.startsWith('_')) continue;
        
        // ── Sensor values ──
        if (['ambientTemperature', 'ambientHumidity', 'waterTemperature', 
             'co2Level', 'ecValue', 'phValue', 'waterLevel', 'lightLevel', 
             'soilMoisture', 'cropId'].includes(key)) {
          updatedSensorData[key] = value;
          hasSensorUpdate = true;
        }
        
        // ── 32-bit deviceStatus — parse bitmask for actuator states ──
        if (key === 'deviceStatus') {
          newDeviceStatusLocal = value;
          updatedSensorData.deviceStatus = value;
          hasSensorUpdate = true;
          
          // Parse the 32-bit bitmask
          const flags = parseDeviceStatus(value);
          newDeviceStatusFlagsLocal = flags;
          
          // Extract actuator states from bitmask and update sensorData
          updatedSensorData.water_pump = flags.waterPump;
          updatedSensorData.water_ILvalve = flags.inletValve;
          updatedSensorData.water_OLvalve = flags.outletValve;
          updatedSensorData.nutrient_pump = flags.nutrientPump;
          updatedSensorData.ac_stat = flags.acStatus;
          // ✅ Do NOT store reboot_ack in sensorData — it's a firmware status flag
          hasActuatorUpdate = true;
        }
        
        if (key === 'deviceStatusFlags') {
          newDeviceStatusFlagsLocal = value;
        }
        
        // ── Direct actuator values (if device sends them separately) ──
        if (['water_pump', 'water_ILvalve', 'water_OLvalve', 
             'nutrient_pump', 'ac_stat'].includes(key)) {
          updatedSensorData[key] = value;
          hasActuatorUpdate = true;
          hasSensorUpdate = true;
        }
        
        // ── Timing fields ──
        if (['water_pump_on_time', 'water_pump_interval', 'nutrient_pump_duration', 'nutrient_pump_on_time'].includes(key)) {
          hasActuatorUpdate = true;
          hasSensorUpdate = true;
        }
      }
      
      if (hasSensorUpdate) {
        updatedSensorData.lastUpdated = new Date();
      }
      
      // ✅ Update deviceStatusFlags outside of this updater
      if (newDeviceStatusFlagsLocal) {
        setDeviceStatusFlags(newDeviceStatusFlagsLocal);
        
        // ✅ Sync deviceConfig.auto_mode from firmware mode bit (Bit 15)
        if (newDeviceStatusFlagsLocal.mode !== null && newDeviceStatusFlagsLocal.mode !== undefined) {
          setDeviceConfig(prev => {
            if (prev.auto_mode !== newDeviceStatusFlagsLocal.mode) {
              console.log(`🔄 Syncing deviceConfig.auto_mode from firmware: ${prev.auto_mode} → ${newDeviceStatusFlagsLocal.mode}`);
              return { ...prev, auto_mode: newDeviceStatusFlagsLocal.mode, lastUpdated: new Date() };
            }
            return prev;
          });
        }
      }
      if (newDeviceStatusLocal !== null) {
        setDeviceStatus(newDeviceStatusLocal);
      }
      
      // ✅ Update actuatorStatus inside its own updater
      if (hasActuatorUpdate) {
        console.log(`📥 Global actuatorStatus updating...`);
        setActuatorStatus(prevAct => {
          const updatedActuator = { ...prevAct };
          const actuatorKeys = ['water_pump', 'water_ILvalve', 'water_OLvalve', 
               'nutrient_pump', 'ac_stat'];
          for (const key of actuatorKeys) {
            if (updatedSensorData[key] !== undefined) {
              updatedActuator[key] = updatedSensorData[key];
            }
          }
          const timingKeys = ['water_pump_on_time', 'water_pump_interval', 'nutrient_pump_duration', 'nutrient_pump_on_time'];
          for (const key of timingKeys) {
            if (updatedSensorData[key] !== undefined) {
              updatedActuator[key] = updatedSensorData[key];
            }
          }
          updatedActuator.lastUpdated = new Date();
          return updatedActuator;
        });
      }
      
      return updatedSensorData;
    });
  };

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
    
    // ✅ Use returned devices list instead of stale availableDevices state
    const devices = await loadAvailableDevices();
    
    const selected = await loadSelectedDevice();
    console.log("📦 Selected device loaded:", selected);
    
    // ✅ Use the returned devices array (not the stale state)
    if (!selected && devices.length > 0) {
      // No saved selection — auto-select the last added device
      const lastDevice = devices[devices.length - 1];
      const autoName = lastDevice.name || lastDevice.device_name || `Device ${(lastDevice.id || '').slice(-4)}`;
      console.log(`🔌 No selected device, auto-selecting: ${autoName} (${lastDevice.id})`);
      await selectDevice(lastDevice.id, autoName);
    }
    
    if (selected && !selectedExternalKey) {
      const device = devices.find(d => d.id === selected.deviceId);
      if (device && device.external_key) {
        setSelectedExternalKey(device.external_key);
        await AsyncStorage.setItem(STORAGE_KEYS.SELECTED_EXTERNAL_KEY, device.external_key);
        console.log("✅ Set missing external key:", device.external_key);
      }
    }
    
    console.log(`✅ Current selectedExternalKey: ${selectedExternalKey}`);
    
    const storedKey = await AsyncStorage.getItem(STORAGE_KEYS.EXTERNAL_KEY);
    
    if (!storedKey) {
      console.log("⚠️ No external_key found - Skipping MQTT connection");
      setExternalKey(null);
      setIsReady(true);
      setConnectionState('idle');
      return;
    }

    // ✅ If selectedExternalKey is still null, use storedKey as fallback
    if (!selectedExternalKey && storedKey) {
      setSelectedExternalKey(storedKey);
      await AsyncStorage.setItem(STORAGE_KEYS.SELECTED_EXTERNAL_KEY, storedKey);
      console.log("✅ Set selectedExternalKey from external_key:", storedKey);
    }

    console.log("✅ external_key found, proceeding with MQTT connection");
    // ✅ Don't force 'connecting' if we already have data — prevents dashboard flicker
    setConnectionState(prev => hasReceivedDataRef.current ? prev : 'connecting');
    setIsInitializing(true);
    
    try {
      await restoreAllDevicesData();
      setExternalKey(storedKey);
      await updateMqttPassword(storedKey);
      await cleanupMqtt();

      const client = await getMqttClient();
      console.log("📡 MQTT client obtained, connected:", client.connected);
      setMqttClient(client);

      client.removeAllListeners();
      
      client.on("connect", async () => {
        if (!isMountedRef.current) return;
        console.log("✅ MQTT Connected");
        setIsConnected(true);
        hasInitializedRef.current = true;
        setMqttClient(client);
        
        // ✅ Don't reset to 'waiting' if we already have data — prevents dashboard flicker on reconnect
        setConnectionState(prev => (prev === 'online' || prev === 'data') ? prev : 'connecting');
        
        await new Promise(resolve => setTimeout(resolve, 1500));
        await subscribeToAllDevices(client);
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // ✅ Quick 3-second status check
        await quickStatusCheck();
      });

      client.on("close", () => {
        if (isMountedRef.current) {
          console.log("🔌 MQTT Disconnected");
          setIsConnected(false);
          // ✅ Don't reset connectionState if we already have data — prevents flicker on brief disconnects
          setConnectionState(prev => {
            if (prev === 'online' || prev === 'data') return 'online'; // Keep showing data
            return 'disconnected';
          });
          hasInitializedRef.current = false;
        }
      });

      client.on("reconnect", () => console.log("🔄 MQTT Reconnecting..."));
      client.on("error", (err) => console.log("❌ MQTT Error:", err));
      client.on("message", handleIncomingMessage);

      if (client.connected) {
        console.log("✅ Client already connected");
        setIsConnected(true);
        hasInitializedRef.current = true;
        setMqttClient(client);
        setConnectionState(prev => (prev === 'online' || prev === 'data') ? prev : 'connecting');
        
        await new Promise(resolve => setTimeout(resolve, 1500));
        await subscribeToAllDevices(client);
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // ✅ Quick 3-second status check instead of waiting 2 minutes
        await quickStatusCheck();
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

  const restoreAllDevicesData = async () => {
    try {
      const cached = await loadLastData();
      if (!cached) {
        console.log("🗂️ No cached MQTT snapshot found");
        return false;
      }

      if (cached.devicesData) {
        // ✅ Convert lastUpdated strings back to Date objects
        const restored = {};
        for (const [key, dev] of Object.entries(cached.devicesData)) {
          restored[key] = {
            ...dev,
            sensorData: dev.sensorData ? {
              ...dev.sensorData,
              lastUpdated: dev.sensorData.lastUpdated ? new Date(dev.sensorData.lastUpdated) : null,
              reboot_ack: null, // ✅ Clear stale reboot_ack from cache
            } : { ...DEFAULT_SENSOR_DATA },
            actuatorStatus: dev.actuatorStatus ? {
              ...dev.actuatorStatus,
              lastUpdated: dev.actuatorStatus.lastUpdated ? new Date(dev.actuatorStatus.lastUpdated) : null,
              reboot_ack: null, // ✅ Clear stale reboot_ack from cache
            } : { ...DEFAULT_ACTUATOR_STATUS },
            deviceConfig: dev.deviceConfig ? {
              ...dev.deviceConfig,
              boot_ack: false, // ✅ Clear stale boot_ack from cache
            } : dev.deviceConfig,
            lastUpdated: dev.lastUpdated ? new Date(dev.lastUpdated) : null,
          };
        }
        setDevicesData(restored);
        console.log("🗂️ Restored data for", Object.keys(restored).length, "devices");
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

      // ✅ Restore global data flags so dashboard doesn't show '--' during reconnect
      if (cached.devicesData && Object.keys(cached.devicesData).length > 0) {
        const hasAnyData = Object.values(cached.devicesData).some(d => d.hasReceivedData);
        if (hasAnyData) {
          setHasReceivedData(true);
          hasReceivedDataRef.current = true;
          setIsLiveData(true);
          // ✅ Start as 'online' when we have cached data — prevents flicker (data → offline → online)
          setConnectionState('online');
        }

        // ✅ Populate lastOnlineTimePerDevice from cached data so grace period works on reconnect
        for (const [key, dev] of Object.entries(cached.devicesData)) {
          if (dev.isOnline) {
            lastOnlineTimePerDevice.current[key] = Date.now(); // treat cached-online as recently seen
          }
          if (dev.hasReceivedData) {
            lastDataReceivedTimePerDevice.current[key] = Date.now();
          }
        }
      }

      console.log("🗂️ Restored last MQTT snapshot from AsyncStorage");
      return true;
    } catch (error) {
      console.error("❌ Error restoring last MQTT snapshot:", error);
      return false;
    }
  };

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
            `/messages/${device.external_key}/status`,
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
    // ✅ Don't reset hasReceivedData/isLiveData during cleanup — keeps last known data visible during reconnect
    setDeviceStatus(null);
    // ✅ Don't set to 'idle' if we already had data — prevents dashboard from showing '--' during reconnect
    setConnectionState(prev => (prev === 'online' || hasReceivedDataRef.current) ? 'connecting' : 'idle');
    
    isUsingGetStat.current = true;
    getStatStartTime.current = null;
  };

  const connectToDevice = async (deviceId, externalKey) => {
    console.log(`🔌 Connecting to device: ${deviceId} (${externalKey})`);
    setActiveDeviceId(deviceId);
    setExternalKey(externalKey);
    await saveDevice(externalKey, deviceId);
    await forceReconnect(externalKey);
    return true;
  };

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
        await reconnectMqttClient(newKey);
      } else {
        await reconnectMqttClient();
      }
      
      await initializeMqtt();
      console.log(`✅ Force reconnect completed. isConnected: ${isConnected}`);
    } catch (error) {
      console.error("❌ Force reconnect error:", error);
      throw error;
    }
  };

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

  const getDeviceData = (deviceKey) => {
    return devicesData[deviceKey] || null;
  };

  const getDeviceStatus = (deviceKey) => {
    return deviceOnlineStatus[deviceKey] || false;
  };

  const publishActuatorStatus = async (deviceKey, status) => {
    if (!deviceKey) {
      console.log("⚠️ No device key provided");
      return false;
    }
    
    const previousStatus = devicesData[deviceKey]?.actuatorStatus || {};
    const payload = buildActuatorPayload(status, deviceKey, previousStatus);
    console.log(`📤 Publishing actuator to /messages/${deviceKey}/actuator`);
    console.log(`📤 Payload:`, JSON.stringify(payload, null, 2));
    const success = await publish(`/messages/${deviceKey}/actuator`, JSON.stringify(payload));
    
    if (success) {
      console.log(`✅ Actuator published successfully`);
      console.log(`⏳ Waiting for data topic response...`);
    } else {
      console.log(`❌ Actuator publish FAILED`);
    }
    return success;
  };

  const publishSettings = async (deviceKey, settings) => {
    if (!deviceKey) {
      console.log("⚠️ No device key provided");
      return false;
    }
    
    const payload = buildSettingsPayload(settings, deviceKey);
    console.log(`\n════════════════════════════════════════════`);
    console.log(`📤 PUBLISH SETTINGS to /messages/${deviceKey}/settings`);
    console.log(`📤 Settings input:`, JSON.stringify(settings, null, 2));
    console.log(`📤 Raw payload:`, JSON.stringify(payload, null, 2));
    console.log(`════════════════════════════════════════════\n`);
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
      
      if (deviceKey === selectedExternalKeyRef.current) {
        setCropSettings({ ...settings, lastUpdated: new Date() });
      }
    }
    return success;
  };

  const publishConfig = async (deviceKey, config) => {
    if (!deviceKey) {
      console.log("⚠️ No device key provided");
      return false;
    }
    
    // Always merge with current config so ALL fields are preserved
    const previousConfig = devicesData[deviceKey]?.deviceConfig || {};
    const mergedConfig = { ...previousConfig, ...config };
    const payload = buildConfigPayload(deviceKey, mergedConfig, previousConfig);
    const success = await publish(`/messages/${deviceKey}/cfg`, JSON.stringify(payload));
    
    if (success) {
      console.log(`✅ Config published to ${deviceKey}`);
      console.log(`📤 Full cfg payload:`, JSON.stringify(payload, null, 2));
      // ✅ Update config fields EXCEPT auto_mode — wait for device to confirm mode via bitmask
      // This prevents UI mode toggle from flipping before device actually responds
      const configWithoutMode = { ...mergedConfig };
      delete configWithoutMode.auto_mode; // ← Don't touch auto_mode until device confirms
      configWithoutMode.lastUpdated = new Date();
      
      setDevicesData(prev => ({
        ...prev,
        [deviceKey]: {
          ...prev[deviceKey],
          deviceConfig: { ...prev[deviceKey]?.deviceConfig, ...configWithoutMode },
        }
      }));
      
      if (deviceKey === selectedExternalKeyRef.current) {
        setDeviceConfig(prev => ({ ...prev, ...configWithoutMode }));
      }
    }
    return success;
  };

  const publishReboot = async (deviceKey) => {
    if (!deviceKey) {
      console.log("⚠️ No device key for reboot");
      return false;
    }
    // Send FULL config payload with BootAck=true — device needs all fields
    const previousConfig = devicesData[deviceKey]?.deviceConfig || {};
    const payload = buildConfigPayload(deviceKey, { boot_ack: true }, previousConfig);
    const success = await publish(`/messages/${deviceKey}/cfg`, JSON.stringify(payload));
    if (success) {
      console.log(`✅ Reboot command sent to ${deviceKey}`);
      setDevicesData(prev => ({
        ...prev,
        [deviceKey]: {
          ...prev[deviceKey],
          deviceConfig: { ...previousConfig, boot_ack: true, lastUpdated: new Date() },
        }
      }));
    }
    return success;
  };

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

  const loadSavedDevice = async () => {
    try {
      const savedKey = await AsyncStorage.getItem(STORAGE_KEYS.EXTERNAL_KEY);
      const savedDeviceId = await AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_DEVICE_ID);
      const savedSelectedDeviceId = await AsyncStorage.getItem(STORAGE_KEYS.SELECTED_DEVICE_ID);
      const savedSelectedDeviceName = await AsyncStorage.getItem(STORAGE_KEYS.SELECTED_DEVICE_NAME);
      const savedSelectedExtKey = await AsyncStorage.getItem(STORAGE_KEYS.SELECTED_EXTERNAL_KEY);
      
      if (savedKey) {
        console.log("📦 Loaded saved external_key:", savedKey);
        setExternalKey(savedKey);
      }
      
      if (savedDeviceId) {
        console.log("📦 Loaded saved activeDeviceId:", savedDeviceId);
        setActiveDeviceId(savedDeviceId);
      }

      // ✅ Restore selected device info so header shows the name immediately
      if (savedSelectedDeviceId) {
        setSelectedDeviceId(savedSelectedDeviceId);
      }
      if (savedSelectedDeviceName) {
        setSelectedDeviceName(savedSelectedDeviceName);
      } else {
        // ✅ Name not saved — try to resolve from availableDevices or generate fallback
        const devices = await loadAvailableDevices();
        const matched = devices.find(d => d.id === savedSelectedDeviceId || d.external_key === savedSelectedExtKey);
        const fallbackName = matched?.name || matched?.device_name || 
          (savedSelectedDeviceId ? `Device ${savedSelectedDeviceId.slice(-4)}` : null);
        if (fallbackName) {
          setSelectedDeviceName(fallbackName);
          // ✅ Save it so next time it's available immediately
          await AsyncStorage.setItem(STORAGE_KEYS.SELECTED_DEVICE_NAME, fallbackName);
        } else if (savedKey) {
          // ✅ Last resort: use external key as name
          setSelectedDeviceName(`Device ${savedKey.slice(-6)}`);
        }
      }
      if (savedSelectedExtKey) {
        setSelectedExternalKey(savedSelectedExtKey);
      }
      
      return { savedKey, savedDeviceId };
    } catch (error) {
      console.error("❌ Error loading saved device:", error);
      return { savedKey: null, savedDeviceId: null };
    }
  };

  const reconnect = async () => {
    console.log("🔄 Attempting to reconnect MQTT...");
    hasInitializedRef.current = false;
    await cleanupMqtt();
    await initializeMqtt();
  };

  const contextValue = {
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
    quickStatusCheck,
    checkSingleDeviceStatus,
    publishActuatorStatus,
    publishSettings,
    publishConfig,
    publishReboot,
    
    selectedDeviceId,
    selectedDeviceName,
    selectedExternalKey,
    selectDevice,
    getSelectedDeviceId,
    getSelectedDeviceName,
    getSelectedExternalKey,
    getSelectedDeviceData,
    getSelectedDeviceSensorData,
    getSelectedDeviceActuatorStatus,
    getSelectedDeviceCropSettings,
    getSelectedDeviceConfig,
    getSelectedDeviceOnlineStatus,
    
    sensorData,
    actuatorStatus,
    cropSettings,
    deviceConfig,
    devices,
    deviceStatus,
    deviceStatusFlags,
    
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
      console.log("selectedExternalKey:", selectedExternalKey);
      console.log("isUsingGetStat:", isUsingGetStat.current);
      console.log("getStatStartTime:", getStatStartTime.current);
      console.log("=== END DEBUG ===");
    },
    toggleDeviceStatus: async (deviceKey, deviceName, status, timingOverrides = {}) => {
      const actuatorMap = {
      water_pump: "water_pump",
      water_ILvalve: "water_ILvalve",
      water_OLvalve: "water_OLvalve",
      nutrient_pump: "nutrient_pump",
      ac_stat: "ac_stat",
    };
    
    const actuatorKey = actuatorMap[deviceName];
    if (!actuatorKey) {
      console.log(`⚠️ Unknown device: ${deviceName}`);
        return false;
      }
      
      const currentData = devicesData[deviceKey] || {};
      const currentStatus = currentData.actuatorStatus || {};
      
      const updatedStatus = {
        ...currentStatus,
        [actuatorKey]: status,
        ...timingOverrides,
      };
      
      return await publishActuatorStatus(deviceKey, updatedStatus);
    },
    
    updateSensorData: (data) => setSensorData(prev => ({ ...prev, ...data, lastUpdated: new Date() })),
    updateActuatorStatus: (status) => setActuatorStatus(prev => ({ ...prev, ...status, lastUpdated: new Date() })),
    updateCropSettings: async (settings) => {
      if (!selectedExternalKey) return false;
      return await publishSettings(selectedExternalKey, { ...cropSettings, ...settings });
    },
    updateDeviceConfig: async (config) => {
      if (!selectedExternalKey) return false;
      return await publishConfig(selectedExternalKey, { ...deviceConfig, ...config });
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