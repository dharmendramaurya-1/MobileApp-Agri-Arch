// app/(main)/dashboard.jsx

import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Dimensions,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SENSORS } from "../../src/config/sensorConfigs";
import { useAlerts } from "../../src/context/AlertContext";
import { useAuth } from "../../src/context/AuthContext";
import { useMqtt } from "../../src/context/MqttContext";
import { useScroll, useScrollReset } from "../../src/context/ScrollContext";
import { useSystemMode } from "../../src/context/SystemModeContext";
import { useTheme } from "../../src/context/ThemContext";
import { user_profile } from "../../src/services/profile/profile";

const { width: SCREEN_W } = Dimensions.get("window");

const SENSOR_COLS = 3;
const SENSOR_GAP = 10;
const SENSOR_PAD = 16;
const SENSOR_CARD_W = "31%";

const SENSOR_CONFIG = SENSORS.map((sensor) => ({
  id: sensor.key,
  name: sensor.name,
  dataKey: sensor.dataKey,
  unit: sensor.unit,
  color: sensor.color,
  icon: sensor.icon,
  maxValue: sensor.maxValue,
}));

/* ============================================================
   CONNECTION DOT
============================================================ */

function ConnectionDot({
  connectionState,
  isLiveData,
  deviceStatusFlags,
  hasReceivedData,
}) {
  const isOnline =
    (isLiveData || hasReceivedData) && deviceStatusFlags?.online === true;

  const isWaiting =
    connectionState === "connecting" ||
    connectionState === "waiting" ||
    connectionState === "idle";

  const isOffline =
    connectionState === "offline" ||
    connectionState === "disconnected" ||
    connectionState === "error";

  let color = "#9E9E9E";

  if (isOnline) color = "#4CAF50";
  else if (isWaiting) color = "#FF9800";
  else if (isOffline) color = "#F44336";

  return (
    <View style={styles.connDotRow}>
      <View style={[styles.connDot, { backgroundColor: color }]} />
    </View>
  );
}

/* ============================================================
   FORMAT HELPERS
============================================================ */

function fmt(value) {
  if (value === null || value === undefined) return "--";

  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }

  return String(value);
}

function formatLastUpdated(date) {
  if (!date) return null;

  const timeOpts = { hour: "2-digit", minute: "2-digit" };

  try {
    if (typeof date === "string") {
      const parsed = new Date(date);

      if (!isNaN(parsed.getTime())) {
        return parsed.toLocaleTimeString([], timeOpts);
      }

      return date;
    }

    if (date instanceof Date && !isNaN(date.getTime())) {
      return date.toLocaleTimeString([], timeOpts);
    }

    return null;
  } catch {
    return null;
  }
}

/* ============================================================
   MERGE CACHE + LIVE DATA
============================================================ */

function mergeDefinedValues(cached = {}, live = {}) {
  const result = {
    ...(cached || {}),
  };

  Object.keys(live || {}).forEach((key) => {
    if (live[key] !== undefined && live[key] !== null) {
      result[key] = live[key];
    }
  });

  return result;
}

/* ============================================================
   VALVE CARD
============================================================ */

function ValveCard({ actuatorStatus, theme }) {
  const inValve = actuatorStatus?.water_ILvalve || false;
  const outValve = actuatorStatus?.water_OLvalve || false;

  const inColor = inValve ? "#4CAF50" : "#E0E0E0";
  const outColor = outValve ? "#FF5722" : "#E0E0E0";
  const accentColor = "#00BCD4";

  return (
    <TouchableOpacity
      style={styles.sensorCard}
      activeOpacity={0.7}
    >
      <View style={styles.sensorCardInner}>
        <View style={[styles.sensorAccent, { backgroundColor: accentColor }]} />
        <View style={[styles.sensorIconCircle, { backgroundColor: `${accentColor}18` }]}
        >
          <Ionicons name="git-network-outline" size={22} color={accentColor} />
        </View>
        <View style={styles.sensorValueRow}>
          <Text style={[styles.sensorValue, { color: accentColor, fontSize: 13 }]}>IN</Text>
          <View style={[styles.valveDotSmall, { backgroundColor: inColor }]} />
          <Text style={[styles.valveStatusSmall, { color: inValve ? "#4CAF50" : "#9E9E9E" }]}>
            {inValve ? "ON" : "OFF"}
          </Text>
        </View>
        <View style={styles.sensorValueRow}>
          <Text style={[styles.sensorValue, { color: accentColor, fontSize: 13 }]}>OUT</Text>
          <View style={[styles.valveDotSmall, { backgroundColor: outColor }]} />
          <Text style={[styles.valveStatusSmall, { color: outValve ? "#FF5722" : "#9E9E9E" }]}>
            {outValve ? "ON" : "OFF"}
          </Text>
        </View>
        <Text
          style={[styles.sensorLabel, { color: theme.colors.text }]}
          numberOfLines={1}
        >
          Valves
        </Text>
      </View>
    </TouchableOpacity>
  );
}

/* ============================================================
   SENSOR TILE
============================================================ */

function SensorTile({
  sensor,
  sensorData,
  isDeviceOnline,
  isDeviceWaiting,
  theme,
  onPress,
}) {
  const liveValue = sensorData?.[sensor.dataKey];
  const hasValue = liveValue !== null && liveValue !== undefined;
  const active = isDeviceOnline && hasValue;

  const tint = hasValue
    ? active
      ? sensor.color
      : isDeviceWaiting
      ? "#FF9800"
      : "#9E9E9E"
    : isDeviceWaiting
    ? "#FF9800"
    : "#BDBDBD";

  return (
    <View style={styles.sensorCard}>
      <TouchableOpacity
        style={styles.sensorCardInner}
        onPress={onPress}
        activeOpacity={0.7}
      >
        <View style={[styles.sensorAccent, { backgroundColor: tint }]} />
        <View
          style={[styles.sensorIconCircle, { backgroundColor: `${tint}18` }]}
        >
          <Ionicons name={sensor.icon} size={22} color={tint} />
        </View>
        <Text
          style={[styles.sensorValue, { color: tint }]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {hasValue ? fmt(liveValue) : isDeviceWaiting ? "..." : "--"}
        </Text>
        <Text style={[styles.sensorUnit, { color: tint }]}>
          {hasValue ? sensor.unit : ""}
        </Text>
        <Text
          style={[styles.sensorLabel, { color: hasValue ? theme.colors.text : "#9E9E9E" }]}
          numberOfLines={1}
        >
          {sensor.name}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

/* ============================================================
   DASHBOARD
============================================================ */

export default function Dashboard() {
  const insets = useSafeAreaInsets();
  const { onScroll, headerHeight } = useScroll();
  const scrollRef = useRef(null);
  useScrollReset(scrollRef);

  /* ============================================================
     USER
  ============================================================ */
  const [u_name, set_u_name] = useState("");

  useEffect(() => {
    let mounted = true;
    const profile = async () => {
      try {
        const response = await user_profile();
        await AsyncStorage.setItem("Username", response);
        if (mounted) set_u_name(response);
      } catch (e) {
        console.log(e);
      }
    };
    profile();
    return () => { mounted = false; };
  }, []);

  /* ============================================================
     CONTEXTS
  ============================================================ */
  const { theme } = useTheme();
  const { user } = useAuth();

  const {
    getSelectedDeviceSensorData,
    getSelectedDeviceActuatorStatus,
    getSelectedDeviceOnlineStatus,
    getSelectedDeviceName,
    selectedDeviceId,
    selectedExternalKey,
    isConnected,
    hasReceivedData,
    isLiveData,
    toggleDeviceStatus,
    deviceStatusFlags,
    connectionState,
    externalKey,
    availableDevices,
  } = useMqtt();

  const { addAlert } = useAlerts();
  const {
    isManualMode,
    isAutoMode,
    isModeLoaded,
    isSwitching: isModeSwitching,
    modeLocked,
    checkBeforeActuator,
    toggleMode,
    getModeIcon,
    getModeColor,
  } = useSystemMode();

  /* ============================================================
     CACHE STATE
  ============================================================ */
  const [cachedSensorData, setCachedSensorData] = useState(null);
  const [cachedActuatorStatus, setCachedActuatorStatus] = useState(null);
  const [isCacheLoaded, setIsCacheLoaded] = useState(false);

  const liveSensorData = getSelectedDeviceSensorData();
  const liveActuatorStatus = getSelectedDeviceActuatorStatus();
  const isDeviceOnlineFromContext = getSelectedDeviceOnlineStatus();
  const selectedDeviceName = getSelectedDeviceName();

  const cacheDeviceKey = selectedDeviceId || selectedExternalKey;
  const sensorCacheKey = cacheDeviceKey
    ? `dashboard_sensor_data_${cacheDeviceKey}`
    : null;
  const actuatorCacheKey = cacheDeviceKey
    ? `dashboard_actuator_status_${cacheDeviceKey}`
    : null;

  /* ============================================================
     LOAD CACHE
  ============================================================ */
  useEffect(() => {
    let cancelled = false;
    const loadCachedDashboardData = async () => {
      if (!cacheDeviceKey) {
        if (!cancelled) {
          setCachedSensorData(null);
          setCachedActuatorStatus(null);
          setIsCacheLoaded(false);
        }
        return;
      }
      setCachedSensorData(null);
      setCachedActuatorStatus(null);
      setIsCacheLoaded(false);

      try {
        const [sensorRaw, actuatorRaw] = await Promise.all([
          AsyncStorage.getItem(sensorCacheKey),
          AsyncStorage.getItem(actuatorCacheKey),
        ]);

        if (cancelled) return;

        if (sensorRaw) {
          try {
            const parsedSensor = JSON.parse(sensorRaw);
            if (!cancelled) setCachedSensorData(parsedSensor || {});
          } catch (error) {
            console.warn("Invalid cached sensor data:", error);
            if (!cancelled) setCachedSensorData(null);
          }
        } else {
          setCachedSensorData(null);
        }

        if (actuatorRaw) {
          try {
            const parsedActuator = JSON.parse(actuatorRaw);
            if (!cancelled) setCachedActuatorStatus(parsedActuator || {});
          } catch (error) {
            console.warn("Invalid cached actuator data:", error);
            if (!cancelled) setCachedActuatorStatus(null);
          }
        } else {
          setCachedActuatorStatus(null);
        }
      } catch (error) {
        console.error("Failed to load dashboard cache:", error);
      } finally {
        if (!cancelled) setIsCacheLoaded(true);
      }
    };
    loadCachedDashboardData();
    return () => { cancelled = true; };
  }, [cacheDeviceKey, sensorCacheKey, actuatorCacheKey]);

  /* ============================================================
     MERGED DATA
  ============================================================ */
  const sensorData = mergeDefinedValues(cachedSensorData || {}, liveSensorData || {});
  const actuatorStatus = mergeDefinedValues(cachedActuatorStatus || {}, liveActuatorStatus || {});

  const hasRealSensorData =
    !!liveSensorData &&
    SENSOR_CONFIG.some(
      (sensor) =>
        liveSensorData[sensor.dataKey] !== undefined &&
        liveSensorData[sensor.dataKey] !== null
    );

  useEffect(() => {
    if (!sensorCacheKey || !hasRealSensorData || !liveSensorData) return;
    const saveSensorData = async () => {
      try {
        await AsyncStorage.setItem(sensorCacheKey, JSON.stringify(liveSensorData));
      } catch (error) {
        console.error("Failed to cache sensor data:", error);
      }
    };
    saveSensorData();
  }, [sensorCacheKey, liveSensorData, hasRealSensorData]);

  const hasRealActuatorData =
    !!liveActuatorStatus && Object.keys(liveActuatorStatus).length > 0;

  useEffect(() => {
    if (!actuatorCacheKey || !hasRealActuatorData || !liveActuatorStatus) return;
    const saveActuatorData = async () => {
      try {
        await AsyncStorage.setItem(actuatorCacheKey, JSON.stringify(liveActuatorStatus));
      } catch (error) {
        console.error("Failed to cache actuator data:", error);
      }
    };
    saveActuatorData();
  }, [actuatorCacheKey, liveActuatorStatus, hasRealActuatorData]);

  /* ============================================================
     PUMP
  ============================================================ */
  const [pumpStatus, setPumpStatus] = useState(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [optimisticPumpStatus, setOptimisticPumpStatus] = useState(null);
  const [showNoDevicePopup, setShowNoDevicePopup] = useState(false);

  const hasCachedData = SENSOR_CONFIG.some(
    (sensor) =>
      sensorData?.[sensor.dataKey] !== undefined &&
      sensorData?.[sensor.dataKey] !== null
  );

  const hasData = hasReceivedData || isLiveData || hasCachedData;

  const isDeviceOnline = isDeviceOnlineFromContext && connectionState === "online";
  const isDeviceWaiting =
    connectionState === "connecting" ||
    connectionState === "waiting" ||
    connectionState === "idle";
  const isDeviceOffline =
    connectionState === "offline" ||
    connectionState === "disconnected" ||
    connectionState === "error";

  const canPublish =
    isConnected && isDeviceOnline && isManualMode && !isModeSwitching && !isPublishing;

  const normalizePumpStatus = (value) => {
    if (
      value === true || value === 1 || value === "1" ||
      value === "true" || value === "TRUE" || value === "on" || value === "ON"
    ) {
      return "ON";
    }
    return "OFF";
  };

  useEffect(() => {
    if (actuatorStatus?.water_pump === undefined || actuatorStatus?.water_pump === null) return;
    const newStatus = normalizePumpStatus(actuatorStatus.water_pump);
    const prevStatus = pumpStatus;
    setPumpStatus(newStatus);
    setOptimisticPumpStatus(null);
    if (prevStatus !== null && prevStatus !== newStatus) {
      const time = new Date().toLocaleTimeString();
      addAlert(
        "pump",
        newStatus === "ON" ? "💧 Water Pump ON" : "💧 Water Pump OFF",
        `Water pump ${newStatus === "ON" ? "activated" : "deactivated"} at ${time}`,
        newStatus === "ON" ? "success" : "info"
      );
    }
  }, [actuatorStatus, addAlert, pumpStatus]);

  const actualPumpStatus = normalizePumpStatus(actuatorStatus?.water_pump);
  const displayPumpStatus = optimisticPumpStatus || actualPumpStatus;

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
    const currentPumpStatus = normalizePumpStatus(actuatorStatus?.water_pump) === "ON";
    const newStatus = !currentPumpStatus;
    setIsPublishing(true);

    try {
      const success = await toggleDeviceStatus(currentDeviceKey, "water_pump", newStatus);
      if (!success) {
        setOptimisticPumpStatus(null);
        setPumpStatus(currentPumpStatus ? "ON" : "OFF");
        Alert.alert("Command Failed", "Failed to send pump command.");
      } else {
        const time = new Date().toLocaleTimeString();
        addAlert(
          "pump",
          newStatus ? "💧 Water Pump ON" : "💧 Water Pump OFF",
          `Water pump ${newStatus ? "activated" : "deactivated"} at ${time}`,
          newStatus ? "success" : "info"
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

  const togglePump = useCallback(async () => {
    if (isPublishing || isModeSwitching) {
      Alert.alert("Busy", "Please wait...");
      return;
    }
    if (!isModeLoaded) {
      Alert.alert("Loading", "Please wait for system mode to load.");
      return;
    }
    if (isDeviceOffline) {
      Alert.alert("Device Offline", "Cannot control pump while device is offline.");
      return;
    }
    if (isDeviceWaiting) {
      Alert.alert("Connecting", "Device is connecting. Please wait...");
      return;
    }
    const canControl = checkBeforeActuator("Water Pump");
    if (!canControl) return;
    await performPumpToggle();
  }, [
    isPublishing, isModeSwitching, isDeviceOffline, isDeviceWaiting,
    isModeLoaded, checkBeforeActuator, performPumpToggle,
  ]);

  /* ============================================================
     MODE
  ============================================================ */
  const modeIcon = isModeSwitching
    ? "⏳"
    : getModeIcon
    ? getModeIcon()
    : isManualMode
    ? "🔧"
    : "🤖";

  const modeColor = isModeSwitching
    ? "#FF9800"
    : getModeColor
    ? getModeColor()
    : isManualMode
    ? "#4CAF50"
    : "#FF9800";

  const showMode = isModeLoaded && (isDeviceOnline || hasData);

  /* ============================================================
     NO DEVICE LOGIC
  ============================================================ */
  const hasNoDevices = availableDevices && availableDevices.length === 0;

  useEffect(() => {
    if (!hasNoDevices) return;
    const checkPopup = async () => {
      try {
        const shown = await AsyncStorage.getItem("no_device_popup_shown");
        if (!shown) {
          setShowNoDevicePopup(true);
          await AsyncStorage.setItem("no_device_popup_shown", "true");
        }
      } catch (error) {
        console.error("Failed to check no-device popup:", error);
      }
    };
    checkPopup();
  }, [hasNoDevices]);

  const handleNoDevicePopupYes = () => {
    setShowNoDevicePopup(false);
    router.push("/(main)/devices");
  };

  /* ============================================================
     LAST UPDATED
  ============================================================ */
  const formattedTime = formatLastUpdated(sensorData?.lastUpdated);
  const lastUpdatedLabel = formattedTime
    ? isDeviceOnline
      ? ` ${formattedTime}`
      : `Last known: ${formattedTime}`
    : null;

  const sensorCount = SENSOR_CONFIG.length;
  const activeSensors = SENSOR_CONFIG.filter(
    (sensor) =>
      sensorData?.[sensor.dataKey] !== null &&
      sensorData?.[sensor.dataKey] !== undefined
  ).length;

  /* ============================================================
     NO DEVICES EMPTY STATE
  ============================================================ */
  if (hasNoDevices) {
    return (
      <>
        <View
          style={[styles.container, { backgroundColor: theme.colors.background }]}
        >
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text style={[styles.greeting, { color: theme.colors.text }]}>
                {u_name} 👋
              </Text>
            </View>
            <View style={styles.headerActions}>
              <TouchableOpacity
                onPress={() => router.push("/(main)/settings")}
                style={styles.headerIconBtn}
                activeOpacity={0.6}
              >
                <Ionicons
                  name="settings-outline"
                  size={20}
                  color={theme.colors.textSecondary}
                />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => router.push("/(main)/profile")}>
                <View
                  style={[styles.avatar, { backgroundColor: theme.colors.primary }]}
                >
                  <Text style={styles.avatarText}>
                    {user?.name?.charAt(0) || "F"}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.emptyState}>
            <View
              style={[styles.emptyIconWrap, { backgroundColor: `${theme.colors.primary}18` }]}
            >
              <Ionicons name="hardware-chip-outline" size={56} color={theme.colors.primary} />
            </View>
            <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>
              No Devices Connected
            </Text>
            <Text style={[styles.emptyDesc, { color: theme.colors.textSecondary }]}>
              Add your first AgriArch device to start monitoring your farm in real time.
            </Text>
            <TouchableOpacity
              onPress={() => router.push("/(main)/devices")}
              style={[styles.emptyAddBtn, { shadowColor: theme.colors.primaryDark }]}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={[theme.colors.primary, theme.colors.primaryDark]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.emptyAddBtnGradient}
              >
                <Ionicons name="add-circle" size={20} color="#FFF" />
                <Text style={styles.emptyAddBtnText}>Add Your First Device</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>

        <Modal
          visible={showNoDevicePopup}
          transparent
          animationType="fade"
          onRequestClose={() => setShowNoDevicePopup(false)}
        >
          <View style={styles.noDeviceOverlay}>
            <View
              style={[styles.noDeviceModal, { backgroundColor: theme.colors.surface }]}
            >
              <View style={[styles.noDeviceIconWrap, { backgroundColor: "#F4433615" }]}>
                <Ionicons name="hardware-chip-outline" size={40} color="#F44336" />
              </View>
              <Text style={[styles.noDeviceTitle, { color: theme.colors.text }]}>
                No Devices Found
              </Text>
              <Text style={[styles.noDeviceDesc, { color: theme.colors.textSecondary }]}>
                You don't have any devices in your list. Add your first device to start monitoring your farm.
              </Text>
              <View style={styles.noDeviceButtons}>
                <TouchableOpacity
                  style={[styles.noDeviceCancelBtn, { backgroundColor: `${theme.colors.textSecondary}14` }]}
                  onPress={() => setShowNoDevicePopup(false)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.noDeviceCancelText, { color: theme.colors.text }]}>
                    Later
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.noDeviceYesBtn} onPress={handleNoDevicePopupYes} activeOpacity={0.85}>
                  <LinearGradient
                    colors={[theme.colors.primary, theme.colors.primaryDark]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.noDeviceYesGradient}
                  >
                    <Ionicons name="add-circle" size={18} color="#FFF" />
                    <Text style={styles.noDeviceYesText}>Add Device</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </>
    );
  }

  /* ============================================================
     NORMAL DASHBOARD
  ============================================================ */

    const { scrollY } = useScroll();
  return (
    <ScrollView
      contentContainerStyle={{ paddingTop: headerHeight, paddingBottom: 80 }}
      onScroll={Animated.event(
        [{ nativeEvent: { contentOffset: { y: scrollY } } }],
        { useNativeDriver: false }
      )}
      scrollEventThrottle={16}
    >
      {/* ── HEADER ── */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={[styles.greeting, { color: theme.colors.text }]}>
            {u_name}
          </Text>
        </View>
        <View style={styles.headerActions}>
          {showMode && (
            <TouchableOpacity
              style={[styles.modePill, { backgroundColor: `${modeColor}18` }]}
              onPress={() => {
                if (!isModeSwitching && !modeLocked && isConnected) {
                  toggleMode();
                }
              }}
              disabled={isModeSwitching || modeLocked || !isConnected}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.modePillText,
                  { color: isModeSwitching ? "#FF9800" : modeColor },
                ]}
              >
                {isModeSwitching ? "⏳" : modeIcon}{" "}
                {isManualMode ? "Manual" : "Auto"}
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            onPress={() => router.push("/(main)/settings")}
            style={styles.headerIconBtn}
            activeOpacity={0.6}
          >
            <Ionicons
              name="settings-outline"
              size={20}
              color={theme.colors.textSecondary}
            />
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.push("/(main)/profile")}>
            <View
              style={[styles.avatar, { backgroundColor: theme.colors.primary }]}
            >
              <Text style={styles.avatarText}>
                {user?.name?.charAt(0) || "F"}
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── QUICK SUMMARY CARD ── */}
      <View style={styles.summaryCard}>
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <View style={[styles.summaryIconWrap, { backgroundColor: "#4CAF5018" }]}>
              <Ionicons name="hardware-chip-outline" size={16} color="#4CAF50" />
            </View>
            <View>
              <Text
                style={[styles.summaryValue, { color: theme.colors.text }]}
                numberOfLines={1}
              >
                {externalKey ? "•••••" + externalKey.slice(-5) : "N/A"}
              </Text>
              <Text style={[styles.summaryLabel, { color: theme.colors.textSecondary }]}>
                Device
              </Text>
            </View>
          </View>

          <View style={styles.summarySep} />

          <View style={styles.summaryItem}>
            <View style={[styles.summaryIconWrap, { backgroundColor: "#2196F318" }]}>
              <Ionicons name="analytics-outline" size={16} color="#2196F3" />
            </View>
            <View>
              <Text style={[styles.summaryValue, { color: theme.colors.text }]}>
                {activeSensors}/{sensorCount}
              </Text>
              <Text style={[styles.summaryLabel, { color: theme.colors.textSecondary }]}>
                Sensors
              </Text>
            </View>
          </View>

          <View style={styles.summarySep} />

          <View style={styles.summaryItem}>
            <View
              style={[
                styles.summaryIconWrap,
                { backgroundColor: isDeviceOnline ? "#4CAF5018" : "#F4433618" },
              ]}
            >
              <Ionicons
                name="radio-outline"
                size={16}
                color={isDeviceOnline ? "#4CAF50" : "#F44336"}
              />
            </View>
            <View>
              <Text
                style={[styles.summaryValue, { color: theme.colors.text }]}
                numberOfLines={1}
              >
                {lastUpdatedLabel || "No data"}
              </Text>
              <Text style={[styles.summaryLabel, { color: theme.colors.textSecondary }]}>
                Last Updated
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* ── SENSOR GRID ── */}
      <View style={styles.sensorGrid}>
        {SENSOR_CONFIG.map((sensor, index) => (
          <React.Fragment key={sensor.id}>
            <SensorTile
            key={sensor.id}
            sensor={sensor}
            sensorData={sensorData}
            isDeviceOnline={isDeviceOnline}
            isDeviceWaiting={isDeviceWaiting}
            theme={theme}
            onPress={() => {
              router.push({
                pathname: "/(main)/sensor/[type]",
                params: { type: sensor.id },
              });
            }}
          />
      {index === 7 && <ValveCard actuatorStatus={actuatorStatus} theme={theme} />}
          </React.Fragment>
        ))}
      </View>
    </ScrollView>
  );
}

/* ============================================================
   STYLES
============================================================ */
const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  headerLeft: { flex: 1, marginRight: 10 },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  greeting: { fontSize: 22, fontWeight: "700" },
  modePill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  modePillText: { fontSize: 12, fontWeight: "600" },
  headerIconBtn: { padding: 6 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: { color: "#FFF", fontWeight: "700", fontSize: 14 },

  // Summary card
  summaryCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  summaryRow: { flexDirection: "row", alignItems: "center" },
  summaryItem: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  summaryIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  summaryValue: { fontSize: 14, fontWeight: "700" },
  summaryLabel: { fontSize: 10, fontWeight: "500", marginTop: 1 },
  summarySep: {
    width: 1,
    height: 30,
    backgroundColor: "#E0E0E0",
    marginHorizontal: 4,
  },

  // Sensor grid
  sensorGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: SENSOR_PAD,
    gap: SENSOR_GAP,
  },
  sensorCard: {
    width: SENSOR_CARD_W,
  },
  sensorCardInner: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    paddingTop: 14,
    paddingBottom: 10,
    paddingHorizontal: 8,
    alignItems: "center",
    position: "relative",
    overflow: "hidden",
    height: 120,
    justifyContent: "space-between",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  sensorAccent: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  sensorIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  sensorValue: { fontSize: 17, fontWeight: "800" },
  sensorUnit: { fontSize: 10, fontWeight: "500", marginTop: 1 },
  sensorLabel: { fontSize: 10, fontWeight: "600", textAlign: "center" },
  sensorValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  valveDotSmall: { width: 6, height: 6, borderRadius: 3 },
  valveStatusSmall: { fontSize: 11, fontWeight: "700" },

  // Connection
  connDotRow: { flexDirection: "row", alignItems: "center" },
  connDot: { width: 8, height: 8, borderRadius: 4 },

  // Empty state
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  emptyIconWrap: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  emptyTitle: { fontSize: 20, fontWeight: "700", marginBottom: 8, textAlign: "center" },
  emptyDesc: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 24,
  },
  emptyAddBtn: { borderRadius: 14, overflow: "hidden", elevation: 4 },
  emptyAddBtnGradient: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
  },
  emptyAddBtnText: { color: "#FFF", fontWeight: "700", fontSize: 15 },

  // No device modal
  noDeviceOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    padding: 24,
  },
  noDeviceModal: {
    width: "100%",
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
  },
  noDeviceIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  noDeviceTitle: { fontSize: 18, fontWeight: "700", marginBottom: 8, textAlign: "center" },
  noDeviceDesc: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 20,
  },
  noDeviceButtons: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
  noDeviceCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  noDeviceCancelText: { fontWeight: "600", fontSize: 14 },
  noDeviceYesBtn: { flex: 1, borderRadius: 12, overflow: "hidden" },
  noDeviceYesGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
  },
  noDeviceYesText: { color: "#FFF", fontWeight: "700", fontSize: 14 },
});
