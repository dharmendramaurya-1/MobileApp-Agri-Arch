// app/(main)/config.jsx
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useMqtt } from "../../src/context/MqttContext";
import { useScroll, useScrollReset } from "../../src/context/ScrollContext";
import { useTheme } from "../../src/context/ThemContext";
import { parseDeviceStatus } from "../../src/utils/deviceStatusParser";

// â”€â”€ Main Config Screen â”€â”€
export default function ConfigScreen() {
  const { theme, isDark, toggleTheme } = useTheme();
  const { onScroll, headerHeight } = useScroll();
  const scrollRef = useRef(null);
  useScrollReset(scrollRef);
  
  const { 
    externalKey,
    selectedExternalKey, 
    isConnected, 
    publishConfig, 
    getSelectedDeviceConfig,
    isReady,
    getSelectedDeviceName,
    deviceOnlineStatus,
    deviceInitialLoadComplete,
    connectionState,
    subscribeToLiveData,
  } = useMqtt();
  
  const deviceConfig = getSelectedDeviceConfig();

  const [notifications, setNotifications] = useState(true);
  const [config, setConfig] = useState({
    report_interval: 180,
    sampling_interval: 30,
    auto_mode: false,
  });
  const [publishing, setPublishing] = useState(false);
  const [isAutoModePending, setIsAutoModePending] = useState(false);
  const [publishError, setPublishError] = useState(null);
  const pendingTargetModeRef = useRef(null);
  const autoModeTimeoutRef = useRef(null);

  // â”€â”€ App resume state tracking â”€â”€
  const [isResuming, setIsResuming] = useState(false);
  const appStateRef = useRef(AppState.currentState);
  const resumeTimeoutRef = useRef(null);
  const isMountedRef = useRef(true);

  // Get selected device info
  const selectedDeviceName = getSelectedDeviceName();
  const deviceKey = selectedExternalKey || externalKey;

  // â”€â”€ âœ… STABLE STATUS DERIVATION (SAME AS LAYOUT) â”€â”€
  const isDeviceOnline = useMemo(() => {
    if (!deviceKey) return false;
    return deviceOnlineStatus[deviceKey] === true;
  }, [deviceKey, deviceOnlineStatus]);

  const isInitialLoadComplete = useMemo(() => {
    if (!deviceKey) return false;
    return deviceInitialLoadComplete[deviceKey] === true;
  }, [deviceKey, deviceInitialLoadComplete]);

  // â”€â”€ Loading state (show NOTHING) â”€â”€
  const isLoading = useMemo(() => {
    if (!deviceKey) return false;
    return !isInitialLoadComplete;
  }, [deviceKey, isInitialLoadComplete]);

  // â”€â”€ Waiting state â”€â”€
  const isWaiting = useMemo(() => {
    return (!isInitialLoadComplete && !isLoading) ||
      connectionState === "connecting" ||
      connectionState === "waiting" ||
      connectionState === "idle";
  }, [isInitialLoadComplete, isLoading, connectionState]);

  // â”€â”€ Offline state (only when confirmed) â”€â”€
  const isDeviceOffline = useMemo(() => {
    return isInitialLoadComplete && !isDeviceOnline;
  }, [isInitialLoadComplete, isDeviceOnline]);

  // â”€â”€ Not connected state â”€â”€
  const isNotConnected = useMemo(() => {
    return connectionState === "idle" || connectionState === "disconnected" || connectionState === "error";
  }, [connectionState]);

  // â”€â”€ âœ… SINGLE SOURCE OF TRUTH for device status â”€â”€
  const deviceStatus = useMemo(() => {
    // If not connected, show nothing
    if (isNotConnected || !isConnected) {
      return { type: 'unknown' };
    }
    
    // âœ… When loading or waiting, show NOTHING
    if (isLoading || isWaiting) {
      return { type: 'loading' };
    }
    
    // âœ… Only show status when we have a definitive state
    if (isDeviceOnline) {
      return { type: 'online', text: 'Online', color: '#4CAF50' };
    }
    
    if (isDeviceOffline) {
      return { type: 'offline', text: 'Offline', color: '#f44336' };
    }
    
    return { type: 'unknown' };
  }, [isNotConnected, isConnected, isLoading, isWaiting, isDeviceOnline, isDeviceOffline]);

  // â”€â”€ âœ… DEVICE READY STATE (stable, no flicker) â”€â”€
  const isDeviceReady = useMemo(() => {
    return isConnected && isInitialLoadComplete && isDeviceOnline && !isResuming && !isLoading && !isWaiting;
  }, [isConnected, isInitialLoadComplete, isDeviceOnline, isResuming, isLoading, isWaiting]);

  // â”€â”€ AppState listener for resume handling â”€â”€
  useEffect(() => {
    isMountedRef.current = true;
    
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      const previousAppState = appStateRef.current;
      
      if (nextAppState === "active" && previousAppState !== "active") {
        console.log("ðŸ“± Config: App resumed");
        setIsResuming(true);
        
        if (resumeTimeoutRef.current) {
          clearTimeout(resumeTimeoutRef.current);
        }
        
        resumeTimeoutRef.current = setTimeout(() => {
          if (isMountedRef.current) {
            setIsResuming(false);
          }
          resumeTimeoutRef.current = null;
        }, 1500);
      }
      
      if (nextAppState === "background") {
        console.log("ðŸ“± Config: App backgrounded");
        if (resumeTimeoutRef.current) {
          clearTimeout(resumeTimeoutRef.current);
          resumeTimeoutRef.current = null;
        }
        if (isMountedRef.current) {
          setIsResuming(false);
        }
      }
      
      appStateRef.current = nextAppState;
    });
    
    return () => {
      isMountedRef.current = false;
      subscription.remove();
      if (resumeTimeoutRef.current) {
        clearTimeout(resumeTimeoutRef.current);
        resumeTimeoutRef.current = null;
      }
    };
  }, []);

  // ── Sync deviceConfig from MQTT context ──
  useEffect(() => {
    if (deviceConfig) {
      const devAutoMode = typeof deviceConfig.auto_mode === "boolean" ? deviceConfig.auto_mode : null;
      setConfig((prev) => ({
        ...prev,
        report_interval: deviceConfig.report_interval ?? prev.report_interval,
        sampling_interval: deviceConfig.sampling_interval ?? prev.sampling_interval,
        // While pending /data response, keep existing switch value; otherwise sync with confirmed deviceConfig
        auto_mode: isAutoModePending ? prev.auto_mode : (devAutoMode ?? prev.auto_mode),
      }));

      // If pending target matches updated deviceConfig, device has confirmed!
      if (isAutoModePending && pendingTargetModeRef.current !== null && devAutoMode === pendingTargetModeRef.current) {
        console.log(`🎉 Confirmed AutoMode = ${devAutoMode} via deviceConfig sync`);
        if (autoModeTimeoutRef.current) {
          clearTimeout(autoModeTimeoutRef.current);
          autoModeTimeoutRef.current = null;
        }
        pendingTargetModeRef.current = null;
        setIsAutoModePending(false);
        setConfig((prev) => ({ ...prev, auto_mode: devAutoMode }));
      }
    }
  }, [deviceConfig, isAutoModePending]);

  // ── Listen for direct /data confirmation from the device ──
  useEffect(() => {
    if (typeof subscribeToLiveData !== 'function') return;

    const unsubscribe = subscribeToLiveData(({ deviceKey: msgDeviceKey, parsed, isStatusResponse }) => {
      const targetDeviceKey = selectedExternalKey || externalKey;
      if (!targetDeviceKey || msgDeviceKey !== targetDeviceKey) return;

      if (parsed && parsed.deviceStatus !== undefined && parsed.deviceStatus !== null) {
        const flags = parseDeviceStatus(parsed.deviceStatus);
        if (flags.mode !== null && flags.mode !== undefined) {
          console.log(`📥 [${msgDeviceKey}] ${isStatusResponse ? 'STATUS' : 'DATA'} mode = ${flags.mode}`);

          if (pendingTargetModeRef.current !== null && flags.mode === pendingTargetModeRef.current) {
            console.log(`🎉 Confirmed AutoMode = ${flags.mode} from /data message for ${msgDeviceKey}!`);
            if (autoModeTimeoutRef.current) {
              clearTimeout(autoModeTimeoutRef.current);
              autoModeTimeoutRef.current = null;
            }
            pendingTargetModeRef.current = null;
            setIsAutoModePending(false);
            setConfig((prev) => ({ ...prev, auto_mode: flags.mode }));
          }
        }
      }
    });

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
      if (autoModeTimeoutRef.current) {
        clearTimeout(autoModeTimeoutRef.current);
        autoModeTimeoutRef.current = null;
      }
    };
  }, [selectedExternalKey, externalKey, subscribeToLiveData]);

  const switchColors = {
    trackColor: { false: theme.colors.border, true: theme.colors.primary },
    thumbColor: "#fff",
  };

  // ── Auto-publish on auto_mode toggle (Wait for device /data confirmation) ──
  const handleAutoModePublish = async (autoModeValue) => {
    const targetDeviceKey = selectedExternalKey || externalKey;

    if (!isConnected) {
      Alert.alert("Not Connected", "Please wait for device to connect.");
      return;
    }
    if (!targetDeviceKey) {
      Alert.alert("Error", "No device selected.");
      return;
    }
    if (!isDeviceReady) {
      Alert.alert("Device Not Ready", "Please wait for the device to come online.");
      return;
    }
    if (isAutoModePending || publishing) {
      return;
    }

    // Do NOT update config.auto_mode yet!
    // The switch button stays in its original state until /messages/{deviceKey}/data arrives.
    setIsAutoModePending(true);
    setPublishError(null);
    pendingTargetModeRef.current = autoModeValue;

    // Timeout after 25s if device does not send /data confirming the mode
    if (autoModeTimeoutRef.current) clearTimeout(autoModeTimeoutRef.current);
    autoModeTimeoutRef.current = setTimeout(() => {
      if (pendingTargetModeRef.current !== null) {
        console.warn(`⏰ AutoMode switch timed out waiting for /data response from ${targetDeviceKey}`);
        setIsAutoModePending(false);
        pendingTargetModeRef.current = null;
        Alert.alert(
          "Timeout",
          `Mode command was sent, but the device did not confirm in /data telemetry within 25 seconds.\nThe switch remains in its current state.`
        );
      }
    }, 25000);

    const configToSend = {
      report_interval: config.report_interval || 180,
      sampling_interval: config.sampling_interval || 30,
      auto_mode: autoModeValue,
    };

    try {
      console.log(`📡 [${targetDeviceKey}] Publishing /cfg for AutoMode = ${autoModeValue}:`, configToSend);
      const result = await publishConfig(targetDeviceKey, configToSend);
      const isSuccess = typeof result === 'boolean' ? result : result?.success;

      if (isSuccess) {
        console.log(`✅ AutoMode = ${autoModeValue} /cfg published. Waiting for device confirmation in /data topic...`);
        // Do NOT setConfig or clear isAutoModePending here!
        // We strictly wait until /messages/{targetDeviceKey}/data confirms flags.mode === autoModeValue
      } else {
        if (autoModeTimeoutRef.current) {
          clearTimeout(autoModeTimeoutRef.current);
          autoModeTimeoutRef.current = null;
        }
        setIsAutoModePending(false);
        pendingTargetModeRef.current = null;
        const errorMsg = typeof result === 'object' && result?.error ? result.error : "Failed to send mode command to device.";
        console.warn(`⚠️ AutoMode publish unsuccessful:`, errorMsg);
        setPublishError(errorMsg);
        Alert.alert("Publish Failed", errorMsg);
      }
    } catch (error) {
      if (autoModeTimeoutRef.current) {
        clearTimeout(autoModeTimeoutRef.current);
        autoModeTimeoutRef.current = null;
      }
      setIsAutoModePending(false);
      pendingTargetModeRef.current = null;
      console.error('❌ Auto mode publish error:', error);
      const errorMsg = error.message || "Failed to publish auto mode.";
      setPublishError(errorMsg);
      Alert.alert("Error", errorMsg);
    }
  };

  // ── Publish configuration ──
  const handlePublish = async () => {
    const targetDeviceKey = selectedExternalKey || externalKey;

    if (!isConnected) {
      Alert.alert(
        "Not Connected",
        "Please check your MQTT connection and try again."
      );
      return;
    }

    if (!targetDeviceKey) {
      Alert.alert(
        "No Device ID",
        "Device key not found. Please restart the app or select a device."
      );
      return;
    }

    setPublishing(true);
    setPublishError(null);
    
    try {
      const configToSend = {
        report_interval: config.report_interval || 180,
        sampling_interval: config.sampling_interval || 30,
        auto_mode: config.auto_mode,
      };

      console.log('📤 Publishing config:', {
        deviceKey: targetDeviceKey,
        config: configToSend,
        isConnected,
      });

      const result = await publishConfig(targetDeviceKey, configToSend);
      const isSuccess = typeof result === 'boolean' ? result : result?.success;

      if (isSuccess) {
        Alert.alert(
          "Configuration Published",
          `Mode updated for ${selectedDeviceName || targetDeviceKey}.`
        );
        setPublishError(null);
      } else {
        const errorMsg = typeof result === 'object' && result?.error ? result.error : "Unknown error occurred";
        Alert.alert(
          "Publish Failed",
          `${errorMsg}\n\nPlease check:\n- Device is online\n- Connection is stable\n- Try again in a moment`
        );
      }
    } catch (error) {
      console.error("Publish error details:", {
        message: error.message,
        stack: error.stack,
      });

      Alert.alert(
        "Publish Error",
        error.message || "An unexpected error occurred. Please try again."
      );
    } finally {
      setPublishing(false);
    }
  };

  // â”€â”€ Show loading state â”€â”€
  if (!isReady) {
    return (
      <View style={[styles.container, { 
        backgroundColor: theme.colors.background,
        justifyContent: 'center',
        alignItems: 'center' 
      }]}>
        <Text style={{ color: theme.colors.text }}>Loading configuration...</Text>
      </View>
    );
  }

  // âœ… Determine what to show
  const showStatusBadge = deviceStatus.type === 'online' || deviceStatus.type === 'offline';
  const showWarning = deviceStatus.type === 'offline';

  return (
    <ScrollView
      ref={scrollRef}
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={{
        // paddingBottom: SCREEN_HEIGHT * 0.1,
        paddingTop: headerHeight,
      }}
      onScroll={onScroll}
      scrollEventThrottle={16}
    >
      {/* â”€â”€ Header â”€â”€ */}
      <View style={styles.headerRow}>
        <View>
          <Text style={[styles.title, { color: theme.colors.text }]}>
            Configuration
          </Text>
          {selectedDeviceName && (
            <Text style={[styles.deviceNameSubtitle, { color: theme.colors.textSecondary }]}>
              {selectedDeviceName}
            </Text>
          )}
        </View>
        {showStatusBadge && (
          <View style={[
            styles.statusBadge,
            { backgroundColor: deviceStatus.color }
          ]}>
            <Text style={[styles.statusText, { color: '#fff' }]}>
              {deviceStatus.text}
            </Text>
          </View>
        )}
      </View>

      {/* â”€â”€ Device Info â”€â”€ */}
      {/* {externalKey && (
        <View style={[
          styles.deviceInfo,
          { 
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
          }
        ]}>
          <Ionicons name="hardware-chip-outline" size={20} color={theme.colors.primary} />
          <Text style={[styles.deviceId, { color: theme.colors.text }]}>
            Device: {externalKey}
          </Text>
          {showDeviceDot && (
            <View style={[
              styles.onlineDot, 
              { backgroundColor: deviceStatus.type === 'online' ? '#4CAF50' : '#f44336' }
            ]} />
          )}
        </View>
      )} */}

      {/* â”€â”€ Device Configuration Section â”€â”€ */}
      <View
        style={[
          styles.section,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
          },
        ]}
      >
        <Text
          style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}
        >
          Device Configuration
        </Text>

        <Text style={[styles.sectionSubtitle, { color: theme.colors.textSecondary }]}>
          Choose how the selected device should operate.
        </Text>

        <View style={styles.settingItem}>
          <Ionicons name="sync-outline" size={24} color={theme.colors.primary} />
          <View style={styles.settingLabelContainer}>
            <Text style={[styles.settingText, { color: theme.colors.text }]}>Auto Mode</Text>
            <Text style={[styles.settingDescription, { color: theme.colors.textSecondary }]}>
              Let the device manage its operating cycle automatically.
            </Text>
          </View>
          <View style={styles.switchWrapper}>
            {isAutoModePending && (
              <ActivityIndicator
                size="small"
                color={theme.colors.primary}
                style={{ marginRight: 8 }}
              />
            )}
            <Switch
              value={config.auto_mode}
              onValueChange={(v) => {
                handleAutoModePublish(v);
              }}
              disabled={isAutoModePending || publishing || !isDeviceReady}
              style={styles.largeSwitch}
              {...switchColors}
            />
          </View>
        </View>

        <View style={[styles.modeSummary, { backgroundColor: `${theme.colors.primary}0D`, borderColor: `${theme.colors.primary}25` }]}>
          <Ionicons
            name={config.auto_mode ? "sync-circle-outline" : "hand-left-outline"}
            size={22}
            color={theme.colors.primary}
          />
          <View style={styles.modeSummaryText}>
            <Text style={[styles.modeSummaryTitle, { color: theme.colors.text }]}>
              {config.auto_mode ? "Automatic control" : "Manual control"}
            </Text>
            <Text style={[styles.modeSummarySubtitle, { color: theme.colors.textSecondary }]}>
              {config.auto_mode ? "The device manages its cycle." : "You control the device from the app."}
            </Text>
          </View>
        </View>

        <View style={[styles.internalConfigNote, { backgroundColor: `${theme.colors.textSecondary}0D` }]}>
          <Ionicons name="information-circle-outline" size={16} color={theme.colors.textSecondary} />
          <Text style={[styles.internalConfigText, { color: theme.colors.textSecondary }]}>
            Device timing settings are managed automatically.
          </Text>
        </View>

        <View>
          {publishError && (
            <Text style={[styles.errorText, { color: '#F44336' }]}>
              Error: {publishError}
            </Text>
          )}
        </View>

        {/* â”€â”€ Publish Button â”€â”€ */}
        <Pressable
          onPress={handlePublish}
          disabled={publishing || !isDeviceReady}
          style={[
            styles.publishButton,
            { 
              backgroundColor: isDeviceReady ? theme.colors.primary : '#888',
              opacity: publishing || !isDeviceReady ? 0.6 : 1 
            },
          ]}
        >
          <Ionicons name="cloud-upload-outline" size={18} color="#fff" />
          <Text style={styles.publishButtonText}>
            {publishing ? "Publishing..." : "Set Configuration"}
          </Text>
        </Pressable>

        {/* â”€â”€ Warnings (ONLY when definitive) â”€â”€ */}
        {showWarning && (
          <Text style={[styles.warningText, { color: '#f44336' }]}>
            Device is offline. Please wait for device to connect.
          </Text>
        )}
        {isResuming && !showWarning && (
          <Text style={[styles.warningText, { color: '#FF9800' }]}>
            App is resuming. Please wait a moment...
          </Text>
        )}
      </View>

      {/* â”€â”€ Notifications Section â”€â”€ */}
      {/* <View
        style={[
          styles.section,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
          },
        ]}
      >
        <Text
          style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}
        >
          Notifications
        </Text>
        <View style={styles.settingItem}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              flex: 1,
              gap: 16,
            }}
          >
            <Ionicons
              name="notifications-outline"
              size={24}
              color={theme.colors.primary}
            />
            <Text
              style={[
                styles.settingText,
                {
                  color: theme.colors.text,
                },
              ]}
            >
              Push Notifications
            </Text>
          </View>
          <Switch
            value={notifications}
            onValueChange={setNotifications}
            {...switchColors}
          />
        </View>
      </View> */}

      {/* â”€â”€ Appearance Section â”€â”€ */}
      <View
        style={[
          styles.section,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
          },
        ]}
      >
        <Text
          style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}
        >
          Appearance
        </Text>
        <View style={styles.settingItem}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              flex: 1,
              gap: 16,
            }}
          >
            <Ionicons
              name="moon-outline"
              size={24}
              color={theme.colors.primary}
            />
            <Text
              style={[
                styles.settingText,
                {
                  color: theme.colors.text,
                },
              ]}
            >
              Dark Mode
            </Text>
          </View>
          <View style={styles.switchWrapper}>
            <Switch
              value={isDark}
              onValueChange={toggleTheme}
              style={styles.largeSwitch}
              {...switchColors}
            />
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: { fontSize: 28, fontWeight: "700" },
  deviceNameSubtitle: { 
    fontSize: 14, 
    fontWeight: "500",
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  deviceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 20,
    gap: 10,
  },
  deviceId: {
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  onlineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  section: {
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 20,
    overflow: "hidden",
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    padding: 16,
    paddingBottom: 8,
  },
  sectionSubtitle: {
    fontSize: 12,
    paddingHorizontal: 16,
    paddingBottom: 8,
    opacity: 0.8,
  },
  settingItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 16,
  },
  settingLabelContainer: {
    flex: 1,
  },
  settingText: { fontSize: 16, fontWeight: "500" },
  settingDescription: { fontSize: 12, marginTop: 4, lineHeight: 17 },
  switchWrapper: {
    paddingHorizontal: 6,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  largeSwitch: {
    transform: [{ scaleX: 1.25 }, { scaleY: 1.25 }],
  },
  warningText: {
    fontSize: 12,
    textAlign: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  errorText: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 6,
    fontWeight: '600',
  },
  modeSummary: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
  },
  modeSummaryText: {
    flex: 1,
    marginLeft: 12,
  },
  modeSummaryTitle: { fontSize: 14, fontWeight: "700" },
  modeSummarySubtitle: { fontSize: 12, marginTop: 3 },
  internalConfigNote: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginBottom: 4,
    padding: 10,
    borderRadius: 8,
  },
  internalConfigText: { flex: 1, fontSize: 11, marginLeft: 7, lineHeight: 16 },
  publishButton: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    margin: 16,
    marginTop: 4,
    paddingVertical: 14,
    borderRadius: 10,
  },
  publishButtonText: { color: "#fff", fontWeight: "600", fontSize: 15 },
});