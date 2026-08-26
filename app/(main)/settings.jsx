// app/(main)/config.jsx
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
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

// ── Interval Picker Component ──────────────────────────────────────────────
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

// ── Main Config Screen ──────────────────────────────────────────────────────
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
    getSelectedDeviceOnlineStatus,
    selectedDeviceId,
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

  // Get selected device info
  const selectedDeviceName = getSelectedDeviceName();
  const isDeviceOnline = getSelectedDeviceOnlineStatus();

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
    // Auto mode is a boolean, it's always set (true/false)
    return errors;
  };

  // ── Auto-publish on auto_mode toggle — wait for device response ──
  const handleAutoModePublish = async (autoModeValue) => {
    if (!isConnected) return;
    if (!externalKey) return;
    if (!config.report_interval || !config.sampling_interval) return;

    setPublishing(true);
    try {
      const configToSend = {
        report_interval: config.report_interval,
        sampling_interval: config.sampling_interval,
        auto_mode: autoModeValue,
      };
      const success = await publishConfig(externalKey, configToSend);
      if (success) {
        console.log(`✅ Auto mode ${autoModeValue ? 'ON' : 'OFF'} published — waiting for device response...`);
        // ✅ Don't update config here — wait for deviceConfig to change via MQTT response
        // The useEffect on deviceConfig will sync the toggle state
      } else {
        // Revert on failure
        setConfig((c) => ({ ...c, auto_mode: !autoModeValue }));
      }
    } catch (error) {
      console.error('Auto mode publish error:', error);
      setConfig((c) => ({ ...c, auto_mode: !autoModeValue }));
    } finally {
      setPublishing(false);
    }
  };

  // ── Publish configuration using MQTT context ──
  const handlePublish = async () => {
    // Validate all fields are filled
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

    setPublishing(true);
    setShowError(false);
    try {
      const configToSend = {
        report_interval: config.report_interval,
        sampling_interval: config.sampling_interval,
        auto_mode: config.auto_mode,
      };

      const success = await publishConfig(externalKey, configToSend);

      if (success) {
        const summary =
          `Report Interval: ${formatDuration(configToSend.report_interval)}\n` +
          `Sampling Interval: ${formatDuration(configToSend.sampling_interval)}\n` +
          `Auto Mode: ${configToSend.auto_mode ? "ON" : "OFF"}\n\n` +
          `✅ Configuration sent to: ${selectedDeviceName || externalKey}`;

        Alert.alert("✅ Configuration Published", summary);
      } else {
        Alert.alert("❌ Publish Failed", "Could not publish configuration. Please try again.");
      }
    } catch (error) {
      console.error("Publish error:", error);
      Alert.alert("Error", String(error));
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

  return (
    <ScrollView
      ref={scrollRef}
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={{
        paddingBottom: SCREEN_HEIGHT * 0.1,
        paddingTop: headerHeight,
      }}
      onScroll={onScroll}
      scrollEventThrottle={16}
    >
      {/* Header with Connection Status and Device Info */}
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
        <View style={[
          styles.statusBadge,
          { backgroundColor: isConnected && isDeviceOnline ? '#4CAF50' : '#f44336' }
        ]}>
          <Text style={styles.statusText}>
            {isConnected && isDeviceOnline ? '● Online' : '● Offline'}
          </Text>
        </View>
      </View>

      {/* Device Info */}
      {externalKey && (
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
          {isConnected && isDeviceOnline && (
            <View style={[styles.onlineDot, { backgroundColor: '#4CAF50' }]} />
          )}
        </View>
      )}

      {/* Device Configuration Section */}
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
              // ✅ Don't update locally — publish and wait for device response
              handleAutoModePublish(v);
            }}
            disabled={publishing || !isConnected || !isDeviceOnline}
            {...switchColors}
          />
        </View>

        {/* Show current values with validation status */}
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
        </View>

        <Pressable
          onPress={handlePublish}
          disabled={publishing || !isConnected}
          style={[
            styles.publishButton,
            { 
              backgroundColor: isConnected && isDeviceOnline ? theme.colors.primary : '#888',
              opacity: publishing || !isConnected || !isDeviceOnline ? 0.6 : 1 
            },
          ]}
        >
          <Ionicons name="cloud-upload-outline" size={18} color="#fff" />
          <Text style={styles.publishButtonText}>
            {publishing ? "Publishing..." : "Set Configuration"}
          </Text>
        </Pressable>

        {!isConnected && (
          <Text style={[styles.warningText, { color: '#f44336' }]}>
            ⚠️ MQTT not connected. Please check your connection.
          </Text>
        )}
        {isConnected && !isDeviceOnline && (
          <Text style={[styles.warningText, { color: '#FF9800' }]}>
            ⚠️ Device is offline. Please wait for device to connect.
          </Text>
        )}
      </View>

      {/* Notifications Section */}
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
  {/* Left side: Icon + Text */}
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

  {/* Right side: Switch */}
  <Switch
    value={notifications}
    onValueChange={setNotifications}
    {...switchColors}
  />
</View>
      </View>

      {/* Appearance Section */}
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
  {/* Left side: Icon + Text */}
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

  {/* Right side: Switch */}
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
    color: '#fff',
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