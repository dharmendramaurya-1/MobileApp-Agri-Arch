// app/(main)/dashboard.jsx

import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
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
import { parseDeviceStatus } from "../../src/utils/deviceStatusParser";

// ✅ Import all your SVG icons
import {
  Co2Icon,
  EcIcon,
  HumidityIcon,
  InletValveIcon,
  LightIcon,
  OutletValveIcon,
  PhIcon,
  StatusDot,
  TemperatureIcon,
  WaterFlowIcon,
  WaterLevelIcon,
  WaterPumpIcon,
} from "../../components/SvgIcons";

const { width: SCREEN_W } = Dimensions.get("window");

const SENSOR_COLS = 3;
const SENSOR_GAP = 10;
const SENSOR_PAD = 16;
const SENSOR_CARD_W = "31%";

// ✅ Filter out device-status and soil-moisture
const SENSOR_CONFIG = SENSORS
  .filter(sensor => sensor.key !== 'device-status' && sensor.key !== 'soil-moisture')
  .map((sensor) => ({
    id: sensor.key,
    name: sensor.name,
    dataKey: sensor.dataKey,
    unit: sensor.unit,
    color: sensor.color,
    icon: sensor.icon,
  }));

// ✅ Helper: Get sensor icon component
const getSensorIcon = (sensorKey) => {
  const iconMap = {
    'ambient-temperature': TemperatureIcon,
    'water-temperature': TemperatureIcon,
    'ambient-humidity': HumidityIcon,
    'ph-level': PhIcon,
    'co2': Co2Icon,
    'water-level': WaterLevelIcon,
    'water-flow': WaterFlowIcon,
    'light-level': LightIcon,
    'ec-value': EcIcon,
  };
  return iconMap[sensorKey] || TemperatureIcon;
};

// ✅ Helper: Get sensor color
const getSensorColor = (sensorKey) => {
  const colorMap = {
    'ambient-temperature': '#FF5722',
    'water-temperature': '#03A9F4',
    'ambient-humidity': '#2196F3',
    'ph-level': '#4CAF50',
    'co2': '#9C27B0',
    'water-level': '#2E7D32',
    'water-flow': '#00695C',
    'light-level': '#FFC107',
    'ec-value': '#00BCD4',
  };
  return colorMap[sensorKey] || '#4CAF50';
};

// ✅ Helper: Get sensor status from device flags
const getSensorStatusFromFlags = (sensorKey, deviceStatus) => {
  if (!deviceStatus) {
    return { level: 'unknown', label: 'No Data', color: '#9E9E9E' };
  }

  const flags = typeof deviceStatus === 'number' 
    ? parseDeviceStatus(deviceStatus) 
    : deviceStatus;

  // ── AMBIENT TEMPERATURE ──
  if (sensorKey === 'ambient-temperature' || sensorKey === 'ambientTemperature') {
    if (flags.airTempHigh) return { level: 'high', label: 'High', color: '#F44336' };
    if (flags.airTempLow) return { level: 'low', label: 'Low', color: '#2196F3' };
    return { level: 'normal', label: 'Normal', color: '#4CAF50' };
  }

  // ── WATER TEMPERATURE ──
  if (sensorKey === 'water-temperature' || sensorKey === 'waterTemperature') {
    if (flags.waterTempHigh) return { level: 'high', label: 'High', color: '#F44336' };
    if (flags.waterTempLow) return { level: 'low', label: 'Low', color: '#2196F3' };
    return { level: 'normal', label: 'Normal', color: '#4CAF50' };
  }

  // ── HUMIDITY ──
  if (sensorKey === 'ambient-humidity' || sensorKey === 'ambientHumidity') {
    if (flags.humidityHigh) return { level: 'high', label: 'High', color: '#F44336' };
    if (flags.humidityLow) return { level: 'low', label: 'Low', color: '#2196F3' };
    return { level: 'normal', label: 'Normal', color: '#4CAF50' };
  }

  // ── CO₂ ──
  if (sensorKey === 'co2' || sensorKey === 'co2Level') {
    if (flags.co2High) return { level: 'high', label: 'High', color: '#F44336' };
    if (flags.co2Low) return { level: 'low', label: 'Low', color: '#2196F3' };
    return { level: 'normal', label: 'Normal', color: '#4CAF50' };
  }

  // ── pH ──
  if (sensorKey === 'ph-level' || sensorKey === 'phValue') {
    if (flags.phHigh) return { level: 'high', label: 'High', color: '#F44336' };
    if (flags.phLow) return { level: 'low', label: 'Low', color: '#2196F3' };
    return { level: 'normal', label: 'Normal', color: '#4CAF50' };
  }

  // ── EC ──
  if (sensorKey === 'ec-value' || sensorKey === 'ecValue') {
    if (flags.ecHigh) return { level: 'high', label: 'High', color: '#F44336' };
    if (flags.ecLow) return { level: 'low', label: 'Low', color: '#2196F3' };
    return { level: 'normal', label: 'Normal', color: '#4CAF50' };
  }

  // ── WATER LEVEL ──
  if (sensorKey === 'water-level' || sensorKey === 'waterLevel') {
    if (flags.tankHigh) return { level: 'high', label: 'High', color: '#F44336' };
    if (flags.tankLow) return { level: 'low', label: 'Low', color: '#2196F3' };
    return { level: 'normal', label: 'Normal', color: '#4CAF50' };
  }

  // ── WATER FLOW ──
  if (sensorKey === 'water-flow' || sensorKey === 'waterFlow') {
    if (flags.tankHigh) return { level: 'high', label: 'High', color: '#F44336' };
    if (flags.tankLow) return { level: 'low', label: 'Low', color: '#2196F3' };
    return { level: 'normal', label: 'Normal', color: '#4CAF50' };
  }

  // ── LIGHT LEVEL ──
  if (sensorKey === 'light-level' || sensorKey === 'lightLevel') {
    if (flags.luxHigh) return { level: 'high', label: 'High', color: '#F44336' };
    if (flags.luxLow) return { level: 'low', label: 'Low', color: '#2196F3' };
    return { level: 'normal', label: 'Normal', color: '#4CAF50' };
  }

  return { level: 'normal', label: 'Normal', color: '#4CAF50' };
};

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

function mergeDefinedValues(cached = {}, live = {}) {
  const result = { ...(cached || {}) };
  Object.keys(live || {}).forEach((key) => {
    if (live[key] !== undefined && live[key] !== null) {
      result[key] = live[key];
    }
  });
  return result;
}

/* ============================================================
   VALVE CARD - Using your SVG icons ✅
============================================================ */

function ValveCard({ actuatorStatus, theme }) {
  const inValve = actuatorStatus?.water_ILvalve || false;
  const outValve = actuatorStatus?.water_OLvalve || false;
  
  const inColor = inValve ? "#4CAF50" : "#E0E0E0";
  const outColor = outValve ? "#FF5722" : "#E0E0E0";
  const inStatusText = inValve ? "OPEN" : "CLOSED";
  const outStatusText = outValve ? "OPEN" : "CLOSED";
  const inStatusColor = inValve ? "#4CAF50" : "#9E9E9E";
  const outStatusColor = outValve ? "#FF5722" : "#9E9E9E";

  return (
    <View style={styles.sensorCard}>
      <View style={styles.sensorCardInner}>
        <View style={[styles.sensorAccent, { backgroundColor: "#00BCD4" }]} />
        
        {/* ✅ Inlet Valve SVG Icon */}
        <InletValveIcon
          active={inValve}
          size={40}
          color="#00BCD4"
          status="normal"
        />
        
        <View style={styles.valveStatusContainer}>
          <View style={styles.valveStatusRow}>
            <View style={[styles.valveDot, { backgroundColor: inColor }]} />
            <Text style={[styles.valveLabel, { color: theme.colors.textSecondary }]}>IN</Text>
            <Text style={[styles.valveStatus, { color: inStatusColor, fontWeight: '700' }]}>
              {inStatusText}
            </Text>
          </View>
        </View>

        {/* ✅ Outlet Valve SVG Icon */}
        <OutletValveIcon
          active={outValve}
          size={40}
          color="#FF5722"
          status="normal"
        />

        <View style={styles.valveStatusContainer}>
          <View style={styles.valveStatusRow}>
            <View style={[styles.valveDot, { backgroundColor: outColor }]} />
            <Text style={[styles.valveLabel, { color: theme.colors.textSecondary }]}>OUT</Text>
            <Text style={[styles.valveStatus, { color: outStatusColor, fontWeight: '700' }]}>
              {outStatusText}
            </Text>
          </View>
        </View>

        <Text style={[styles.sensorLabel, { color: theme.colors.text }]} numberOfLines={1}>
          Valves
        </Text>
      </View>
    </View>
  );
}

/* ============================================================
   PUMP CARD - Using your SVG icon ✅
============================================================ */

function PumpCard({ actuatorStatus, theme }) {
  const pumpStatus = actuatorStatus?.water_pump || false;
  const nutrientPump = actuatorStatus?.nutrient_pump || false;
  
  const pumpColor = pumpStatus ? "#2196F3" : "#E0E0E0";
  const pumpText = pumpStatus ? "ON" : "OFF";
  const pumpTextColor = pumpStatus ? "#2196F3" : "#9E9E9E";
  
  const nutrientColor = nutrientPump ? "#4CAF50" : "#E0E0E0";
  const nutrientText = nutrientPump ? "ON" : "OFF";
  const nutrientTextColor = nutrientPump ? "#4CAF50" : "#9E9E9E";

  return (
    <View style={styles.sensorCard}>
      <View style={styles.sensorCardInner}>
        <View style={[styles.sensorAccent, { backgroundColor: "#2196F3" }]} />
        
        {/* ✅ Water Pump SVG Icon */}
        <WaterPumpIcon
          active={pumpStatus}
          size={40}
          color="#2196F3"
          status="normal"
        />

        <View style={styles.valveStatusContainer}>
          <View style={styles.valveStatusRow}>
            <View style={[styles.valveDot, { backgroundColor: pumpColor }]} />
            <Text style={[styles.valveLabel, { color: theme.colors.textSecondary }]}>PUMP</Text>
            <Text style={[styles.valveStatus, { color: pumpTextColor, fontWeight: '700' }]}>
              {pumpText}
            </Text>
          </View>
        </View>

        <View style={styles.valveStatusContainer}>
          <View style={styles.valveStatusRow}>
            <View style={[styles.valveDot, { backgroundColor: nutrientColor }]} />
            <Text style={[styles.valveLabel, { color: theme.colors.textSecondary }]}>NUT</Text>
            <Text style={[styles.valveStatus, { color: nutrientTextColor, fontWeight: '700' }]}>
              {nutrientText}
            </Text>
          </View>
        </View>

        <Text style={[styles.sensorLabel, { color: theme.colors.text }]} numberOfLines={1}>
          Pumps
        </Text>
      </View>
    </View>
  );
}

/* ============================================================
   SENSOR TILE - Using your SVG icons
============================================================ */

function SensorTile({
  sensor,
  sensorData,
  isDeviceOnline,
  isDeviceWaiting,
  theme,
  onPress,
  deviceStatusFlags,
}) {
  const liveValue = sensorData?.[sensor.dataKey];
  const hasValue = liveValue !== null && liveValue !== undefined;
  const active = isDeviceOnline && hasValue;

  const status = getSensorStatusFromFlags(sensor.id, deviceStatusFlags);
  
  let valueColor;
  let statusLabel = status.label;
  
  if (hasValue && active) {
    valueColor = status.color;
    statusLabel = status.label;
  } else if (hasValue && !active) {
    valueColor = isDeviceWaiting ? "#FF9800" : "#9E9E9E";
    statusLabel = isDeviceWaiting ? "..." : "No Data";
  } else {
    valueColor = isDeviceWaiting ? "#FF9800" : "#BDBDBD";
    statusLabel = isDeviceWaiting ? "..." : "--";
  }

  // ✅ Get your SVG icon
  const IconComponent = getSensorIcon(sensor.id);

  return (
    <View style={styles.sensorCard}>
      <TouchableOpacity
        style={styles.sensorCardInner}
        onPress={onPress}
        activeOpacity={0.7}
      >
        <View style={[styles.sensorAccent, { backgroundColor: valueColor }]} />
        
        {/* ✅ Your SVG Icon */}
        <IconComponent
          active={active}
          size={40}
          color={sensor.color}
          status={active ? status.level : 'normal'}
        />
        
        <Text style={[styles.sensorValue, { color: valueColor }]}>
          {hasValue ? fmt(liveValue) : isDeviceWaiting ? "..." : "--"}
        </Text>
        
        <Text style={[styles.sensorUnit, { color: valueColor }]}>
          {hasValue ? sensor.unit : ""}
        </Text>
        
        {hasValue && active && status.level !== 'unknown' && (
          <View style={styles.statusContainer}>
            <StatusDot active={true} status={status.level} size={8} />
            <Text style={[styles.statusText, { color: status.color }]}>
              {statusLabel}
            </Text>
          </View>
        )}
        
        <Text style={[styles.sensorLabel, { color: hasValue ? theme.colors.text : "#9E9E9E" }]}>
          {sensor.name}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

/* ============================================================
   DASHBOARD MAIN
============================================================ */

export default function Dashboard() {
  const insets = useSafeAreaInsets();
  const { onScroll, headerHeight, scrollY } = useScroll();
  const scrollRef = useRef(null);
  useScrollReset(scrollRef);

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

  const { theme } = useTheme();
  const { user } = useAuth();

  const {
    getSelectedDeviceSensorData,
    getSelectedDeviceActuatorStatus,
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
    deviceOnlineStatus,
    deviceInitialLoadComplete,
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

  const deviceKey = useMemo(() => selectedExternalKey || externalKey, [selectedExternalKey, externalKey]);

  const isDeviceOnline = useMemo(() => {
    if (!deviceKey) return false;
    return deviceOnlineStatus[deviceKey] === true;
  }, [deviceKey, deviceOnlineStatus]);

  const isInitialLoadComplete = useMemo(() => {
    if (!deviceKey) return false;
    return deviceInitialLoadComplete[deviceKey] === true;
  }, [deviceKey, deviceInitialLoadComplete]);

  const isLoading = useMemo(() => {
    if (!deviceKey) return false;
    return !isInitialLoadComplete;
  }, [deviceKey, isInitialLoadComplete]);

  const isDeviceOffline = useMemo(() => {
    return isInitialLoadComplete && !isDeviceOnline;
  }, [isInitialLoadComplete, isDeviceOnline]);

  const isDeviceWaiting = useMemo(() => {
    return (!isInitialLoadComplete && !isLoading) || 
      connectionState === "connecting" || 
      connectionState === "waiting" || 
      connectionState === "idle";
  }, [isInitialLoadComplete, isLoading, connectionState]);

  const [cachedSensorData, setCachedSensorData] = useState(null);
  const [cachedActuatorStatus, setCachedActuatorStatus] = useState(null);
  const [isCacheLoaded, setIsCacheLoaded] = useState(false);

  const liveSensorData = getSelectedDeviceSensorData();
  const liveActuatorStatus = getSelectedDeviceActuatorStatus();
  const selectedDeviceName = getSelectedDeviceName();

  const cacheDeviceKey = selectedDeviceId || selectedExternalKey;
  const sensorCacheKey = cacheDeviceKey
    ? `dashboard_sensor_data_${cacheDeviceKey}`
    : null;
  const actuatorCacheKey = cacheDeviceKey
    ? `dashboard_actuator_status_${cacheDeviceKey}`
    : null;

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

  const [showNoDevicePopup, setShowNoDevicePopup] = useState(false);

  const hasCachedData = SENSOR_CONFIG.some(
    (sensor) =>
      sensorData?.[sensor.dataKey] !== undefined &&
      sensorData?.[sensor.dataKey] !== null
  );

  const hasData = hasReceivedData || isLiveData || hasCachedData;

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

  const formattedTime = formatLastUpdated(sensorData?.lastUpdated);
  const lastUpdatedLabel = formattedTime
    ? isDeviceOnline
      ? ` ${formattedTime}`
      : ` ${formattedTime}`
    : null;

  const sensorCount = SENSOR_CONFIG.length;
  const activeSensors = SENSOR_CONFIG.filter(
    (sensor) =>
      sensorData?.[sensor.dataKey] !== null &&
      sensorData?.[sensor.dataKey] !== undefined
  ).length;

  const shortDeviceId = externalKey ? externalKey.slice(-5).toUpperCase() : "N/A";

  if (hasNoDevices) {
    return (
      <>
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
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
                <Ionicons name="settings-outline" size={20} color={theme.colors.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => router.push("/(main)/profile")}>
                <View style={[styles.avatar, { backgroundColor: theme.colors.primary }]}>
                  <Text style={styles.avatarText}>{user?.name?.charAt(0) || "F"}</Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.emptyState}>
            <View style={[styles.emptyIconWrap, { backgroundColor: `${theme.colors.primary}18` }]}>
              <Ionicons name="hardware-chip-outline" size={56} color={theme.colors.primary} />
            </View>
            <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>No Devices Connected</Text>
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
            <View style={[styles.noDeviceModal, { backgroundColor: theme.colors.surface }]}>
              <View style={[styles.noDeviceIconWrap, { backgroundColor: "#F4433615" }]}>
                <Ionicons name="hardware-chip-outline" size={40} color="#F44336" />
              </View>
              <Text style={[styles.noDeviceTitle, { color: theme.colors.text }]}>No Devices Found</Text>
              <Text style={[styles.noDeviceDesc, { color: theme.colors.textSecondary }]}>
                You don't have any devices in your list. Add your first device to start monitoring your farm.
              </Text>
              <View style={styles.noDeviceButtons}>
                <TouchableOpacity
                  style={[styles.noDeviceCancelBtn, { backgroundColor: `${theme.colors.textSecondary}14` }]}
                  onPress={() => setShowNoDevicePopup(false)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.noDeviceCancelText, { color: theme.colors.text }]}>Later</Text>
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

  return (
    <ScrollView
      ref={scrollRef}
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
              <Text style={[styles.modePillText, { color: isModeSwitching ? "#FF9800" : modeColor }]}>
                {isModeSwitching ? "⏳" : modeIcon} {isManualMode ? "Manual" : "Auto"}
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            onPress={() => router.push("/(main)/settings")}
            style={styles.headerIconBtn}
            activeOpacity={0.6}
          >
            <Ionicons name="settings-outline" size={20} color={theme.colors.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.push("/(main)/profile")}>
            <View style={[styles.avatar, { backgroundColor: theme.colors.primary }]}>
              <Text style={styles.avatarText}>{user?.name?.charAt(0) || "F"}</Text>
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
              <Text style={[styles.summaryValue, { color: theme.colors.text }]} numberOfLines={1}>
                {shortDeviceId}
              </Text>
              <Text style={[styles.summaryLabel, { color: theme.colors.textSecondary }]}>Device</Text>
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
              <Text style={[styles.summaryLabel, { color: theme.colors.textSecondary }]}>Sensors</Text>
            </View>
          </View>

          <View style={styles.summarySep} />

          <View style={styles.summaryItem}>
            <View style={[styles.summaryIconWrap, { backgroundColor: isDeviceOnline ? "#4CAF5018" : "#F4433618" }]}>
              <Ionicons name="time-outline" size={16} color={isDeviceOnline ? "#4CAF50" : "#F44336"} />
            </View>
            <View>
              <Text style={[styles.summaryValue, { color: theme.colors.text }]} numberOfLines={1}>
                {lastUpdatedLabel || "No data"}
              </Text>
              <Text style={[styles.summaryLabel, { color: theme.colors.textSecondary }]}>Last Updated</Text>
            </View>
          </View>
        </View>
      </View>

      {/* ── SENSOR GRID ── */}
      <View style={styles.sensorGrid}>
        {SENSOR_CONFIG.map((sensor, index) => {
          // At position 7 (index 7) show Valve Card and Pump Card
          if (index === 7) {
            return (
              <React.Fragment key={`valve-${index}`}>
                <ValveCard
                  actuatorStatus={actuatorStatus}
                  theme={theme}
                />
                <PumpCard
                  actuatorStatus={actuatorStatus}
                  theme={theme}
                />
              </React.Fragment>
            );
          }
          
          // Skip the next sensor if we just inserted valve + pump
          if (index === 8) return null;
          
          return (
            <SensorTile
              key={sensor.id}
              sensor={sensor}
              sensorData={sensorData}
              isDeviceOnline={isDeviceOnline}
              isDeviceWaiting={isDeviceWaiting}
              theme={theme}
              deviceStatusFlags={deviceStatusFlags}
              onPress={() => {
                router.push({
                  pathname: "/(main)/sensor/[type]",
                  params: { type: sensor.id },
                });
              }}
            />
          );
        })}
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
    marginTop: 12,
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
    height: 135,
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
  sensorValue: { fontSize: 18, fontWeight: "800" },
  sensorUnit: { fontSize: 10, fontWeight: "500", marginTop: 1 },
  sensorLabel: { fontSize: 10, fontWeight: "600", textAlign: "center" },
  
  valveStatusContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  valveStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  valveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  valveLabel: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  valveStatus: {
    fontSize: 10,
    letterSpacing: 0.3,
  },

  statusContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 1,
  },
  statusText: {
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 0.3,
  },

  connDotRow: { flexDirection: "row", alignItems: "center" },
  connDot: { width: 8, height: 8, borderRadius: 4 },

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