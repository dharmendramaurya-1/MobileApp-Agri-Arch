// app/(main)/config.jsx
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  AppState,
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useMqtt } from "../../src/context/MqttContext";
import { useScroll, useScrollReset } from "../../src/context/ScrollContext";
import { useTheme } from "../../src/context/ThemContext";

const SCREEN_HEIGHT = Dimensions.get("window").height;

function formatDuration(seconds) {
  if (!seconds || seconds < 0) return 'N/A';
  if (seconds < 60) return `${seconds}s`;
  if (seconds % 60 === 0) return `${seconds / 60} min`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

// ── Interval Picker Component ──
function IntervalPicker({
  label,
  value,
  onSelect,
  theme,
  isRequired = false,
}) {
  const [expanded, setExpanded] = useState(false);
  const [customText, setCustomText] = useState(String(value || ''));

  const handleTogglePress = () => {
    setCustomText(String(value || ''));
    setExpanded((e) => !e);
  };

  const handleCustomSubmit = () => {
    const parsed = parseInt(customText, 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      onSelect(parsed);
      setExpanded(false);
    } else {
      Alert.alert("Invalid Value", "Please enter a positive number.");
    }
  };

  return (
    <View>
      <View style={styles.settingItem}>
        <Ionicons name="time-outline" size={24} color={theme.colors.primary} />
        <View style={styles.settingLabelContainer}>
          <Text style={[styles.settingText, { color: theme.colors.text }]}>
            {label}
          </Text>
          {isRequired && (
            <Text style={[styles.requiredBadge, { color: '#F44336' }]}>*</Text>
          )}
        </View>

        <Pressable
          onPress={handleTogglePress}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={[
            styles.dropdownTrigger,
            {
              borderColor: theme.colors.border,
            },
          ]}
        >
          <Text style={{ color: theme.colors.text }}>
            {value ? formatDuration(value) : 'Select'}
          </Text>
          <Ionicons
            name={expanded ? "chevron-up" : "chevron-down"}
            size={16}
            color={theme.colors.textSecondary}
          />
        </Pressable>
      </View>

      {expanded && (
        <View
          style={[
            styles.chipPanel,
            {
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.background,
            },
          ]}
        >
          <View style={styles.customRow}>
            <Text
              style={[styles.customLabel, { color: theme.colors.textSecondary }]}
            >
              Enter custom value (seconds)
            </Text>
            <View style={styles.customInputRow}>
              <TextInput
                value={customText}
                onChangeText={setCustomText}
                keyboardType="number-pad"
                placeholder="Enter seconds"
                placeholderTextColor={theme.colors.textSecondary}
                style={[
                  styles.customInput,
                  {
                    color: theme.colors.text,
                    borderColor: theme.colors.border,
                  },
                ]}
                onSubmitEditing={handleCustomSubmit}
                returnKeyType="done"
              />
              <Pressable
                onPress={handleCustomSubmit}
                style={[
                  styles.customApplyButton,
                  { backgroundColor: theme.colors.primary },
                ]}
              >
                <Text style={styles.customApplyText}>Set</Text>
              </Pressable>
            </View>
            <Text
              style={[styles.hintText, { color: theme.colors.textSecondary }]}
            >
              Current: {value ? formatDuration(value) : 'Not set'}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

// ── Main Config Screen ──
export default function ConfigScreen() {
  const { theme, isDark, toggleTheme } = useTheme();
  const { onScroll, headerHeight } = useScroll();
  const scrollRef = useRef(null);
  useScrollReset(scrollRef);
  
  const { 
    externalKey, 
    isConnected, 
    publishConfig, 
    getSelectedDeviceConfig,
    isReady,
    getSelectedDeviceName,
    deviceOnlineStatus,
    deviceInitialLoadComplete,
    connectionState,
    addAlert,
  } = useMqtt();
  
  const deviceConfig = getSelectedDeviceConfig();

  const [notifications, setNotifications] = useState(true);
  const [config, setConfig] = useState({
    report_interval: null,
    sampling_interval: null,
    auto_mode: false,
  });
  const [publishing, setPublishing] = useState(false);
  const [showError, setShowError] = useState(false);
  const [publishError, setPublishError] = useState(null);

  // ── App resume state tracking ──
  const [isResuming, setIsResuming] = useState(false);
  const appStateRef = useRef(AppState.currentState);
  const resumeTimeoutRef = useRef(null);
  const isMountedRef = useRef(true);

  // Get selected device info
  const selectedDeviceName = getSelectedDeviceName();
  const deviceKey = externalKey;

  // ── ✅ STABLE STATUS DERIVATION (SAME AS LAYOUT) ──
  const isDeviceOnline = useMemo(() => {
    if (!deviceKey) return false;
    return deviceOnlineStatus[deviceKey] === true;
  }, [deviceKey, deviceOnlineStatus]);

  const isInitialLoadComplete = useMemo(() => {
    if (!deviceKey) return false;
    return deviceInitialLoadComplete[deviceKey] === true;
  }, [deviceKey, deviceInitialLoadComplete]);

  // ── Loading state (show NOTHING) ──
  const isLoading = useMemo(() => {
    if (!deviceKey) return false;
    return !isInitialLoadComplete;
  }, [deviceKey, isInitialLoadComplete]);

  // ── Waiting state ──
  const isWaiting = useMemo(() => {
    return (!isInitialLoadComplete && !isLoading) ||
      connectionState === "connecting" ||
      connectionState === "waiting" ||
      connectionState === "idle";
  }, [isInitialLoadComplete, isLoading, connectionState]);

  // ── Offline state (only when confirmed) ──
  const isDeviceOffline = useMemo(() => {
    return isInitialLoadComplete && !isDeviceOnline;
  }, [isInitialLoadComplete, isDeviceOnline]);

  // ── Not connected state ──
  const isNotConnected = useMemo(() => {
    return connectionState === "idle" || connectionState === "disconnected" || connectionState === "error";
  }, [connectionState]);

  // ── ✅ SINGLE SOURCE OF TRUTH for device status ──
  const deviceStatus = useMemo(() => {
    // If not connected, show nothing
    if (isNotConnected || !isConnected) {
      return { type: 'unknown' };
    }
    
    // ✅ When loading or waiting, show NOTHING
    if (isLoading || isWaiting) {
      return { type: 'loading' };
    }
    
    // ✅ Only show status when we have a definitive state
    if (isDeviceOnline) {
      return { type: 'online', text: '● Online', color: '#4CAF50' };
    }
    
    if (isDeviceOffline) {
      return { type: 'offline', text: '● Offline', color: '#f44336' };
    }
    
    return { type: 'unknown' };
  }, [isNotConnected, isConnected, isLoading, isWaiting, isDeviceOnline, isDeviceOffline]);

  // ── ✅ DEVICE READY STATE (stable, no flicker) ──
  const isDeviceReady = useMemo(() => {
    return isConnected && isInitialLoadComplete && isDeviceOnline && !isResuming && !isLoading && !isWaiting;
  }, [isConnected, isInitialLoadComplete, isDeviceOnline, isResuming, isLoading, isWaiting]);

  // ── AppState listener for resume handling ──
  useEffect(() => {
    isMountedRef.current = true;
    
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      const previousAppState = appStateRef.current;
      
      if (nextAppState === "active" && previousAppState !== "active") {
        console.log("📱 Config: App resumed");
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
        console.log("📱 Config: App backgrounded");
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

  // Load device config from context
  useEffect(() => {
    if (deviceConfig) {
      setConfig((prev) => ({
        report_interval: deviceConfig.report_interval ?? prev.report_interval,
        sampling_interval: deviceConfig.sampling_interval ?? prev.sampling_interval,
        auto_mode: deviceConfig.auto_mode ?? prev.auto_mode,
      }));
    }
  }, [deviceConfig]);

  const switchColors = {
    trackColor: { false: theme.colors.border, true: theme.colors.primary },
    thumbColor: "#fff",
  };

  // ── Validate all fields are filled ──
  const validateConfig = () => {
    const errors = [];
    if (!config.report_interval || config.report_interval <= 0) {
      errors.push("Report Interval");
    }
    if (!config.sampling_interval || config.sampling_interval <= 0) {
      errors.push("Sampling Interval");
    }
    return errors;
  };

  // ── Helper function to handle publish result ──
  const handlePublishResult = (result, action) => {
    // Check if result is a boolean (old format) or object (new format)
    const isSuccess = typeof result === 'boolean' ? result : result?.success;
    const errorMsg = typeof result === 'object' ? result?.error : null;
    
    if (isSuccess) {
      setPublishError(null);
      return { success: true };
    } else {
      setPublishError(errorMsg || 'Unknown error occurred');
      return { success: false, error: errorMsg || 'Unknown error occurred' };
    }
  };

  // ── Auto-publish on auto_mode toggle ──
  const handleAutoModePublish = async (autoModeValue) => {
    if (!isConnected) {
      Alert.alert("Not Connected", "Please wait for device to connect.");
      return;
    }
    if (!externalKey) {
      Alert.alert("Error", "No device selected.");
      return;
    }
    if (!config.report_interval || !config.sampling_interval) {
      Alert.alert("Missing Values", "Please set Report and Sampling intervals first.");
      return;
    }
    if (!isDeviceReady) {
      Alert.alert(
        "Device Not Ready",
        isDeviceOffline
          ? "Device is offline. Please wait for device to connect."
          : isResuming
          ? "App is resuming. Please wait a moment."
          : "Device is still connecting. Please wait."
      );
      return;
    }

    setPublishing(true);
    setPublishError(null);
    
    try {
      const configToSend = {
        report_interval: config.report_interval,
        sampling_interval: config.sampling_interval,
        auto_mode: autoModeValue,
      };

      console.log('📤 Publishing auto mode:', {
        deviceKey: externalKey,
        config: configToSend,
        isConnected,
        isDeviceReady,
      });

      const result = await publishConfig(externalKey, configToSend);
      console.log('📥 Auto mode publish result:', result);
      
      const { success, error } = handlePublishResult(result, 'auto mode');
      
      if (success) {
        console.log(`✅ Auto mode ${autoModeValue ? 'ON' : 'OFF'} published`);
        addAlert?.("success", `Auto mode ${autoModeValue ? 'ON' : 'OFF'}`, "Configuration updated successfully");
      } else {
        setConfig((c) => ({ ...c, auto_mode: !autoModeValue }));
        Alert.alert(
          "Publish Failed", 
          `Failed to update auto mode: ${error}\nPlease try again.`
        );
      }
    } catch (error) {
      console.error('Auto mode publish error:', error);
      setConfig((c) => ({ ...c, auto_mode: !autoModeValue }));
      Alert.alert(
        "Error", 
        error.message || "Failed to publish auto mode. Please try again."
      );
    } finally {
      setPublishing(false);
    }
  };

  // ── Publish configuration ──
  const handlePublish = async () => {
    const errors = validateConfig();
    if (errors.length > 0) {
      setShowError(true);
      Alert.alert(
        "⚠️ Missing Configuration",
        `Please set the following parameters:\n\n• ${errors.join('\n• ')}\n\nAll three parameters are required.`,
        [{ text: "OK" }]
      );
      return;
    }

    if (!isConnected) {
      Alert.alert(
        "Not Connected",
        "Please check your MQTT connection and try again."
      );
      return;
    }

    if (!externalKey) {
      Alert.alert(
        "No Device ID",
        "External key not found. Please restart the app."
      );
      return;
    }

    if (!isDeviceReady) {
      Alert.alert(
        "Device Not Ready",
        isDeviceOffline
          ? "Device is offline. Please make sure the device is connected and try again."
          : isResuming
          ? "App is resuming. Please wait a moment and try again."
          : isLoading || isWaiting
          ? "Device is still connecting. Please wait for the device to come online."
          : "Device is not ready. Please wait."
      );
      return;
    }

    setPublishing(true);
    setShowError(false);
    setPublishError(null);
    
    try {
      const configToSend = {
        report_interval: config.report_interval,
        sampling_interval: config.sampling_interval,
        auto_mode: config.auto_mode,
      };

      console.log('📤 Publishing config:', {
        deviceKey: externalKey,
        config: configToSend,
        isConnected,
        isDeviceReady,
        connectionState,
        isDeviceOnline,
      });

      const result = await publishConfig(externalKey, configToSend);
      console.log('📥 Publish result:', result);
      
      const { success, error } = handlePublishResult(result, 'config');

      if (success) {
        const summary =
          `Report Interval: ${formatDuration(configToSend.report_interval)}\n` +
          `Sampling Interval: ${formatDuration(configToSend.sampling_interval)}\n` +
          `Auto Mode: ${configToSend.auto_mode ? "ON" : "OFF"}\n\n` +
          `✅ Configuration sent to: ${selectedDeviceName || externalKey}`;

        Alert.alert("✅ Configuration Published", summary);
        setPublishError(null);
      } else {
        Alert.alert(
          "❌ Publish Failed", 
          `${error}\n\nPlease check:\n• Device is online\n• Connection is stable\n• Try again in a moment`
        );
      }
    } catch (error) {
      console.error("Publish error details:", {
        message: error.message,
        stack: error.stack,
        config: configToSend,
      });
      
      Alert.alert(
        "❌ Publish Error", 
        error.message || "An unexpected error occurred. Please try again."
      );
    } finally {
      setPublishing(false);
    }
  };

  // ── Show loading state ──
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

  // ✅ Determine what to show
  const showStatusBadge = deviceStatus.type === 'online' || deviceStatus.type === 'offline';
  const showDeviceDot = deviceStatus.type === 'online' || deviceStatus.type === 'offline';
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
      {/* ── Header ── */}
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

      {/* ── Device Info ── */}
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

      {/* ── Device Configuration Section ── */}
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
          All fields are required. Please configure each parameter.
        </Text>

        <IntervalPicker
          label="Report Interval"
          value={config.report_interval}
          onSelect={(v) => setConfig((c) => ({ ...c, report_interval: v }))}
          theme={theme}
          isRequired={true}
        />

        <IntervalPicker
          label="Sampling Interval"
          value={config.sampling_interval}
          onSelect={(v) => setConfig((c) => ({ ...c, sampling_interval: v }))}
          theme={theme}
          isRequired={true}
        />

        <View style={styles.settingItem}>
          <Ionicons name="sync-outline" size={24} color={theme.colors.primary} />
          <View style={styles.settingLabelContainer}>
            <Text style={[styles.settingText, { color: theme.colors.text }]}>
              Auto Mode
            </Text>
            <Text style={[styles.requiredBadge, { color: '#F44336' }]}>*</Text>
          </View>
          <Switch
            value={config.auto_mode}
            onValueChange={(v) => {
              handleAutoModePublish(v);
            }}
            disabled={publishing || !isDeviceReady}
            {...switchColors}
          />
        </View>

        {/* ── Current Values ── */}
        <View style={[styles.currentValuesContainer, { 
          backgroundColor: showError && (!config.report_interval || !config.sampling_interval) 
            ? 'rgba(244,67,54,0.08)' 
            : 'rgba(0,0,0,0.05)'
        }]}>
          <Text style={[styles.currentValuesLabel, { color: theme.colors.textSecondary }]}>
            Current Configuration:
          </Text>
          <View style={styles.currentValuesRow}>
            <View style={styles.currentValueItem}>
              <Text style={[styles.currentValueLabel, { color: theme.colors.textSecondary }]}>
                Report:
              </Text>
              <Text style={[styles.currentValueText, { 
                color: config.report_interval ? theme.colors.text : '#F44336',
                fontWeight: config.report_interval ? '500' : '700',
              }]}>
                {config.report_interval ? formatDuration(config.report_interval) : '⚠️ Required'}
              </Text>
            </View>
            <View style={styles.currentValueItem}>
              <Text style={[styles.currentValueLabel, { color: theme.colors.textSecondary }]}>
                Sampling:
              </Text>
              <Text style={[styles.currentValueText, { 
                color: config.sampling_interval ? theme.colors.text : '#F44336',
                fontWeight: config.sampling_interval ? '500' : '700',
              }]}>
                {config.sampling_interval ? formatDuration(config.sampling_interval) : '⚠️ Required'}
              </Text>
            </View>
            <View style={styles.currentValueItem}>
              <Text style={[styles.currentValueLabel, { color: theme.colors.textSecondary }]}>
                Auto:
              </Text>
              <Text style={[styles.currentValueText, { 
                color: theme.colors.text,
                fontWeight: '500',
              }]}>
                {config.auto_mode ? 'ON' : 'OFF'}
              </Text>
            </View>
          </View>
          {showError && (!config.report_interval || !config.sampling_interval) && (
            <Text style={[styles.errorText, { color: '#F44336' }]}>
              ⚠️ Please set all required fields before publishing.
            </Text>
          )}
          {publishError && (
            <Text style={[styles.errorText, { color: '#F44336' }]}>
              ❌ Error: {publishError}
            </Text>
          )}
        </View>

        {/* ── Publish Button ── */}
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

        {/* ── Warnings (ONLY when definitive) ── */}
        {showWarning && (
          <Text style={[styles.warningText, { color: '#f44336' }]}>
            ⚠️ Device is offline. Please wait for device to connect.
          </Text>
        )}
        {isResuming && !showWarning && (
          <Text style={[styles.warningText, { color: '#FF9800' }]}>
            ⏳ App is resuming. Please wait a moment...
          </Text>
        )}
      </View>

      {/* ── Notifications Section ── */}
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
      </View>

      {/* ── Appearance Section ── */}
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
          <Switch
            value={isDark}
            onValueChange={toggleTheme}
            {...switchColors}
          />
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
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 4,
  },
  settingText: { fontSize: 16, fontWeight: "500" },
  requiredBadge: {
    fontSize: 16,
    fontWeight: "700",
    marginLeft: 2,
  },
  hintText: {
    fontSize: 12,
    paddingHorizontal: 16,
    marginTop: -8,
    marginBottom: 12,
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
  dropdownTrigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderRadius: 8,
  },
  chipPanel: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  customRow: { gap: 6 },
  customLabel: { fontSize: 12, fontWeight: "600" },
  customInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  customInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  customApplyButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  customApplyText: { color: "#fff", fontWeight: "600", fontSize: 13 },
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
  currentValuesContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 10,
  },
  currentValuesLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
  },
  currentValuesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  currentValueItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  currentValueLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  currentValueText: {
    fontSize: 13,
  },
});