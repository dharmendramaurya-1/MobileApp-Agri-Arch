// app/(main)/dashboard.jsx
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// ✅ CORRECT - Components from root components/ folder

// ✅ CORRECT - Context from src/context/
import { SENSORS } from "../../src/config/sensorConfigs";
import { useAlerts } from '../../src/context/AlertContext';
import { useAuth } from "../../src/context/AuthContext";
import { useMqtt } from "../../src/context/MqttContext";
import { useSystemMode } from "../../src/context/SystemModeContext";
import { useTheme } from "../../src/context/ThemContext";
import { user_profile } from "../../src/services/profile/profile";

// ✅ CORRECT - Utils from src/utils/
import { getDisplayStatus } from '../../src/utils/deviceStatusParser';

const { width } = Dimensions.get("window");

// ── Sensor tiles ───────────────────────────────────────────────────────────
const SENSOR_CONFIG = SENSORS.map((sensor) => ({
  id: sensor.key,
  name: sensor.name,
  location: sensor.location,
  dataKey: sensor.dataKey,
  unit: sensor.unit,
  color: sensor.color,
  route: `/sensor/${sensor.key}`,
  maxValue: sensor.maxValue,
}));

// ── Circular Progress ─────────────────────────────────────────────────────────
function CircularProgress({ value, size = 70, color = "#4CAF50", maxValue = 100 }) {
  const isLoading = value === null || value === undefined;

  if (isLoading) {
    return (
      <View style={[styles.circularContainer, { width: size, height: size }]}>
        <View
          style={[
            styles.circularBg,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: `${color}30`,
            },
          ]}
        />
        <Text style={[styles.circularText, { fontSize: size / 4, color: '#999' }]}>
          _ _
        </Text>
      </View>
    );
  }

  const percentage = Math.min(Math.max((value / maxValue) * 100, 0), 100);

  return (
    <View style={[styles.circularContainer, { width: size, height: size }]}>
      <View
        style={[
          styles.circularBg,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: `${color}30`,
          },
        ]}
      />
      <View
        style={[
          styles.circularFill,
          {
            width: size - 10,
            height: size - 10,
            borderRadius: (size - 10) / 2,
            borderWidth: 5,
            borderColor: color,
          },
        ]}
      />
      <Text style={[styles.circularText, { fontSize: size / 3.5, color }]}>
        {Math.round(percentage)}%
      </Text>
    </View>
  );
}

// ── Connection status dot ─────────────────────────────────────────────────────
function ConnectionDot({ connectionState, hasReceivedData, deviceStatusFlags }) {
  // ✅ Check online status from 32-bit status flags (Bit 17)
  const isOnline = deviceStatusFlags?.online;

  // ✅ If data received AND device reports online → Online (Green)
  if (hasReceivedData && isOnline === true) {
    return (
      <View style={styles.connectionRow}>
        <View style={[styles.connectionDot, { backgroundColor: '#4CAF50' }]} />
        <Text style={styles.connectionLabel}>Online</Text>
      </View>
    );
  }

  // ✅ If data received but device reports offline → Offline (Red)
  if (hasReceivedData && isOnline === false) {
    return (
      <View style={styles.connectionRow}>
        <View style={[styles.connectionDot, { backgroundColor: '#F44336' }]} />
        <Text style={styles.connectionLabel}>Offline</Text>
      </View>
    );
  }

  // ✅ No data received yet → Offline (Red)
  return (
    <View style={styles.connectionRow}>
      <View style={[styles.connectionDot, { backgroundColor: '#F44336' }]} />
      <Text style={styles.connectionLabel}>Offline</Text>
    </View>
  );
}

// ── Helper ────────────────────────────────────────────────────────────────────
function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

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
    deviceStatus,
    actuatorStatus,
    toggleDeviceStatus,
    deviceConfig,
    publishConfig,
    deviceStatusFlags,
    connectionState,
    externalKey,
    activeDeviceId,
    hasEverBeenOnline,
  } = useMqtt();

  const {
    isManualMode,
    isModeLoaded,
    checkBeforeActuator,
    modeDisplay,
    switchToManual,
    switchToAuto,
  } = useSystemMode();

  const { addAlert } = useAlerts();

  const [pumpStatus, setPumpStatus] = useState("OFF");
  const [isPublishing, setIsPublishing] = useState(false);
  const [optimisticPumpStatus, setOptimisticPumpStatus] = useState(null);
  const [isSwitchingMode, setIsSwitchingMode] = useState(false);
  const [modeSwitchPending, setModeSwitchPending] = useState(false);
  const [pumpToggleTime, setPumpToggleTime] = useState(null);
  const pendingActionRef = useRef(null);

  // ── Get display status ──────────────────────────────────────────────────
  const displayStatus = getDisplayStatus(deviceStatusFlags);

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

  const sensorRows = chunkArray(SENSOR_CONFIG, 3);

  const lastUpdatedLabel = sensorData.lastUpdated
    ? `Updated ${sensorData.lastUpdated.toLocaleTimeString()}`
    : "No data received yet";

  const displayPumpStatus = optimisticPumpStatus || pumpStatus;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={[
        styles.scrollViewContent,
        { paddingBottom: 20 + insets.bottom },
      ]}
      showsVerticalScrollIndicator={false}
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
            connectionState={connectionState}
            hasReceivedData={hasReceivedData}
            deviceStatusFlags={deviceStatusFlags}
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

          {/* ✅ Show offline status */}
          {/* {isOffline && (
            <View style={styles.deviceStatusRow}>
              <View style={[styles.deviceStatusDot, { backgroundColor: '#F44336' }]} />
              <Text style={[styles.deviceStatusText, { color: '#F44336' }]}>
                ● Device Offline
              </Text>
            </View>
          )} */}
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

      {/* ── DevStat / connection status banner ───────────────────────────── */}
      {/* <ConnectionStatusBanner
        connectionState={connectionState}
        hasReceivedData={hasReceivedData}
        deviceStatus={deviceStatus}
        deviceStatusFlags={deviceStatusFlags}
      /> */}

      {/* ── Last updated timestamp ────────────────────────────────────────── */}
      <Text style={[styles.lastUpdated, { color: theme.colors.textSecondary }]}>
        {lastUpdatedLabel}
      </Text>

      {/* ── Device Status Summary ─────────────────────────────────────────── */}
      {/* <DeviceStatusSummary 
        onPress={() => {}}
        deviceStatusFlags={deviceStatusFlags}
        hasReceivedData={hasReceivedData}
        connectionState={connectionState}
      /> */}

      {/* ── Water Tank Status ─────────────────────────────────────────────── */}
      <View style={styles.statsRow}>
        <View
          style={[
            styles.waterTankCard,
            { backgroundColor: isOffline ? '#999' : theme.colors.primaryLight, flex: 1 },
          ]}
        >
          <Text style={styles.cardTitle}>Water Tank Status</Text>
          <View style={styles.tankContent}>
            <CircularProgress
              value={sensorData.waterLevel}
              size={60}
              color="#FFF"
              maxValue={100}
            />
            <View>
              <Text style={styles.waterLevelValue}>
                {fmt(sensorData.waterLevel)}%
              </Text>
              <Text style={styles.capacityText}>Capacity: 5,000 L</Text>
              {displayStatus.tankLow !== '_ _' && isDeviceOnline && (
                <Text style={[styles.tankAlert, { 
                  color: displayStatus.tankLow === 'YES' ? '#FF5722' : '#4CAF50' 
                }]}>
                  {displayStatus.tankLow === 'YES' ? '⚠️ LOW LEVEL' : '✅ Level OK'}
                </Text>
              )}
              {isOffline && (
                <Text style={[styles.tankAlert, { color: '#FF5722' }]}>
                  ⚠️ Device Offline
                </Text>
              )}
            </View>
          </View>
        </View>
      </View>

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
      <Text
        style={[
          styles.sectionTitle,
          { color: theme.colors.text, marginHorizontal: 16, marginTop: 8 },
        ]}
      >
        Environmental Sensors
      </Text>

      <View style={styles.sensorsGrid}>
        {sensorRows.map((row, rowIndex) => (
          <View key={rowIndex} style={styles.sensorRow}>
            {row.map((sensor) => {
              const liveValue = sensorData[sensor.dataKey];
              const hasValue = liveValue !== null && liveValue !== undefined;
              return (
                <TouchableOpacity
                  key={sensor.id}
                  style={[
                    styles.sensorCardSquare,
                    {
                      backgroundColor: theme.colors.card,
                      borderColor: isOffline ? '#ccc' : theme.colors.border,
                    },
                  ]}
                  onPress={() => router.push(sensor.route)}
                  activeOpacity={0.7}
                >
                  <CircularProgress
                    value={liveValue}
                    size={50}
                    color={isOffline || !hasValue ? '#999' : sensor.color}
                    maxValue={sensor.maxValue || 100}
                  />

                  <Text
                    style={[styles.sensorName, { color: isOffline || !hasValue ? '#999' : theme.colors.text }]}
                    numberOfLines={1}
                  >
                    {sensor.name}
                  </Text>

                  <Text
                    style={[styles.sensorValue, { color: isOffline || !hasValue ? '#999' : sensor.color }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    {hasValue ? fmt(liveValue) + sensor.unit : '_ _'}
                  </Text>

                  <Text
                    style={[styles.clickText, { color: isOffline || !hasValue ? '#999' : theme.colors.primary }]}
                  >
                    tap for details
                  </Text>
                </TouchableOpacity>
              );
            })}

            {row.length < 3 &&
              Array(3 - row.length)
                .fill(null)
                .map((_, i) => (
                  <View
                    key={`empty-${i}`}
                    style={styles.sensorCardSquareEmpty}
                  />
                ))}
          </View>
        ))}
      </View>

      {/* ── Quick Summary ─────────────────────────────────────────────────── */}
      <View
        style={[
          styles.quickStatsCard,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
          },
        ]}
      >
        <Text style={[styles.overviewTitle, { color: theme.colors.text }]}>
          Quick Summary
        </Text>

        <View style={styles.overviewGrid}>
          {[
            {
              label: "Temp",
              value: fmt(sensorData.ambientTemperature) + "°",
              color: isOffline ? '#999' : "#FF5722",
            },
            {
              label: "Humidity",
              value: fmt(sensorData.ambientHumidity) + "%",
              color: isOffline ? '#999' : "#2196F3",
            },
            { 
              label: "CO₂", 
              value: fmt(sensorData.co2Level), 
              color: isOffline ? '#999' : "#9C27B0" 
            },
            { 
              label: "pH", 
              value: fmt(sensorData.phValue), 
              color: isOffline ? '#999' : "#4CAF50" 
            },
            {
              label: "Water",
              value: fmt(sensorData.waterLevel) + "%",
              color: isOffline ? '#999' : "#2E7D32",
            },
            {
              label: "Soil",
              value: fmt(sensorData.soilMoisture) + "%",
              color: isOffline ? '#999' : "#8BC34A",
            },
          ].map((item) => (
            <View key={item.label} style={styles.overviewItem}>
              <Text
                style={[
                  styles.overviewLabel,
                  { color: theme.colors.textSecondary },
                ]}
              >
                {item.label}
              </Text>
              <Text style={[styles.overviewValue, { color: item.color }]}>
                {item.value}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {/* ── Status Flags Quick View ──────────────────────────────────────── */}
      {/* <View
        style={[
          styles.flagCard,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
          },
        ]}
      >
        <Text style={[styles.overviewTitle, { color: theme.colors.text }]}>
          🚦 Status Flags
        </Text>
        <View style={styles.flagGrid}>
          {[
            { key: 'tankLow', label: 'Tank Low' },
            { key: 'tankHigh', label: 'Tank High' },
            { key: 'waterPump', label: 'Water Pump' },
            { key: 'nutrientPump', label: 'Nutrient Pump' },
            { key: 'inletValve', label: 'Inlet Valve' },
            { key: 'outletValve', label: 'Outlet Valve' },
            { key: 'mode', label: 'Mode' },
            { key: 'dimmingLevel', label: 'Dimming' },
          ].map(item => {
            const value = displayStatus[item.key];
            const isOn = value === 'YES' || value === 'ON' || value === 'OPEN' || value === 'AUTO';
            const isOff = value === 'NO' || value === 'OFF' || value === 'CLOSED' || value === 'MANUAL';
            const color = isOffline || !hasReceivedData ? '#999' : value === '_ _' ? '#999' : isOn ? '#4CAF50' : isOff ? '#F44336' : '#FF9800';
            
            return (
              <View key={item.key} style={styles.flagItem}>
                <Text style={[styles.flagLabel, { color: theme.colors.textSecondary }]}>
                  {item.label}
                </Text>
                <Text style={[styles.flagValue, { color }]}>
                  {!hasReceivedData ? '_ _' : value}
                </Text>
              </View>
            );
          })}
        </View>
      </View> */}

      {/* ── Debug Section ─────────────────────────────────────────────────── */}
      {/* <View style={[styles.debugSection, { 
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.border,
      }]}>
        <Text style={[styles.debugTitle, { color: theme.colors.text }]}>
          🔍 Debug Info
        </Text>
        <Text style={[styles.debugText, { color: theme.colors.textSecondary }]}>
          Connected: {isConnected ? '✅ Yes' : '❌ No'}
        </Text>
        <Text style={[styles.debugText, { color: theme.colors.textSecondary }]}>
          Has Data: {hasReceivedData ? '✅ Yes' : '❌ No'}
        </Text>
        <Text style={[styles.debugText, { color: theme.colors.textSecondary }]}>
          Ever Online: {hasEverBeenOnline ? '✅ Yes' : '❌ No'}
        </Text>
        <Text style={[styles.debugText, { color: theme.colors.textSecondary }]}>
          Online Flag: {deviceStatusFlags?.online !== null && deviceStatusFlags?.online !== undefined 
            ? (deviceStatusFlags.online ? '✅ Online' : '❌ Offline') 
            : '_ _'}
        </Text>
        <Text style={[styles.debugText, { color: theme.colors.textSecondary }]}>
          Connection State: {connectionState || '_ _'}
        </Text>
        <Text style={[styles.debugText, { color: theme.colors.textSecondary }]}>
          External Key: {externalKey || '_ _'}
        </Text>
        <Text style={[styles.debugText, { color: theme.colors.textSecondary }]}>
          Device ID: {activeDeviceId || '_ _'}
        </Text>
        <Text style={[styles.debugText, { color: theme.colors.textSecondary }]}>
          Mode: {isManualMode ? 'MANUAL' : 'AUTO'}
        </Text>
        <Text style={[styles.debugText, { color: theme.colors.textSecondary }]}>
          Can Publish: {canPublish ? '✅ Yes' : '❌ No'}
        </Text>
        <Text style={[styles.debugText, { color: theme.colors.textSecondary }]}>
          Device Status: {deviceStatus !== null ? deviceStatus : '_ _'}
        </Text>
      </View> */}
    </ScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollViewContent: { paddingBottom: "5%" },

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
    marginTop: 6,
    gap: 5,
  },
  connectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  connectionLabel: {
    fontSize: 11,
    color: "#888",
  },

  deviceStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    gap: 6,
  },
  deviceStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  deviceStatusText: {
    fontSize: 12,
    fontWeight: "500",
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

  statsRow: {
    marginHorizontal: 16,
    marginBottom: 16,
  },

  waterTankCard: { padding: 16, borderRadius: 16, overflow: "hidden" },
  cardTitle: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 12,
  },
  tankContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  waterLevelValue: { color: "#FFF", fontSize: 24, fontWeight: "700" },
  capacityText: { color: "#FFF", fontSize: 11, opacity: 0.9, marginTop: 2 },
  tankAlert: { 
    fontSize: 12, 
    fontWeight: "700",
    marginTop: 4,
  },

  pumpCard: {
    padding: 14,
    borderRadius: 16,
    marginHorizontal: 16,
    marginBottom: 16,
    position: 'relative',
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

  sectionTitle: { fontSize: 18, fontWeight: "700", marginBottom: 10 },

  sensorsGrid: { paddingHorizontal: 16, gap: 10 },
  sensorRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 10,
  },
  sensorCardSquare: {
    flex: 1,
    aspectRatio: 1,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  sensorCardSquareEmpty: { flex: 1, aspectRatio: 1, opacity: 0 },
  sensorName: { fontSize: 11, fontWeight: "500", textAlign: "center" },
  sensorValue: { fontSize: 16, fontWeight: "700", textAlign: "center" },
  clickText: { fontSize: 8, opacity: 0.6 },

  quickStatsCard: {
    marginHorizontal: 16,
    padding: 14,
    borderRadius: 12,
    marginTop: 16,
    borderWidth: 1,
  },
  overviewTitle: { fontSize: 14, fontWeight: "700", marginBottom: 10 },
  overviewGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  overviewItem: {
    width: "31%",
    alignItems: "center",
    padding: 6,
    borderRadius: 8,
    backgroundColor: "rgba(0,0,0,0.03)",
  },
  overviewLabel: { fontSize: 10, marginBottom: 2, textAlign: "center" },
  overviewValue: { fontSize: 14, fontWeight: "700" },

  circularContainer: {
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
  },
  circularBg: { position: "absolute" },
  circularFill: {
    position: "absolute",
    borderTopColor: "transparent",
    borderRightColor: "transparent",
    transform: [{ rotate: "-45deg" }],
  },
  circularText: { fontWeight: "bold", zIndex: 1 },

  flagCard: {
    marginHorizontal: 16,
    padding: 14,
    borderRadius: 12,
    marginTop: 12,
    borderWidth: 1,
  },
  flagGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  flagItem: {
    width: '23%',
    alignItems: 'center',
    paddingVertical: 4,
  },
  flagLabel: {
    fontSize: 9,
    textAlign: 'center',
  },
  flagValue: {
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },

  debugSection: {
    marginHorizontal: 16,
    padding: 14,
    borderRadius: 12,
    marginTop: 12,
    marginBottom: 20,
    borderWidth: 1,
  },
  debugTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
  },
  debugText: {
    fontSize: 12,
    marginBottom: 4,
  },
});