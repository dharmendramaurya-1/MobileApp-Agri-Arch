// src/context/AlertContext.jsx
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Alert as RNAlert } from 'react-native';
import { useMqtt } from './MqttContext';

const AlertContext = createContext(undefined);

export const AlertProvider = ({ children }) => {
  const { 
    deviceStatusFlags, 
    actuatorStatus,
    hasReceivedData,
  } = useMqtt();
  
  const [alerts, setAlerts] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const previousActuatorState = useRef({});
  const previousFlagsState = useRef({});
  const initialLoadRef = useRef(true);

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

  // ── Monitor Actuator Status Changes (PRIMARY SOURCE) ──────────────────
  useEffect(() => {
    if (!hasReceivedData || !actuatorStatus) return;
    
    console.log('📊 Actuator Status:', actuatorStatus);
    
    const prev = previousActuatorState.current;
    const current = actuatorStatus;
    
    // ONLY show ON/OFF status for pumps and valves from actuatorStatus
    const actuatorFields = {
      water_pump: { 
        label: 'Water Pump', 
        emoji: '💧',
        format: (val) => val ? 'ON' : 'OFF',
        severity: (val) => val ? 'success' : 'info'
      },
      nutrient_pump: { 
        label: 'Nutrient Pump', 
        emoji: '🌿',
        format: (val) => val ? 'ON' : 'OFF',
        severity: (val) => val ? 'success' : 'info'
      },
      ph_up_pump: { 
        label: 'pH UP Pump', 
        emoji: '⬆️',
        format: (val) => val ? 'ON' : 'OFF',
        severity: (val) => val ? 'success' : 'info'
      },
      ph_down_pump: { 
        label: 'pH DOWN Pump', 
        emoji: '⬇️',
        format: (val) => val ? 'ON' : 'OFF',
        severity: (val) => val ? 'success' : 'info'
      },
      water_ILvalve: { 
        label: 'Inlet Valve', 
        emoji: '🚰',
        format: (val) => val ? 'OPEN' : 'CLOSED',
        severity: (val) => val ? 'success' : 'info'
      },
      water_OLvalve: { 
        label: 'Outlet Valve', 
        emoji: '🚿',
        format: (val) => val ? 'OPEN' : 'CLOSED',
        severity: (val) => val ? 'success' : 'info'
      },
      ac_stat: { 
        label: 'AC Status', 
        emoji: '❄️',
        format: (val) => val ? 'ON' : 'OFF',
        severity: (val) => val ? 'success' : 'info'
      },
      dimming_level: { 
        label: 'Dimming Level', 
        emoji: '💡',
        format: (val) => `${val}%`,
        severity: () => 'info'
      }
    };
    
    Object.entries(actuatorFields).forEach(([key, config]) => {
      const currentVal = current[key];
      const prevVal = prev[key];
      
      // Skip if value hasn't changed
      if (currentVal === undefined || currentVal === null || currentVal === prevVal) return;
      
      const formattedValue = config.format(currentVal);
      const severity = config.severity(currentVal);
      
      addAlert(
        'actuator',
        `${config.emoji} ${config.label}: ${formattedValue}`,
        `${config.label} changed to ${formattedValue} at ${new Date().toLocaleTimeString()}`,
        severity
      );
    });
    
    previousActuatorState.current = current;
    
  }, [actuatorStatus, hasReceivedData]);

  // ── Monitor Device Flags Changes (ONLY SENSOR THRESHOLDS) ──────────────
  useEffect(() => {
    if (!hasReceivedData || !deviceStatusFlags) return;
    
    console.log('📊 Device Flags:', deviceStatusFlags);
    
    const prev = previousFlagsState.current;
    const current = deviceStatusFlags;
    
    // ONLY sensor threshold alerts - REMOVED pumps/valves/ac to avoid duplicates
    const flagFields = {
      tankLow: { 
        label: 'Tank Level', 
        emoji: '🪣',
        format: (val) => val ? 'LOW ⚠️' : 'NORMAL ✅',
        severity: (val) => val ? 'error' : 'success'
      },
      tankHigh: { 
        label: 'Tank Level', 
        emoji: '🪣',
        format: (val) => val ? 'HIGH ⚠️' : 'NORMAL ✅',
        severity: (val) => val ? 'warning' : 'success'
      },
      co2High: { 
        label: 'CO₂', 
        emoji: '🫧',
        format: (val) => val ? 'HIGH ⚠️' : 'NORMAL ✅',
        severity: (val) => val ? 'warning' : 'success'
      },
      co2Low: { 
        label: 'CO₂', 
        emoji: '🫧',
        format: (val) => val ? 'LOW ⚠️' : 'NORMAL ✅',
        severity: (val) => val ? 'warning' : 'success'
      },
      phHigh: { 
        label: 'pH', 
        emoji: '🧪',
        format: (val) => val ? 'HIGH ⚠️' : 'NORMAL ✅',
        severity: (val) => val ? 'warning' : 'success'
      },
      phLow: { 
        label: 'pH', 
        emoji: '🧪',
        format: (val) => val ? 'LOW ⚠️' : 'NORMAL ✅',
        severity: (val) => val ? 'warning' : 'success'
      },
      ecHigh: { 
        label: 'EC', 
        emoji: '⚡',
        format: (val) => val ? 'HIGH ⚠️' : 'NORMAL ✅',
        severity: (val) => val ? 'warning' : 'success'
      },
      ecLow: { 
        label: 'EC', 
        emoji: '⚡',
        format: (val) => val ? 'LOW ⚠️' : 'NORMAL ✅',
        severity: (val) => val ? 'warning' : 'success'
      },
      luxHigh: { 
        label: 'Light', 
        emoji: '☀️',
        format: (val) => val ? 'HIGH ⚠️' : 'NORMAL ✅',
        severity: (val) => val ? 'warning' : 'success'
      },
      luxLow: { 
        label: 'Light', 
        emoji: '☀️',
        format: (val) => val ? 'LOW ⚠️' : 'NORMAL ✅',
        severity: (val) => val ? 'warning' : 'success'
      },
      // ❌ REMOVED: inletValve, outletValve, waterPump, nutrientPump, acStatus
      // These are already in actuatorStatus
      dimmingLevel: { 
        label: 'Dimming Level', 
        emoji: '💡',
        format: (val) => `${val}%`,
        severity: () => 'info'
      },
      sensorFault: { 
        label: 'Sensor Fault', 
        emoji: '⚠️',
        format: (val) => val ? `0x${val.toString(16)}` : 'NONE',
        severity: (val) => val ? 'error' : 'success'
      }
    };
    
    Object.entries(flagFields).forEach(([key, config]) => {
      const currentVal = current[key];
      const prevVal = prev[key];
      
      // Skip if value hasn't changed
      if (currentVal === undefined || currentVal === null || currentVal === prevVal) return;
      
      const formattedValue = config.format(currentVal);
      const severity = config.severity(currentVal);
      
      addAlert(
        'flag',
        `${config.emoji} ${config.label}: ${formattedValue}`,
        `${config.label} changed to ${formattedValue} at ${new Date().toLocaleTimeString()}`,
        severity
      );
    });
    
    previousFlagsState.current = current;
    
  }, [deviceStatusFlags, hasReceivedData]);

  // ── Clear old alerts ────────────────────────────────────────────────────
  useEffect(() => {
    if (alerts.length > 100) {
      setAlerts(prev => prev.slice(0, 100));
    }
  }, [alerts.length]);

  // ✅ VALUE
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