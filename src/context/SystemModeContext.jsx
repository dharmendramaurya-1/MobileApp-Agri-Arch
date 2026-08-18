// src/context/SystemModeContext.jsx
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useMqtt } from './MqttContext';

const SystemModeContext = createContext(undefined);

export const SystemModeProvider = ({ children }) => {
  const { 
    getSelectedDeviceConfig,
    getSelectedDeviceSensorData,
    getSelectedDeviceOnlineStatus,
    isConnected, 
    externalKey,
    publishConfig,
    isReady,
    deviceStatusFlags: legacyDeviceStatusFlags,
    selectedExternalKey,
  } = useMqtt();
  
  // ✅ Get data for the selected device using external key
  const deviceConfig = getSelectedDeviceConfig();
  const sensorData = getSelectedDeviceSensorData();
  const isDeviceOnline = getSelectedDeviceOnlineStatus();
  
  // ✅ Get mode from deviceStatusFlags (Bit 16) - from selected device's sensor data
  const deviceStatusFlags = sensorData?.deviceStatusFlags || legacyDeviceStatusFlags;
  
  const [mode, setMode] = useState('manual');
  const [modeLocked, setModeLocked] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [isModeLoaded, setIsModeLoaded] = useState(false);
  const [modeDisplay, setModeDisplay] = useState('Manual');
  const modeSyncTimeout = useRef(null);
  const modeCheckInterval = useRef(null);
  const isMountedRef = useRef(true);

  // ── Cleanup ──────────────────────────────────────────────────────────────
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      clearAllTimers();
    };
  }, []);

  const clearAllTimers = () => {
    if (modeSyncTimeout.current) {
      clearTimeout(modeSyncTimeout.current);
      modeSyncTimeout.current = null;
    }
    if (modeCheckInterval.current) {
      clearInterval(modeCheckInterval.current);
      modeCheckInterval.current = null;
    }
  };

  // ── Sync mode from deviceConfig ──────────────────────────────────────────
  useEffect(() => {
    if (!isMountedRef.current) return;
    
    if (deviceConfig && isReady) {
      const newMode = deviceConfig.auto_mode ? 'auto' : 'manual';
      
      if (newMode !== mode && !isSwitching) {
        console.log(`🔄 System mode synced from deviceConfig: ${newMode.toUpperCase()}`);
        setMode(newMode);
        setModeDisplay(newMode === 'auto' ? 'Auto' : 'Manual');
        setIsModeLoaded(true);
      } 
      else if (isSwitching && newMode === mode) {
        console.log(`✅ Mode confirmed via deviceConfig: ${newMode.toUpperCase()}`);
        setIsSwitching(false);
        setModeLocked(false);
        clearAllTimers();
      }
      
      if (!isModeLoaded) {
        setIsModeLoaded(true);
      }
    }
  }, [deviceConfig, isReady]);

  // ── Sync mode from deviceStatusFlags (Bit 16) ────────────────────────────
  useEffect(() => {
    if (!isMountedRef.current) return;
    
    if (deviceStatusFlags && deviceStatusFlags.mode !== null && deviceStatusFlags.mode !== undefined) {
      const newMode = deviceStatusFlags.mode ? 'auto' : 'manual';
      
      if (newMode !== mode && !isSwitching) {
        console.log(`🔄 System mode synced from deviceStatusFlags (Bit 16): ${newMode.toUpperCase()}`);
        setMode(newMode);
        setModeDisplay(newMode === 'auto' ? 'Auto' : 'Manual');
        setIsModeLoaded(true);
      }
      else if (isSwitching && newMode === mode) {
        console.log(`✅ Mode confirmed via status flags: ${newMode.toUpperCase()}`);
        setIsSwitching(false);
        setModeLocked(false);
        clearAllTimers();
      }
      
      if (!isModeLoaded) {
        setIsModeLoaded(true);
      }
    }
  }, [deviceStatusFlags]);

  // ── Mark mode as loaded when we have data ────────────────────────────────
  useEffect(() => {
    if (isReady && deviceConfig) {
      setIsModeLoaded(true);
    }
    // ✅ Also mark loaded if we have sensor data with status flags
    if (deviceStatusFlags && deviceStatusFlags.mode !== null && deviceStatusFlags.mode !== undefined) {
      setIsModeLoaded(true);
    }
  }, [isReady, deviceConfig, deviceStatusFlags]);

  const isManualMode = mode === 'manual';
  const isAutoMode = mode === 'auto';
  const isConfigMode = mode === 'config';

  // ── Reset switching state (emergency) ────────────────────────────────────
  const resetSwitchingState = () => {
    console.log('🔄 Emergency reset: Clearing switching state');
    setIsSwitching(false);
    setModeLocked(false);
    clearAllTimers();
  };

  // ── Switch to Manual ──────────────────────────────────────────────────────
  const switchToManual = async () => {
    if (isSwitching) {
      console.log('⏳ Already switching mode...');
      return;
    }

    if (!selectedExternalKey && !externalKey) {
      Alert.alert('❌ Error', 'No device selected');
      return;
    }

    if (!isConnected) {
      Alert.alert('📡 Not Connected', 'Please check your MQTT connection.');
      return;
    }

    setIsSwitching(true);
    setModeLocked(true);
    setIsModeLoaded(false);

    try {
      console.log('🔄 Switching to MANUAL mode...');
      
      const updatedConfig = {
        report_interval: deviceConfig?.report_interval || 120,
        sampling_interval: deviceConfig?.sampling_interval || 30,
        auto_mode: false
      };

      // ✅ Use selectedExternalKey for publishing
      const deviceKey = selectedExternalKey || externalKey;
      const success = await publishConfig(deviceKey, updatedConfig);
      
      if (success) {
        console.log('✅ Switch to MANUAL request sent, waiting for confirmation...');
        
        await new Promise((resolve) => {
          let resolved = false;
          
          modeSyncTimeout.current = setTimeout(() => {
            if (!resolved) {
              resolved = true;
              console.log('⚠️ Mode switch timeout - forcing reset');
              resolve(null);
            }
          }, 15000);
          
          modeCheckInterval.current = setInterval(() => {
            if (resolved) return;
            
            if (deviceConfig && deviceConfig.auto_mode === false) {
              resolved = true;
              clearAllTimers();
              console.log('✅ Confirmed MANUAL mode via deviceConfig');
              resolve(null);
            }
            
            if (deviceStatusFlags && deviceStatusFlags.mode === false) {
              resolved = true;
              clearAllTimers();
              console.log('✅ Confirmed MANUAL mode via status flags');
              resolve(null);
            }
          }, 500);
        });
        
        setMode('manual');
        setModeDisplay('Manual');
        setIsModeLoaded(true);
        setIsSwitching(false);
        setModeLocked(false);
        clearAllTimers();
        
        const isConfirmed = deviceConfig?.auto_mode === false || deviceStatusFlags?.mode === false;
        if (isConfirmed) {
          Alert.alert(
            '✅ Mode Switched', 
            'System is now in MANUAL mode.\nYou can now control devices individually.'
          );
          console.log('✅ Confirmed MANUAL mode');
        } else {
          Alert.alert(
            '⚠️ Mode Update Pending', 
            'Mode switch request sent. The system will update automatically.\nCurrent mode: MANUAL'
          );
        }
      } else {
        setIsModeLoaded(true);
        setIsSwitching(false);
        setModeLocked(false);
        Alert.alert('❌ Error', 'Failed to switch to MANUAL mode. Please try again.');
        console.log('❌ Failed to switch to MANUAL mode');
      }
    } catch (error) {
      console.error('Error switching to manual mode:', error);
      setIsModeLoaded(true);
      setIsSwitching(false);
      setModeLocked(false);
      Alert.alert('❌ Error', 'Failed to switch mode. Please check your connection.');
    } finally {
      clearAllTimers();
    }
  };

  // ── Switch to Auto ──────────────────────────────────────────────────────
  const switchToAuto = async () => {
    if (isSwitching) {
      console.log('⏳ Already switching mode...');
      return;
    }

    if (!selectedExternalKey && !externalKey) {
      Alert.alert('❌ Error', 'No device selected');
      return;
    }

    if (!isConnected) {
      Alert.alert('📡 Not Connected', 'Please check your MQTT connection.');
      return;
    }

    setIsSwitching(true);
    setModeLocked(true);
    setIsModeLoaded(false);

    try {
      console.log('🔄 Switching to AUTO mode...');
      
      const updatedConfig = {
        report_interval: deviceConfig?.report_interval || 120,
        sampling_interval: deviceConfig?.sampling_interval || 30,
        auto_mode: true
      };

      // ✅ Use selectedExternalKey for publishing
      const deviceKey = selectedExternalKey || externalKey;
      const success = await publishConfig(deviceKey, updatedConfig);
      
      if (success) {
        console.log('✅ Switch to AUTO request sent, waiting for confirmation...');
        
        await new Promise((resolve) => {
          let resolved = false;
          
          modeSyncTimeout.current = setTimeout(() => {
            if (!resolved) {
              resolved = true;
              console.log('⚠️ Mode switch timeout - forcing reset');
              resolve(null);
            }
          }, 15000);
          
          modeCheckInterval.current = setInterval(() => {
            if (resolved) return;
            
            if (deviceConfig && deviceConfig.auto_mode === true) {
              resolved = true;
              clearAllTimers();
              console.log('✅ Confirmed AUTO mode via deviceConfig');
              resolve(null);
            }
            
            if (deviceStatusFlags && deviceStatusFlags.mode === true) {
              resolved = true;
              clearAllTimers();
              console.log('✅ Confirmed AUTO mode via status flags');
              resolve(null);
            }
          }, 500);
        });
        
        setMode('auto');
        setModeDisplay('Auto');
        setIsModeLoaded(true);
        setIsSwitching(false);
        setModeLocked(false);
        clearAllTimers();
        
        const isConfirmed = deviceConfig?.auto_mode === true || deviceStatusFlags?.mode === true;
        if (isConfirmed) {
          Alert.alert(
            '✅ Mode Switched', 
            'System is now in AUTO mode.\nAutomatic controls are now enabled.'
          );
          console.log('✅ Confirmed AUTO mode');
        } else {
          Alert.alert(
            '⚠️ Mode Update Pending', 
            'Mode switch request sent. The system will update automatically.\nCurrent mode: AUTO'
          );
        }
      } else {
        setIsModeLoaded(true);
        setIsSwitching(false);
        setModeLocked(false);
        Alert.alert('❌ Error', 'Failed to switch to AUTO mode. Please try again.');
        console.log('❌ Failed to switch to AUTO mode');
      }
    } catch (error) {
      console.error('Error switching to auto mode:', error);
      setIsModeLoaded(true);
      setIsSwitching(false);
      setModeLocked(false);
      Alert.alert('❌ Error', 'Failed to switch mode. Please check your connection.');
    } finally {
      clearAllTimers();
    }
  };

  // ── Toggle Mode ──────────────────────────────────────────────────────────
  const toggleMode = async () => {
    if (isSwitching || modeLocked) {
      console.log('⏳ Mode switch in progress...');
      Alert.alert('⏳ Busy', 'System is currently switching modes. Please wait.');
      return;
    }

    if (!isModeLoaded) {
      Alert.alert('⏳ Loading', 'Please wait for the system mode to load.');
      return;
    }

    if (!isConnected) {
      Alert.alert('📡 Not Connected', 'Please check your MQTT connection.');
      return;
    }

    if (isAutoMode) {
      Alert.alert(
        '🔄 Switch to Manual Mode',
        'Switching to MANUAL mode will disable automatic controls and allow you to control devices individually.\n\nCurrent Mode: AUTO\n\nContinue?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Yes, Switch to Manual', onPress: switchToManual }
        ]
      );
    } else {
      Alert.alert(
        '🔄 Switch to Auto Mode',
        'Switching to AUTO mode will let the system control devices automatically.\n\nManual controls will be disabled.\n\nCurrent Mode: MANUAL\n\nContinue?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Yes, Switch to Auto', onPress: switchToAuto }
        ]
      );
    }
  };

  // ── Check before actuator control ──────────────────────────────────────
  const checkBeforeActuator = (action) => {
    if (!isConnected) {
      Alert.alert('📡 Not Connected', 'Please check your MQTT connection and try again.');
      return false;
    }

    if (!isModeLoaded) {
      Alert.alert('⏳ Loading Mode', 'Please wait for the system mode to load...');
      return false;
    }

    if (modeLocked || isSwitching) {
      Alert.alert('⏳ Mode Switching', 'System is currently switching modes. Please wait...');
      return false;
    }

    if (isAutoMode) {
      Alert.alert(
        '🤖 AUTO Mode Active',
        `Cannot control "${action}" while system is in AUTO mode.\n\nCurrent Mode: AUTO\n\nPlease switch to MANUAL mode to control devices individually.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Switch to Manual', onPress: switchToManual }
        ]
      );
      return false;
    }

    if (isManualMode) {
      return true;
    }

    Alert.alert(
      '⚠️ Unknown Mode',
      `System is in ${mode.toUpperCase()} mode. Proceed with caution.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Continue', onPress: () => {} }
      ]
    );
    return true;
  };

  const showModeWarning = (action) => {
    Alert.alert(
      '⚠️ Mode Restriction',
      `Cannot perform "${action}" in ${modeDisplay} mode.\n\nCurrent Mode: ${modeDisplay.toUpperCase()}\n\nPlease switch to MANUAL mode to control devices.`,
      [
        { text: 'OK', style: 'default' },
        { text: 'Switch to Manual', onPress: switchToManual }
      ]
    );
  };

  const setModeHandler = async (newMode) => {
    if (modeLocked || isSwitching) {
      Alert.alert('⏳ Busy', 'System is currently switching modes. Please wait.');
      return;
    }

    if (newMode === mode) {
      console.log(`ℹ️ Already in ${newMode.toUpperCase()} mode`);
      return;
    }

    if (newMode === 'manual') {
      await switchToManual();
    } else if (newMode === 'auto') {
      await switchToAuto();
    } else {
      setMode(newMode);
      setModeDisplay(newMode === 'auto' ? 'Auto' : 'Manual');
      setIsModeLoaded(true);
    }
  };

  const canPublish = isManualMode && isConnected && !modeLocked && !isSwitching && isModeLoaded;

  const value = {
    mode,
    modeDisplay,
    isManualMode,
    isAutoMode,
    isConfigMode,
    setMode: setModeHandler,
    checkBeforeActuator,
    showModeWarning,
    canPublish,
    modeLocked: modeLocked || isSwitching,
    isSwitching,
    switchToManual,
    switchToAuto,
    toggleMode,
    isModeLoaded,
    resetSwitchingState,
    getModeDisplay: () => modeDisplay,
    getModeIcon: () => isManualMode ? '🔧' : '🤖',
    getModeColor: () => isManualMode ? '#4CAF50' : '#FF9800',
  };

  return (
    <SystemModeContext.Provider value={value}>
      {children}
    </SystemModeContext.Provider>
  );
};

export const useSystemMode = () => {
  const context = useContext(SystemModeContext);
  if (!context) {
    throw new Error('useSystemMode must be used within a SystemModeProvider');
  }
  return context;
};