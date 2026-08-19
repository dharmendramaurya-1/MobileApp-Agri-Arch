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
import { useAlerts } from '../../src/context/AlertContext';
import { useAuth } from "../../src/context/AuthContext";
import { useMqtt } from "../../src/context/MqttContext";
import { useScroll, useScrollReset } from "../../src/context/ScrollContext";
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
  icon: sensor.icon,
  maxValue: sensor.maxValue,
}));

// ── Connection status dot ─────────────────────────────────────────────────────
function ConnectionDot({ connectionState, isLiveData, deviceStatusFlags, background, hasReceivedData }) {
  // ✅ Green: Device is online and we have received data (from either get_stat or data topic)
  const isOnline = (isLiveData || hasReceivedData) && deviceStatusFlags?.online === true;
  
  // ✅ Orange: Connecting or waiting
  const isWaiting = connectionState === 'connecting' || 
                    connectionState === 'waiting' || 
                    connectionState === 'idle';
  
  // ✅ Red: Offline or disconnected
  const isOffline = connectionState === 'offline' || 
                    connectionState === 'disconnected' ||
                    connectionState === 'error';

  let color = '#9E9E9E';
  let label = 'Unknown';

  if (isOnline) {
    color = '#4CAF50';
    label = 'Online';
  } else if (isWaiting) {
    color = '#FF9800';
    label = 'Connecting...';
  } else if (isOffline) {
    color = '#F44336';
    label = 'Offline';
  }

  return (
    <View style={[styles.connectionRow, { backgroundColor: background }]}>
      <View style={[styles.connectionDot, { backgroundColor: color }]} />
      <Text style={[styles.connectionLabel, { color }]}>
        {label}
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

// ── Safe date formatter ──────────────────────────────────────────────────────
function formatLastUpdated(date) {
  if (!date) return null;
  try {
    if (typeof date === 'string') {
      const parsed = new Date(date);
      if (!isNaN(parsed.getTime())) {
        return parsed.toLocaleTimeString();
      }
      return date;
    }
    if (date instanceof Date && !isNaN(date.getTime())) {
      return date.toLocaleTimeString();
    }
    return null;
  } catch (e) {
    return null;
  }
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
  
  // ✅ Use selected device data
  const {
    getSelectedDeviceSensorData,
    getSelectedDeviceActuatorStatus,
    getSelectedDeviceOnlineStatus,
    getSelectedDeviceName,
    selectedDeviceId,
    selectedExternalKey,
    sensorData: legacySensorData,
    actuatorStatus: legacyActuatorStatus,
    isConnected,
    hasReceivedData,
    isLiveData,
    toggleDeviceStatus,
    deviceConfig,
    publishConfig,
    deviceStatusFlags,
    connectionState,
    deviceOnlineStatus,
  } = useMqtt();

  // ✅ Get data for the selected device
  const sensorData = getSelectedDeviceSensorData();
  const actuatorStatus = getSelectedDeviceActuatorStatus();
  const isDeviceOnlineFromContext = getSelectedDeviceOnlineStatus();
  const selectedDeviceName = getSelectedDeviceName();

  // ✅ Log for debugging
  useEffect(() => {
  }, [selectedDeviceId, selectedExternalKey, selectedDeviceName, sensorData, actuatorStatus, isDeviceOnlineFromContext, connectionState, isLiveData, hasReceivedData]);

  // ✅ System Mode Context
  const {
    mode,
    modeDisplay,
    isManualMode,
    isAutoMode,
    isModeLoaded,
    isSwitching: isModeSwitching,
    modeLocked,
    checkBeforeActuator,
    switchToManual,
    switchToAuto,
    toggleMode,
    canPublish: systemCanPublish,
    getModeIcon,
    getModeColor,
    getModeDisplay,
  } = useSystemMode();

  const { addAlert } = useAlerts();

  const [pumpStatus, setPumpStatus] = useState("OFF");
  const [isPublishing, setIsPublishing] = useState(false);
  const [optimisticPumpStatus, setOptimisticPumpStatus] = useState(null);
  const [pumpToggleTime, setPumpToggleTime] = useState(null);

  // ── Check device status ──
  // ✅ Device is online if we have received data (from get_stat or data) AND device is marked online
  const hasData = hasReceivedData || isLiveData;
  const isDeviceOnline = isDeviceOnlineFromContext && hasData;
  const isDeviceWaiting = connectionState === 'connecting' || 
                          connectionState === 'waiting' || 
                          connectionState === 'idle';
  const isDeviceOffline = connectionState === 'offline' || 
                          connectionState === 'disconnected' ||
                          connectionState === 'error';

  // ── Combined publish permission ──
  const canPublish = isConnected && 
                     isDeviceOnline && 
                     isManualMode && 
                     !isModeSwitching && 
                     !isPublishing;

  // ── Update pump status from actuatorStatus ──
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

  // ── PERFORM PUMP TOGGLE ─────────────────────────────────────────────────────
  const performPumpToggle = useCallback(async () => {
    if (isPublishing) return;
    if (isDeviceOffline) {
      Alert.alert("Device Offline", "Cannot control pump while device is offline.");
      return;
    }

    const currentDeviceKey = selectedExternalKey;
    if (!currentDeviceKey) {
      Alert.alert("Error", "No device selected");
      return;
    }

    const currentPumpStatus = actuatorStatus?.water_pump || false;
    const newStatus = !currentPumpStatus;

    setOptimisticPumpStatus(newStatus ? "ON" : "OFF");
    setPumpStatus(newStatus ? "ON" : "OFF");
    setIsPublishing(true);

    try {
      const success = await toggleDeviceStatus(
        currentDeviceKey,
        "water_pump",
        newStatus
      );

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
  }, [actuatorStatus, isPublishing, isDeviceOffline, selectedExternalKey, toggleDeviceStatus, addAlert]);

  // ── PUMP CONTROL WITH SYSTEM MODE ──────────────────────────────────────────
  const togglePump = useCallback(async () => {
    if (isPublishing || isModeSwitching) {
      Alert.alert("⏳ Busy", "Please wait for current operation to complete.");
      return;
    }

    if (!isModeLoaded) {
      Alert.alert("⏳ Loading", "Please wait for system mode to load.");
      return;
    }

    if (isDeviceOffline) {
      Alert.alert("Device Offline", "Cannot control pump while device is offline.");
      return;
    }

    if (isDeviceWaiting) {
      Alert.alert("⏳ Connecting", "Device is connecting. Please wait...");
      return;
    }

    const canControl = checkBeforeActuator("Water Pump");
    if (!canControl) {
      return;
    }

    await performPumpToggle();
  }, [
    isPublishing,
    isModeSwitching,
    isDeviceOffline,
    isDeviceWaiting,
    isModeLoaded,
    checkBeforeActuator,
    performPumpToggle,
  ]);

  // ── Navigate to Settings ──────────────────────────────────────────────────
  const navigateToSettings = () => {
    router.push("/(main)/settings");
  };

  // ── Get mode display info ──
  const modeIcon = isModeSwitching ? '⏳' : (getModeIcon ? getModeIcon() : (isManualMode ? '🔧' : '🤖'));
  const modeColor = isModeSwitching ? '#FF9800' : (getModeColor ? getModeColor() : (isManualMode ? '#4CAF50' : '#FF9800'));
  const currentModeDisplay = getModeDisplay ? getModeDisplay() : modeDisplay;

  // ── Get status color for pump card ──
  const getPumpCardColor = () => {
    if (isDeviceOnline) {
      return displayPumpStatus === "ON" ? "#4CAF50" : "#F44336";
    } else if (isDeviceWaiting) {
      return "#FF9800";
    } else {
      return "#9E9E9E";
    }
  };

  // ── Format last updated label ──
  const formattedTime = formatLastUpdated(sensorData?.lastUpdated);
  const lastUpdatedLabel = formattedTime
    ? (isDeviceOnline
        ? `Updated ${formattedTime}`
        : `Last known: ${formattedTime}`)
    : "No data received yet";

  const displayPumpStatus = optimisticPumpStatus || pumpStatus;

  // ── Check if mode should be shown ──
  const showMode = isModeLoaded && (isDeviceOnline || hasData);

  // ── Check if connected but no data ──
  const isConnectedButNoData = isConnected && !hasData;

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
            {selectedDeviceName ? `📡 ${selectedDeviceName}` : 'Real-time Farm Analytics Dashboard'}
          </Text>
          
          {/* ✅ Connection Status - Now uses hasReceivedData */}
          <ConnectionDot
            connectionState={connectionState}
            isLiveData={isLiveData}
            deviceStatusFlags={deviceStatusFlags}
            background={theme.colors.surface}
            hasReceivedData={hasReceivedData}
          />

          {/* ✅ System Mode Status - Show when loaded and device is online or has data */}
          {showMode && (
            <TouchableOpacity 
              style={styles.modeStatusContainer}
              onPress={() => {
                if (isModeSwitching || modeLocked) {
                  Alert.alert('⏳ Busy', 'Mode switch in progress. Please wait...');
                  return;
                }
                if (!isConnected) {
                  Alert.alert('📡 Not Connected', 'Please connect to device first.');
                  return;
                }
                toggleMode();
              }}
              disabled={isModeSwitching || modeLocked || !isConnected}
              activeOpacity={0.7}
            >
              <View style={styles.modeStatusRow}>
                <Text style={[styles.modeStatusLabel, { color: theme.colors.textSecondary }]}>
                  System Mode:
                </Text>
                <Text style={[styles.modeStatusValue, {
                  color: isModeSwitching ? '#FF9800' : (isDeviceOnline ? modeColor : '#9E9E9E'),
                  fontWeight: '700'
                }]}>
                  {isModeSwitching ? '⏳' : modeIcon} 
                  {isModeSwitching ? 'Switching...' : (isManualMode ? 'MANUAL' : 'AUTO')}
                </Text>
                {isModeSwitching && (
                  <ActivityIndicator size="small" color="#FF9800" />
                )}
                {!isDeviceOnline && isModeLoaded && !isModeSwitching && (
                  <Text style={[styles.modeOfflineText, { color: '#9E9E9E' }]}>
                    (Offline)
                  </Text>
                )}
                {!isModeSwitching && (
                  <TouchableOpacity 
                    style={styles.modeInfoButton}
                    onPress={() => {
                      Alert.alert(
                        isManualMode ? '💡 Manual Mode' : '🤖 Auto Mode',
                        isManualMode 
                          ? 'You can control devices individually.\n\nTap to switch to AUTO mode.'
                          : 'System controls devices automatically.\n\nTap to switch to MANUAL mode to control devices individually.',
                        [
                          { text: 'OK', style: 'default' },
                          ...(isManualMode && isConnected
                            ? [{ text: 'Switch to AUTO', onPress: switchToAuto }]
                            : []
                          ),
                          ...(isAutoMode && isConnected
                            ? [{ text: 'Switch to MANUAL', onPress: switchToManual }]
                            : []
                          )
                        ]
                      );
                    }}
                  >
                    <Ionicons name="information-circle-outline" size={18} color={isModeSwitching ? '#FF9800' : modeColor} />
                  </TouchableOpacity>
                )}
              </View>
            </TouchableOpacity>
          )}

          {/* ✅ Show waiting for data status when connected but no data yet */}
          {isConnectedButNoData && (
            <View style={styles.modeStatusRow}>
              <Text style={[styles.modeStatusLabel, { color: theme.colors.textSecondary }]}>
                Status:
              </Text>
              <Text style={[styles.modeStatusValue, { color: '#FF9800', fontWeight: '700' }]}>
                ⏳ Waiting for data...
              </Text>
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
      <View style={styles.lastUpdatedRow}>
        <Text style={[styles.lastUpdated, { color: theme.colors.textSecondary }]}>
          {lastUpdatedLabel}
        </Text>
        {sensorData?.lastUpdated && !isDeviceOnline && (
          <View style={[styles.lastKnownBadge, { backgroundColor: `${'#FF9800'}1A` }]}>
            <Ionicons name="cloud-download-outline" size={12} color="#FF9800" />
            <Text style={[styles.lastKnownBadgeText, { color: '#FF9800' }]}>
              Last known data
            </Text>
          </View>
        )}
      </View>

      {/* ── Pump Control ──────────────────────────────────────────────────── */}
      <View
        style={[
          styles.pumpCard,
          {
            backgroundColor: getPumpCardColor(),
            opacity: isDeviceOffline ? 0.6 : 1,
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
            {isDeviceWaiting && (
              <Text style={styles.pumpTimeText}>
                ⏳ Connecting...
              </Text>
            )}
            {isDeviceOffline && (
              <Text style={styles.pumpTimeText}>
                ⚠️ Offline - No control
              </Text>
            )}
            {isAutoMode && isModeLoaded && isDeviceOnline && (
              <Text style={styles.pumpTimeText}>
                🔒 Auto Mode - Tap to switch
              </Text>
            )}
            {isModeSwitching && (
              <Text style={styles.pumpTimeText}>
                ⏳ Switching mode...
              </Text>
            )}
          </View>

          {/* ✅ Mode Badge - Show when mode is loaded */}
          {isModeLoaded && (
            <View style={[styles.pumpModeBadge, { 
              backgroundColor: isDeviceOnline ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)'
            }]}>
              <Text style={styles.pumpModeBadgeText}>
                {isModeSwitching ? '⏳' : modeIcon} {isModeSwitching ? 'Switching' : (isManualMode ? 'Manual' : 'Auto')}
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={[
              styles.pumpButton,
              (!canPublish || isPublishing || isModeSwitching) && styles.pumpButtonDisabled,
            ]}
            onPress={togglePump}
            disabled={!canPublish || isPublishing || isModeSwitching}
          >
            {isPublishing || isModeSwitching ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Text style={styles.pumpButtonText}>
                {displayPumpStatus === "ON" ? "TURN OFF" : "TURN ON"}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.pumpStatus}>
          {isDeviceOffline ? "Device Offline" :
           isModeSwitching ? "Switching Mode..." :
           isAutoMode ? `🤖 Auto Mode - Switch to Manual to control (${currentModeDisplay})` :
           isDeviceWaiting
             ? (actuatorStatus?.water_pump !== null && actuatorStatus?.water_pump !== undefined
                ? `Pump is ${displayPumpStatus === "ON" ? "RUNNING" : "OFF"} (last known)`
                : "⏳ Connecting to device...")
             : `Pump is ${displayPumpStatus === "ON" ? "RUNNING" : "OFF"}`}
          {isPublishing && " (Sending...)"}
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
          const liveValue = sensorData?.[sensor.dataKey];
          const hasValue = liveValue !== null && liveValue !== undefined;
          const active = isDeviceOnline && hasValue;
          const tint = hasValue
            ? (active ? sensor.color : (isDeviceWaiting ? '#FF9800' : '#9E9E9E'))
            : (isDeviceWaiting ? '#FF9800' : '#9E9E9E');

          return (
            <TouchableOpacity
              key={sensor.id}
              style={[
                styles.sensorCard,
                {
                  backgroundColor: theme.colors.card,
                  borderColor: hasValue ? `${tint}55` : (isDeviceWaiting ? '#FF980055' : theme.colors.border),
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
                style={[styles.sensorValue, { color: tint }]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {hasValue ? `${fmt(liveValue)}${sensor.unit}` : (isDeviceWaiting ? '...' : '_ _')}
              </Text>
              <Text
                style={[styles.sensorName, { color: hasValue ? theme.colors.text : (isDeviceWaiting ? '#FF9800' : '#9E9E9E') }]}
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

  modeStatusContainer: {
    marginTop: 4,
  },
  modeStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
    marginTop: 4,
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
  },
  modeInfoButton: {
    padding: 2,
  },
  modeOfflineText: {
    fontSize: 10,
    fontWeight: "500",
    opacity: 0.6,
  },
  modeSwitchingProgress: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  modeSwitchingProgressText: {
    fontSize: 12,
    fontWeight: "500",
  },

  lastUpdatedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 12,
  },
  lastUpdated: {
    fontSize: 11,
    opacity: 0.7,
  },
  lastKnownBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  lastKnownBadgeText: {
    fontSize: 10,
    fontWeight: "700",
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