// app/(main)/dashboard.jsx
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// ✅ CORRECT - Context from src/context/
import { SENSORS } from "../../src/config/sensorConfigs";
import { useScroll, useScrollReset } from "../../src/context/ScrollContext";
import { useAlerts } from '../../src/context/AlertContext';
import { useAuth } from "../../src/context/AuthContext";
import { useMqtt } from "../../src/context/MqttContext";
import { useSystemMode } from "../../src/context/SystemModeContext";
import { useTheme } from "../../src/context/ThemContext";
import { user_profile } from "../../src/services/profile/profile";

// ── Sensor tiles ───────────────────────────────────────────────────────────
const SENSOR_CONFIG = SENSORS.map((sensor) => ({
  id: sensor.key,
  name: sensor.name,
  dataKey: sensor.dataKey,
  unit: sensor.unit,
  color: sensor.color,
  icon: sensor.icon, // ✅ each sensor's own icon
  maxValue: sensor.maxValue,
}));

// ── Connection status dot ─────────────────────────────────────────────────────
function ConnectionDot({ hasReceivedData, deviceStatusFlags, background }) {
  // ✅ Online only when data received AND device reports online (Bit 17)
  const isOnline = hasReceivedData && deviceStatusFlags?.online === true;
  const color = isOnline ? '#4CAF50' : '#F44336';

  return (
    <View style={[styles.connectionRow, { backgroundColor: background }]}>
      <View style={[styles.connectionDot, { backgroundColor: color }]} />
      <Text style={[styles.connectionLabel, { color }]}>
        {isOnline ? 'Online' : 'Offline'}
      </Text>
    </View>
  );
}

// ── Helper ────────────────────────────────────────────────────────────────────
function fmt(value) {
  if (value === null || value === undefined) {
    return "_ _";
  }
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }
  return String(value);
}

function formatDuration(seconds) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds % 60 === 0) return `${seconds / 60} min`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const insets = useSafeAreaInsets();
  const { onScroll, headerHeight } = useScroll();
  const scrollRef = useRef(null);
  useScrollReset(scrollRef);

  const [u_name, set_u_name] = useState("");
  useEffect(() => {
    const profile = async () => {
      try {
        const response = await user_profile();
        await AsyncStorage.setItem("Username", response);
        set_u_name(response);
      } catch (e) {
        console.log(e);
      }
    };
    profile();
  }, []);

  const { theme } = useTheme();
  const { user } = useAuth();
  
  const {
    sensorData,
    isConnected,
    hasReceivedData,
    actuatorStatus,
    toggleDeviceStatus,
    deviceConfig,
    publishConfig,
    deviceStatusFlags,
    connectionState,
  } = useMqtt();

  const { isManualMode, isModeLoaded, checkBeforeActuator } = useSystemMode();

  const { addAlert } = useAlerts();

  const [pumpStatus, setPumpStatus] = useState("OFF");
  const [isPublishing, setIsPublishing] = useState(false);
  const [optimisticPumpStatus, setOptimisticPumpStatus] = useState(null);
  const [isSwitchingMode, setIsSwitchingMode] = useState(false);
  const [modeSwitchPending, setModeSwitchPending] = useState(false);
  const [pumpToggleTime, setPumpToggleTime] = useState(null);
  const pendingActionRef = useRef(null);

  // ── Check if device is offline ──────────────────────────────────────────
  // ✅ Device is offline if:
  // 1. No data received yet, OR
  // 2. Device reports offline (Bit 17 = 0)
  const isOffline = !hasReceivedData || 
                    (deviceStatusFlags?.online === false) || 
                    connectionState === 'offline' ||
                    connectionState === 'disconnected';

  // ── Check if device is online ────────────────────────────────────────────
  const isDeviceOnline = hasReceivedData && deviceStatusFlags?.online === true;

  // ── Check if publish is allowed ─────────────────────────────────────────
  const canPublish = isConnected && isDeviceOnline && isManualMode && !isSwitchingMode;

  // ── Update pump status from actuatorStatus ──────────────────────────────
  useEffect(() => {
    if (actuatorStatus?.water_pump !== undefined && actuatorStatus?.water_pump !== null) {
      const newStatus = actuatorStatus.water_pump ? "ON" : "OFF";
      const prevStatus = pumpStatus;
      setPumpStatus(newStatus);
      setOptimisticPumpStatus(null);
      
      if (prevStatus !== newStatus && prevStatus !== "OFF") {
        const time = new Date().toLocaleTimeString();
        setPumpToggleTime(time);
        addAlert(
          'pump',
          newStatus === "ON" ? '💧 Water Pump ON' : '💧 Water Pump OFF',
          newStatus === "ON" 
            ? `Water pump activated at ${time}`
            : `Water pump deactivated at ${time}`,
          newStatus === "ON" ? 'success' : 'info'
        );
      }
    }
  }, [actuatorStatus, addAlert]);

  // ── Monitor deviceConfig for mode switch confirmation ────────────────────
  useEffect(() => {
    if (deviceConfig && modeSwitchPending) {
      if (deviceConfig.auto_mode === false) {
        console.log("✅ Mode switch confirmed - Now in MANUAL mode");
        setModeSwitchPending(false);
        setIsSwitchingMode(false);
        
        if (pendingActionRef.current) {
          const action = pendingActionRef.current;
          pendingActionRef.current = null;
          if (action === 'togglePump') {
            performPumpToggle();
          }
        }
      }
    }
  }, [deviceConfig, modeSwitchPending]);

  // ── SWITCH TO MANUAL MODE WITH CALLBACK ──────────────────────────────────
  const switchToManualModeWithCallback = useCallback(async (callback) => {
    if (isSwitchingMode || isPublishing) return;

    if (isOffline) {
      Alert.alert("Device Offline", "Cannot switch mode while device is offline.");
      return;
    }

    if (!deviceConfig) {
      Alert.alert("Error", "Device configuration not available.");
      return;
    }

    setIsSwitchingMode(true);
    setModeSwitchPending(true);

    try {
      const manualModeConfig = {
        report_interval: deviceConfig.report_interval || 120,
        sampling_interval: deviceConfig.sampling_interval || 30,
        auto_mode: false,
      };

      const success = await publishConfig(manualModeConfig);

      if (success) {
        pendingActionRef.current = callback;
        
        Alert.alert(
          "🔄 Switching Mode",
          "Switching to MANUAL mode...\n\n" +
          "Please wait for confirmation from the device.\n" +
          "Your action will be performed automatically after mode switch.",
          [{ text: "OK" }]
        );
        
        return true;
      } else {
        setModeSwitchPending(false);
        setIsSwitchingMode(false);
        Alert.alert("Failed", "Could not switch to MANUAL mode.");
        return false;
      }
    } catch (error) {
      console.error("Error switching to manual mode:", error);
      setModeSwitchPending(false);
      setIsSwitchingMode(false);
      return false;
    }
  }, [isSwitchingMode, isPublishing, isOffline, deviceConfig, publishConfig]);

  // ── PERFORM PUMP TOGGLE ─────────────────────────────────────────────────────
  const performPumpToggle = useCallback(async () => {
    if (isPublishing) return;
    if (isOffline) {
      Alert.alert("Device Offline", "Cannot control pump while device is offline.");
      return;
    }

    const currentPumpStatus = actuatorStatus?.water_pump || false;
    const newStatus = !currentPumpStatus;

    setOptimisticPumpStatus(newStatus ? "ON" : "OFF");
    setPumpStatus(newStatus ? "ON" : "OFF");
    setIsPublishing(true);

    try {
      const success = await toggleDeviceStatus("water_pump", newStatus);

      if (!success) {
        setOptimisticPumpStatus(null);
        setPumpStatus(currentPumpStatus ? "ON" : "OFF");
        Alert.alert("Command Failed", "Failed to send pump command.");
      } else {
        const time = new Date().toLocaleTimeString();
        setPumpToggleTime(time);
        addAlert(
          'pump',
          newStatus ? '💧 Water Pump ON' : '💧 Water Pump OFF',
          newStatus 
            ? `Water pump activated at ${time}`
            : `Water pump deactivated at ${time}`,
          newStatus ? 'success' : 'info'
        );
      }
    } catch (error) {
      console.error("Error toggling pump:", error);
      setOptimisticPumpStatus(null);
      setPumpStatus(currentPumpStatus ? "ON" : "OFF");
    } finally {
      setIsPublishing(false);
    }
  }, [actuatorStatus, isPublishing, isOffline, toggleDeviceStatus, addAlert]);

  // ── PUMP CONTROL WITH MODE CHECK ──────────────────────────────────────────
  const togglePump = useCallback(async () => {
    if (isPublishing || isSwitchingMode) return;

    if (isOffline) {
      Alert.alert("Device Offline", "Cannot control pump while device is offline.");
      return;
    }

    if (!isManualMode && isModeLoaded) {
      Alert.alert(
        "🤖 Auto Mode Active",
        "Cannot control pump while system is in AUTO mode.\n\n" +
        "Current Mode: AUTO\n" +
        `Report Interval: ${formatDuration(deviceConfig?.report_interval || 120)}\n` +
        `Sampling Interval: ${formatDuration(deviceConfig?.sampling_interval || 30)}\n\n` +
        "Please switch to MANUAL mode to control devices.\n\n" +
        "Select an option below:",
        [
          { 
            text: "Cancel", 
            style: "cancel" 
          },
          { 
            text: "🔧 Switch to Manual Now", 
            onPress: async () => {
              await switchToManualModeWithCallback('togglePump');
            },
            style: "default"
          },
          { 
            text: "⚙️ Go to Settings", 
            onPress: () => {
              router.push("/(main)/settings");
            },
            style: "default"
          }
        ],
        { cancelable: true }
      );
      return;
    }

    if (!checkBeforeActuator("Water Pump")) {
      return;
    }

    await performPumpToggle();
  }, [
    isManualMode,
    isModeLoaded,
    isPublishing,
    isSwitchingMode,
    isOffline,
    deviceConfig,
    checkBeforeActuator,
    performPumpToggle,
    switchToManualModeWithCallback,
  ]);

  // ── Navigate to Settings ──────────────────────────────────────────────────
  const navigateToSettings = () => {
    router.push("/(main)/settings");
  };

  const lastUpdatedLabel = sensorData.lastUpdated
    ? `Updated ${sensorData.lastUpdated.toLocaleTimeString()}`
    : "No data received yet";

  const displayPumpStatus = optimisticPumpStatus || pumpStatus;

  return (
    <ScrollView
      ref={scrollRef}
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={{
        paddingBottom: 20 + insets.bottom,
        paddingTop: headerHeight,
      }}
      showsVerticalScrollIndicator={false}
      onScroll={onScroll}
      scrollEventThrottle={16}
    >
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={[styles.greeting, { color: theme.colors.text }]}>
            Hello, {u_name} 👋
          </Text>
          <Text
            style={[styles.subtitle, { color: theme.colors.textSecondary }]}
          >
            Real-time Farm Analytics Dashboard
          </Text>
          
          <ConnectionDot
            hasReceivedData={hasReceivedData}
            deviceStatusFlags={deviceStatusFlags}
            background={theme.colors.surface}
          />

          {/* ✅ Show mode only if device is online */}
          {isDeviceOnline && isModeLoaded && (
            <View style={styles.modeStatusRow}>
              <Text style={[styles.modeStatusLabel, { color: theme.colors.textSecondary }]}>
                System Mode:
              </Text>
              <Text style={[styles.modeStatusValue, {
                color: isManualMode ? '#4CAF50' : '#FF9800',
                fontWeight: '700'
              }]}>
                {isManualMode ? '🔧 MANUAL' : '🤖 AUTO'}
              </Text>
              {isSwitchingMode && (
                <Text style={[styles.modeSwitchingText, { color: '#FF9800' }]}>
                  ⏳ Switching...
                </Text>
              )}
            </View>
          )}

        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity onPress={navigateToSettings} style={styles.settingsButton}>
            <Ionicons name="settings-outline" size={24} color={theme.colors.text} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push("/(main)/profile")}>
            <View
              style={[styles.avatar, { backgroundColor: theme.colors.primary }]}
            >
              <Text style={{ color: "#FFF", fontWeight: "700", fontSize: 18 }}>
                {user?.name?.charAt(0) || "F"}
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Last updated timestamp ────────────────────────────────────────── */}
      <Text style={[styles.lastUpdated, { color: theme.colors.textSecondary }]}>
        {lastUpdatedLabel}
      </Text>

      {/* ── Pump Control ──────────────────────────────────────────────────── */}
      <View
        style={[
          styles.pumpCard,
          {
            backgroundColor: isOffline ? '#999' : displayPumpStatus === "ON" ? "#4CAF50" : "#F44336",
            opacity: isOffline || !canPublish ? 0.6 : 1,
          },
        ]}
      >
        <View style={styles.pumpHeader}>
          <View>
            <Text style={styles.pumpTitle}>Water Pump</Text>
            {pumpToggleTime && isDeviceOnline && (
              <Text style={styles.pumpTimeText}>
                Last toggle: {pumpToggleTime}
              </Text>
            )}
            {isOffline && (
              <Text style={styles.pumpTimeText}>
                ⚠️ Offline - No control
              </Text>
            )}
            {!isManualMode && isModeLoaded && isDeviceOnline && (
              <Text style={styles.pumpTimeText}>
                🔒 Auto Mode - Click to switch
              </Text>
            )}
          </View>

          {isDeviceOnline && isModeLoaded && (
            <View style={styles.pumpModeBadge}>
              <Text style={styles.pumpModeBadgeText}>
                {isManualMode ? '🔧 Manual' : '🤖 Auto'}
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={[
              styles.pumpButton,
              (!canPublish || isPublishing || isSwitchingMode) && styles.pumpButtonDisabled,
            ]}
            onPress={togglePump}
            disabled={!canPublish || isPublishing || isSwitchingMode}
          >
            {isPublishing || isSwitchingMode ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Text style={styles.pumpButtonText}>
                {displayPumpStatus === "ON" ? "TURN OFF" : "TURN ON"}
              </Text>
            )}
          </TouchableOpacity>
        </View>
        <Text style={styles.pumpStatus}>
          {isOffline ? "Device Offline" :
           !isManualMode ? "Auto Mode - Switch to Manual to control" :
           `Pump is ${displayPumpStatus === "ON" ? "RUNNING" : "OFF"}`}
          {isPublishing && " (Sending...)"}
          {isSwitchingMode && " (Switching Mode...)"}
        </Text>
        <View style={styles.pumpStats}>
          <Text style={styles.pumpStatText}>⚡ 2.5 kW</Text>
          <Text style={styles.pumpStatText}>⏱️ Last run: {pumpToggleTime || 'N/A'}</Text>
        </View>
      </View>

      {/* ── Environmental Sensors Grid ────────────────────────────────────── */}
      <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
        🌿 Environmental Sensors
      </Text>

      <View style={styles.sensorsGrid}>
        {SENSOR_CONFIG.map((sensor) => {
          const liveValue = sensorData[sensor.dataKey];
          const hasValue = liveValue !== null && liveValue !== undefined;
          const active = !isOffline && hasValue;
          const tint = active ? sensor.color : '#9E9E9E';

          return (
            <TouchableOpacity
              key={sensor.id}
              style={[
                styles.sensorCard,
                {
                  backgroundColor: theme.colors.card,
                  borderColor: active ? `${tint}55` : theme.colors.border,
                },
              ]}
              onPress={() =>
                router.push({
                  pathname: "/(main)/sensor-tabs",
                  params: { type: sensor.id },
                })
              }
              activeOpacity={0.75}
            >
              <View style={[styles.sensorIconChip, { backgroundColor: `${tint}1A` }]}>
                <Ionicons name={sensor.icon} size={22} color={tint} />
              </View>
              <Text
                style={[styles.sensorValue, { color: active ? tint : '#9E9E9E' }]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {active ? `${fmt(liveValue)}${sensor.unit}` : '_ _'}
              </Text>
              <Text
                style={[styles.sensorName, { color: active ? theme.colors.text : '#9E9E9E' }]}
                numberOfLines={1}
              >
                {sensor.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

    </ScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1 },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerLeft: {
    flex: 1,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingTop: 4,
  },
  settingsButton: {
    padding: 4,
  },
  greeting: { fontSize: 24, fontWeight: "800" },
  subtitle: { fontSize: 13, marginTop: 2 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },

  connectionRow: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    marginTop: 8,
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
  },
  connectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  connectionLabel: {
    fontSize: 12,
    fontWeight: "600",
  },

  modeStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    gap: 6,
  },
  modeStatusLabel: {
    fontSize: 12,
    fontWeight: "500",
  },
  modeStatusValue: {
    fontSize: 12,
    fontWeight: "700",
  },
  modeSwitchingText: {
    fontSize: 12,
    fontWeight: "600",
    marginLeft: 4,
  },

  lastUpdated: {
    fontSize: 11,
    marginHorizontal: 20,
    marginBottom: 12,
    opacity: 0.7,
  },

  pumpCard: {
    padding: 14,
    borderRadius: 16,
    marginHorizontal: 16,
    marginBottom: 16,
    position: 'relative',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  pumpHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8,
  },
  pumpTitle: { fontSize: 16, fontWeight: "700", color: "#FFF" },
  pumpTimeText: { fontSize: 10, color: "#FFF", opacity: 0.8, marginTop: 2 },
  pumpButton: {
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    minWidth: 80,
    alignItems: "center",
  },
  pumpButtonDisabled: {
    opacity: 0.5,
  },
  pumpButtonText: { color: "#FFF", fontSize: 11, fontWeight: "600" },
  pumpStatus: { fontSize: 12, color: "#FFF", opacity: 0.9, marginBottom: 8 },
  pumpStats: { flexDirection: "row", gap: 16 },
  pumpStatText: { fontSize: 10, color: "#FFF", opacity: 0.9 },

  pumpModeBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  pumpModeBadgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '600',
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 12,
    marginHorizontal: 16,
  },

  sensorsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    rowGap: 12,
  },
  sensorCard: {
    width: "31.5%",
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  sensorIconChip: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  sensorName: { fontSize: 11, fontWeight: "600", textAlign: "center" },
  sensorValue: { fontSize: 16, fontWeight: "800", textAlign: "center" },
});