// src/context/AlertContext.jsx
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useMqtt } from './MqttContext';

const AlertContext = createContext(undefined);

export const AlertProvider = ({ children }) => {
  const { 
    deviceStatusFlags, 
    hasReceivedData,
  } = useMqtt();
  
  const [alerts, setAlerts] = useState([]);
  const previousState = useRef({});
  const isInitialLoad = useRef(true);

  // ── Generate alert ID ────────────────────────────────────────────────────
  const generateAlertId = () => {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  };

  // ── Add alert ────────────────────────────────────────────────────────────
  const addAlert = (title, message) => {
    // Check if this exact alert already exists
    const exists = alerts.some(alert => alert.title === title);
    
    if (exists) {
      return null;
    }

    const newAlert = {
      id: generateAlertId(),
      title,
      message,
      timestamp: new Date(),
    };
    
    setAlerts(prev => {
      const updated = [newAlert, ...prev];
      if (updated.length > 50) {
        return updated.slice(0, 50);
      }
      return updated;
    });
    
    return newAlert;
  };

  // ── Remove alert by title ──────────────────────────────────────────────
  const removeAlert = (title) => {
    setAlerts(prev => prev.filter(alert => alert.title !== title));
  };

  // ── Remove alert by ID ──────────────────────────────────────────────────
  const removeAlertById = (alertId) => {
    setAlerts(prev => prev.filter(alert => alert.id !== alertId));
  };

  // ── Clear all alerts ────────────────────────────────────────────────────
  const clearAlerts = () => {
    setAlerts([]);
  };

  // ── Update alerts from device flags ────────────────────────────────────
  useEffect(() => {
    if (!hasReceivedData || !deviceStatusFlags) return;
    
    console.log('📊 Device Flags:', deviceStatusFlags);
    
    const current = deviceStatusFlags;
    const prev = previousState.current;

    // ──────────────────────────────────────────────────────────────────────
    // ✅ TYPE 1: SENSOR ALERTS (High/Low) - Only show when TRUE
    // ──────────────────────────────────────────────────────────────────────
    const sensorAlerts = [
      { key: 'tankLow', label: 'Tank Level', emoji: '🪣', status: 'LOW' },
      { key: 'tankHigh', label: 'Tank Level', emoji: '🪣', status: 'HIGH' },
      { key: 'ecHigh', label: 'EC', emoji: '⚡', status: 'HIGH' },
      { key: 'ecLow', label: 'EC', emoji: '⚡', status: 'LOW' },
      { key: 'phHigh', label: 'pH', emoji: '🧪', status: 'HIGH' },
      { key: 'phLow', label: 'pH', emoji: '🧪', status: 'LOW' },
      { key: 'luxLow', label: 'Light', emoji: '☀️', status: 'LOW' },
      { key: 'luxHigh', label: 'Light', emoji: '☀️', status: 'HIGH' },
      { key: 'co2High', label: 'CO₂', emoji: '🫧', status: 'HIGH' },
      { key: 'co2Low', label: 'CO₂', emoji: '🫧', status: 'LOW' },
      { key: 'waterTempHigh', label: 'Water Temp', emoji: '🌡️', status: 'HIGH' },
      { key: 'waterTempLow', label: 'Water Temp', emoji: '🌡️', status: 'LOW' },
      { key: 'airTempHigh', label: 'Air Temp', emoji: '🌡️', status: 'HIGH' },
      { key: 'airTempLow', label: 'Air Temp', emoji: '🌡️', status: 'LOW' },
      { key: 'humidityHigh', label: 'Humidity', emoji: '💧', status: 'HIGH' },
      { key: 'humidityLow', label: 'Humidity', emoji: '💧', status: 'LOW' },
      { key: 'sensorFault', label: 'Sensor Fault', emoji: '⚠️', status: 'FAULT' },
    ];

    // ✅ Sensor alerts: Only show when TRUE, remove when FALSE
    sensorAlerts.forEach(({ key, label, emoji, status }) => {
      const currentVal = current[key];
      
      if (currentVal === true) {
        // Show alert (TRUE = problem)
        const title = `${emoji} ${label}: ${status}`;
        const message = `${label} - ${status} at ${new Date().toLocaleTimeString()}`;
        addAlert(title, message);
      } else {
        // Remove alert (FALSE = normal)
        const title = `${emoji} ${label}: ${status}`;
        removeAlert(title);
      }
    });

    // ──────────────────────────────────────────────────────────────────────
    // ✅ TYPE 2: ACTUATOR ALERTS (Pumps, Valves, AC, Buzzer) - Show BOTH states
    // ──────────────────────────────────────────────────────────────────────
    const actuatorAlerts = [
      { key: 'waterPump', label: 'Water Pump', emoji: '💧', onStatus: 'ON', offStatus: 'OFF' },
      { key: 'nutrientPump', label: 'Nutrient Pump', emoji: '🌿', onStatus: 'ON', offStatus: 'OFF' },
      { key: 'inletValve', label: 'Inlet Valve', emoji: '🚰', onStatus: 'OPEN', offStatus: 'CLOSED' },
      { key: 'outletValve', label: 'Outlet Valve', emoji: '🚿', onStatus: 'OPEN', offStatus: 'CLOSED' },
      { key: 'acStatus', label: 'AC Status', emoji: '❄️', onStatus: 'ON', offStatus: 'OFF' },
      { key: 'buzzer', label: 'Buzzer', emoji: '🔊', onStatus: 'ON', offStatus: 'OFF' },
    ];

    // ✅ Actuator alerts: Show when state changes (ON or OFF)
    actuatorAlerts.forEach(({ key, label, emoji, onStatus, offStatus }) => {
      const currentVal = current[key];
      const prevVal = prev[key];
      
      // Skip if this is initial load (no previous state)
      if (isInitialLoad.current) {
        return;
      }

      // Skip if value hasn't changed
      if (currentVal === prevVal) {
        return;
      }

      // Value changed - show alert for new state
      if (currentVal === true) {
        // Turned ON / OPEN
        const title = `${emoji} ${label}: ${onStatus}`;
        const message = `${label} turned ${onStatus} at ${new Date().toLocaleTimeString()}`;
        addAlert(title, message);
      } else if (currentVal === false) {
        // Turned OFF / CLOSED
        const title = `${emoji} ${label}: ${offStatus}`;
        const message = `${label} turned ${offStatus} at ${new Date().toLocaleTimeString()}`;
        addAlert(title, message);
      }
    });

    // ──────────────────────────────────────────────────────────────────────
    // ✅ TYPE 3: MODE CHANGE ALERT (Auto/Manual)
    // ──────────────────────────────────────────────────────────────────────
    if (!isInitialLoad.current) {
      const currentMode = current.mode;
      const prevMode = prev.mode;
      
      if (currentMode !== undefined && currentMode !== prevMode) {
        const modeStatus = currentMode ? 'AUTO' : 'MANUAL';
        const title = `⚙️ Mode: ${modeStatus}`;
        const message = `System mode changed to ${modeStatus} at ${new Date().toLocaleTimeString()}`;
        addAlert(title, message);
      }
    }

    // ──────────────────────────────────────────────────────────────────────
    // ✅ Initial load complete - mark it
    // ──────────────────────────────────────────────────────────────────────
    if (isInitialLoad.current) {
      isInitialLoad.current = false;
    }

    // Save current state for next comparison
    previousState.current = current;

  }, [deviceStatusFlags, hasReceivedData]);

  const value = {
    alerts,
    alertCount: alerts.length,
    clearAlerts,
    removeAlertById,
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