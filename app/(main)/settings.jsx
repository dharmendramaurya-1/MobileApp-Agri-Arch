// app/(main)/config.jsx
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
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
import { useTheme } from "../../src/context/ThemContext";

const SCREEN_HEIGHT = Dimensions.get("window").height;

const DEFAULT_CONFIG = {
  report_interval: 120,
  sampling_interval: 30,
  auto_mode: false,
};

function formatDuration(seconds) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds % 60 === 0) return `${seconds / 60} min`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

// ── Interval Picker Component ──────────────────────────────────────────────
function IntervalPicker({
  label,
  value,
  disabled,
  onSelect,
  theme,
}) {
  const [expanded, setExpanded] = useState(false);
  const [customText, setCustomText] = useState(String(value));

  const handleTogglePress = () => {
    if (disabled) return;
    setCustomText(String(value));
    setExpanded((e) => !e);
  };

  const handleCustomSubmit = () => {
    const parsed = parseInt(customText, 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      onSelect(parsed);
    } else {
      setCustomText(String(value));
    }
  };

  return (
    <View>
      <View style={styles.settingItem}>
        <Ionicons name="time-outline" size={24} color={theme.colors.primary} />
        <Text style={[styles.settingText, { color: theme.colors.text }]}>
          {label}
        </Text>

        <Pressable
          disabled={disabled}
          onPress={handleTogglePress}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={[
            styles.dropdownTrigger,
            {
              borderColor: theme.colors.border,
              opacity: disabled ? 0.5 : 1,
            },
          ]}
        >
          <Text style={{ color: theme.colors.text }}>
            {formatDuration(value)}
          </Text>
          <Ionicons
            name={expanded ? "chevron-up" : "chevron-down"}
            size={16}
            color={theme.colors.textSecondary}
          />
        </Pressable>
      </View>

      {expanded && !disabled && (
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
              Current: {formatDuration(value)}
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
  
  const { 
    externalKey, 
    isConnected, 
    publishConfig, 
    deviceConfig,
    isReady 
  } = useMqtt();

  const [notifications, setNotifications] = useState(true);
  const [isDefaultMode, setIsDefaultMode] = useState(true);
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [publishing, setPublishing] = useState(false);

  // Load device config from context
  useEffect(() => {
    if (deviceConfig && deviceConfig.report_interval) {
      setConfig({
        report_interval: deviceConfig.report_interval || 120,
        sampling_interval: deviceConfig.sampling_interval || 30,
        auto_mode: deviceConfig.auto_mode || false,
      });
    }
  }, [deviceConfig]);

  const activeConfig = isDefaultMode ? DEFAULT_CONFIG : config;

  const switchColors = {
    trackColor: { false: theme.colors.border, true: theme.colors.primary },
    thumbColor: "#fff",
  };

  const handleToggleDefaultMode = (value) => {
    setIsDefaultMode(value);
    if (value) {
      setConfig(DEFAULT_CONFIG);
    }
  };

  // Publish configuration using MQTT context
  const handlePublish = async () => {
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
    try {
      // Send the current config values (whether default or custom)
      const success = await publishConfig(activeConfig);

      if (success) {
        const summary =
          `Report Interval: ${formatDuration(activeConfig.report_interval)}\n` +
          `Sampling Interval: ${formatDuration(activeConfig.sampling_interval)}\n` +
          `Auto Mode: ${activeConfig.auto_mode ? "ON" : "OFF"}\n\n` +
          `Mode: ${isDefaultMode ? "Default" : "Custom"}`;

        Alert.alert("Configuration Published ✅", summary);
      } else {
        Alert.alert("Publish Failed", "Could not publish configuration.");
      }
    } catch (error) {
      console.error("Publish error:", error);
      Alert.alert("Error", String(error));
    } finally {
      setPublishing(false);
    }
  };

  // Show loading state
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
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={{ paddingBottom: SCREEN_HEIGHT * 0.1 }}
    >
      {/* Header with Connection Status */}
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: theme.colors.text }]}>
          Configuration
        </Text>
        <View style={[
          styles.statusBadge,
          { backgroundColor: isConnected ? '#4CAF50' : '#f44336' }
        ]}>
          <Text style={styles.statusText}>
            {isConnected ? '● Online' : '● Offline'}
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

        <View style={styles.settingItem}>
          <Ionicons
            name="options-outline"
            size={24}
            color={theme.colors.primary}
          />
          <Text style={[styles.settingText, { color: theme.colors.text }]}>
            Use Default Mode
          </Text>
          <Switch
            value={isDefaultMode}
            onValueChange={handleToggleDefaultMode}
            {...switchColors}
          />
        </View>
        {isDefaultMode && (
          <Text style={[styles.hintText, { color: theme.colors.textSecondary }]}>
            Turn this off to customize the intervals and Auto Mode below.
          </Text>
        )}

        <IntervalPicker
          label="Report Interval"
          value={activeConfig.report_interval}
          disabled={isDefaultMode}
          onSelect={(v) => setConfig((c) => ({ ...c, report_interval: v }))}
          theme={theme}
        />

        <IntervalPicker
          label="Sampling Interval"
          value={activeConfig.sampling_interval}
          disabled={isDefaultMode}
          onSelect={(v) => setConfig((c) => ({ ...c, sampling_interval: v }))}
          theme={theme}
        />

        <View style={styles.settingItem}>
          <Ionicons name="sync-outline" size={24} color={theme.colors.primary} />
          <Text style={[styles.settingText, { color: theme.colors.text }]}>
            Auto Mode
          </Text>
          <Switch
            value={activeConfig.auto_mode}
            disabled={isDefaultMode}
            onValueChange={(v) => setConfig((c) => ({ ...c, auto_mode: v }))}
            {...switchColors}
          />
        </View>

        {/* Show current values */}
        <View style={styles.currentValuesContainer}>
          <Text style={[styles.currentValuesLabel, { color: theme.colors.textSecondary }]}>
            Current Configuration:
          </Text>
          <Text style={[styles.currentValuesText, { color: theme.colors.text }]}>
            Report: {formatDuration(activeConfig.report_interval)} | 
            Sampling: {formatDuration(activeConfig.sampling_interval)} | 
            Auto: {activeConfig.auto_mode ? "ON" : "OFF"}
          </Text>
        </View>

        <Pressable
          onPress={handlePublish}
          disabled={publishing || !isConnected}
          style={[
            styles.publishButton,
            { 
              backgroundColor: isConnected ? theme.colors.primary : '#888',
              opacity: publishing || !isConnected ? 0.6 : 1 
            },
          ]}
        >
          <Ionicons name="cloud-upload-outline" size={18} color="#fff" />
          <Text style={styles.publishButtonText}>
            {publishing ? "Publishing..." : "Publish Configuration"}
          </Text>
        </Pressable>

        {!isConnected && (
          <Text style={[styles.warningText, { color: '#f44336' }]}>
            ⚠️ MQTT not connected. Please check your connection.
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
          <Ionicons
            name="notifications-outline"
            size={24}
            color={theme.colors.primary}
          />
          <Text style={[styles.settingText, { color: theme.colors.text }]}>
            Push Notifications
          </Text>
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
          <Ionicons
            name="moon-outline"
            size={24}
            color={theme.colors.primary}
          />
          <Text style={[styles.settingText, { color: theme.colors.text }]}>
            Dark Mode
          </Text>
          <Switch value={isDark} onValueChange={toggleTheme} {...switchColors} />
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
  settingItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 16,
  },
  settingText: { flex: 1, fontSize: 16 },
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
    paddingVertical: 12,
    borderRadius: 10,
  },
  publishButtonText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  currentValuesContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginHorizontal: 16,
    marginVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  currentValuesLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  currentValuesText: {
    fontSize: 13,
  },
});