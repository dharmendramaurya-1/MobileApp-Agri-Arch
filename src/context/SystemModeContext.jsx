// src/context/SystemModeContext.jsx
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useMqtt } from './MqttContext';

const SystemModeContext = createContext(undefined);

export const SystemModeProvider = ({ children }) => {
  const { 
    deviceConfig, 
    isConnected, 
    externalKey,
    publishConfig,
    isReady
  } = useMqtt();
  
  const [mode, setMode] = useState('manual');
  const [modeLocked, setModeLocked] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [isModeLoaded, setIsModeLoaded] = useState(false);
  const [modeDisplay, setModeDisplay] = useState('Manual');
  const modeSyncTimeout = useRef(null);

  useEffect(() => {
    if (deviceConfig && isReady) {
      const newMode = deviceConfig.auto_mode ? 'auto' : 'manual';
      if (newMode !== mode && !isSwitching) {
        console.log(`🔄 System mode synced from deviceConfig: ${newMode.toUpperCase()}`);
        setMode(newMode);
        setModeDisplay(newMode === 'auto' ? 'Auto' : 'Manual');
        setIsModeLoaded(true);
      }
      
      if (modeSyncTimeout.current) {
        clearTimeout(modeSyncTimeout.current);
        modeSyncTimeout.current = null;
      }
    }
  }, [deviceConfig, isReady]);

  useEffect(() => {
    if (isReady && deviceConfig) {
      setIsModeLoaded(true);
    }
  }, [isReady, deviceConfig]);

  const isManualMode = mode === 'manual';
  const isAutoMode = mode === 'auto';
  const isConfigMode = mode === 'config';

  const switchToManual = async () => {
    if (isSwitching) {
      console.log('⏳ Already switching mode...');
      return;
    }

    if (!externalKey) {
      Alert.alert('❌ Error', 'No device ID available');
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

      const success = await publishConfig(updatedConfig);
      
      if (success) {
        console.log('✅ Switch to MANUAL request sent, waiting for confirmation...');
        
        await new Promise((resolve) => {
          modeSyncTimeout.current = setTimeout(() => {
            console.log('⚠️ Mode switch timeout - waiting for backend response');
            resolve(null);
          }, 10000);
          
          const checkConfig = () => {
            if (deviceConfig && !deviceConfig.auto_mode) {
              clearTimeout(modeSyncTimeout.current);
              modeSyncTimeout.current = null;
              resolve(null);
            }
          };
          
          const interval = setInterval(checkConfig, 500);
          setTimeout(() => {
            clearInterval(interval);
          }, 10000);
        });
        
        if (deviceConfig && !deviceConfig.auto_mode) {
          setMode('manual');
          setModeDisplay('Manual');
          setIsModeLoaded(true);
          Alert.alert(
            '✅ Mode Switched', 
            'System is now in MANUAL mode.\nYou can now control devices individually.'
          );
          console.log('✅ Confirmed MANUAL mode');
        } else {
          setIsModeLoaded(true);
          Alert.alert(
            '⚠️ Mode Update Pending', 
            'Mode switch request sent but confirmation is pending.\nPlease check the system status.'
          );
        }
      } else {
        setIsModeLoaded(true);
        Alert.alert('❌ Error', 'Failed to switch to MANUAL mode. Please try again.');
        console.log('❌ Failed to switch to MANUAL mode');
      }
    } catch (error) {
      console.error('Error switching to manual mode:', error);
      setIsModeLoaded(true);
      Alert.alert('❌ Error', 'Failed to switch mode. Please check your connection.');
    } finally {
      setIsSwitching(false);
      setModeLocked(false);
      if (modeSyncTimeout.current) {
        clearTimeout(modeSyncTimeout.current);
        modeSyncTimeout.current = null;
      }
    }
  };

  const switchToAuto = async () => {
    if (isSwitching) {
      console.log('⏳ Already switching mode...');
      return;
    }

    if (!externalKey) {
      Alert.alert('❌ Error', 'No device ID available');
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

      const success = await publishConfig(updatedConfig);
      
      if (success) {
        console.log('✅ Switch to AUTO request sent, waiting for confirmation...');
        
        await new Promise((resolve) => {
          modeSyncTimeout.current = setTimeout(() => {
            console.log('⚠️ Mode switch timeout - waiting for backend response');
            resolve(null);
          }, 10000);
          
          const checkConfig = () => {
            if (deviceConfig && deviceConfig.auto_mode) {
              clearTimeout(modeSyncTimeout.current);
              modeSyncTimeout.current = null;
              resolve(null);
            }
          };
          
          const interval = setInterval(checkConfig, 500);
          setTimeout(() => {
            clearInterval(interval);
          }, 10000);
        });
        
        if (deviceConfig && deviceConfig.auto_mode) {
          setMode('auto');
          setModeDisplay('Auto');
          setIsModeLoaded(true);
          Alert.alert(
            '✅ Mode Switched', 
            'System is now in AUTO mode.\nAutomatic controls are now enabled.'
          );
          console.log('✅ Confirmed AUTO mode');
        } else {
          setIsModeLoaded(true);
          Alert.alert(
            '⚠️ Mode Update Pending', 
            'Mode switch request sent but confirmation is pending.\nPlease check the system status.'
          );
        }
      } else {
        setIsModeLoaded(true);
        Alert.alert('❌ Error', 'Failed to switch to AUTO mode. Please try again.');
        console.log('❌ Failed to switch to AUTO mode');
      }
    } catch (error) {
      console.error('Error switching to auto mode:', error);
      setIsModeLoaded(true);
      Alert.alert('❌ Error', 'Failed to switch mode. Please check your connection.');
    } finally {
      setIsSwitching(false);
      setModeLocked(false);
      if (modeSyncTimeout.current) {
        clearTimeout(modeSyncTimeout.current);
        modeSyncTimeout.current = null;
      }
    }
  };

  const toggleMode = async () => {
    if (isSwitching || modeLocked) {
      console.log('⏳ Mode switch in progress...');
      return;
    }

    if (!isModeLoaded) {
      Alert.alert('⏳ Loading', 'Please wait for the system mode to load.');
      return;
    }

    if (isAutoMode) {
      Alert.alert(
        '🔄 Switch to Manual Mode',
        'Switching to MANUAL mode will disable automatic controls and allow you to control devices individually.\n\nCurrent Mode: AUTO\n\nContinue?',
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Yes, Switch to Manual', 
            onPress: () => switchToManual()
          }
        ]
      );
    } else {
      Alert.alert(
        '🔄 Switch to Auto Mode',
        'Switching to AUTO mode will let the system control devices automatically.\n\nManual controls will be disabled.\n\nCurrent Mode: MANUAL\n\nContinue?',
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Yes, Switch to Auto', 
            onPress: () => switchToAuto()
          }
        ]
      );
    }
  };

  // ✅ Enhanced checkBeforeActuator with better popup
  const checkBeforeActuator = (action) => {
    if (!isConnected) {
      Alert.alert(
        '📡 Not Connected',
        'Please check your MQTT connection and try again.'
      );
      return false;
    }

    if (!isModeLoaded) {
      Alert.alert(
        '⏳ Loading Mode',
        'Please wait for the system mode to load...'
      );
      return false;
    }

    if (modeLocked || isSwitching) {
      Alert.alert(
        '⏳ Mode Switching',
        'System is currently switching modes. Please wait...'
      );
      return false;
    }

    // ✅ Check if in AUTO mode - show clear popup with mode info
    if (isAutoMode) {
      Alert.alert(
        '🤖 AUTO Mode Active',
        `Cannot control "${action}" while system is in AUTO mode.\n\nCurrent Mode: AUTO\n\nPlease switch to MANUAL mode to control devices individually.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Switch to Manual', 
            onPress: () => {
              switchToManual();
            }
          }
        ]
      );
      return false;
    }

    // ✅ In MANUAL mode - allow control
    if (isManualMode) {
      return true;
    }

    // Fallback for unknown mode
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
        { 
          text: 'Switch to Manual', 
          onPress: () => {
            switchToManual();
          }
        }
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
    modeDisplay,        // ✅ Display friendly name
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
    getModeDisplay: () => modeDisplay,  // ✅ Helper to get mode display
    getModeIcon: () => isManualMode ? '🔧' : '🤖',  // ✅ Helper for icon
    getModeColor: () => isManualMode ? '#4CAF50' : '#FF9800',  // ✅ Helper for color
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