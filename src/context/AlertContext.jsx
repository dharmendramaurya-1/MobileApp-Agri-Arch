// src/context/AlertContext.jsx
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useMqtt } from './MqttContext';
import { EVENT_BITS } from '../utils/deviceStatusParser';

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
  const previousActuatorStates = useRef({});
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

  // ── Record Actuator / Event Alert (Appends a new event alert for ON or OFF) ──
  const recordActuatorAlert = useCallback((label, emoji, isOn, statusOnText = 'ON', statusOffText = 'OFF', customMessage = null) => {
    const statusText = isOn ? statusOnText : statusOffText;
    const title = `${emoji} ${label}: ${statusText}`;
    const msg = customMessage || `${label} turned ${statusText}`;

    dismissedAlerts.current.delete(title);

    const freshAlert = {
      id: generateAlertId(),
      title,
      message: msg,
      timestamp: new Date(),
    };

    setAlerts(prev => {
      // Avoid rapid double-insertion if same alert fired within 2.5 seconds
      if (prev.length > 0 && prev[0].title === title && (Date.now() - new Date(prev[0].timestamp).getTime() < 2500)) {
        return prev;
      }
      return [freshAlert, ...prev].slice(0, 50);
    });
  }, []);

  const updateActuatorAlert = recordActuatorAlert;

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
    previousActuatorStates.current = {};
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
    // ✅ TYPE 4: ACTUATOR ALERTS & EVENT MASK (Water Pump, Valves, Pumps, AC)
    // ──────────────────────────────────────────────────────────────────────
    const rawEventMask = typeof effectiveSensData.eventMask === 'number'
      ? effectiveSensData.eventMask
      : (typeof effectiveSensData.EventMask === 'number' ? effectiveSensData.EventMask : null);

    // ── 1. WATER PUMP (EventMask Bit 16: ON [65536], Bit 17: OFF [131072], or DevStat Bit 12) ──
    let currentPumpState = null;
    let pumpSource = '';

    if (rawEventMask !== null) {
      if ((rawEventMask & EVENT_BITS.EVENT_WATER_PUMP_ON) !== 0) {
        currentPumpState = true;
        pumpSource = 'Event Mask';
      } else if ((rawEventMask & EVENT_BITS.EVENT_WATER_PUMP_OFF) !== 0) {
        currentPumpState = false;
        pumpSource = 'Event Mask';
      }
    }

    if (currentPumpState === null && typeof currentFlags.waterPump === 'boolean') {
      currentPumpState = currentFlags.waterPump;
      pumpSource = 'DevStat';
    }

    if (currentPumpState !== null) {
      const prevPump = previousActuatorStates.current.waterPump;
      if (prevPump === undefined || prevPump !== currentPumpState) {
        previousActuatorStates.current.waterPump = currentPumpState;

        // Trigger alert on state change, or if pump is actively ON on load
        if (!isInitialLoad.current || currentPumpState === true) {
          console.log(`🔔 [AlertContext] Water Pump alert triggered: ${currentPumpState ? 'ON' : 'OFF'} via ${pumpSource}`);
          updateActuatorAlert(
            'Water Pump',
            '💧',
            currentPumpState,
            'ON',
            'OFF',
            `Water circulation pump turned ${currentPumpState ? 'ON' : 'OFF'}`
          );
        }
      }
    }

    // ── 2. INLET VALVE (EventMask Bit 18: OPEN, Bit 19: CLOSED, or DevStat Bit 10) ──
    let currentInletState = null;
    if (rawEventMask !== null) {
      if ((rawEventMask & EVENT_BITS.EVENT_INLET_VALVE_OPEN) !== 0) currentInletState = true;
      else if ((rawEventMask & EVENT_BITS.EVENT_INLET_VALVE_CLOSED) !== 0) currentInletState = false;
    }
    if (currentInletState === null && typeof currentFlags.inletValve === 'boolean') {
      currentInletState = currentFlags.inletValve;
    }
    if (currentInletState !== null) {
      const prevInlet = previousActuatorStates.current.inletValve;
      if (prevInlet === undefined || prevInlet !== currentInletState) {
        previousActuatorStates.current.inletValve = currentInletState;
        if (!isInitialLoad.current) {
          updateActuatorAlert('Inlet Valve', '🚰', currentInletState, 'OPEN', 'CLOSED');
        }
      }
    }

    // ── 3. OUTLET VALVE (EventMask Bit 20: OPEN, Bit 21: CLOSED, or DevStat Bit 11) ──
    let currentOutletState = null;
    if (rawEventMask !== null) {
      if ((rawEventMask & EVENT_BITS.EVENT_OUTLET_VALVE_OPEN) !== 0) currentOutletState = true;
      else if ((rawEventMask & EVENT_BITS.EVENT_OUTLET_VALVE_CLOSED) !== 0) currentOutletState = false;
    }
    if (currentOutletState === null && typeof currentFlags.outletValve === 'boolean') {
      currentOutletState = currentFlags.outletValve;
    }
    if (currentOutletState !== null) {
      const prevOutlet = previousActuatorStates.current.outletValve;
      if (prevOutlet === undefined || prevOutlet !== currentOutletState) {
        previousActuatorStates.current.outletValve = currentOutletState;
        if (!isInitialLoad.current) {
          updateActuatorAlert('Outlet Valve', '🚿', currentOutletState, 'OPEN', 'CLOSED');
        }
      }
    }

    // ── 4. NUTRIENT PUMP (EventMask Bit 22: ON, Bit 23: OFF, or DevStat Bit 13) ──
    let currentNutrientState = null;
    if (rawEventMask !== null) {
      if ((rawEventMask & EVENT_BITS.EVENT_NUTRIENT_PUMP_ON) !== 0) currentNutrientState = true;
      else if ((rawEventMask & EVENT_BITS.EVENT_NUTRIENT_PUMP_OFF) !== 0) currentNutrientState = false;
    }
    if (currentNutrientState === null && typeof currentFlags.nutrientPump === 'boolean') {
      currentNutrientState = currentFlags.nutrientPump;
    }
    if (currentNutrientState !== null) {
      const prevNutrient = previousActuatorStates.current.nutrientPump;
      if (prevNutrient === undefined || prevNutrient !== currentNutrientState) {
        previousActuatorStates.current.nutrientPump = currentNutrientState;
        if (!isInitialLoad.current) {
          updateActuatorAlert('Nutrient Pump', '🌿', currentNutrientState, 'ON', 'OFF');
        }
      }
    }

    // ── 5. LED LIGHT (EventMask Bit 24: ON, Bit 25: OFF, or DevStat Bit 16) ──
    let currentLedState = null;
    if (rawEventMask !== null) {
      if ((rawEventMask & EVENT_BITS.EVENT_LED_LIGHT_ON) !== 0) currentLedState = true;
      else if ((rawEventMask & EVENT_BITS.EVENT_LED_LIGHT_OFF) !== 0) currentLedState = false;
    }
    if (currentLedState === null && typeof currentFlags.ledStatus === 'boolean') {
      currentLedState = currentFlags.ledStatus;
    }
    if (currentLedState !== null) {
      const prevLed = previousActuatorStates.current.ledStatus;
      if (prevLed === undefined || prevLed !== currentLedState) {
        previousActuatorStates.current.ledStatus = currentLedState;
        if (!isInitialLoad.current) {
          updateActuatorAlert('Light Switch', '💡', currentLedState, 'ON', 'OFF');
        }
      }
    }

    // ── 6. AC STATUS (EventMask Bit 26: ON, Bit 27: OFF, or DevStat Bit 14) ──
    let currentAcState = null;
    if (rawEventMask !== null) {
      if ((rawEventMask & EVENT_BITS.EVENT_AC_ON) !== 0) currentAcState = true;
      else if ((rawEventMask & EVENT_BITS.EVENT_AC_OFF) !== 0) currentAcState = false;
    }
    if (currentAcState === null && typeof currentFlags.acStatus === 'boolean') {
      currentAcState = currentFlags.acStatus;
    }
    if (currentAcState !== null) {
      const prevAc = previousActuatorStates.current.acStatus;
      if (prevAc === undefined || prevAc !== currentAcState) {
        previousActuatorStates.current.acStatus = currentAcState;
        if (!isInitialLoad.current) {
          updateActuatorAlert('AC Status', '❄️', currentAcState, 'ON', 'OFF');
        }
      }
    }

    // ── 7. BUZZER (DevStat Bit 24) ──
    if (typeof currentFlags.buzzer === 'boolean') {
      const prevBuzzer = previousActuatorStates.current.buzzer;
      if (prevBuzzer === undefined || prevBuzzer !== currentFlags.buzzer) {
        previousActuatorStates.current.buzzer = currentFlags.buzzer;
        if (!isInitialLoad.current) {
          updateActuatorAlert('Buzzer', '🔊', currentFlags.buzzer, 'ON', 'OFF');
        }
      }
    }

    // ── 8. SYSTEM MODE (EventMask Bit 28: AUTO, Bit 29: MANUAL, or DevStat Bit 15) ──
    let currentModeState = null;
    if (rawEventMask !== null) {
      if ((rawEventMask & EVENT_BITS.EVENT_MODE_AUTO) !== 0) currentModeState = true;
      else if ((rawEventMask & EVENT_BITS.EVENT_MODE_MANUAL) !== 0) currentModeState = false;
    }
    if (currentModeState === null && typeof currentFlags.mode === 'boolean') {
      currentModeState = currentFlags.mode;
    }
    if (currentModeState !== null) {
      const prevMode = previousActuatorStates.current.mode;
      if (prevMode === undefined || prevMode !== currentModeState) {
        previousActuatorStates.current.mode = currentModeState;
        if (!isInitialLoad.current) {
          const modeStatus = currentModeState ? 'AUTO' : 'MANUAL';
          updateActuatorAlert('Mode', '⚙️', currentModeState, 'AUTO', 'MANUAL', `System mode changed to ${modeStatus}`);
        }
      }
    }

    if (isInitialLoad.current) {
      isInitialLoad.current = false;
    }

    previousState.current = { ...currentFlags };

  }, [
    deviceStatusFlags,
    hasReceivedData,
    sensorData,
    cropSettings,
    addAlert,
    removeAlert,
    updateActuatorAlert,
    getSelectedDeviceSensorData,
    getSelectedDeviceCropSettings
  ]);

  const value = {
    alerts,
    alertCount: alerts.length,
    clearAlerts,
    removeAlertById,
    addAlert,
    recordActuatorAlert,
    updateActuatorAlert,
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