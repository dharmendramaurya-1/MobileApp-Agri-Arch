// src/context/TankSafetyContext.jsx
import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { Alert } from 'react-native';
import { useMqtt } from './MqttContext';
import { useSystemMode } from './SystemModeContext';

const TankSafetyContext = createContext(undefined);

export const CLEAN_TANK_PHASES = {
  IDLE: 'IDLE',
  DRAINING: 'DRAINING',           // Pump OFF, Inlet CLOSED, Outlet OPEN until level < 5%
  OUTLET_CLOSED: 'OUTLET_CLOSED', // Level < 5% reached, Outlet closed
  REFILLING: 'REFILLING',         // Inlet OPEN, filling tank + monitoring 3% in 3min
  PUMP_RESUMED: 'PUMP_RESUMED',   // Level > 15%, Pump restarted
  COMPLETED: 'COMPLETED',
  ALERT_NO_INFLOW: 'ALERT_NO_INFLOW',
};

// Pure helper to validate outlet valve opening
export function canOpenOutletValve(waterLevel, isCleanTankActive) {
  if (waterLevel === null || waterLevel === undefined) return true;
  const minLevel = isCleanTankActive ? 5 : 15;
  return waterLevel >= minLevel;
}

// Pure helper to validate inlet valve opening
export function canOpenInletValve(waterLevel) {
  if (waterLevel === null || waterLevel === undefined) return true;
  return waterLevel < 90;
}

export const TankSafetyProvider = ({ children }) => {
  const {
    selectedExternalKey,
    externalKey,
    getSelectedDeviceActuatorStatus,
    getSelectedDeviceSensorData,
    getSelectedDeviceCleanTankStatus,
    publishActuatorStatus,
    publishCleanTank,
    isConnected,
    deviceOnlineStatus,
  } = useMqtt();

  const { isManualMode } = useSystemMode();

  const deviceKey = selectedExternalKey || externalKey;
  const actuatorStatus = getSelectedDeviceActuatorStatus();
  const sensorData = getSelectedDeviceSensorData();
  const rawCleanTankStatus = getSelectedDeviceCleanTankStatus();

  const currentLevel = sensorData?.waterLevel ?? null;
  const isPumpOn = actuatorStatus?.water_pump === true;
  const isInletOpen = actuatorStatus?.water_ILvalve === true;
  const isOutletOpen = actuatorStatus?.water_OLvalve === true;

  // ── States ──
  const [cleanTankActive, setCleanTankActive] = useState(false);
  const [cleanTankPhase, setCleanTankPhase] = useState(CLEAN_TANK_PHASES.IDLE);
  const [cleanTankMessage, setCleanTankMessage] = useState('');
  const [safetyAlert, setSafetyAlert] = useState(null);
  const [inflowSecondsRemaining, setInflowSecondsRemaining] = useState(180);

  // Refs for tracking timers and baselines
  const inflowStartTimeRef = useRef(null);
  const inflowBaselineLevelRef = useRef(null);
  const inflowCheckIntervalRef = useRef(null);
  const cleanTankActiveRef = useRef(cleanTankActive);
  const cleanTankPhaseRef = useRef(cleanTankPhase);
  const currentLevelRef = useRef(currentLevel);
  const actuatorStatusRef = useRef(actuatorStatus);

  cleanTankActiveRef.current = cleanTankActive;
  cleanTankPhaseRef.current = cleanTankPhase;
  currentLevelRef.current = currentLevel;
  actuatorStatusRef.current = actuatorStatus;

  // Sync external clean tank status from MQTT
  useEffect(() => {
    if (rawCleanTankStatus !== undefined && rawCleanTankStatus !== null) {
      if (rawCleanTankStatus && !cleanTankActive) {
        setCleanTankActive(true);
        if (cleanTankPhase === CLEAN_TANK_PHASES.IDLE) {
          setCleanTankPhase(CLEAN_TANK_PHASES.DRAINING);
        }
      } else if (!rawCleanTankStatus && cleanTankActive) {
        setCleanTankActive(false);
        setCleanTankPhase(CLEAN_TANK_PHASES.IDLE);
        setCleanTankMessage('');
      }
    }
  }, [rawCleanTankStatus]);

  // ── Helper to publish actuator changes ──
  const sendActuatorUpdate = useCallback(async (overrides) => {
    if (!deviceKey) return false;
    const current = actuatorStatusRef.current || {};
    const updated = {
      ...current,
      ...overrides,
    };
    return await publishActuatorStatus(deviceKey, updated);
  }, [deviceKey, publishActuatorStatus]);

  // ── Start Auto Clean Tank Process ──
  const startCleanTank = useCallback(async () => {
    if (!deviceKey) {
      Alert.alert('Error', 'No device selected');
      return false;
    }

    const isOnline = isConnected && deviceOnlineStatus?.[deviceKey] === true;
    if (!isOnline) {
      Alert.alert('Device Offline', 'Cannot start clean tank cycle while device is offline.');
      return false;
    }

    console.log('🚰 Starting Auto Clean Tank Process for', deviceKey);
    setCleanTankActive(true);
    setCleanTankPhase(CLEAN_TANK_PHASES.DRAINING);
    setCleanTankMessage('Phase 1: Switching off Pump, Closing Inlet Valve, Opening Outlet Valve to drain to < 5%');

    // Notify MQTT
    await publishCleanTank(deviceKey, true);

    // 1. Switch off PUMP, Close Inlet Valve, Open Outlet Valve
    await sendActuatorUpdate({
      water_pump: false,
      water_ILvalve: false,
      water_OLvalve: true,
    });

    return true;
  }, [deviceKey, publishCleanTank, sendActuatorUpdate]);

  // ── Stop Clean Tank Process ──
  const stopCleanTank = useCallback(async () => {
    if (!deviceKey) return false;

    console.log('🛑 Stopping Auto Clean Tank Process for', deviceKey);
    setCleanTankActive(false);
    setCleanTankPhase(CLEAN_TANK_PHASES.IDLE);
    setCleanTankMessage('Clean Tank process stopped.');

    if (inflowCheckIntervalRef.current) {
      clearInterval(inflowCheckIntervalRef.current);
      inflowCheckIntervalRef.current = null;
    }
    inflowStartTimeRef.current = null;
    inflowBaselineLevelRef.current = null;
    setInflowSecondsRemaining(180);

    // Notify MQTT
    await publishCleanTank(deviceKey, false);

    // Close outlet valve for safety
    await sendActuatorUpdate({
      water_OLvalve: false,
    });

    return true;
  }, [deviceKey, publishCleanTank, sendActuatorUpdate]);

  // ── Auto Clean Tank State Machine Monitor ──
  useEffect(() => {
    if (!cleanTankActive) return;

    const level = currentLevel;
    const phase = cleanTankPhase;

    // ── Phase 1 / DRAINING: Wait until waterLevel < 5% ──
    if (phase === CLEAN_TANK_PHASES.DRAINING) {
      if (level !== null && level < 5) {
        console.log(`🚰 [CleanTank] Level is ${level}% (< 5%). Closing Outlet, Opening Inlet to refill.`);
        setCleanTankPhase(CLEAN_TANK_PHASES.REFILLING);
        setCleanTankMessage('Phase 2: Draining complete (< 5%). Outlet closed, Inlet opened. Monitoring water inflow (≥ 3% every 3 min)...');

        // Close Outlet, Open Inlet
        sendActuatorUpdate({
          water_OLvalve: false,
          water_ILvalve: true,
        });

        // Initialize 3-minute inflow monitor
        inflowStartTimeRef.current = Date.now();
        inflowBaselineLevelRef.current = level;
        setInflowSecondsRemaining(180);
      }
    }

    // ── Phase 2 / REFILLING: Level reaches > 15% -> Start Pump ──
    if (phase === CLEAN_TANK_PHASES.REFILLING) {
      if (level !== null && level > 15 && !isPumpOn) {
        console.log(`🚰 [CleanTank] Level reached ${level}% (> 15%). Starting water pump.`);
        setCleanTankPhase(CLEAN_TANK_PHASES.PUMP_RESUMED);
        setCleanTankMessage('Phase 3: Water level > 15%. Water Pump restarted successfully!');

        // Start Pump
        sendActuatorUpdate({
          water_pump: true,
        });

        // If level crosses 90%, complete clean tank
        if (level >= 90) {
          console.log(`🚰 [CleanTank] Tank full (>= 90%). Completing Clean Tank.`);
          sendActuatorUpdate({
            water_ILvalve: false,
          });
          setCleanTankPhase(CLEAN_TANK_PHASES.COMPLETED);
          setCleanTankMessage('Clean Tank process completed successfully! Tank refilled.');
          publishCleanTank(deviceKey, false);
          setCleanTankActive(false);
        }
      }
    }

    if (phase === CLEAN_TANK_PHASES.PUMP_RESUMED) {
      if (level !== null && level >= 90) {
        console.log(`🚰 [CleanTank] Tank full (>= 90%). Inlet closed.`);
        sendActuatorUpdate({
          water_ILvalve: false,
        });
        setCleanTankPhase(CLEAN_TANK_PHASES.COMPLETED);
        setCleanTankMessage('Clean Tank process completed successfully! Tank full.');
        publishCleanTank(deviceKey, false);
        setCleanTankActive(false);
      }
    }
  }, [cleanTankActive, cleanTankPhase, currentLevel, isPumpOn, deviceKey, sendActuatorUpdate, publishCleanTank]);

  // ── 3-Minute Inflow Monitoring Loop (Applies ONLY during Clean Tank) ──
  useEffect(() => {
    // We only monitor inflow during Clean Tank
    if (!cleanTankActive || !isInletOpen) {
      if (inflowCheckIntervalRef.current) {
        clearInterval(inflowCheckIntervalRef.current);
        inflowCheckIntervalRef.current = null;
      }
      inflowStartTimeRef.current = null;
      inflowBaselineLevelRef.current = null;
      setInflowSecondsRemaining(180);
      return;
    }

    // Inlet is OPEN: Start or continue inflow monitoring
    if (!inflowStartTimeRef.current) {
      inflowStartTimeRef.current = Date.now();
      inflowBaselineLevelRef.current = currentLevel ?? 0;
      setInflowSecondsRemaining(180);
    }

    inflowCheckIntervalRef.current = setInterval(() => {
      const now = Date.now();
      const elapsed = Math.floor((now - (inflowStartTimeRef.current || now)) / 1000);
      const remaining = Math.max(0, 180 - elapsed);
      setInflowSecondsRemaining(remaining);

      // Check if 3 minutes (180s) have passed
      if (elapsed >= 180) {
        const baseline = inflowBaselineLevelRef.current ?? 0;
        const current = currentLevelRef.current ?? 0;
        const delta = current - baseline;

        console.log(`⏱️ 3-minute inflow check: baseline=${baseline}%, current=${current}%, delta=${delta}%`);

        // Check if level changed by at least 3% (or increased in manual mode)
        const minChangeRequired = cleanTankActiveRef.current ? 3 : 1;

        if (delta < minChangeRequired) {
          console.warn(`⚠️ No water inflow detected within 3 minutes (delta: ${delta}% < ${minChangeRequired}%). Closing Inlet Valve.`);

          // Shut off Inlet Valve to avoid emptying overhead supply / leak
          const updates = { water_ILvalve: false };

          // In Clean Tank mode: check tank level; if > 15%, start pump operation
          if (cleanTankActiveRef.current) {
            if (current > 15) {
              console.log(`🚰 Level is ${current}% (> 15%). Starting pump operation.`);
              updates.water_pump = true;
            }
            setCleanTankPhase(CLEAN_TANK_PHASES.ALERT_NO_INFLOW);
            setCleanTankMessage('Warning: No water inflow detected for 3 minutes. Inlet valve closed for safety.');
            publishCleanTank(deviceKey, false);
            setCleanTankActive(false);
          }

          sendActuatorUpdate(updates);

          const alertMsg = cleanTankActiveRef.current
            ? 'Auto Clean Tank: Water level did not increase by 3% within 3 minutes. Inlet valve closed to protect overhead tank.'
            : 'Inlet Valve Safety Cutoff: No increase in tank water level detected for 3 minutes. Inlet valve closed to avoid emptying overhead tank or leaking.';

          setSafetyAlert(alertMsg);
          Alert.alert('⚠️ Water Inflow Warning', alertMsg);

          // Reset timer
          inflowStartTimeRef.current = null;
          inflowBaselineLevelRef.current = null;
          setInflowSecondsRemaining(180);
        } else {
          // Level increased adequately! Reset baseline and start next 3-minute window
          console.log(`✅ Inflow confirmed (+${delta}%). Resetting 3-minute window.`);
          inflowStartTimeRef.current = Date.now();
          inflowBaselineLevelRef.current = current;
          setInflowSecondsRemaining(180);
        }
      }
    }, 1000);

    return () => {
      if (inflowCheckIntervalRef.current) {
        clearInterval(inflowCheckIntervalRef.current);
        inflowCheckIntervalRef.current = null;
      }
    };
  }, [isInletOpen, deviceKey, sendActuatorUpdate, publishCleanTank]);

  // ── General Valve Level Protections ──
  useEffect(() => {
    if (currentLevel === null || currentLevel === undefined) return;

    // 1. CLEAN TANK PROTECTIONS
    if (cleanTankActive) {
      if (isOutletOpen && currentLevel < 5) {
        console.log(`🚰 [CleanTank] Level is ${currentLevel}% (< 5%). Closing Outlet Valve.`);
        sendActuatorUpdate({ water_OLvalve: false });
      }
      if (isInletOpen && currentLevel >= 90) {
        console.log(`🚰 [CleanTank] Tank full (>= 90%). Closing Inlet Valve.`);
        sendActuatorUpdate({ water_ILvalve: false });
      }
      return;
    }

    // 2. AUTO MODE INLET VALVE AUTOMATION:
    if (!isManualMode) {
      // In auto mode: open inlet valve when water falls below 15%, stop after it crosses 90%
      if (currentLevel < 15 && !isInletOpen) {
        console.log(`🤖 [AutoMode] Tank Level is ${currentLevel}% (< 15%). Opening Inlet Valve.`);
        sendActuatorUpdate({ water_ILvalve: true });
      } else if (currentLevel >= 90 && isInletOpen) {
        console.log(`🤖 [AutoMode] Tank Level is ${currentLevel}% (>= 90%). Closing Inlet Valve.`);
        sendActuatorUpdate({ water_ILvalve: false });
      }
    }
    // In MANUAL mode: No automatic overrides — the user has full manual control to turn all devices ON or OFF.
  }, [currentLevel, isInletOpen, isOutletOpen, cleanTankActive, isManualMode, sendActuatorUpdate]);

  const clearSafetyAlert = () => setSafetyAlert(null);

  const value = {
    cleanTankActive,
    cleanTankPhase,
    cleanTankMessage,
    safetyAlert,
    clearSafetyAlert,
    inflowSecondsRemaining,
    currentLevel,
    isPumpOn,
    isInletOpen,
    isOutletOpen,
    startCleanTank,
    stopCleanTank,
    canOpenOutletValve: (targetLevel = currentLevel) => canOpenOutletValve(targetLevel, cleanTankActive),
    canOpenInletValve: (targetLevel = currentLevel) => canOpenInletValve(targetLevel),
  };

  return (
    <TankSafetyContext.Provider value={value}>
      {children}
    </TankSafetyContext.Provider>
  );
};

export const useTankSafety = () => {
  const context = useContext(TankSafetyContext);
  if (!context) {
    return {
      cleanTankActive: false,
      cleanTankPhase: CLEAN_TANK_PHASES.IDLE,
      cleanTankMessage: '',
      safetyAlert: null,
      clearSafetyAlert: () => {},
      inflowSecondsRemaining: 180,
      currentLevel: null,
      isPumpOn: false,
      isInletOpen: false,
      isOutletOpen: false,
      startCleanTank: async () => false,
      stopCleanTank: async () => false,
      canOpenOutletValve: () => true,
      canOpenInletValve: () => true,
    };
  }
  return context;
};
