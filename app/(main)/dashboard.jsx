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
import { SENSORS } from "../../src/config/sensorConfigs";
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
  TemperatureIcon,
  WaterFlowIcon,
  WaterLevelIcon,
  WaterPumpIcon,
} from "../../components/SvgIcons";

const { width: SCREEN_W } = Dimensions.get("window");

// Exactly 3 cards per row. The card width is derived from the screen so the row
// fills the full width evenly on every device.
const SENSOR_COLS = 3;
const SENSOR_GAP = 10;
const SENSOR_PAD = 16;
// Use Math.floor to prevent floating point rounding issues that cause wrapping
const SENSOR_CARD_W = Math.floor(
  (SCREEN_W - SENSOR_PAD * 2 - SENSOR_GAP * (SENSOR_COLS - 1)) / SENSOR_COLS
);

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
   SENSOR TILE
============================================================ */

function SensorTile({
  sensor,
  sensorData,
  isDeviceOnline,
  isDeviceWaiting,
  theme,
  onPress,
  deviceStatusFlags,
  isLastColumn,
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

  const IconComponent = getSensorIcon(sensor.id);

  return (
    <View style={[styles.sensorCard, !isLastColumn && styles.sensorCardGap]}>
      <TouchableOpacity
        style={[
          styles.sensorCardInner,
          { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
        ]}
        onPress={onPress}
        activeOpacity={0.75}
      >
        <View style={[styles.sensorAccent, { backgroundColor: valueColor }]} />

        <View style={[styles.iconWrap, { backgroundColor: `${sensor.color}12` }]}>
          <IconComponent
            active={active}
            size={22}
            color={active ? sensor.color : theme.colors.textSecondary}
            status={active ? status.level : 'normal'}
          />
        </View>

        <View style={styles.valueRow}>
          <Text style={[styles.sensorValue, { color: valueColor }]} numberOfLines={1}>
            {hasValue ? fmt(liveValue) : isDeviceWaiting ? "..." : "--"}
          </Text>
          {hasValue && sensor.unit ? (
            <Text style={[styles.sensorUnit, { color: valueColor }]}>{sensor.unit}</Text>
          ) : null}
        </View>

        <View style={[styles.statusPill, { backgroundColor: `${valueColor}15` }]}>
          <View style={[styles.statusDot, { backgroundColor: valueColor }]} />
          <Text style={[styles.statusText, { color: valueColor }]} numberOfLines={1}>
            {statusLabel}
          </Text>
        </View>

        <Text
          style={[
            styles.sensorLabel,
            { color: hasValue ? theme.colors.text : theme.colors.textSecondary },
          ]}
          numberOfLines={2}
        >
          {sensor.name}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function ActuatorSummaryCard({ icon: Icon, label, state, active, theme, accentColor }) {
  const stateLabel = active ? state.active : state.inactive;
  const iconColor = active ? accentColor : theme.colors.textSecondary;
  const progressColors = active
    ? [accentColor, `${accentColor}CC`, `${accentColor}99`, `${accentColor}66`, `${accentColor}35`]
    : [`${theme.colors.textSecondary}35`, `${theme.colors.textSecondary}28`, `${theme.colors.textSecondary}20`, `${theme.colors.textSecondary}16`, `${theme.colors.textSecondary}10`];

  return (
    <View style={[styles.actuatorSummaryCard, {  borderColor: active ? `${accentColor}55` : theme.colors.border }]}>
      <View style={[styles.actuatorSummaryTopAccent, { backgroundColor: accentColor }]} />
      <View style={[styles.actuatorSummaryIcon, { backgroundColor: active ? `${accentColor}18` : `${theme.colors.textSecondary}12` }]}>
        <Icon active={active} size={28} color={iconColor} status="normal" />
      </View>
      <View style={styles.actuatorSummaryInfo}>
        <Text style={[styles.actuatorSummaryLabel, { color: theme.colors.text }]} numberOfLines={2}>{label}</Text>
        <View style={styles.actuatorSummaryStateRow}>
          <View style={[styles.actuatorSummaryDot, { backgroundColor: active ? accentColor : theme.colors.border }]} />
          <Text style={[styles.actuatorSummaryState, { color: active ? accentColor : theme.colors.textSecondary }]}>{stateLabel}</Text>
        </View>
      </View>
      <View style={styles.actuatorSummaryProgress}>
        {progressColors.map((color, index) => (
          <View key={`${label}-progress-${index}`} style={[styles.actuatorSummaryProgressSegment, { backgroundColor: color }]} />
        ))}
      </View>
    </View>
  );
}

/* ============================================================
   DASHBOARD MAIN
============================================================ */

export default function Dashboard() {
  const { headerHeight, scrollY } = useScroll();
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

  const {
    getSelectedDeviceSensorData,
    getSelectedDeviceActuatorStatus,
    selectedDeviceId,
    selectedExternalKey,
    isConnected,
    hasReceivedData,
    isLiveData,
    deviceStatusFlags,
    connectionState,
    externalKey,
    availableDevices,
    deviceOnlineStatus,
    deviceInitialLoadComplete,
  } = useMqtt();

  const {
    isManualMode,
    isModeLoaded,
    isSwitching: isModeSwitching,
    modeLocked,
    toggleMode,
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
            <Text style={[styles.greeting, { color: theme.colors.text }]} numberOfLines={1}>
              {u_name}
            </Text>
            <Text style={[styles.greetingSub, { color: theme.colors.textSecondary }]}>
              Welcome back 👋
            </Text>
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
                You don&apos;t have any devices in your list. Add your first device to start monitoring your farm.
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
      contentContainerStyle={{ paddingTop: headerHeight, paddingBottom: 10 }}
      onScroll={Animated.event(
        [{ nativeEvent: { contentOffset: { y: scrollY } } }],
        { useNativeDriver: false }
      )}
      scrollEventThrottle={16}
    >
      {/* ── HEADER ── */}
      {/* <View style={styles.header}>
        <Text style={[styles.greeting, { color: theme.colors.text }]} numberOfLines={1}>
          {u_name}
        </Text>
        <Text style={[styles.greetingSub, { color: theme.colors.textSecondary }]}>
          Welcome back 👋
        </Text>
      </View> */}

      {/* ── QUICK SUMMARY CARD ── */}
      <View
        style={[
          styles.summaryCard,
          { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
        ]}
      >
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <View style={[styles.summaryIconWrap, { backgroundColor: "#4CAF5018" }]}>
              <Ionicons name="hardware-chip-outline" size={16} color="#4CAF50" />
            </View>
            <View style={styles.summaryTextWrap}>
              <Text style={[styles.summaryValue, { color: theme.colors.text }]} numberOfLines={1}>
                {shortDeviceId}
              </Text>
              <Text style={[styles.summaryLabel, { color: theme.colors.textSecondary }]}>Device</Text>
            </View>
          </View>

          {/* <View style={[styles.summarySep, { backgroundColor: theme.colors.border }]} /> */}

          {/* <View style={styles.summaryItem}>
            <View style={[styles.summaryIconWrap, { backgroundColor: "#2196F318" }]}>
              <Ionicons name="analytics-outline" size={16} color="#2196F3" />
            </View>
            <View style={styles.summaryTextWrap}>
              <Text style={[styles.summaryValue, { color: theme.colors.text }]} numberOfLines={1}>
                {activeSensors}/{sensorCount}
              </Text>
              <Text style={[styles.summaryLabel, { color: theme.colors.textSecondary }]}>Sensors</Text>
            </View>
          </View> */}

          <View style={[styles.summarySep, { backgroundColor: theme.colors.border }]} />


          <TouchableOpacity
            style={styles.summaryItem}
            onPress={() => {
              if (!isModeSwitching && !modeLocked && isConnected) {
                toggleMode();
              }
            }}
            disabled={!showMode || isModeSwitching || modeLocked || !isConnected}
            activeOpacity={0.7}
          >
            <View style={[styles.summaryIconWrap, { backgroundColor: `${modeColor}1F` }]}>
              <Ionicons
                name={isManualMode ? "hand-left-outline" : "sync-outline"}
                size={16}
                color={showMode ? modeColor : theme.colors.textSecondary}
              />
            </View>
            <View style={styles.summaryTextWrap}>
              <Text
                style={[
                  styles.summaryValue,
                  { color: showMode ? modeColor : theme.colors.textSecondary },
                ]}
                numberOfLines={1}
              >
                {!showMode ? "--" : isModeSwitching ? "Switching" : isManualMode ? "Manual" : "Auto"}
              </Text>
              <Text style={[styles.summaryLabel, { color: theme.colors.textSecondary }]}>Mode</Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={[styles.summaryActuatorSection, { borderTopColor: theme.colors.border }]}>
          {/* <View style={styles.summaryActuatorHeading}>
            <View>
              <Text style={[styles.summaryActuatorTitle, { color: theme.colors.text }]}>Equipment status</Text>
              <Text style={[styles.summaryActuatorSubtitle, { color: theme.colors.textSecondary }]}>Pumps and valves</Text>
            </View>
            <Ionicons name="pulse-outline" size={19} color={theme.colors.primary} />
          </View> */}
          <View style={styles.actuatorSummaryGrid}>
            <ActuatorSummaryCard
              icon={WaterPumpIcon}
              label="Water Pump"
              state={{ active: "ON", inactive: "OFF" }}
              active={actuatorStatus?.water_pump === true}
              accentColor="#2E7D32"
              theme={theme}
            />
            <ActuatorSummaryCard
              icon={WaterPumpIcon}
              label="Nutrient Pump"
              state={{ active: "ON", inactive: "OFF" }}
              active={actuatorStatus?.nutrient_pump === true}
              accentColor="#43A047"
              theme={theme}
            />
            <ActuatorSummaryCard
              icon={InletValveIcon}
              label="Inlet Valve"
              state={{ active: "OPEN", inactive: "CLOSED" }}
              active={actuatorStatus?.water_ILvalve === true}
              accentColor="#0288D1"
              theme={theme}
            />
            <ActuatorSummaryCard
              icon={OutletValveIcon}
              label="Outlet Valve"
              state={{ active: "OPEN", inactive: "CLOSED" }}
              active={actuatorStatus?.water_OLvalve === true}
              accentColor="#1976D2"
              theme={theme}
            />
          </View>
        </View>
      </View>

      <View style={styles.sensorSectionHeader}>
        <View>
          <Text style={[styles.sensorSectionTitle, { color: theme.colors.text }]}>Live Sensors</Text>
          {/* <Text style={[styles.sensorSectionSubtitle, { color: theme.colors.textSecondary }]}>Real-time readings from {selectedDeviceName || "your device"}</Text> */}
        </View>
        <TouchableOpacity
          style={[styles.sensorCountBadge, { backgroundColor: `${theme.colors.primary}15` }]}
          onPress={() => router.push("/(main)/sensor-list")}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel="Open sensor list"
        >
          <View style={[styles.sensorCountDot, { backgroundColor: isDeviceOnline ? "#4CAF50" : theme.colors.textSecondary }]} />
          <Text style={[styles.sensorCountText, { color: theme.colors.primary }]}>{activeSensors}/{sensorCount}</Text>
          <Ionicons name="arrow-forward" size={13} color={theme.colors.primary} />
        </TouchableOpacity>
      </View>

      {/* ── SENSOR GRID ── */}
      <View style={styles.sensorGrid}>
        {SENSOR_CONFIG.map((sensor, index) => (
            <SensorTile
              key={sensor.id}
              sensor={sensor}
              sensorData={sensorData}
              isDeviceOnline={isDeviceOnline}
              isDeviceWaiting={isDeviceWaiting}
              theme={theme}
              deviceStatusFlags={deviceStatusFlags}
              isLastColumn={index % SENSOR_COLS === SENSOR_COLS - 1}
              onPress={() => {
                router.push({
                  pathname: "/(main)/sensor/[type]",
                  params: { type: sensor.id },
                });
              }}
            />
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
    paddingHorizontal: 16,
    marginBottom: 12,
    marginTop: 10,
  },
  greeting: { fontSize: 22, fontWeight: "700" },
  greetingSub: { fontSize: 12, fontWeight: "500", marginTop: 2 },

  summaryCard: {
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 24,
    paddingVertical: 12,
    paddingHorizontal: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  summaryRow: { flexDirection: "row", alignItems: "center" },
  summaryItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 2,
  },
  summaryIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 11,
    justifyContent: "center",
    alignItems: "center",
  },
  summaryTextWrap: { flex: 1 },
  summaryValue: { fontSize: 13, fontWeight: "800" },
  summaryLabel: { fontSize: 9.5, fontWeight: "600", marginTop: 1, letterSpacing: 0.2 },
  summarySep: {
    width: 1,
    height: 26,
    marginHorizontal: 2,
    opacity: 0.8,
  },
  summaryActuatorSection: {
    borderTopWidth: 1,
    marginTop: 12,
    paddingTop: 10,
  },
  summaryActuatorHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  summaryActuatorTitle: { fontSize: 12, fontWeight: "800" },
  summaryActuatorSubtitle: { fontSize: 9, marginTop: 2 },
  actuatorSummaryGrid: { flexDirection: "row", alignItems: "stretch", justifyContent: "space-between" },
  actuatorSummaryCard: {
    width: "23.5%",
    minHeight: 70,
    position: "relative",
    alignItems: "center",
    paddingHorizontal: 3,
    paddingTop: 10,
    paddingBottom: 7,
    borderRadius: 9,
    borderWidth: 1,
    overflow: "hidden",
  },
  actuatorSummaryTopAccent: { position: "absolute", top: 0, left: "25%", width: "50%", height: 3, borderBottomLeftRadius: 3, borderBottomRightRadius: 3 },
  actuatorSummaryIcon: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  actuatorSummaryInfo: { width: "100%", minWidth: 0, alignItems: "center" },
  actuatorSummaryLabel: { fontSize: 8.5, fontWeight: "700", textAlign: "center", lineHeight: 10 },
  actuatorSummaryStateRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", marginTop: 3 },
  actuatorSummaryDot: { width: 5, height: 5, borderRadius: 3, marginRight: 4 },
  actuatorSummaryState: { fontSize: 8, fontWeight: "800", letterSpacing: 0.1 },
  actuatorSummaryProgress: { flexDirection: "row", width: "82%", gap: 2, marginTop: 6 },
  actuatorSummaryProgressSegment: { flex: 1, height: 3, borderRadius: 2 },

  sensorSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: SENSOR_PAD,
    marginBottom: 10,
  },
  sensorSectionTitle: { fontSize: 16, fontWeight: "800" },
  sensorSectionSubtitle: { fontSize: 10, marginTop: 2 },
  sensorCountBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 10,
  },
  sensorCountDot: { width: 6, height: 6, borderRadius: 3 },
  sensorCountText: { fontSize: 11, fontWeight: "800" },

  sensorGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: SENSOR_PAD,
    justifyContent: "flex-start",
  },
  sensorCard: {
    width: SENSOR_CARD_W,
    marginBottom: SENSOR_GAP,
  },
  sensorCardGap: { marginRight: SENSOR_GAP },
  sensorCardInner: {
    borderRadius: 16,
    borderWidth: 1,
    paddingTop: 10,
    paddingBottom: 10,
    paddingHorizontal: 6,
    alignItems: "center",
    overflow: "hidden",
    height: 136, // slightly reduced to fit 3 columns comfortably
    justifyContent: "space-between",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  sensorAccent: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 2,
  },
  valueRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 2,
  },
  sensorValue: { fontSize: 16, fontWeight: "800" },
  sensorUnit: { fontSize: 9, fontWeight: "600", marginBottom: 2 },
  sensorLabel: {
    fontSize: 9.5,
    fontWeight: "600",
    textAlign: "center",
    lineHeight: 12,
  },

  // ── Status pill ──
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  statusText: {
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 0.2,
  },

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