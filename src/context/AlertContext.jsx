// src/context/AlertContext.jsx
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Alert as RNAlert } from 'react-native';
import { useMqtt } from './MqttContext';

const AlertContext = createContext(undefined);

export const AlertProvider = ({ children }) => {
  const { 
    sensorData, 
    deviceStatusFlags, 
    actuatorStatus,
    isConnected,
    hasReceivedData,
    connectionState,  // ✅ ADD THIS
  } = useMqtt();
  
  const [alerts, setAlerts] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const previousState = useRef({});
  const initialLoadRef = useRef(true); // ✅ Track initial load

  // ── Generate alert ID ────────────────────────────────────────────────────
  const generateAlertId = () => {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  };

  // ── Add alert ────────────────────────────────────────────────────────────
  const addAlert = (type, title, message, severity = 'info', showNative = true) => {
    const newAlert = {
      id: generateAlertId(),
      type,
      title,
      message,
      severity,
      timestamp: new Date(),
      read: false,
    };
    
    setAlerts(prev => [newAlert, ...prev]);
    setUnreadCount(prev => prev + 1);
    
    // ✅ Only show native alert if NOT initial load
    if (showNative && (severity === 'error' || severity === 'warning') && !initialLoadRef.current) {
      RNAlert.alert(title, message);
    }
    
    return newAlert;
  };

  // ── Mark alert as read ──────────────────────────────────────────────────
  const markAsRead = (alertId) => {
    setAlerts(prev => prev.map(alert => 
      alert.id === alertId ? { ...alert, read: true } : alert
    ));
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  const markAllAsRead = () => {
    setAlerts(prev => prev.map(alert => ({ ...alert, read: true })));
    setUnreadCount(0);
  };

  // ── Clear alerts ────────────────────────────────────────────────────────
  const clearAlerts = () => {
    setAlerts([]);
    setUnreadCount(0);
  };

  // ── Check tank status ────────────────────────────────────────────────────
  useEffect(() => {
    if (!hasReceivedData || !deviceStatusFlags) return;
    
    const prev = previousState.current;
    const current = deviceStatusFlags;
    
    if (current.tankLow !== null && current.tankLow !== prev.tankLow) {
      if (current.tankLow) {
        addAlert('tank', '⚠️ Tank Low', 'Water tank level is critically low! Please refill immediately.', 'error');
      } else {
        addAlert('tank', '✅ Tank Level Normal', 'Water tank level has returned to normal.', 'success');
      }
    }
    
    if (current.tankHigh !== null && current.tankHigh !== prev.tankHigh) {
      if (current.tankHigh) {
        addAlert('tank', '⚠️ Tank High', 'Water tank is nearly full! Consider reducing water intake.', 'warning');
      } else {
        addAlert('tank', '✅ Tank Level Normal', 'Water tank level has returned to normal.', 'success');
      }
    }
    
    prev.tankLow = current.tankLow;
    prev.tankHigh = current.tankHigh;
  }, [deviceStatusFlags, hasReceivedData]);

  // ── Check pump status changes ───────────────────────────────────────────
  useEffect(() => {
    if (!hasReceivedData || !actuatorStatus) return;
    
    const prev = previousState.current;
    const current = actuatorStatus;
    
    if (current.water_pump !== null && current.water_pump !== prev.water_pump) {
      addAlert(
        'pump',
        current.water_pump ? '💧 Water Pump ON' : '💧 Water Pump OFF',
        current.water_pump 
          ? `Water pump activated at ${new Date().toLocaleTimeString()}`
          : `Water pump deactivated at ${new Date().toLocaleTimeString()}`,
        current.water_pump ? 'success' : 'info'
      );
    }
    
    if (current.nutrient_pump !== null && current.nutrient_pump !== prev.nutrient_pump) {
      addAlert(
        'pump',
        current.nutrient_pump ? '🌿 Nutrient Pump ON' : '🌿 Nutrient Pump OFF',
        current.nutrient_pump 
          ? `Nutrient pump activated at ${new Date().toLocaleTimeString()}`
          : `Nutrient pump deactivated at ${new Date().toLocaleTimeString()}`,
        current.nutrient_pump ? 'success' : 'info'
      );
    }
    
    prev.water_pump = current.water_pump;
    prev.nutrient_pump = current.nutrient_pump;
  }, [actuatorStatus, hasReceivedData]);

  // ── Check valve status changes ──────────────────────────────────────────
  useEffect(() => {
    if (!hasReceivedData || !deviceStatusFlags) return;
    
    const prev = previousState.current;
    const current = deviceStatusFlags;
    const valveNames = ['CLOSED', 'OPEN', 'ERROR'];
    
    if (current.inletValve !== null && current.inletValve !== prev.inletValve) {
      const status = valveNames[current.inletValve] || 'UNKNOWN';
      addAlert('valve', `🚪 Inlet Valve ${status}`, `Inlet valve changed to ${status} at ${new Date().toLocaleTimeString()}`, current.inletValve === 2 ? 'error' : 'info');
    }
    
    if (current.outletValve !== null && current.outletValve !== prev.outletValve) {
      const status = valveNames[current.outletValve] || 'UNKNOWN';
      addAlert('valve', `🚪 Outlet Valve ${status}`, `Outlet valve changed to ${status} at ${new Date().toLocaleTimeString()}`, current.outletValve === 2 ? 'error' : 'info');
    }
    
    prev.inletValve = current.inletValve;
    prev.outletValve = current.outletValve;
  }, [deviceStatusFlags, hasReceivedData]);

  // ── Check mode changes ──────────────────────────────────────────────────
  useEffect(() => {
    if (!hasReceivedData || !deviceStatusFlags) return;
    
    const prev = previousState.current;
    const current = deviceStatusFlags;
    
    if (current.mode !== null && current.mode !== prev.mode) {
      const modes = ['MANUAL', 'AUTO', 'SCHEDULE'];
      const modeName = modes[current.mode] || 'UNKNOWN';
      addAlert('mode', `🔄 System Mode: ${modeName}`, `System mode changed to ${modeName} at ${new Date().toLocaleTimeString()}`, current.mode === 1 ? 'warning' : 'info');
    }
    
    prev.mode = current.mode;
  }, [deviceStatusFlags, hasReceivedData]);

  // ── Check sensor thresholds ─────────────────────────────────────────────
  useEffect(() => {
    if (!hasReceivedData || !sensorData) return;
    
    const prev = previousState.current;
    const current = sensorData;
    
    if (current.ambientTemperature !== null && current.ambientTemperature !== prev.ambientTemperature) {
      if (current.ambientTemperature > 40) {
        addAlert('sensor', '🌡️ High Temperature', `Temperature is ${current.ambientTemperature.toFixed(1)}°C. Critical level!`, 'error');
      } else if (current.ambientTemperature < 10) {
        addAlert('sensor', '🌡️ Low Temperature', `Temperature is ${current.ambientTemperature.toFixed(1)}°C. Too cold!`, 'warning');
      }
    }
    
    if (current.ambientHumidity !== null && current.ambientHumidity !== prev.ambientHumidity) {
      if (current.ambientHumidity > 80) {
        addAlert('sensor', '💧 High Humidity', `Humidity is ${current.ambientHumidity.toFixed(0)}%. Consider ventilation.`, 'warning');
      } else if (current.ambientHumidity < 30) {
        addAlert('sensor', '💧 Low Humidity', `Humidity is ${current.ambientHumidity.toFixed(0)}%. Consider humidification.`, 'warning');
      }
    }
    
    if (current.phValue !== null && current.phValue !== prev.phValue) {
      if (current.phValue < 5.5) {
        addAlert('sensor', '🧪 Low pH', `pH level is ${current.phValue.toFixed(1)}. Acidic condition!`, 'error');
      } else if (current.phValue > 8.5) {
        addAlert('sensor', '🧪 High pH', `pH level is ${current.phValue.toFixed(1)}. Alkaline condition!`, 'error');
      }
    }
    
    if (current.ecValue !== null && current.ecValue !== prev.ecValue) {
      if (current.ecValue > 2000) {
        addAlert('sensor', '⚡ High EC', `EC level is ${current.ecValue.toFixed(0)} µS. Nutrient solution too strong!`, 'error');
      } else if (current.ecValue < 200) {
        addAlert('sensor', '⚡ Low EC', `EC level is ${current.ecValue.toFixed(0)} µS. Nutrient solution too weak!`, 'warning');
      }
    }
    
    if (current.waterLevel !== null && current.waterLevel !== prev.waterLevel) {
      if (current.waterLevel < 20) {
        addAlert('sensor', '💦 Low Water Level', `Water level is ${current.waterLevel.toFixed(0)}%. Refill required!`, 'error');
      }
    }
    
    if (current.co2Level !== null && current.co2Level !== prev.co2Level) {
      if (current.co2Level > 1200) {
        addAlert('sensor', '🫧 High CO₂', `CO₂ level is ${current.co2Level.toFixed(0)} ppm. Need ventilation!`, 'warning');
      }
    }
    
    prev.ambientTemperature = current.ambientTemperature;
    prev.ambientHumidity = current.ambientHumidity;
    prev.phValue = current.phValue;
    prev.ecValue = current.ecValue;
    prev.waterLevel = current.waterLevel;
    prev.co2Level = current.co2Level;
  }, [sensorData, hasReceivedData]);

  // ── ✅ UPDATED: Connection status alert - NO POPUP on initial load ────
  useEffect(() => {
    // ✅ Skip on initial load - don't show any popup
    if (initialLoadRef.current) {
      // Wait for first data or connection state change
      if (hasReceivedData || connectionState === 'online' || connectionState === 'offline') {
        initialLoadRef.current = false;
      }
      return;
    }

    // ✅ Only show after initial load
    if (!isConnected || connectionState === 'offline' || connectionState === 'disconnected') {
      addAlert(
        'connection',
        '📡 Connection Lost',
        `Device disconnected at ${new Date().toLocaleTimeString()}`,
        'error',
        false // ✅ No native popup - sirf alert list me show
      );
    } else if (connectionState === 'online' && hasReceivedData) {
      // ✅ Only show reconnect if it was previously disconnected
      if (previousState.current.wasDisconnected) {
        addAlert(
          'connection',
          '📡 Device Connected',
          `Device reconnected at ${new Date().toLocaleTimeString()}`,
          'success',
          false // ✅ No native popup
        );
      }
    }
    
    previousState.current.wasDisconnected = !isConnected || connectionState === 'offline';
    
  }, [isConnected, connectionState, hasReceivedData]);

  // ── Clear old alerts ────────────────────────────────────────────────────
  useEffect(() => {
    if (alerts.length > 100) {
      setAlerts(prev => prev.slice(0, 100));
    }
  }, [alerts.length]);

  // ✅ CLEAN VALUE
  const value = {
    alerts,
    unreadCount,
    addAlert,
    markAsRead,
    markAllAsRead,
    clearAlerts,
    getAlertsByType: (type) => alerts.filter(alert => alert.type === type),
    getUnreadAlerts: () => alerts.filter(alert => !alert.read),
    getRecentAlerts: (count = 10) => alerts.slice(0, count),
  };

  // ✅ CLEAN RETURN
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