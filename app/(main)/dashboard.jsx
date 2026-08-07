// app/(main)/dashboard.jsx
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// ✅ CORRECT - Components from root components/ folder
import { AlertList } from '../../components/AlertList';
import { DeviceStatusSummary } from '../../components/DeviceStatusSummary';

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
function ConnectionDot({ connected, isOffline }) {
  return (
    <View style={styles.connectionRow}>
      <View
        style={[
          styles.connectionDot,
          { backgroundColor: isOffline ? "#F44336" : connected ? "#4CAF50" : "#FF9800" },
        ]}
      />
      <Text style={styles.connectionLabel}>
        {isOffline ? "Device Offline" : connected ? "Live" : "Connecting…"}
      </Text>
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
  activeDeviceId,  // ✅ YEH ADD KARO
} = useMqtt();

  const {
    isManualMode,
    isModeLoaded,
    checkBeforeActuator,
    modeDisplay,
  } = useSystemMode();

  // ✅ Extract both addAlert AND alerts
  const { addAlert, alerts } = useAlerts();

  const [pumpStatus, setPumpStatus] = useState("OFF");
  const [isPublishing, setIsPublishing] = useState(false);
  const [optimisticPumpStatus, setOptimisticPumpStatus] = useState(null);
  const [isSwitchingMode, setIsSwitchingMode] = useState(false);
  const [modeSwitchPending, setModeSwitchPending] = useState(false);
  const [showAlerts, setShowAlerts] = useState(false);
  const [pumpToggleTime, setPumpToggleTime] = useState(null);

  // ── Get display status ──────────────────────────────────────────────────
  const displayStatus = getDisplayStatus(deviceStatusFlags);

  // ── Check if device is offline ──────────────────────────────────────────
  const isOffline = deviceStatus === 0 || connectionState === 'disconnected' || connectionState === 'idle';

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
  }, [actuatorStatus]);

  // ── Monitor deviceConfig for mode switch confirmation ────────────────────
  useEffect(() => {
    if (deviceConfig && modeSwitchPending) {
      if (deviceConfig.auto_mode === false) {
        console.log("✅ Mode switch confirmed - Now in MANUAL mode");
        setModeSwitchPending(false);
        setIsSwitchingMode(false);
        performPumpToggle();
      }
    }
  }, [deviceConfig, modeSwitchPending]);

  // ── SWITCH TO MANUAL MODE ──────────────────────────────────────────────────
  const switchToManualMode = useCallback(async () => {
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
    setIsPublishing(true);
    setModeSwitchPending(true);

    try {
      const manualModeConfig = {
        report_interval: deviceConfig.report_interval || 120,
        sampling_interval: deviceConfig.sampling_interval || 30,
        auto_mode: false,
      };

      const success = await publishConfig(manualModeConfig);

      if (success) {
        addAlert(
          'mode',
          '🔄 System Mode: MANUAL',
          `System mode changed to MANUAL at ${new Date().toLocaleTimeString()}`,
          'info'
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
    } finally {
      setIsPublishing(false);
    }
  }, [isSwitchingMode, isPublishing, isOffline, deviceConfig, publishConfig, addAlert]);

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

  // ── PUMP CONTROL ──────────────────────────────────────────────────────────
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
        "Would you like to switch to MANUAL mode to control the pump?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Switch to Manual",
            onPress: async () => {
              await switchToManualMode();
            },
          },
        ]
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
    checkBeforeActuator,
    performPumpToggle,
    switchToManualMode,
  ]);

  const sensorRows = chunkArray(SENSOR_CONFIG, 3);

  const lastUpdatedLabel = sensorData.lastUpdated
    ? `Updated ${sensorData.lastUpdated.toLocaleTimeString()}`
    : "Waiting for data…";

  const displayPumpStatus = optimisticPumpStatus || pumpStatus;

  // ✅ ALWAYS SHOW THE DASHBOARD - No loading/offline screens
  return (
    <>
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
            <ConnectionDot connected={isConnected} isOffline={isOffline} />

            {isOffline && (
              <View style={styles.deviceStatusRow}>
                <View style={[styles.deviceStatusDot, { backgroundColor: '#F44336' }]} />
                <Text style={[styles.deviceStatusText, { color: '#F44336' }]}>
                  ● Device Offline
                </Text>
              </View>
            )}

            {isModeLoaded && !isOffline && (
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
            <TouchableOpacity onPress={() => setShowAlerts(true)} style={styles.bellButton}>
              <Ionicons name="notifications-outline" size={24} color={theme.colors.text} />
              {alerts && alerts.filter(a => !a.read).length > 0 && (
                <View style={styles.bellBadge}>
                  <Text style={styles.bellBadgeText}>
                    {alerts.filter(a => !a.read).length}
                  </Text>
                </View>
              )}
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

        {/* ── Device Status Summary ─────────────────────────────────────────── */}
        <DeviceStatusSummary 
          onPress={() => setShowAlerts(true)}
          deviceStatusFlags={deviceStatusFlags}
          hasReceivedData={hasReceivedData}
          connectionState={connectionState}
        />

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
                {displayStatus.tankLow !== '_ _' && !isOffline && (
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
              opacity: isOffline ? 0.6 : 1,
            },
          ]}
        >
          <View style={styles.pumpHeader}>
            <View>
              <Text style={styles.pumpTitle}>Water Pump</Text>
              {pumpToggleTime && !isOffline && (
                <Text style={styles.pumpTimeText}>
                  Last toggle: {pumpToggleTime}
                </Text>
              )}
              {isOffline && (
                <Text style={styles.pumpTimeText}>
                  ⚠️ Offline - No control
                </Text>
              )}
            </View>

            {isModeLoaded && !isOffline && (
              <View style={styles.pumpModeBadge}>
                <Text style={styles.pumpModeBadgeText}>
                  {isManualMode ? '🔧 Manual' : '🤖 Auto'}
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={[
                styles.pumpButton,
                (isOffline || isPublishing || isSwitchingMode || !isManualMode) && styles.pumpButtonDisabled,
              ]}
              onPress={togglePump}
              disabled={isOffline || isPublishing || isSwitchingMode || !isManualMode}
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
            {isOffline ? "Device Offline" : `Pump is ${displayPumpStatus === "ON" ? "RUNNING" : "OFF"}`}
            {isPublishing && " (Sending...)"}
            {isSwitchingMode && " (Switching Mode...)"}
            {!isManualMode && isModeLoaded && !isOffline && " (Auto Mode)"}
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
                      color={isOffline ? '#999' : sensor.color}
                      maxValue={sensor.maxValue || 100}
                    />

                    <Text
                      style={[styles.sensorName, { color: isOffline ? '#999' : theme.colors.text }]}
                      numberOfLines={1}
                    >
                      {sensor.name}
                    </Text>

                    <Text
                      style={[styles.sensorValue, { color: isOffline ? '#999' : sensor.color }]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                    >
                      {fmt(liveValue)}
                      {liveValue !== null && liveValue !== undefined && sensor.unit}
                    </Text>

                    <Text
                      style={[styles.clickText, { color: isOffline ? '#999' : theme.colors.primary }]}
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
        <View
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
              const color = isOffline ? '#999' : value === '_ _' ? '#999' : isOn ? '#4CAF50' : isOff ? '#F44336' : '#FF9800';
              
              return (
                <View key={item.key} style={styles.flagItem}>
                  <Text style={[styles.flagLabel, { color: theme.colors.textSecondary }]}>
                    {item.label}
                  </Text>
                  <Text style={[styles.flagValue, { color }]}>
                    {isOffline ? '_ _' : value}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* ── Recent Alerts ─────────────────────────────────────────────────── */}
        <View style={styles.alertsSection}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
            Recent Alerts
          </Text>

          {[
            {
              title: isOffline ? "📡 Device Offline" : displayStatus.tankLow === 'YES' ? "⚠️ Tank Low" : "✅ Tank Level OK",
              message: isOffline 
                ? "Device is currently offline. Please check your connection."
                : displayStatus.tankLow === 'YES' 
                  ? "Water tank is critically low! Please refill immediately."
                  : "Water tank level is normal.",
              color: isOffline ? "#F44336" : displayStatus.tankLow === 'YES' ? "#F44336" : "#4CAF50",
            },
            {
              title: isOffline ? "⏳ Waiting for Data" : displayPumpStatus === "ON" ? "💧 Pump Running" : "💧 Pump Off",
              message: isOffline
                ? "No data received from device."
                : displayPumpStatus === "ON"
                  ? `Water pump is actively running (Last toggled: ${pumpToggleTime || 'N/A'})`
                  : `Water pump is currently off (Last toggled: ${pumpToggleTime || 'N/A'})`,
              color: isOffline ? "#999" : displayPumpStatus === "ON" ? "#4CAF50" : "#F44336",
            },
            {
              title: isOffline ? "🔴 Disconnected" : `🔧 System Mode: ${displayStatus.mode}`,
              message: isOffline
                ? "Device is offline. Reconnecting..."
                : `System is currently in ${displayStatus.mode} mode. ${displayStatus.mode === 'AUTO' ? 'Automatic controls are active.' : 'Manual controls are available.'}`,
              color: isOffline ? "#F44336" : displayStatus.mode === 'AUTO' ? "#FF9800" : "#4CAF50",
            },
          ].map((alertItem) => (
            <TouchableOpacity
              key={alertItem.title}
              style={[
                styles.alertCard,
                {
                  backgroundColor: theme.colors.surface,
                  borderLeftColor: alertItem.color,
                },
              ]}
              onPress={() => setShowAlerts(true)}
            >
              <Text style={[styles.alertTitle, { color: theme.colors.text }]}>
                {alertItem.title}
              </Text>
              <Text
                style={[
                  styles.alertMessage,
                  { color: theme.colors.textSecondary },
                ]}
              >
                {alertItem.message}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Debug Section ─────────────────────────────────────────────────── */}
        <View style={[styles.debugSection, { 
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
            Device Status: {deviceStatus !== null ? deviceStatus : '_ _'}
          </Text>
          <Text style={[styles.debugText, { color: theme.colors.textSecondary }]}>
            External Key: {externalKey || '_ _'}
          </Text>
          <Text style={[styles.debugText, { color: theme.colors.textSecondary }]}>
            Connection State: {connectionState || '_ _'}
          </Text>
          <Text style={[styles.debugText, { color: theme.colors.textSecondary }]}>
            Device ID: {activeDeviceId || '_ _'}
          </Text>
        </View>
      </ScrollView>

      {/* ── Alert Modal ────────────────────────────────────────────────────── */}
      <Modal
        visible={showAlerts}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setShowAlerts(false)}
      >
        <AlertList onClose={() => setShowAlerts(false)} />
      </Modal>
    </>
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
  greeting: { fontSize: 24, fontWeight: "800" },
  subtitle: { fontSize: 13, marginTop: 2 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  bellButton: {
    position: 'relative',
    padding: 4,
  },
  bellBadge: {
    position: 'absolute',
    top: -2,
    right: -4,
    backgroundColor: '#F44336',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  bellBadgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '700',
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

  alertsSection: { marginTop: 12, marginBottom: 20, paddingHorizontal: 16 },
  alertCard: {
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
    borderLeftWidth: 3,
  },
  alertTitle: { fontSize: 13, fontWeight: "600", marginBottom: 2 },
  alertMessage: { fontSize: 11 },

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

  // ── Debug Section ──────────────────────────────────────────────────────
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