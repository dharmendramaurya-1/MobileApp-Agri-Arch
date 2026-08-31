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
    deviceInitialLoadStatus,
    deviceCheckingStatus,
  } = useMqtt();
  
  // ✅ Get data for the selected device using external key
  const deviceConfig = getSelectedDeviceConfig();
  const sensorData = getSelectedDeviceSensorData();
  const deviceStatus = getSelectedDeviceOnlineStatus();
  
  // ✅ Get mode from deviceStatusFlags - but ONLY if it's from real data
  const deviceStatusFlags = sensorData?.deviceStatusFlags || legacyDeviceStatusFlags;
  
  // ── State ──
  const [mode, setMode] = useState(null); // Start with null - unknown state
  const [modeLocked, setModeLocked] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [isModeLoaded, setIsModeLoaded] = useState(false);
  const [modeDisplay, setModeDisplay] = useState('Loading...');
  const [isDeviceOnline, setIsDeviceOnline] = useState(false);
  const [isDeviceLoading, setIsDeviceLoading] = useState(true);
  const [hasReceivedRealMode, setHasReceivedRealMode] = useState(false);
  
  const modeSyncTimeout = useRef(null);
  const modeCheckInterval = useRef(null);
  const isMountedRef = useRef(true);

  // ── Track device status ──────────────────────────────────────────────────
  useEffect(() => {
    if (!isMountedRef.current) return;
    
    // Check if device is in loading state
    const isLoading = deviceStatus === 'loading' || deviceStatus === 'checking';
    const isOnline = deviceStatus === true;
    
    setIsDeviceLoading(isLoading);
    setIsDeviceOnline(isOnline);
    
    console.log(`📱 Device status: ${isLoading ? 'LOADING' : isOnline ? 'ONLINE' : 'OFFLINE'}`);
    
    // If device is offline and we haven't received real mode data, show loading
    if (!isOnline && !isLoading && !hasReceivedRealMode) {
      setModeDisplay('Loading...');
      setIsModeLoaded(false);
    }
  }, [deviceStatus]);

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

  // ── Sync mode from deviceConfig (REAL DATA ONLY) ──────────────────────
  useEffect(() => {
    if (!isMountedRef.current) return;
    
    // ✅ ONLY use deviceConfig if it's from real data (not cached)
    // Check if we have a valid deviceConfig with a lastUpdated timestamp
    const hasRealData = deviceConfig && deviceConfig.lastUpdated;
    
    if (hasRealData && isReady) {
      const newMode = deviceConfig.auto_mode ? 'auto' : 'manual';
      
      // ✅ Mark that we've received real mode data
      setHasReceivedRealMode(true);
      
      if (isSwitching) {
        // ✅ During a switch — device responded with a DIFFERENT mode = confirmation!
        if (newMode !== mode) {
          console.log(`✅ Mode confirmed via deviceConfig: ${newMode.toUpperCase()} (was ${mode?.toUpperCase()})`);
          setMode(newMode);
          setModeDisplay(newMode === 'auto' ? 'Auto' : 'Manual');
          setIsModeLoaded(true);
          setIsSwitching(false);
          setModeLocked(false);
          clearAllTimers();
        }
      } else {
        // ✅ Not switching — just sync from device (device changed mode externally)
        if (newMode !== mode) {
          console.log(`🔄 System mode synced from deviceConfig: ${newMode.toUpperCase()}`);
          setMode(newMode);
          setModeDisplay(newMode === 'auto' ? 'Auto' : 'Manual');
          setIsModeLoaded(true);
        }
      }
      
      if (!isModeLoaded) {
        setIsModeLoaded(true);
      }
    } else {
      // ✅ Don't use cached deviceConfig - wait for real data
      console.log('⏳ Waiting for real device config data...');
    }
  }, [deviceConfig, isReady]);

  // ── Sync mode from deviceStatusFlags (REAL DATA ONLY) ──────────────────
  useEffect(() => {
    if (!isMountedRef.current) return;
    
    // ✅ ONLY use deviceStatusFlags if it's from real data
    // Check if we have a valid mode value (not null/undefined)
    if (deviceStatusFlags && deviceStatusFlags.mode !== null && deviceStatusFlags.mode !== undefined) {
      
      // ✅ Check if this is real data by looking at the timestamp
      const hasRealData = sensorData?.lastUpdated || deviceStatusFlags._timestamp;
      
      if (hasRealData) {
        const newMode = deviceStatusFlags.mode ? 'auto' : 'manual';
        
        // ✅ Mark that we've received real mode data
        setHasReceivedRealMode(true);
        
        if (isSwitching) {
          // ✅ During a switch — device responded with a DIFFERENT mode = confirmation!
          if (newMode !== mode) {
            console.log(`✅ Mode confirmed via status flags: ${newMode.toUpperCase()}`);
            setMode(newMode);
            setModeDisplay(newMode === 'auto' ? 'Auto' : 'Manual');
            setIsModeLoaded(true);
            setIsSwitching(false);
            setModeLocked(false);
            clearAllTimers();
          }
        } else {
          // ✅ Not switching — just sync from device
          if (newMode !== mode) {
            console.log(`🔄 System mode synced from deviceStatusFlags (Bit 15): ${newMode.toUpperCase()}`);
            setMode(newMode);
            setModeDisplay(newMode === 'auto' ? 'Auto' : 'Manual');
            setIsModeLoaded(true);
          }
        }
        
        if (!isModeLoaded) {
          setIsModeLoaded(true);
        }
      }
    }
  }, [deviceStatusFlags, sensorData]);

  // ── Update mode display based on device status ──────────────────────────
  useEffect(() => {
    if (!isMountedRef.current) return;
    
    // If device is loading or we don't have a mode yet
    if (isDeviceLoading || mode === null) {
      setModeDisplay('Loading...');
      return;
    }
    
    // If device is offline and we have a mode
    if (!isDeviceOnline && !isDeviceLoading && mode !== null) {
      // Show the mode but indicate it's from cached data
      setModeDisplay(mode === 'auto' ? 'Auto (Offline)' : 'Manual (Offline)');
      return;
    }
    
    // Device is online and we have a mode
    setModeDisplay(mode === 'auto' ? 'Auto' : 'Manual');
  }, [mode, isDeviceOnline, isDeviceLoading]);

  const isManualMode = mode === 'manual';
  const isAutoMode = mode === 'auto';
  const isConfigMode = mode === 'config';
  const isModeUnknown = mode === null;

  // ── Reset switching state (emergency) ────────────────────────────────────
  const resetSwitchingState = () => {
    console.log('🔄 Emergency reset: Clearing switching state');
    setIsSwitching(false);
    setModeLocked(false);
    clearAllTimers();
  };

  // ── Check if mode action is allowed ─────────────────────────────────────
  const isModeActionAllowed = () => {
    if (!isReady) {
      console.log('⏳ System not ready yet');
      return false;
    }
    
    if (isDeviceLoading) {
      console.log('⏳ Device is loading, please wait');
      return false;
    }
    
    if (!isDeviceOnline) {
      console.log('📡 Device is offline');
      return false;
    }
    
    if (mode === null) {
      console.log('⏳ Mode not loaded yet');
      return false;
    }
    
    if (!hasReceivedRealMode) {
      console.log('⏳ Waiting for real mode data from device');
      return false;
    }
    
    return true;
  };

  // ── Switch to Manual ──────────────────────────────────────────────────────
  const switchToManual = async () => {
    if (isSwitching) {
      console.log('⏳ Already switching mode...');
      Alert.alert('⏳ Busy', 'System is currently switching modes. Please wait.');
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

    if (!isDeviceOnline) {
      Alert.alert('📡 Device Offline', 'Device is currently offline. Please wait for it to reconnect.');
      return;
    }

    if (mode === null) {
      Alert.alert('⏳ Loading', 'System mode is still loading. Please wait.');
      return;
    }

    if (!hasReceivedRealMode) {
      Alert.alert('⏳ Loading', 'Waiting for device to report its current mode. Please wait...');
      return;
    }

    setIsSwitching(true);
    setModeLocked(true);

    try {
      console.log('🔄 Switching to MANUAL mode...');
      
      const updatedConfig = {
        report_interval: deviceConfig?.report_interval || 120,
        sampling_interval: deviceConfig?.sampling_interval || 30,
        auto_mode: false
      };

      const deviceKey = selectedExternalKey || externalKey;
      const success = await publishConfig(deviceKey, updatedConfig);
      
      if (success) {
        console.log('✅ Switch to MANUAL request sent — waiting for device response...');
        
        modeSyncTimeout.current = setTimeout(() => {
          console.log('⚠️ Mode switch timeout - resetting switching state');
          setIsSwitching(false);
          setModeLocked(false);
          setIsModeLoaded(true);
          Alert.alert('⚠️ Timeout', 'Mode switch request sent but no response received.\nThe system may update shortly.');
        }, 20000);
        
        Alert.alert(
          '📡 Request Sent', 
          'Mode switch request sent to device.\nWaiting for confirmation...'
        );
      } else {
        setIsModeLoaded(true);
        setIsSwitching(false);
        setModeLocked(false);
        Alert.alert('❌ Error', 'Failed to send mode switch command.');
        console.log('❌ Failed to send MANUAL mode command');
      }
    } catch (error) {
      console.error('Error switching to manual mode:', error);
      setIsModeLoaded(true);
      setIsSwitching(false);
      setModeLocked(false);
      Alert.alert('❌ Error', 'Failed to switch mode. Please check your connection.');
    }
  };

  // ── Switch to Auto ──────────────────────────────────────────────────────
  const switchToAuto = async () => {
    if (isSwitching) {
      console.log('⏳ Already switching mode...');
      Alert.alert('⏳ Busy', 'System is currently switching modes. Please wait.');
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

    if (!isDeviceOnline) {
      Alert.alert('📡 Device Offline', 'Device is currently offline. Please wait for it to reconnect.');
      return;
    }

    if (mode === null) {
      Alert.alert('⏳ Loading', 'System mode is still loading. Please wait.');
      return;
    }

    if (!hasReceivedRealMode) {
      Alert.alert('⏳ Loading', 'Waiting for device to report its current mode. Please wait...');
      return;
    }

    setIsSwitching(true);
    setModeLocked(true);

    try {
      console.log('🔄 Switching to AUTO mode...');
      
      const updatedConfig = {
        report_interval: deviceConfig?.report_interval || 120,
        sampling_interval: deviceConfig?.sampling_interval || 30,
        auto_mode: true
      };

      const deviceKey = selectedExternalKey || externalKey;
      const success = await publishConfig(deviceKey, updatedConfig);
      
      if (success) {
        console.log('✅ Switch to AUTO request sent — waiting for device response...');
        
        modeSyncTimeout.current = setTimeout(() => {
          console.log('⚠️ Mode switch timeout - resetting switching state');
          setIsSwitching(false);
          setModeLocked(false);
          setIsModeLoaded(true);
          Alert.alert('⚠️ Timeout', 'Mode switch request sent but no response received.\nThe system may update shortly.');
        }, 20000);
        
        Alert.alert(
          '📡 Request Sent', 
          'Mode switch request sent to device.\nWaiting for confirmation...'
        );
      } else {
        setIsModeLoaded(true);
        setIsSwitching(false);
        setModeLocked(false);
        Alert.alert('❌ Error', 'Failed to send mode switch command.');
        console.log('❌ Failed to send AUTO mode command');
      }
    } catch (error) {
      console.error('Error switching to auto mode:', error);
      setIsModeLoaded(true);
      setIsSwitching(false);
      setModeLocked(false);
      Alert.alert('❌ Error', 'Failed to switch mode. Please check your connection.');
    }
  };

  // ── Toggle Mode ──────────────────────────────────────────────────────────
  const toggleMode = async () => {
    if (!isModeActionAllowed()) {
      if (isDeviceLoading) {
        Alert.alert('⏳ Loading', 'Please wait for the device to connect...');
      } else if (!isDeviceOnline) {
        Alert.alert('📡 Device Offline', 'Device is offline. Please wait for it to reconnect.');
      } else if (mode === null || !hasReceivedRealMode) {
        Alert.alert('⏳ Loading', 'System mode is still loading. Please wait...');
      }
      return;
    }

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
    } else if (isManualMode) {
      Alert.alert(
        '🔄 Switch to Auto Mode',
        'Switching to AUTO mode will let the system control devices automatically.\n\nManual controls will be disabled.\n\nCurrent Mode: MANUAL\n\nContinue?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Yes, Switch to Auto', onPress: switchToAuto }
        ]
      );
    } else {
      Alert.alert('⚠️ Unknown Mode', 'System mode is unknown. Please try again later.');
    }
  };

  // ── Check before actuator control ──────────────────────────────────────
  const checkBeforeActuator = (action) => {
    if (!isConnected) {
      Alert.alert('📡 Not Connected', 'Please check your MQTT connection and try again.');
      return false;
    }

    if (!isDeviceOnline) {
      Alert.alert('📡 Device Offline', 'Device is currently offline. Please wait for it to reconnect.');
      return false;
    }

    if (isDeviceLoading) {
      Alert.alert('⏳ Loading', 'Device is still connecting. Please wait...');
      return false;
    }

    if (!isModeLoaded || mode === null) {
      Alert.alert('⏳ Loading Mode', 'Please wait for the system mode to load...');
      return false;
    }

    if (!hasReceivedRealMode) {
      Alert.alert('⏳ Loading', 'Waiting for device to report its current mode. Please wait...');
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
      `System is in ${mode?.toUpperCase() || 'unknown'} mode. Proceed with caution.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Continue', onPress: () => {} }
      ]
    );
    return true;
  };

  const showModeWarning = (action) => {
    const modeText = modeDisplay || 'unknown';
    Alert.alert(
      '⚠️ Mode Restriction',
      `Cannot perform "${action}" in ${modeText} mode.\n\nCurrent Mode: ${modeText.toUpperCase()}\n\nPlease switch to MANUAL mode to control devices.`,
      [
        { text: 'OK', style: 'default' },
        { text: 'Switch to Manual', onPress: switchToManual }
      ]
    );
  };

  const setModeHandler = async (newMode) => {
    if (!isModeActionAllowed()) {
      Alert.alert('⏳ Not Ready', 'Device is not ready. Please wait...');
      return;
    }

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

  const canPublish = isManualMode && isConnected && !modeLocked && !isSwitching && isModeLoaded && isDeviceOnline && hasReceivedRealMode;

  const value = {
    mode,
    modeDisplay,
    isManualMode,
    isAutoMode,
    isConfigMode,
    isModeUnknown,
    isDeviceOnline,
    isDeviceLoading,
    hasReceivedRealMode,
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
    getModeIcon: () => {
      if (isDeviceLoading || mode === null || !hasReceivedRealMode) return '⏳';
      return isManualMode ? '🔧' : '🤖';
    },
    getModeColor: () => {
      if (isDeviceLoading || mode === null || !hasReceivedRealMode) return '#FF9800';
      return isManualMode ? '#4CAF50' : '#FF9800';
    },
    isModeActionAllowed: isModeActionAllowed,
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