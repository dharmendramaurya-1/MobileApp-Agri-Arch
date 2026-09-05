// src/context/MqttContext.jsx
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

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
  onMqttConnectionChange,
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
  water_pump_on_time: null,
  water_pump_interval: null,
  nutrient_pump_duration: null,
  nutrient_pump_on_time: null,
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
  report_interval: 180,
  sampling_interval: 30,
  auto_mode: false,
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
const GET_STATUS_RESPONSE_TIMEOUT = 20 * 1000;
const OFFLINE_GRACE_PERIOD = 120 * 1000;
const STATUS_UPDATE_DELAY = 5000;
const APP_RESUME_DELAY = 800;
const MAX_RESUME_WAIT_ATTEMPTS = 30;

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
  const reportInterval = config.report_interval ?? previousConfig.report_interval ?? 180;
  const samplingInterval = config.sampling_interval ?? previousConfig.sampling_interval ?? 30;
  const autoMode = config.auto_mode ?? previousConfig.auto_mode ?? false;
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
  // ── State ──
  const [devicesData, setDevicesData] = useState({});
  const [deviceConnectionStatus, setDeviceConnectionStatus] = useState({});
  const [deviceOnlineStatus, setDeviceOnlineStatus] = useState({});
  const [deviceCheckingStatus, setDeviceCheckingStatus] = useState({});
  const [deviceInitialLoadStatus, setDeviceInitialLoadStatus] = useState({});
  const [deviceInitialLoadComplete, setDeviceInitialLoadComplete] = useState({});
  
  const backgroundGraceTimerRef = useRef(null);
  const backgroundGraceActiveRef = useRef(false);
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

  const [reportInterval, setReportInterval] = useState(180);
  const [timeoutDuration, setTimeoutDuration] = useState(3600);

  const [isNetworkAvailable, setIsNetworkAvailable] = useState(true);

  const [appState, setAppState] = useState(AppState.currentState);
  const [isAppInBackground, setIsAppInBackground] = useState(false);

  // ── Refs ──
  const timeoutCheckInterval = useRef(null);
  const statusResponseTimersRef = useRef({});
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
  const networkUnsubscribeRef = useRef(null);
  const connectionCallbackUnsubscribe = useRef(null);

  const isForegroundReconnectingRef = useRef(false);
  const appStateRef = useRef(AppState.currentState);
  const externalKeyRef = useRef(null);
  const selectedExternalKeyRef = useRef(null);
  const selectedDeviceIdRef = useRef(null);
  const availableDevicesRef = useRef([]);
  const devicesDataRef = useRef({});
  const deviceOnlineStatusRef = useRef({});
  const deviceCheckingStatusRef = useRef({});
  const deviceInitialLoadStatusRef = useRef({});
  const deviceInitialLoadCompleteRef = useRef({});

  const gracePeriodActive = useRef(false);
  const foregroundResumeTimer = useRef(null);

  const getStatStartTime = useRef(null);
  const isUsingGetStat = useRef(true);
  const lastGetStatResponseTime = useRef({});
  const lastDataReceivedTimePerDevice = useRef({});
  const lastOnlineTimePerDevice = useRef({});

  const deviceTimeoutMs = useRef({});

  const dataTimeoutTimersRef = useRef({});
  const pendingRequestsRef = useRef({});
  const lastRequestTimeRef = useRef({});
  const statusUpdateTimerRef = useRef({});
  const statusCheckLockRef = useRef({});

  // ── Live-data subscribers (real-time rolling charts) ──
  const liveDataSubscribersRef = useRef(new Set());

  // ── FIX: New refs for race condition prevention ──
  const appResumeProcessingRef = useRef(false);
  const appResumeTimeoutRef = useRef(null);
  const lastAppResumeTime = useRef(0);
  const isResumingRef = useRef(false);
  
  // ── NEW: Track if app is starting fresh ──
  const isFreshStartRef = useRef(true);

  const { isAuthenticated, token, isLoading: authLoading, isSignupFlow } = useAuth();

  // ── Sync refs with state ──
  useEffect(() => { externalKeyRef.current = externalKey; }, [externalKey]);
  useEffect(() => { selectedExternalKeyRef.current = selectedExternalKey; }, [selectedExternalKey]);
  useEffect(() => { selectedDeviceIdRef.current = selectedDeviceId; }, [selectedDeviceId]);
  useEffect(() => { availableDevicesRef.current = availableDevices; }, [availableDevices]);
  useEffect(() => { devicesDataRef.current = devicesData; }, [devicesData]);
  useEffect(() => { deviceOnlineStatusRef.current = deviceOnlineStatus; }, [deviceOnlineStatus]);
  useEffect(() => { deviceCheckingStatusRef.current = deviceCheckingStatus; }, [deviceCheckingStatus]);
  useEffect(() => { deviceInitialLoadStatusRef.current = deviceInitialLoadStatus; }, [deviceInitialLoadStatus]);
  useEffect(() => { deviceInitialLoadCompleteRef.current = deviceInitialLoadComplete; }, [deviceInitialLoadComplete]);

  // ── Helper: Get timeout for a device ──
  const getDeviceTimeout = useCallback((deviceKey) => {
    const interval = deviceTimeoutMs.current[deviceKey] || (reportInterval || 180) * 1000;
    return interval + OFFLINE_GRACE_PERIOD;
  }, [reportInterval]);

  // ── Helper: Set timeout for a device ──
  const setDeviceTimeout = useCallback((deviceKey, intervalSeconds) => {
    const timeoutMs = intervalSeconds * 1000;
    deviceTimeoutMs.current[deviceKey] = timeoutMs;
    console.log(`⏱️ Device ${deviceKey} report interval set to ${intervalSeconds}s`);
    return timeoutMs;
  }, []);

  // ── Helper: safely transition the global connectionState ──
  const setConnectionStateSafe = useCallback((candidate) => {
    if (candidate === 'online' || candidate === 'offline') {
      setConnectionState(candidate);
      return;
    }

    const selKey = selectedExternalKeyRef.current;
    if (selKey) {
      const hasData = devicesDataRef.current[selKey]?.hasReceivedData || false;
      const lastDataTime = lastDataReceivedTimePerDevice.current[selKey] || 0;
      const timeSinceLastData = Date.now() - lastDataTime;
      if (hasData && timeSinceLastData < getDeviceTimeout(selKey)) {
        console.log(`🧊 Ignoring transient connectionState='${candidate}' — ${selKey} still has fresh data`);
        return;
      }
    }

    setConnectionState(candidate);
  }, [getDeviceTimeout]);

  // ── Helper: Update device online status ──
  const updateDeviceOnlineStatus = useCallback((deviceKey) => {
    if (!deviceKey) return;

    setDeviceOnlineStatus(prev => {
      if (prev[deviceKey] === true) return prev;
      return { ...prev, [deviceKey]: true };
    });

    setDeviceConnectionStatus(prev => {
      if (prev[deviceKey] === "online") return prev;
      return { ...prev, [deviceKey]: "online" };
    });

    if (deviceKey === selectedExternalKeyRef.current) {
      setConnectionState("online");
    }
  }, []);

  // ── Helper: Clear all timers for a device ──
  const clearAllTimersForDevice = useCallback((deviceKey) => {
    if (!deviceKey) return;

    if (statusResponseTimersRef.current[deviceKey]) {
      clearTimeout(statusResponseTimersRef.current[deviceKey]);
      delete statusResponseTimersRef.current[deviceKey];
    }

    if (dataTimeoutTimersRef.current[deviceKey]) {
      clearTimeout(dataTimeoutTimersRef.current[deviceKey]);
      delete dataTimeoutTimersRef.current[deviceKey];
    }

    if (statusUpdateTimerRef.current[deviceKey]) {
      clearTimeout(statusUpdateTimerRef.current[deviceKey]);
      delete statusUpdateTimerRef.current[deviceKey];
    }

    delete pendingRequestIds.current[deviceKey];
    delete statusCheckLockRef.current[deviceKey];
  }, []);

  // ── Network Listener ──
  useEffect(() => {
    const checkNetwork = async () => {
      try {
        const state = await NetInfo.fetch();
        const connected = state.isConnected && state.isInternetReachable !== false;
        setIsNetworkAvailable(connected);
        console.log(`📶 Initial network state: ${connected ? 'ONLINE' : 'OFFLINE'}`);
      } catch (error) {
        console.error('❌ Network check error:', error);
        setIsNetworkAvailable(false);
      }
    };

    checkNetwork();

    const unsubscribe = NetInfo.addEventListener(state => {
      const connected = state.isConnected && state.isInternetReachable !== false;
      if (connected !== isNetworkAvailable) {
        console.log(`📶 Network state changed: ${isNetworkAvailable} → ${connected}`);
        setIsNetworkAvailable(connected);

        if (connected) {
          console.log('✅ Internet restored - forcing fresh data request');
          const selKey = selectedExternalKeyRef.current;
          if (selKey) {
            setTimeout(async () => {
              if (statusCheckLockRef.current[selKey]) {
                console.log(`⏳ ${selKey}: check already in flight, skipping network-restore check`);
                return;
              }
              console.log(`📡 Requesting fresh status for ${selKey} after network restore`);
              await getDeviceStatusOnce(selKey, true, false);
            }, 30000);
          }
        } else {
          console.log('⚠️ Internet lost - waiting for restore');
        }
      }
    });

    networkUnsubscribeRef.current = unsubscribe;

    return () => {
      if (networkUnsubscribeRef.current) {
        networkUnsubscribeRef.current();
        networkUnsubscribeRef.current = null;
      }
    };
  }, [isNetworkAvailable]);

  // ── clearStatusResponseTimer ──
  const clearStatusResponseTimer = useCallback((deviceKey) => {
    if (!deviceKey) return;

    const timer = statusResponseTimersRef.current[deviceKey];
    if (timer) {
      clearTimeout(timer);
      delete statusResponseTimersRef.current[deviceKey];
    }
    delete pendingRequestIds.current[deviceKey];
    delete statusCheckLockRef.current[deviceKey];
  }, []);

  // ── markDeviceOnline ──
  const markDeviceOnline = useCallback((deviceKey, immediate = false) => {
    if (!deviceKey) return;

    clearAllTimersForDevice(deviceKey);

    setDeviceCheckingStatus(prev => {
      if (prev[deviceKey] === false) return prev;
      return { ...prev, [deviceKey]: false };
    });

    setDeviceInitialLoadStatus(prev => {
      if (prev[deviceKey] === false) return prev;
      return { ...prev, [deviceKey]: false };
    });

    lastOnlineTimePerDevice.current[deviceKey] = Date.now();

    if (immediate) {
      updateDeviceOnlineStatus(deviceKey);
    } else {
      statusUpdateTimerRef.current[deviceKey] = setTimeout(() => {
        updateDeviceOnlineStatus(deviceKey);
        delete statusUpdateTimerRef.current[deviceKey];
      }, 200);
    }

    startDataTimeoutTimer(deviceKey);
    console.log(`🟢 Device ${deviceKey} is ONLINE`);
  }, [clearAllTimersForDevice, updateDeviceOnlineStatus, startDataTimeoutTimer]);

  // ── markDeviceOffline ──
  const markDeviceOffline = useCallback((deviceKey) => {
    if (!deviceKey) return;

    clearAllTimersForDevice(deviceKey);

    setDeviceCheckingStatus(prev => {
      if (prev[deviceKey] === false) return prev;
      return { ...prev, [deviceKey]: false };
    });

    setDeviceInitialLoadStatus(prev => {
      if (prev[deviceKey] === false) return prev;
      return { ...prev, [deviceKey]: false };
    });

    statusUpdateTimerRef.current[deviceKey] = setTimeout(() => {
      setDeviceOnlineStatus(prev => {
        if (prev[deviceKey] === false) return prev;
        return { ...prev, [deviceKey]: false };
      });

      setDeviceConnectionStatus(prev => {
        if (prev[deviceKey] === "offline") return prev;
        return { ...prev, [deviceKey]: "offline" };
      });

      if (deviceKey === selectedExternalKeyRef.current) {
        setConnectionState("offline");
      }

      console.log(`🔴 Device ${deviceKey} is OFFLINE`);
      delete statusUpdateTimerRef.current[deviceKey];
    }, STATUS_UPDATE_DELAY);

    console.log(`⏳ Device ${deviceKey} will be marked OFFLINE in ${STATUS_UPDATE_DELAY/1000}s`);
  }, [clearAllTimersForDevice]);

  // ── Helper: Start data timeout timer for a device ──
  const startDataTimeoutTimer = useCallback((deviceKey) => {
    if (!deviceKey) return;

    if (dataTimeoutTimersRef.current[deviceKey]) {
      clearTimeout(dataTimeoutTimersRef.current[deviceKey]);
      delete dataTimeoutTimersRef.current[deviceKey];
    }

    const timeoutMs = getDeviceTimeout(deviceKey);
    console.log(`⏱️ Starting data timeout timer for ${deviceKey}: ${Math.round(timeoutMs/1000)}s`);

    dataTimeoutTimersRef.current[deviceKey] = setTimeout(() => {
      console.log(`⏰ Data timeout for ${deviceKey} after ${Math.round(timeoutMs/1000)}s of no data`);
      
      const lastDataTime = lastDataReceivedTimePerDevice.current[deviceKey] || 0;
      const timeSinceLastData = Date.now() - lastDataTime;
      
      if (timeSinceLastData < timeoutMs) {
        console.log(`✅ ${deviceKey} received data ${Math.round(timeSinceLastData/1000)}s ago, resetting timer`);
        startDataTimeoutTimer(deviceKey);
        return;
      }

      const hasData = devicesDataRef.current[deviceKey]?.hasReceivedData || false;
      if (!hasData) {
        console.log(`🔴 ${deviceKey}: No data for ${Math.round(timeoutMs/1000)}s, marking OFFLINE`);
        markDeviceOffline(deviceKey);
      } else {
        console.log(`✅ ${deviceKey} has cached data, not marking offline but timer expired`);
      }
      
      delete dataTimeoutTimersRef.current[deviceKey];
    }, timeoutMs);
  }, [getDeviceTimeout]);

  // ── updateDeviceData ──
  const updateDeviceData = useCallback((deviceKey, parsed) => {
    if (pendingRequestsRef.current[deviceKey]) {
      delete pendingRequestsRef.current[deviceKey];
    }

    setDeviceInitialLoadComplete(prev => ({
      ...prev,
      [deviceKey]: true
    }));

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
        lastDataReceived: null,
        hasReceivedData: false,
        isLiveData: false,
        isOnline: false,
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

        if (['ambientTemperature', 'ambientHumidity', 'waterTemperature',
          'co2Level', 'ecValue', 'phValue', 'waterLevel', 'lightLevel',
          'soilMoisture', 'cropId'].includes(key)) {
          updatedSensorData[key] = value;
        }

        if (key === 'deviceStatus') {
          newDeviceStatus = value;
          updatedSensorData.deviceStatus = value;

          const flags = parseDeviceStatus(value);
          newDeviceStatusFlags = flags;

          const bitmaskActuators = {
            water_pump: flags.waterPump,
            water_ILvalve: flags.inletValve,
            water_OLvalve: flags.outletValve,
            nutrient_pump: flags.nutrientPump,
            ac_stat: flags.acStatus,
          };

          for (const [actKey, actValue] of Object.entries(bitmaskActuators)) {
            if (updatedActuatorStatus[actKey] !== actValue) {
              updatedActuatorStatus[actKey] = actValue;
              updatedSensorData[actKey] = actValue;
              hasActuatorUpdate = true;
            }
          }

          const firmwareAutoMode = flags.mode;
          const currentAutoMode = currentData.deviceConfig?.auto_mode;
          if (firmwareAutoMode !== null && firmwareAutoMode !== undefined && firmwareAutoMode !== currentAutoMode) {
            console.log(`🔄 [${deviceKey}] Syncing deviceConfig.auto_mode: ${currentAutoMode} → ${firmwareAutoMode}`);
            const now = new Date();
            updatedDeviceConfig = { ...currentData.deviceConfig, auto_mode: firmwareAutoMode, lastUpdated: now };
            hasConfigUpdate = true;
          }
        }

        if (key === 'deviceStatusFlags') {
          newDeviceStatusFlags = value;
        }

        if (['water_pump', 'water_ILvalve', 'water_OLvalve',
          'nutrient_pump', 'ac_stat'].includes(key)) {
          updatedActuatorStatus[key] = value;
          updatedSensorData[key] = value;
          hasActuatorUpdate = true;
        }

        if (['water_pump_on_time', 'water_pump_interval',
          'nutrient_pump_duration', 'nutrient_pump_on_time'].includes(key)) {
          updatedActuatorStatus[key] = value;
          hasActuatorUpdate = true;
        }
      }

      const now = new Date();
      updatedSensorData.lastUpdated = now;
      updatedActuatorStatus.lastUpdated = now;

      if (hasActuatorUpdate) {
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
  }, []);

  // ── updateLegacyState ──
  const updateLegacyState = useCallback((parsed) => {
    setSensorData(prev => {
      const updatedSensorData = { ...prev };
      let hasSensorUpdate = false;
      let hasActuatorUpdate = false;
      let newDeviceStatusLocal = null;
      let newDeviceStatusFlagsLocal = null;

      for (const [key, value] of Object.entries(parsed)) {
        if (key.startsWith('_')) continue;

        if (['ambientTemperature', 'ambientHumidity', 'waterTemperature',
          'co2Level', 'ecValue', 'phValue', 'waterLevel', 'lightLevel',
          'soilMoisture', 'cropId'].includes(key)) {
          updatedSensorData[key] = value;
          hasSensorUpdate = true;
        }

        if (key === 'deviceStatus') {
          newDeviceStatusLocal = value;
          updatedSensorData.deviceStatus = value;
          hasSensorUpdate = true;

          const flags = parseDeviceStatus(value);
          newDeviceStatusFlagsLocal = flags;

          updatedSensorData.water_pump = flags.waterPump;
          updatedSensorData.water_ILvalve = flags.inletValve;
          updatedSensorData.water_OLvalve = flags.outletValve;
          updatedSensorData.nutrient_pump = flags.nutrientPump;
          updatedSensorData.ac_stat = flags.acStatus;
          hasActuatorUpdate = true;
        }

        if (key === 'deviceStatusFlags') {
          newDeviceStatusFlagsLocal = value;
        }

        if (['water_pump', 'water_ILvalve', 'water_OLvalve',
          'nutrient_pump', 'ac_stat'].includes(key)) {
          updatedSensorData[key] = value;
          hasActuatorUpdate = true;
          hasSensorUpdate = true;
        }

        if (['water_pump_on_time', 'water_pump_interval',
          'nutrient_pump_duration', 'nutrient_pump_on_time'].includes(key)) {
          hasActuatorUpdate = true;
          hasSensorUpdate = true;
        }
      }

      if (hasSensorUpdate) {
        updatedSensorData.lastUpdated = new Date();
      }

      if (newDeviceStatusFlagsLocal) {
        setDeviceStatusFlags(newDeviceStatusFlagsLocal);

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

      if (hasActuatorUpdate) {
        setActuatorStatus(prevAct => {
          const updatedActuator = { ...prevAct };
          const actuatorKeys = ['water_pump', 'water_ILvalve', 'water_OLvalve',
            'nutrient_pump', 'ac_stat'];
          for (const key of actuatorKeys) {
            if (updatedSensorData[key] !== undefined) {
              updatedActuator[key] = updatedSensorData[key];
            }
          }
          const timingKeys = ['water_pump_on_time', 'water_pump_interval',
            'nutrient_pump_duration', 'nutrient_pump_on_time'];
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
  }, []);

  // ── requestDeviceStatus ──
  const requestDeviceStatus = useCallback(async (deviceKey, isInitialLoad = false) => {
    if (!deviceKey) {
      console.log("⚠️ No device key provided");
      return false;
    }

    if (!isNetworkAvailable) {
      console.log(`⏸️ No network - skipping status request for ${deviceKey}`);
      return false;
    }

    if (!isMqttConnected()) {
      console.log(`⚠️ MQTT not connected - cannot request ${deviceKey}`);
      return false;
    }

    if (statusCheckLockRef.current[deviceKey] || statusResponseTimersRef.current[deviceKey]) {
      console.log(`⏳ Already waiting for GET_STATUS response from ${deviceKey}, skipping duplicate`);
      return true;
    }

    const hasData = devicesDataRef.current[deviceKey]?.hasReceivedData === true;
    const lastDataTime = lastDataReceivedTimePerDevice.current[deviceKey] || 0;
    const timeSinceLastData = Date.now() - lastDataTime;
    const isOnline = deviceOnlineStatusRef.current[deviceKey] === true;

    if (isOnline && hasData && timeSinceLastData < getDeviceTimeout(deviceKey)) {
      console.log(`✅ ${deviceKey}: Already ONLINE with data (${Math.round(timeSinceLastData/1000)}s ago) - Skipping GET_STATUS`);
      return true;
    }

    console.log(`📤 ${deviceKey}: Sending GET_STATUS (ONE TIME ONLY)`);

    statusCheckLockRef.current[deviceKey] = true;

    const requestId = generateRequestId();
    const topic = `/messages/${deviceKey}/get_stat`;
    const payload = buildGetStatusPayload(requestId);

    pendingRequestIds.current[deviceKey] = requestId;

    console.log(`📤 GET_STATUS sent to ${deviceKey} | Request: ${requestId}`);

    try {
      const success = await publishWithRetry(topic, payload, 2);

      if (!success) {
        console.log(`⚠️ GET_STATUS publish failed for ${deviceKey}`);
        delete pendingRequestIds.current[deviceKey];
        delete statusCheckLockRef.current[deviceKey];
        return false;
      }

      console.log(`⏳ Waiting ${GET_STATUS_RESPONSE_TIMEOUT / 1000}s for response from ${deviceKey}`);

      const responseTimer = setTimeout(() => {
        if (statusResponseTimersRef.current[deviceKey] !== responseTimer) {
          console.log(`⏰ Timer for ${deviceKey} already cleared, ignoring timeout`);
          return;
        }

        console.log(`❌ No response from ${deviceKey} within ${GET_STATUS_RESPONSE_TIMEOUT / 1000}s`);
        delete statusResponseTimersRef.current[deviceKey];
        delete pendingRequestIds.current[deviceKey];
        delete statusCheckLockRef.current[deviceKey];

        const hasData = devicesDataRef.current[deviceKey]?.hasReceivedData || false;
        if (!hasData) {
          markDeviceOffline(deviceKey);
        } else {
          console.log(`✅ ${deviceKey} has cached data, not marking offline`);
        }
      }, GET_STATUS_RESPONSE_TIMEOUT);

      statusResponseTimersRef.current[deviceKey] = responseTimer;
      return true;
    } catch (error) {
      console.error(`❌ Failed to send GET_STATUS to ${deviceKey}:`, error);
      delete pendingRequestIds.current[deviceKey];
      delete statusCheckLockRef.current[deviceKey];
      return false;
    }
  }, [isNetworkAvailable, markDeviceOffline, markDeviceOnline, getDeviceTimeout]);

  // ── getDeviceStatusOnce ──
  const getDeviceStatusOnce = useCallback(async (deviceKey, forceRefresh = false, isInitialLoad = false) => {
    if (!deviceKey) {
      console.log("⚠️ No device key provided");
      return { success: false, data: null, fromCache: false };
    }

    // ── Check if app is in background ──
    if (appStateRef.current === "background") {
      console.log(`⏸️ ${deviceKey}: App in background, skipping request`);
      return { success: true, data: devicesDataRef.current[deviceKey] || null, fromCache: true, skipped: true };
    }

    // ── Wait for resume to complete ──
    if (appResumeProcessingRef.current) {
      console.log(`⏳ ${deviceKey}: Resume already in progress, waiting...`);
      let attempts = 0;
      while (appResumeProcessingRef.current && attempts < MAX_RESUME_WAIT_ATTEMPTS) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }
      if (appResumeProcessingRef.current) {
        console.log(`⚠️ ${deviceKey}: Resume still processing after ${MAX_RESUME_WAIT_ATTEMPTS * 100}ms, proceeding anyway`);
      }
    }

    if (!forceRefresh) {
      const lastDataTime = lastDataReceivedTimePerDevice.current[deviceKey] || 0;
      const timeSinceLastData = Date.now() - lastDataTime;
      const hasData = devicesDataRef.current[deviceKey]?.hasReceivedData || false;
      
      if (hasData && timeSinceLastData < getDeviceTimeout(deviceKey)) {
        console.log(`✅ ${deviceKey}: Using cached data (${Math.round(timeSinceLastData/1000)}s old) - Device is ONLINE`);
        if (!deviceOnlineStatusRef.current[deviceKey]) {
          markDeviceOnline(deviceKey, true);
        }
        return { 
          success: true, 
          data: devicesDataRef.current[deviceKey],
          fromCache: true,
          isOnline: true
        };
      }
      
      if (hasData) {
        console.log(`✅ ${deviceKey}: Using stale cached data (${Math.round(timeSinceLastData/1000)}s old)`);
        return { 
          success: true, 
          data: devicesDataRef.current[deviceKey],
          fromCache: true,
          isOnline: deviceOnlineStatusRef.current[deviceKey] || false
        };
      }
    }

    if (statusCheckLockRef.current[deviceKey]) {
      console.log(`⏳ ${deviceKey}: GET_STATUS already in flight, skipping`);
      return {
        success: true,
        data: devicesDataRef.current[deviceKey] || null,
        fromCache: true,
        isOnline: deviceOnlineStatusRef.current[deviceKey] || false,
        skipped: true,
      };
    }

    if (pendingRequestsRef.current[deviceKey]) {
      console.log(`⏳ ${deviceKey}: Waiting for pending request...`);
      try {
        const result = await pendingRequestsRef.current[deviceKey];
        return { ...result, fromCache: false };
      } catch (error) {
        console.log(`❌ ${deviceKey}: Pending request failed:`, error);
        delete pendingRequestsRef.current[deviceKey];
      }
    }

    const lastRequestTime = lastRequestTimeRef.current[deviceKey] || 0;
    const timeSinceLastRequest = Date.now() - lastRequestTime;
    if (timeSinceLastRequest < 5000 && !forceRefresh) {
      console.log(`⏸️ ${deviceKey}: Request throttled (${Math.round(timeSinceLastRequest/1000)}s since last)`);
      const cachedData = devicesDataRef.current[deviceKey];
      if (cachedData?.hasReceivedData) {
        return { 
          success: true, 
          data: cachedData,
          fromCache: true,
          isOnline: deviceOnlineStatusRef.current[deviceKey] || false
        };
      }
    }

    console.log(`📤 ${deviceKey}: Sending GET_STATUS once (forceRefresh: ${forceRefresh}, isInitialLoad: ${isInitialLoad})`);
    
    const requestPromise = (async () => {
      try {
        lastRequestTimeRef.current[deviceKey] = Date.now();
        
        const success = await requestDeviceStatus(deviceKey, isInitialLoad);
        
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const updatedData = devicesDataRef.current[deviceKey];
        const isOnline = deviceOnlineStatusRef.current[deviceKey] || false;

        if (isInitialLoad) {
          setDeviceInitialLoadComplete(prev => ({
            ...prev,
            [deviceKey]: true
          }));
          setDeviceInitialLoadStatus(prev => ({
            ...prev,
            [deviceKey]: false
          }));
        }

        return { 
          success, 
          data: updatedData,
          fromCache: false,
          isOnline
        };
      } catch (error) {
        console.error(`❌ ${deviceKey}: Request failed:`, error);

        if (isInitialLoad) {
          setDeviceInitialLoadStatus(prev => ({
            ...prev,
            [deviceKey]: false
          }));
        }
        
        throw error;
      } finally {
        delete pendingRequestsRef.current[deviceKey];
      }
    })();

    pendingRequestsRef.current[deviceKey] = requestPromise;

    try {
      const result = await requestPromise;
      return result;
    } catch (error) {
      console.error(`❌ ${deviceKey}: Request failed:`, error);
      return { success: false, data: null, fromCache: false, error };
    }
  }, [requestDeviceStatus, markDeviceOnline, getDeviceTimeout]);

  // ── getAllDevicesStatusOnce ──
  const getAllDevicesStatusOnce = useCallback(async (forceRefresh = false, isInitialLoad = false) => {
    const devices = availableDevicesRef.current || [];
    if (!devices.length) {
      console.log("⚠️ No devices available for status check");
      return { success: false, results: [] };
    }

    console.log(`📡 Getting status for ${devices.length} devices (forceRefresh: ${forceRefresh}, isInitialLoad: ${isInitialLoad})`);
    
    const devicesToCheck = devices.filter(device => {
      const deviceKey = device.external_key;
      if (!deviceKey) return false;

      if (statusCheckLockRef.current[deviceKey]) return false;
      
      if (forceRefresh) return true;
      
      const lastDataTime = lastDataReceivedTimePerDevice.current[deviceKey] || 0;
      const timeSinceLastData = Date.now() - lastDataTime;
      
      return timeSinceLastData >= getDeviceTimeout(deviceKey) || !devicesDataRef.current[deviceKey]?.hasReceivedData;
    });

    if (devicesToCheck.length === 0) {
      console.log("✅ All devices have recent data (or a check already in flight), skipping checks");
      return { success: true, results: devices.map(d => ({ 
        deviceKey: d.external_key, 
        fromCache: true,
        success: true,
        data: devicesDataRef.current[d.external_key]
      }))};
    }

    const BATCH_SIZE = 3;
    const results = [];
    
    for (let i = 0; i < devicesToCheck.length; i += BATCH_SIZE) {
      const batch = devicesToCheck.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.allSettled(
        batch.map(device => getDeviceStatusOnce(device.external_key, forceRefresh, isInitialLoad))
      );
      results.push(...batchResults);
    }

    return { 
      success: true, 
      results: results.map((result, index) => ({
        ...result,
        deviceKey: devicesToCheck[index]?.external_key
      }))
    };
  }, [getDeviceStatusOnce, getDeviceTimeout]);

  // ── Register live-data listener (fires on every processed MQTT message) ──
  const subscribeToLiveData = useCallback((callback) => {
    if (typeof callback !== "function") return () => {};
    liveDataSubscribersRef.current.add(callback);
    console.log(`📡 Subscribed live-data listener (${liveDataSubscribersRef.current.size} total)`);
    return () => {
      liveDataSubscribersRef.current.delete(callback);
      console.log(`📡 Unsubscribed live-data listener (${liveDataSubscribersRef.current.size} total)`);
    };
  }, []);

  // ── UNIFIED: Process device data ──
  const processDeviceData = useCallback((deviceKey, parsed, isStatusResponse) => {
    if (!deviceKey || !parsed || Object.keys(parsed).length === 0) {
      console.log(`⚠️ Empty data for ${deviceKey}, skipping`);
      return;
    }

    clearAllTimersForDevice(deviceKey);

    const source = isStatusResponse ? 'STATUS' : 'DATA';

    const now = Date.now();
    lastOnlineTimePerDevice.current[deviceKey] = now;

    if (!isStatusResponse) {
      lastDataReceivedTimePerDevice.current[deviceKey] = now;
      console.log(`📥 [${source}] Data received for ${deviceKey}`);
    } else {
      console.log(`📥 [${source}] Status response received for ${deviceKey}`);
    }

    markDeviceOnline(deviceKey, true);
    gracePeriodActive.current = false;

    updateDeviceData(deviceKey, parsed);

    let isOnline = false;
    if (parsed.deviceStatus !== undefined && parsed.deviceStatus !== null) {
      const flags = parseDeviceStatus(parsed.deviceStatus);
      isOnline = flags.online;
    }
    if (!isOnline && parsed.deviceStatusFlags && parsed.deviceStatusFlags.online !== undefined) {
      isOnline = parsed.deviceStatusFlags.online;
    }

    if (!isOnline && Object.keys(parsed).length > 0) {
      const hasSensorData = parsed.ambientTemperature !== undefined ||
        parsed.ambientHumidity !== undefined ||
        parsed.waterLevel !== undefined ||
        parsed.deviceStatus !== undefined;
      if (hasSensorData) {
        isOnline = true;
      }
    }

    setDevicesData(prev => ({
      ...prev,
      [deviceKey]: {
        ...prev[deviceKey],
        lastDataReceived: Date.now(),
        hasReceivedData: true,
        isLiveData: true,
        isOnline: true,
      }
    }));

    setDeviceOnlineStatus(prev => ({
      ...prev,
      [deviceKey]: true
    }));
    setDeviceConnectionStatus(prev => ({ ...prev, [deviceKey]: 'online' }));

    const currentSelectedKey = selectedExternalKeyRef.current;
    const isSelected = currentSelectedKey === deviceKey;

    if (isSelected) {
      updateLegacyState(parsed);
      setConnectionState('online');
      if (isOnline) {
        setHasEverBeenOnline(true);
        hasEverBeenOnlineRef.current = true;
      }
      setHasReceivedData(true);
      hasReceivedDataRef.current = true;
      setIsLiveData(true);
    } else {
      console.log(`📊 Data for non-selected device: ${deviceKey}`);
    }

    if (isStatusResponse) {
      delete pendingRequestIds.current[deviceKey];
    } else {
      if (isUsingGetStat.current) {
        isUsingGetStat.current = false;
      }
    }

    // ── Notify live-data subscribers so screens can build real-time charts ──
    try {
      liveDataSubscribersRef.current.forEach((cb) => {
        try {
          cb({
            deviceKey,
            parsed: { ...parsed },
            receivedAt: now,
            isStatusResponse,
          });
        } catch (listenerError) {
          console.error("❌ Live-data listener error:", listenerError);
        }
      });
    } catch (notifyError) {
      console.error("❌ Error notifying live-data listeners:", notifyError);
    }
  }, [clearAllTimersForDevice, markDeviceOnline, updateDeviceData, updateLegacyState]);

  // ── handleDataMessage ──
  const handleDataMessage = useCallback((deviceKey, msgStr) => {
    try {
      lastRequestTimeRef.current[deviceKey] = Date.now();
      
      const parsed = parseSenMLToObject(msgStr);

      console.log(`\n════════════════════════════════════════════`);
      console.log(`📥 DATA TOPIC MESSAGE from: ${deviceKey}`);
      console.log(`📥 Parsed:`, JSON.stringify(parsed, null, 2));

      processDeviceData(deviceKey, parsed, false);
    } catch (error) {
      console.error(`❌ Error processing data from ${deviceKey}:`, error);
    }
  }, [processDeviceData]);

  // ── handleStatusResponse ──
  const handleStatusResponse = useCallback((deviceKey, msgStr) => {
    try {
      lastRequestTimeRef.current[deviceKey] = Date.now();
      
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
      } catch (e) { }

      if (!isJsonResponse) {
        parsed = parseSenMLToObject(msgStr);

        console.log(`\n════════════════════════════════════════════`);
        console.log(`📥 STATUS RESPONSE from: ${deviceKey}`);
        console.log(`📥 Parsed:`, JSON.stringify(parsed, null, 2));

        const requestId = parsed._requestId || parsed.ReqID;
        const expectedId = pendingRequestIds.current[deviceKey];

        if (requestId && expectedId && requestId !== expectedId) {
          console.log(`⚠️ Request ID mismatch for ${deviceKey}`);
        }

        lastGetStatResponseTime.current[deviceKey] = Date.now();
        processDeviceData(deviceKey, parsed, true);
      }
    } catch (error) {
      console.error(`❌ Error processing status for ${deviceKey}:`, error);
    }
  }, [processDeviceData]);

  // ── handleIncomingMessage ──
  const handleIncomingMessage = useCallback((topic, message) => {
    if (!isMountedRef.current) return;

    const msgStr = message.toString();
    console.log(`📨 Received on ${topic}: ${msgStr.substring(0, 100)}...`);

    const topicParts = topic.split('/');
    if (topicParts.length < 3) return;

    const deviceKey = topicParts[2];
    const topicType = topicParts[3] || '';

    if (topicType === 'status') {
      console.log(`📡 Processing status response for ${deviceKey}`);
      handleStatusResponse(deviceKey, msgStr);
      return;
    }

    if (topicType === 'data') {
      console.log(`📊 Processing data message for ${deviceKey}`);
      handleDataMessage(deviceKey, msgStr);
      return;
    }

    console.log(`📨 Unhandled topic: ${topic}`);
  }, [handleStatusResponse, handleDataMessage]);

  // ── Register MQTT connection callback ──
  useEffect(() => {
    const handleConnectionChange = (connected) => {
      console.log(`📡 MQTT Connection callback: ${connected ? 'CONNECTED' : 'DISCONNECTED'}`);

      if (connected) {
        console.log('✅ MQTT connected - attaching handlers and subscribing');
        handleMqttConnected();
      } else {
        console.log('❌ MQTT disconnected');
        setIsConnected(false);
        setConnectionStateSafe('disconnected');
      }
    };

    connectionCallbackUnsubscribe.current = onMqttConnectionChange(handleConnectionChange);

    return () => {
      if (connectionCallbackUnsubscribe.current) {
        connectionCallbackUnsubscribe.current();
        connectionCallbackUnsubscribe.current = null;
      }
    };
  }, []);

  // ── quickStatusCheck ──
  const quickStatusCheck = useCallback(async () => {
    console.log("📡 Quick status check - ONE TIME ONLY");
    
    if (!isNetworkAvailable) {
      console.log("⏸️ No network - skipping quick status check");
      return { success: false, reason: 'No network' };
    }

    const devices = availableDevicesRef.current || [];
    let hasPendingCheck = false;
    for (const device of devices) {
      const deviceKey = device.external_key;
      if (deviceKey && (pendingRequestsRef.current[deviceKey] || statusCheckLockRef.current[deviceKey])) {
        hasPendingCheck = true;
        break;
      }
    }
    
    if (hasPendingCheck) {
      console.log("⏳ Already have pending requests, skipping quick status check");
      return { success: true, skipped: true, reason: 'Already checking' };
    }

    return await getAllDevicesStatusOnce(false, false);
  }, [isNetworkAvailable, getAllDevicesStatusOnce]);

  // ── Handle MQTT connected event ──
  const handleMqttConnected = useCallback(async () => {
    try {
      const client = await getMqttClient();

      if (!client || !client.connected) {
        console.log('⚠️ Client not connected after callback');
        return;
      }

      console.log('✅ MQTT client connected - setting up handlers');

      setMqttClient(client);
      setIsConnected(true);

      client.removeAllListeners();

      client.on("message", handleIncomingMessage);

      client.on("connect", async () => {
        console.log("✅ MQTT Connected (from client.on connect)");
        setIsConnected(true);
        
        const deviceKey = selectedExternalKeyRef.current;
        const hasFreshData = deviceKey && devicesDataRef.current[deviceKey]?.hasReceivedData &&
          (Date.now() - (lastDataReceivedTimePerDevice.current[deviceKey] || 0) < getDeviceTimeout(deviceKey));
        
        if (!hasFreshData) {
          setConnectionStateSafe('connecting');
        } else {
          console.log('🧊 Skipping connecting state - has fresh data');
        }

        await new Promise(resolve => setTimeout(resolve, 1500));
        await subscribeToAllDevices(client);
        await new Promise(resolve => setTimeout(resolve, 1000));

        const devices = availableDevicesRef.current || [];
        let hasData = false;
        const devicesWithData = [];
        
        for (const device of devices) {
          const deviceKey = device.external_key;
          if (deviceKey && devicesDataRef.current[deviceKey]?.hasReceivedData) {
            hasData = true;
            devicesWithData.push(deviceKey);
            console.log(`✅ ${deviceKey}: Already has data, marking online`);
            markDeviceOnline(deviceKey, true);
          }
        }
        
        const devicesToCheck = devices.filter(d => 
          !devicesWithData.includes(d.external_key)
        );
        
        if (devicesToCheck.length > 0) {
          console.log(`📡 Checking ${devicesToCheck.length} devices without data`);
          for (const device of devicesToCheck) {
            const key = device.external_key;
            if (!statusCheckLockRef.current[key]) {
              console.log(`📡 Checking ${key} (no data yet)`);
              await getDeviceStatusOnce(key, false, true);
              await new Promise(resolve => setTimeout(resolve, 300));
            }
          }
        } else {
          console.log('📡 All devices have data, skipping initial checks');
        }
        
        console.log('📡 Initial setup completed');
      });

      client.on("close", () => {
        if (isMountedRef.current) {
          console.log("🔌 MQTT Disconnected (from client.on close)");
          setIsConnected(false);
          setConnectionStateSafe('disconnected');
          hasInitializedRef.current = false;
        }
      });

      client.on("reconnect", () => console.log("🔄 MQTT Reconnecting..."));
      client.on("error", (err) => console.log("❌ MQTT Error:", err));

      if (client.connected) {
        console.log("✅ Client already connected - triggering connect handler");
        client.emit('connect');
      }
    } catch (error) {
      console.error('❌ Error in handleMqttConnected:', error);
    }
  }, [handleIncomingMessage, getDeviceStatusOnce, markDeviceOnline, getDeviceTimeout]);

  // ── ✅ FIX: Enhanced AppState Listener - Treat background as "closed" ──
  useEffect(() => {
    const subscription = AppState.addEventListener(
      "change",
      async (nextAppState) => {
        const previousAppState = appStateRef.current;
        console.log(`📱 AppState: ${previousAppState} → ${nextAppState}`);
        appStateRef.current = nextAppState;
        setAppState(nextAppState);

        // ── APP GOES TO BACKGROUND - TREAT AS "CLOSED" ──
        if (nextAppState === "background" || nextAppState === "inactive") {
          console.log("⏸️ App entered background - Treating as CLOSED");
          setIsAppInBackground(true);
          
          // ✅ Clear all timers
          if (appResumeTimeoutRef.current) {
            clearTimeout(appResumeTimeoutRef.current);
            appResumeTimeoutRef.current = null;
          }
          
          // ✅ Reset processing flags
          appResumeProcessingRef.current = false;
          isResumingRef.current = false;
          isFreshStartRef.current = true; // Mark for fresh start on resume
          
          // ✅ Reset all device states (show nothing on resume)
          setDeviceOnlineStatus({});
          setDeviceConnectionStatus({});
          setDeviceCheckingStatus({});
          setDeviceInitialLoadStatus({});
          setDeviceInitialLoadComplete({});
          setConnectionState('idle');
          setHasReceivedData(false);
          hasReceivedDataRef.current = false;
          setIsLiveData(false);
          
          // ✅ Clear all device data (will be restored from cache on resume)
          // Don't clear devicesData - it's restored from cache
          
          // ✅ Disconnect MQTT cleanly
          try {
            await disconnectMqtt(true);
          } catch (e) {
            console.log("⚠️ Error disconnecting MQTT on background:", e);
          }
          
          setIsConnected(false);
          
          console.log("🧹 App backgrounded - State reset, MQTT disconnected");
          return;
        }

        // ── APP COMES TO FOREGROUND - TREAT AS "FRESH START" ──
        if (nextAppState === "active" && previousAppState !== "active") {
          console.log("▶️ App came to FOREGROUND - Fresh start");
          setIsAppInBackground(false);
          isResumingRef.current = true;

          const now = Date.now();
          const timeSinceLastResume = now - lastAppResumeTime.current;
          lastAppResumeTime.current = now;

          // Debounce rapid foreground events
          if (timeSinceLastResume < 1000) {
            console.log("⏸️ Resume debounced - too soon");
            setTimeout(() => {
              isResumingRef.current = false;
            }, 500);
            return;
          }

          if (appResumeTimeoutRef.current) {
            clearTimeout(appResumeTimeoutRef.current);
            appResumeTimeoutRef.current = null;
          }

          if (appResumeProcessingRef.current) {
            console.log("⏳ Resume already processing, skipping");
            setTimeout(() => {
              isResumingRef.current = false;
            }, 500);
            return;
          }

          appResumeProcessingRef.current = true;

          // ✅ Add delay to ensure everything is ready
          appResumeTimeoutRef.current = setTimeout(async () => {
            try {
              console.log("🔄 Starting fresh initialization on resume...");
              
              // ✅ Reset device states (show nothing while initializing)
              setDeviceOnlineStatus({});
              setDeviceConnectionStatus({});
              setDeviceCheckingStatus({});
              setDeviceInitialLoadStatus({});
              setDeviceInitialLoadComplete({});
              setConnectionState('connecting');
              setHasReceivedData(false);
              hasReceivedDataRef.current = false;
              setIsLiveData(false);
              
              // ✅ Restore cached data first
              await restoreAllDevicesData();
              
              // ✅ Get device key
              const deviceKey = selectedExternalKeyRef.current;
              if (!deviceKey) {
                console.log("⚠️ No device key on resume");
                appResumeProcessingRef.current = false;
                isResumingRef.current = false;
                return;
              }

              // ✅ Ensure MQTT is connected
              let mqttConnected = isMqttConnected();
              if (!mqttConnected) {
                console.log("⏳ MQTT not connected, connecting...");
                try {
                  await getMqttClient();
                  // Wait for connection to stabilize
                  let attempts = 0;
                  while (attempts < 10 && !isMqttConnected()) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                    attempts++;
                  }
                  mqttConnected = isMqttConnected();
                } catch (e) {
                  console.error("❌ Failed to connect MQTT:", e);
                }
              }

              if (!mqttConnected) {
                console.log("❌ MQTT not connected after resume, retrying...");
                // One more attempt
                try {
                  await reconnectMqttClient();
                  await new Promise(resolve => setTimeout(resolve, 2000));
                } catch (e) {
                  console.error("❌ MQTT reconnect failed:", e);
                }
              }

              // ✅ Check if we have cached data
              const hasData = devicesDataRef.current[deviceKey]?.hasReceivedData || false;
              const lastDataTime = lastDataReceivedTimePerDevice.current[deviceKey] || 0;
              const timeSinceLastData = Date.now() - lastDataTime;
              const timeout = getDeviceTimeout(deviceKey);
              
              if (hasData && timeSinceLastData < timeout) {
                console.log(`✅ ${deviceKey}: Has recent cached data (${Math.round(timeSinceLastData/1000)}s ago)`);
                markDeviceOnline(deviceKey, true);
                appResumeProcessingRef.current = false;
                isResumingRef.current = false;
                return;
              }

              // ✅ Send GET_STATUS for fresh data
              if (statusCheckLockRef.current[deviceKey] || pendingRequestsRef.current[deviceKey]) {
                console.log(`⏳ ${deviceKey}: Already has pending request, skipping`);
                appResumeProcessingRef.current = false;
                isResumingRef.current = false;
                return;
              }
              
              console.log(`📤 ${deviceKey}: GET_STATUS on app resume (fresh start)`);
              await getDeviceStatusOnce(deviceKey, true, true);
              
            } catch (error) {
              console.error("❌ Error during app resume initialization:", error);
            } finally {
              appResumeProcessingRef.current = false;
              appResumeTimeoutRef.current = null;
              setTimeout(() => {
                isResumingRef.current = false;
              }, 300);
            }
          }, APP_RESUME_DELAY);
        }
      }
    );

    return () => {
      subscription.remove();
      if (appResumeTimeoutRef.current) {
        clearTimeout(appResumeTimeoutRef.current);
        appResumeTimeoutRef.current = null;
      }
    };
  }, [getDeviceStatusOnce, markDeviceOnline, getDeviceTimeout]);

  // ── initDeviceData ──
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
      setDeviceTimeout(deviceId, 180);
      
      setDeviceCheckingStatus(prev => ({
        ...prev,
        [deviceId]: false
      }));

      setDeviceInitialLoadStatus(prev => ({
        ...prev,
        [deviceId]: true
      }));
    }
  };

  // ── loadSelectedDevice ──
  const loadSelectedDevice = async () => {
    try {
      const deviceId = await AsyncStorage.getItem(STORAGE_KEYS.SELECTED_DEVICE_ID);
      const deviceName = await AsyncStorage.getItem(STORAGE_KEYS.SELECTED_DEVICE_NAME);
      const extKey = await AsyncStorage.getItem(STORAGE_KEYS.SELECTED_EXTERNAL_KEY);

      console.log("📦 Loading selected device:", { deviceId, deviceName, extKey });

      if (deviceId) {
        setSelectedDeviceId(deviceId);
        let resolvedName = deviceName;
        if (!resolvedName) {
          const dev = availableDevices.find(d => d.id === deviceId);
          resolvedName = dev?.name || dev?.device_name || `Device ${deviceId.slice(-4)}`;
        }
        setSelectedDeviceName(resolvedName);
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

  // ── saveSelectedDevice ──
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

  // ── selectDevice ──
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

    const hasData = devicesDataRef.current[extKey]?.hasReceivedData || false;
    const lastDataTime = lastDataReceivedTimePerDevice.current[extKey] || 0;
    const timeSinceLastData = Date.now() - lastDataTime;
    
    if (hasData && timeSinceLastData < getDeviceTimeout(extKey)) {
      console.log(`✅ ${extKey}: Already has recent data (${Math.round(timeSinceLastData/1000)}s ago) - No request needed`);
      if (!deviceOnlineStatusRef.current[extKey]) {
        markDeviceOnline(extKey, true);
      }
      return true;
    }

    if (statusCheckLockRef.current[extKey] || pendingRequestsRef.current[extKey]) {
      console.log(`⏳ ${extKey}: Already has pending request, skipping`);
      return true;
    }

    console.log(`📡 ONE TIME status request for selected device: ${extKey}`);
    await getDeviceStatusOnce(extKey, true, true);

    console.log(`✅ Device selected with external key: ${extKey}`);
    return true;
  };

  // ── Getters ──
  const getSelectedDeviceId = () => selectedDeviceId;
  const getSelectedDeviceName = () => selectedDeviceName;
  const getSelectedExternalKey = () => selectedExternalKey;

  const getSelectedDeviceData = () => {
    const key = selectedExternalKey || externalKey;
    if (!key) return null;
    return devicesData[key] || null;
  };

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

  // ── getDeviceStatusSync ──
  const getDeviceStatusSync = useCallback((deviceKey) => {
    if (!deviceKey) {
      return { isOnline: false, hasData: false, data: null, isLoading: false, isChecking: false, hasPendingRequest: false, isInitialLoadComplete: false };
    }

    const isOnline = deviceOnlineStatusRef.current[deviceKey] || false;
    const hasData = devicesDataRef.current[deviceKey]?.hasReceivedData || false;
    const data = devicesDataRef.current[deviceKey] || null;
    const isLoading = deviceInitialLoadStatusRef.current[deviceKey] || false;
    const isChecking = !!statusCheckLockRef.current[deviceKey];
    const hasPendingRequest = !!pendingRequestsRef.current[deviceKey];
    const isInitialLoadComplete = deviceInitialLoadCompleteRef.current[deviceKey] || false;

    return { isOnline, hasData, data, isLoading, isChecking, hasPendingRequest, isInitialLoadComplete };
  }, []);

  // ── getSelectedDeviceOnlineStatus ──
  const getSelectedDeviceOnlineStatus = useCallback(() => {
    const key = selectedExternalKeyRef.current || externalKey;
    if (!key) {
      return 'loading';
    }

    const isLoadComplete = deviceInitialLoadCompleteRef.current[key] === true;
    const isLoading = deviceInitialLoadStatusRef.current[key] === true;
    const isOnline = deviceOnlineStatusRef.current[key];

    if (!isLoadComplete && isLoading) {
      return 'loading';
    }

    if (isOnline === undefined || isOnline === null) {
      return 'loading';
    }

    return isOnline === true;
  }, [externalKey]);

  // ── isDeviceChecking ──
  const isDeviceChecking = useCallback((deviceKey) => {
    if (!deviceKey) return false;

    if (statusCheckLockRef.current[deviceKey]) {
      return true;
    }

    if (pendingRequestsRef.current[deviceKey]) {
      return true;
    }
    
    return deviceCheckingStatusRef.current[deviceKey] === true;
  }, []);

  // ── isDeviceInInitialLoad ──
  const isDeviceInInitialLoad = useCallback((deviceKey) => {
    if (!deviceKey) return false;
    
    if (deviceInitialLoadCompleteRef.current[deviceKey] === true) {
      return false;
    }
    
    if (pendingRequestsRef.current[deviceKey]) {
      return true;
    }
    
    return deviceInitialLoadStatusRef.current[deviceKey] === true;
  }, []);

  // ── requestStatusForAllDevices ──
  const requestStatusForAllDevices = useCallback(async () => {
    console.log("📡 Requesting status for all devices - ONE TIME");
    return await getAllDevicesStatusOnce(true, false);
  }, [getAllDevicesStatusOnce]);

  // ── checkSingleDeviceStatus ──
  const checkSingleDeviceStatus = useCallback(async (externalKey) => {
    if (!externalKey) {
      console.log("⚠️ No external key provided");
      return { success: false, reason: 'No external key' };
    }

    console.log(`🔍 Checking status for ${externalKey} - ONE TIME`);

    if (!isNetworkAvailable) {
      console.log("⏸️ No network - skipping single device check");
      return { success: false, reason: 'No network' };
    }

    try {
      return await getDeviceStatusOnce(externalKey, false, false);
    } catch (error) {
      console.error(`❌ Error checking ${externalKey}:`, error);
      return { success: false, error };
    }
  }, [isNetworkAvailable, getDeviceStatusOnce]);

  // ── subscribeToAllDevices ──
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

  // ── subscribeToTopic ──
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

  // ── publish ──
  const publish = (topic, message) => {
    return publishWithRetry(topic, message, 2);
  };

  // ── loadAvailableDevices ──
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
          setDeviceTimeout(thing.external_key, 180);
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

  // ── saveDevice ──
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

  // ── initializeMqtt ──
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

    const devices = await loadAvailableDevices();

    const selected = await loadSelectedDevice();
    console.log("📦 Selected device loaded:", selected);

    if (!selected && devices.length > 0) {
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

    if (!selectedExternalKey && storedKey) {
      setSelectedExternalKey(storedKey);
      await AsyncStorage.setItem(STORAGE_KEYS.SELECTED_EXTERNAL_KEY, storedKey);
      console.log("✅ Set selectedExternalKey from external_key:", storedKey);
    }

    console.log("✅ external_key found, proceeding with MQTT connection");
    setConnectionState(prev => hasReceivedDataRef.current ? prev : 'connecting');
    setIsInitializing(true);

    try {
      await restoreAllDevicesData();
      setExternalKey(storedKey);
      await updateMqttPassword(storedKey);
      await cleanupMqtt();

      await getMqttClient();

      setIsReady(true);
    } catch (error) {
      console.error("❌ Error in MQTT initialization:", error);
      setIsReady(true);
      setConnectionState('error');
    } finally {
      setIsInitializing(false);
    }
  };

  // ── restoreAllDevicesData ──
  const restoreAllDevicesData = async () => {
    try {
      const cached = await loadLastData();
      if (!cached) {
        console.log("🗂️ No cached MQTT snapshot found");
        return false;
      }

      if (cached.devicesData) {
        const restored = {};
        for (const [key, dev] of Object.entries(cached.devicesData)) {
          restored[key] = {
            sensorData: dev.sensorData ? {
              ...dev.sensorData,
              lastUpdated: dev.sensorData.lastUpdated ? new Date(dev.sensorData.lastUpdated) : null,
              deviceStatus: null,
              deviceStatusFlags: null,
            } : { ...DEFAULT_SENSOR_DATA },
            actuatorStatus: dev.actuatorStatus ? {
              ...dev.actuatorStatus,
              lastUpdated: dev.actuatorStatus.lastUpdated ? new Date(dev.actuatorStatus.lastUpdated) : null,
            } : { ...DEFAULT_ACTUATOR_STATUS },
            cropSettings: dev.cropSettings ? {
              ...dev.cropSettings,
              lastUpdated: dev.cropSettings.lastUpdated ? new Date(dev.cropSettings.lastUpdated) : null,
            } : { ...DEFAULT_CROP_SETTINGS },
            deviceConfig: { ...DEFAULT_CONFIG },
            devices: dev.devices || [],
            deviceStatus: null,
            deviceStatusFlags: getDefaultDeviceStatus(),
            lastUpdated: dev.lastUpdated ? new Date(dev.lastUpdated) : null,
            lastDataReceived: dev.lastDataReceived || null,
            hasReceivedData: dev.hasReceivedData || false,
            isLiveData: false,
            isOnline: false,
          };
        }
        setDevicesData(restored);
        console.log("🗂️ Restored sensor data for", Object.keys(restored).length, "devices");
      }

      console.log("🗂️ Restored last MQTT snapshot from AsyncStorage (sensor data only)");
      return true;
    } catch (error) {
      console.error("❌ Error restoring last MQTT snapshot:", error);
      return false;
    }
  };

  // ── persistTimer ──
  const persistTimer = useRef(null);
  useEffect(() => {
    const hasRealData = Object.keys(devicesData).length > 0;
    if (!hasRealData) return;

    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      const cacheData = {
        devicesData,
        savedAt: Date.now(),
      };
      saveLastData(cacheData);
    }, 600);

    return () => {
      if (persistTimer.current) clearTimeout(persistTimer.current);
    };
  }, [devicesData]);

  // ── cleanupMqtt ──
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
    setDeviceStatus(null);
    setConnectionStateSafe(hasReceivedDataRef.current ? 'connecting' : 'idle');

    isUsingGetStat.current = true;
    getStatStartTime.current = null;
  };

  // ── connectToDevice ──
  const connectToDevice = async (deviceId, externalKey) => {
    console.log(`🔌 Connecting to device: ${deviceId} (${externalKey})`);
    setActiveDeviceId(deviceId);
    setExternalKey(externalKey);
    await saveDevice(externalKey, deviceId);
    await forceReconnect(externalKey);
    return true;
  };

  // ── forceReconnect ──
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

  // ── switchToDevice ──
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

  // ── getDeviceData ──
  const getDeviceData = (deviceKey) => {
    return devicesData[deviceKey] || null;
  };

  // ── getDeviceStatus ──
  const getDeviceStatus = (deviceKey) => {
    if (deviceOnlineStatus[deviceKey] === undefined || deviceOnlineStatus[deviceKey] === null) {
      return 'loading';
    }
    return deviceOnlineStatus[deviceKey] || false;
  };

  // ── forceRefreshData ──
  const forceRefreshData = async () => {
    console.log('🔄 Force refreshing all device data...');

    if (!isNetworkAvailable) {
      console.log('⏸️ No network - cannot refresh');
      return false;
    }

    try {
      let client = await getMqttClient();
      if (!client || !client.connected) {
        console.log('🔄 MQTT disconnected - reconnecting for refresh');
        await reconnectMqttClient();
        client = await getMqttClient();
      }

      if (client && client.connected) {
        setIsConnected(true);
        await subscribeToAllDevices(client);
        
        const result = await getAllDevicesStatusOnce(true, false);
        
        console.log('✅ Force refresh completed');
        return result.success;
      } else {
        console.log('❌ Could not connect MQTT for refresh');
        return false;
      }
    } catch (error) {
      console.error('❌ Force refresh error:', error);
      return false;
    }
  };

  // ── publishActuatorStatus ──
  const publishActuatorStatus = async (deviceKey, status) => {
    if (!deviceKey) {
      console.log("⚠️ No device key provided");
      return false;
    }

    const previousStatus = devicesData[deviceKey]?.actuatorStatus || {};
    const payload = buildActuatorPayload(status, deviceKey, previousStatus);
    console.log(`📤 Publishing actuator to /messages/${deviceKey}/actuator`);
    const success = await publish(`/messages/${deviceKey}/actuator`, JSON.stringify(payload));

    if (success) {
      console.log(`✅ Actuator published successfully`);
    } else {
      console.log(`❌ Actuator publish FAILED`);
    }
    return success;
  };

  // ── publishSettings ──
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

      if (deviceKey === selectedExternalKeyRef.current) {
        setCropSettings({ ...settings, lastUpdated: new Date() });
      }
    }
    return success;
  };

  // ── publishConfig ──
  const publishConfig = async (deviceKey, config) => {
    if (!deviceKey) {
      console.log("⚠️ No device key provided");
      return false;
    }

    const previousConfig = devicesData[deviceKey]?.deviceConfig || {};
    const mergedConfig = { ...previousConfig, ...config };
    const payload = buildConfigPayload(deviceKey, mergedConfig, previousConfig);
    const success = await publish(`/messages/${deviceKey}/cfg`, JSON.stringify(payload));

    if (success) {
      console.log(`✅ Config published to ${deviceKey}`);

      const publishedReportInterval = mergedConfig.report_interval || 180;

      setDeviceTimeout(deviceKey, publishedReportInterval);
      setReportInterval(publishedReportInterval);

      try {
        await AsyncStorage.setItem(STORAGE_KEYS.REPORT_INTERVAL, String(publishedReportInterval));
      } catch (error) {
        console.error('❌ Error saving report_interval:', error);
      }

      const configWithoutMode = { ...mergedConfig };
      delete configWithoutMode.auto_mode;
      configWithoutMode.lastUpdated = new Date();

      setDevicesData(prev => ({
        ...prev,
        [deviceKey]: {
          ...prev[deviceKey],
          deviceConfig: {
            ...prev[deviceKey]?.deviceConfig,
            ...configWithoutMode,
            report_interval: publishedReportInterval
          },
        }
      }));

      if (deviceKey === selectedExternalKeyRef.current) {
        setDeviceConfig(prev => ({
          ...prev,
          ...configWithoutMode,
          report_interval: publishedReportInterval
        }));
      }
    }
    return success;
  };

  // ── publishReboot ──
  const publishReboot = async (deviceKey) => {
    if (!deviceKey) {
      console.log("⚠️ No device key for reboot");
      return false;
    }
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

  // ── Main Init Effect ──
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

  // ── loadSavedDevice ──
  const loadSavedDevice = async () => {
    try {
      const savedKey = await AsyncStorage.getItem(STORAGE_KEYS.EXTERNAL_KEY);
      const savedDeviceId = await AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_DEVICE_ID);
      const savedSelectedDeviceId = await AsyncStorage.getItem(STORAGE_KEYS.SELECTED_DEVICE_ID);
      const savedSelectedDeviceName = await AsyncStorage.getItem(STORAGE_KEYS.SELECTED_DEVICE_NAME);
      const savedSelectedExtKey = await AsyncStorage.getItem(STORAGE_KEYS.SELECTED_EXTERNAL_KEY);

      const savedReportInterval = await AsyncStorage.getItem(STORAGE_KEYS.REPORT_INTERVAL);
      let interval = 180;
      if (savedReportInterval) {
        const parsed = parseInt(savedReportInterval, 10);
        if (!isNaN(parsed) && parsed > 0) {
          interval = parsed;
        }
      }
      setReportInterval(interval);
      console.log(`📦 Loaded report_interval: ${interval}s`);

      const devices = await loadAvailableDevices();
      for (const device of devices) {
        setDeviceTimeout(device.external_key, interval);
      }

      if (savedKey) {
        console.log("📦 Loaded saved external_key:", savedKey);
        setExternalKey(savedKey);
      }

      if (savedDeviceId) {
        console.log("📦 Loaded saved activeDeviceId:", savedDeviceId);
        setActiveDeviceId(savedDeviceId);
      }

      if (savedSelectedDeviceId) {
        setSelectedDeviceId(savedSelectedDeviceId);
      }
      if (savedSelectedDeviceName) {
        setSelectedDeviceName(savedSelectedDeviceName);
      } else {
        const matched = devices.find(d => d.id === savedSelectedDeviceId || d.external_key === savedSelectedExtKey);
        const fallbackName = matched?.name || matched?.device_name ||
          (savedSelectedDeviceId ? `Device ${savedSelectedDeviceId.slice(-4)}` : null);
        if (fallbackName) {
          setSelectedDeviceName(fallbackName);
          await AsyncStorage.setItem(STORAGE_KEYS.SELECTED_DEVICE_NAME, fallbackName);
        } else if (savedKey) {
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

  // ── reconnect ──
  const reconnect = async () => {
    console.log("🔄 Attempting to reconnect MQTT...");
    hasInitializedRef.current = false;
    await cleanupMqtt();
    await initializeMqtt();
  };

  // ── Context Value ──
  const contextValue = {
    devicesData,
    deviceConnectionStatus,
    deviceOnlineStatus,
    deviceCheckingStatus,
    deviceInitialLoadStatus,
    deviceInitialLoadComplete,
    availableDevices,
    subscribeToLiveData,
    getDeviceData,
    getDeviceStatus,
    isDeviceChecking,
    isDeviceInInitialLoad,
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
    forceRefreshData,

    getDeviceStatusOnce,
    getAllDevicesStatusOnce,
    getDeviceStatusSync,

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
    isNetworkAvailable,

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
      console.log("isResuming:", isResumingRef.current);
      console.log("appResumeProcessing:", appResumeProcessingRef.current);
      console.log("isNetworkAvailable:", isNetworkAvailable);
      console.log("availableDevices:", availableDevices.length);
      console.log("deviceOnlineStatus:", deviceOnlineStatus);
      console.log("statusCheckLocks:", Object.keys(statusCheckLockRef.current));
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