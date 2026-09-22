// src/context/AlertContext.jsx
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useMqtt } from './MqttContext';

const AlertContext = createContext(undefined);

// ── Sensor Definitions & Threshold Configurations ─────────────────────────────
const SENSOR_DEFINITIONS = [
  {
    key: 'ec',
    dataKey: 'ecValue',
    label: 'EC',
    emoji: '⚡',
    unit: 'mS/cm',
    flagHigh: 'ecHigh',
    flagLow: 'ecLow',
    faultBit: 0x08,
    defaultMin: 1.0,
    defaultMax: 3.5,
    cropLowKey: 'ecLow',
    cropHighKey: 'ecHigh',
  },
  {
    key: 'ph',
    dataKey: 'phValue',
    label: 'pH',
    emoji: '🧪',
    unit: '',
    flagHigh: 'phHigh',
    flagLow: 'phLow',
    faultBit: 0x10,
    defaultMin: 5.5,
    defaultMax: 7.5,
    cropLowKey: 'phLow',
    cropHighKey: 'phHigh',
  },
  {
    key: 'co2',
    dataKey: 'co2Level',
    label: 'CO₂',
    emoji: '🫧',
    unit: 'ppm',
    flagHigh: 'co2High',
    flagLow: 'co2Low',
    faultBit: 0x01,
    defaultMin: 350,
    defaultMax: 1500,
    cropLowKey: 'co2Low',
    cropHighKey: 'co2High',
  },
  {
    key: 'lux',
    dataKey: 'lightLevel',
    label: 'Light',
    emoji: '☀️',
    unit: 'lux',
    flagHigh: 'luxHigh',
    flagLow: 'luxLow',
    faultBit: 0x04,
    defaultMin: 10,
    defaultMax: 80000,
    cropLowKey: 'luxLow',
    cropHighKey: 'luxHigh',
  },
  {
    key: 'waterTemp',
    dataKey: 'waterTemperature',
    label: 'Water Temp',
    emoji: '🌡️',
    unit: '°C',
    flagHigh: 'waterTempHigh',
    flagLow: 'waterTempLow',
    faultBit: 0x20,
    defaultMin: 18,
    defaultMax: 26,
    cropLowKey: 'waterTempLow',
    cropHighKey: 'waterTempHigh',
  },
  {
    key: 'airTemp',
    dataKey: 'ambientTemperature',
    label: 'Air Temp',
    emoji: '🌡️',
    unit: '°C',
    flagHigh: 'airTempHigh',
    flagLow: 'airTempLow',
    faultBit: 0x40,
    defaultMin: 18,
    defaultMax: 28,
    cropLowKey: 'tempLow',
    cropHighKey: 'tempHigh',
  },
  {
    key: 'humidity',
    dataKey: 'ambientHumidity',
    label: 'Humidity',
    emoji: '💧',
    unit: '%',
    flagHigh: 'humidityHigh',
    flagLow: 'humidityLow',
    faultBit: 0x80,
    defaultMin: 40,
    defaultMax: 80,
    cropLowKey: 'humidityLow',
    cropHighKey: 'humidityHigh',
  },
  {
    key: 'waterLevel',
    dataKey: 'waterLevel',
    label: 'Tank Level',
    emoji: '🪣',
    unit: '%',
    flagHigh: 'tankHigh',
    flagLow: 'tankLow',
    faultBit: 0x02,
    defaultMin: 25,
    defaultMax: 90,
    cropLowKey: 'waterLevelLow',
    cropHighKey: 'waterLevelHigh',
  },
];

export const AlertProvider = ({ children }) => {
  const { 
    deviceStatusFlags, 
    hasReceivedData,
    sensorData,
    getSelectedDeviceSensorData,
    getSelectedDeviceCropSettings,
    cropSettings,
    selectedExternalKey,
  } = useMqtt();
  
  const [alerts, setAlerts] = useState([]);
  const previousState = useRef({});
  const isInitialLoad = useRef(true);
  const dismissedAlerts = useRef(new Set());

  // ── Generate unique alert ID ──────────────────────────────────────────────
  const generateAlertId = () => {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  };

  // ── Add alert ────────────────────────────────────────────────────────────
  const addAlert = useCallback((title, message) => {
    if (dismissedAlerts.current.has(title)) {
      return null;
    }

    const newAlert = {
      id: generateAlertId(),
      title,
      message,
      timestamp: new Date(),
    };
    
    setAlerts(prev => {
      if (prev.some(alert => alert.title === title)) {
        return prev;
      }
      const updated = [newAlert, ...prev];
      return updated.slice(0, 50);
    });
    
    return newAlert;
  }, []);

  // ── Remove alert by title ──────────────────────────────────────────────
  const removeAlert = useCallback((title) => {
    dismissedAlerts.current.delete(title);
    setAlerts(prev => prev.filter(alert => alert.title !== title));
  }, []);

  // ── Remove alert by ID (user dismiss) ───────────────────────────────────
  const removeAlertById = useCallback((alertId) => {
    setAlerts(prev => {
      const target = prev.find(alert => alert.id === alertId);
      if (target) {
        dismissedAlerts.current.add(target.title);
      }
      return prev.filter(alert => alert.id !== alertId);
    });
  }, []);

  // ── Clear all alerts (user clear) ───────────────────────────────────────
  const clearAlerts = useCallback(() => {
    setAlerts(prev => {
      prev.forEach(alert => dismissedAlerts.current.add(alert.title));
      return [];
    });
  }, []);

  // ── Reset state on device switch ─────────────────────────────────────────
  useEffect(() => {
    previousState.current = {};
    dismissedAlerts.current.clear();
    setAlerts([]);
    isInitialLoad.current = true;
  }, [selectedExternalKey]);

  // ── Update alerts from device flags & live sensor data ──────────────────
  useEffect(() => {
    if (!hasReceivedData && !deviceStatusFlags) return;
    
    const currentFlags = deviceStatusFlags || {};
    const prev = previousState.current;

    // Get live sensor data & crop thresholds
    const effectiveSensData = sensorData || (typeof getSelectedDeviceSensorData === 'function' ? getSelectedDeviceSensorData() : null) || {};
    const currentCrop = cropSettings || (typeof getSelectedDeviceCropSettings === 'function' ? getSelectedDeviceCropSettings() : null) || {};

    const sensFlt = typeof effectiveSensData.SensFlt === 'number'
      ? effectiveSensData.SensFlt
      : (typeof effectiveSensData.sensorFaultStatus === 'number' ? effectiveSensData.sensorFaultStatus : null);

    // ──────────────────────────────────────────────────────────────────────
    // ✅ TYPE 1 & 2: SENSOR THRESHOLDS & HARDWARE FAULTS (ALL 8 SENSORS)
    // ──────────────────────────────────────────────────────────────────────
    SENSOR_DEFINITIONS.forEach(def => {
      const rawVal = effectiveSensData[def.dataKey];
      const numVal = (rawVal !== undefined && rawVal !== null && !isNaN(Number(rawVal))) ? Number(rawVal) : null;

      const minVal = currentCrop[def.cropLowKey] ?? def.defaultMin;
      const maxVal = currentCrop[def.cropHighKey] ?? def.defaultMax;

      // ── HIGH Check (Flag from firmware OR reading exceeding threshold) ──
      const isHighByFlag = currentFlags[def.flagHigh] === true;
      const isHighByValue = numVal !== null && numVal > maxVal;

      const titleHigh = `${def.emoji} ${def.label}: HIGH`;
      if (isHighByFlag || isHighByValue) {
        const message = numVal !== null 
          ? `${def.label} reading (${numVal}${def.unit ? ' ' + def.unit : ''}) is HIGH`
          : `${def.label} - HIGH condition detected`;
        addAlert(titleHigh, message);
      } else {
        removeAlert(titleHigh);
      }

      // ── LOW Check (Flag from firmware OR reading below threshold) ──
      const isLowByFlag = currentFlags[def.flagLow] === true;
      const isLowByValue = numVal !== null && numVal < minVal;

      const titleLow = `${def.emoji} ${def.label}: LOW`;
      if (isLowByFlag || isLowByValue) {
        const message = numVal !== null 
          ? `${def.label} reading (${numVal}${def.unit ? ' ' + def.unit : ''}) is LOW`
          : `${def.label} - LOW condition detected`;
        addAlert(titleLow, message);
      } else {
        removeAlert(titleLow);
      }

      // ── HARDWARE FAULT Check (SensFlt bitmask OR global fault with bad reading) ──
      const titleFault = `${def.emoji} ${def.label}: FAULT`;
      const isFaultByMask = sensFlt !== null && ((sensFlt & def.faultBit) !== 0);
      const isFaultByGlobal = currentFlags.sensorFault === true && (numVal !== null && (numVal <= 0 || numVal > def.defaultMax * 2));

      if (isFaultByMask || isFaultByGlobal) {
        const message = `${def.label} hardware fault detected`;
        addAlert(titleFault, message);
      } else {
        removeAlert(titleFault);
      }
    });

    // ──────────────────────────────────────────────────────────────────────
    // ✅ TYPE 3: GENERAL SENSOR FAULT (Bit 23 of DevStat)
    // ──────────────────────────────────────────────────────────────────────
    if (currentFlags.sensorFault === true) {
      addAlert('⚠️ Sensor Fault: FAULT', 'General sensor hardware fault reported by system');
    } else {
      removeAlert('⚠️ Sensor Fault: FAULT');
    }

    // ──────────────────────────────────────────────────────────────────────
    // ✅ TYPE 4: ACTUATOR ALERTS (Pumps, Valves, AC, Buzzer) - State transitions
    // ──────────────────────────────────────────────────────────────────────
    const actuatorAlerts = [
      { key: 'waterPump', label: 'Water Pump', emoji: '💧', onStatus: 'ON', offStatus: 'OFF' },
      { key: 'nutrientPump', label: 'Nutrient Pump', emoji: '🌿', onStatus: 'ON', offStatus: 'OFF' },
      { key: 'inletValve', label: 'Inlet Valve', emoji: '🚰', onStatus: 'OPEN', offStatus: 'CLOSED' },
      { key: 'outletValve', label: 'Outlet Valve', emoji: '🚿', onStatus: 'OPEN', offStatus: 'CLOSED' },
      { key: 'acStatus', label: 'AC Status', emoji: '❄️', onStatus: 'ON', offStatus: 'OFF' },
      { key: 'buzzer', label: 'Buzzer', emoji: '🔊', onStatus: 'ON', offStatus: 'OFF' },
    ];

    if (!isInitialLoad.current) {
      actuatorAlerts.forEach(({ key, label, emoji, onStatus, offStatus }) => {
        const currentVal = currentFlags[key];
        const prevVal = prev[key];
        
        if (currentVal !== undefined && prevVal !== undefined && currentVal !== prevVal) {
          if (currentVal === true) {
            const title = `${emoji} ${label}: ${onStatus}`;
            const message = `${label} turned ${onStatus}`;
            addAlert(title, message);
          } else if (currentVal === false) {
            const title = `${emoji} ${label}: ${offStatus}`;
            const message = `${label} turned ${offStatus}`;
            addAlert(title, message);
          }
        }
      });

      // Mode change alert
      const currentMode = currentFlags.mode;
      const prevMode = prev.mode;
      if (currentMode !== undefined && prevMode !== undefined && currentMode !== prevMode) {
        const modeStatus = currentMode ? 'AUTO' : 'MANUAL';
        const title = `⚙️ Mode: ${modeStatus}`;
        const message = `System mode changed to ${modeStatus}`;
        addAlert(title, message);
      }
    }

    if (isInitialLoad.current) {
      isInitialLoad.current = false;
    }

    previousState.current = { ...currentFlags };

  }, [deviceStatusFlags, hasReceivedData, sensorData, cropSettings, addAlert, removeAlert, getSelectedDeviceSensorData, getSelectedDeviceCropSettings]);

  const value = {
    alerts,
    alertCount: alerts.length,
    clearAlerts,
    removeAlertById,
    addAlert,
  };

  return (
    <AlertContext.Provider value={value}>
      {children}
    </AlertContext.Provider>
  );
};

export const useAlerts = () => {
  const context = useContext(AlertContext);
  if (!context) {
    throw new Error('useAlerts must be used within an AlertProvider');
  }
  return context;
};