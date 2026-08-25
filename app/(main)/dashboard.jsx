// app/(main)/dashboard.jsx

import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
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
    (isLiveData || hasReceivedData) &&
    deviceStatusFlags?.online === true;

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

  try {
    if (typeof date === "string") {
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
  } catch {
    return null;
  }
}

/* ============================================================
   MERGE CACHE + LIVE DATA
============================================================ */

/**
 * Cached value is used immediately when the app opens.
 *
 * When live MQTT data arrives:
 * - defined live values replace cached values
 * - missing live values continue using cached values
 *
 * This prevents:
 *
 * cache -> empty -> live
 *
 * and instead gives:
 *
 * cache -> live
 */
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

  return (
    <View style={styles.valveCard}>
      <View
        style={[
          styles.sensorAccent,
          { backgroundColor: "#00BCD4" },
        ]}
      />

      <View
        style={[
          styles.sensorIconWrap,
          { backgroundColor: "#00BCD415" },
        ]}
      >
        <Ionicons
          name="git-network-outline"
          size={20}
          color="#00BCD4"
        />
      </View>

      <Text
        style={[
          styles.sensorLabel,
          {
            color: theme.colors.text,
            marginTop: 4,
            marginBottom: 0,
          },
        ]}
      >
        Valves
      </Text>

      <View style={styles.valveSplit}>
        <View style={styles.valveItem}>
          <Text style={[styles.valveName, { color: "#9E9E9E" }]}>
            IN
          </Text>

          <View
            style={[
              styles.valveDot,
              { backgroundColor: inColor },
            ]}
          />

          <Text
            style={[
              styles.valveStatus,
              {
                color: inValve ? "#4CAF50" : "#9E9E9E",
              },
            ]}
          >
            {inValve ? "ON" : "OFF"}
          </Text>
        </View>

        <View style={styles.valveDividerV} />

        <View style={styles.valveItem}>
          <Text style={[styles.valveName, { color: "#9E9E9E" }]}>
            OUT
          </Text>

          <View
            style={[
              styles.valveDot,
              { backgroundColor: outColor },
            ]}
          />

          <Text
            style={[
              styles.valveStatus,
              {
                color: outValve ? "#FF5722" : "#9E9E9E",
              },
            ]}
          >
            {outValve ? "ON" : "OFF"}
          </Text>
        </View>
      </View>
    </View>
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

  const hasValue =
    liveValue !== null &&
    liveValue !== undefined;

  const active =
    isDeviceOnline &&
    hasValue;

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
        <View
          style={[
            styles.sensorAccent,
            { backgroundColor: tint },
          ]}
        />

        <View
          style={[
            styles.sensorIconWrap,
            { backgroundColor: `${tint}15` },
          ]}
        >
          <Ionicons
            name={sensor.icon}
            size={20}
            color={tint}
          />
        </View>

        <Text
          style={[
            styles.sensorValue,
            { color: tint },
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {hasValue
            ? fmt(liveValue)
            : isDeviceWaiting
            ? "..."
            : "--"}{" "}
          <Text
            style={[
              styles.sensorUnit,
              { color: tint },
            ]}
          >
            {hasValue ? sensor.unit : ""}
          </Text>
        </Text>

        <Text
          style={[
            styles.sensorLabel,
            {
              color: hasValue
                ? theme.colors.text
                : "#9E9E9E",
            },
          ]}
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

        await AsyncStorage.setItem(
          "Username",
          response
        );

        if (mounted) {
          set_u_name(response);
        }
      } catch (e) {
        console.log(e);
      }
    };

    profile();

    return () => {
      mounted = false;
    };
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
     
     IMPORTANT:
     These states are declared BEFORE they are used.
  ============================================================ */

  const [cachedSensorData, setCachedSensorData] =
    useState(null);

  const [cachedActuatorStatus, setCachedActuatorStatus] =
    useState(null);

  const [isCacheLoaded, setIsCacheLoaded] =
    useState(false);

  /* ============================================================
     LIVE MQTT DATA
  ============================================================ */

  const liveSensorData =
    getSelectedDeviceSensorData();

  const liveActuatorStatus =
    getSelectedDeviceActuatorStatus();

  const isDeviceOnlineFromContext =
    getSelectedDeviceOnlineStatus();

  const selectedDeviceName =
    getSelectedDeviceName();

  /* ============================================================
     DEVICE CACHE KEYS
  ============================================================ */

  const cacheDeviceKey =
    selectedDeviceId ||
    selectedExternalKey;

  const sensorCacheKey = cacheDeviceKey
    ? `dashboard_sensor_data_${cacheDeviceKey}`
    : null;

  const actuatorCacheKey = cacheDeviceKey
    ? `dashboard_actuator_status_${cacheDeviceKey}`
    : null;

  /* ============================================================
     LOAD CACHE
     
     Whenever selected device changes:
     1. clear previous device cache from UI
     2. load selected device cache
  ============================================================ */

  useEffect(() => {
    let cancelled = false;

    const loadCachedDashboardData = async () => {
      /*
       * No device selected yet.
       */
      if (!cacheDeviceKey) {
        if (!cancelled) {
          setCachedSensorData(null);
          setCachedActuatorStatus(null);
          setIsCacheLoaded(false);
        }

        return;
      }

      /*
       * New device selected.
       *
       * Clear old device values first so data from
       * another device is never displayed.
       */
      setCachedSensorData(null);
      setCachedActuatorStatus(null);
      setIsCacheLoaded(false);

      try {
        const [sensorRaw, actuatorRaw] =
          await Promise.all([
            AsyncStorage.getItem(sensorCacheKey),
            AsyncStorage.getItem(actuatorCacheKey),
          ]);

        if (cancelled) return;

        /* ------------------------------------------------------
           SENSOR CACHE
        ------------------------------------------------------ */

        if (sensorRaw) {
          try {
            const parsedSensor =
              JSON.parse(sensorRaw);

            if (!cancelled) {
              setCachedSensorData(
                parsedSensor || {}
              );
            }
          } catch (error) {
            console.warn(
              "Invalid cached sensor data:",
              error
            );

            if (!cancelled) {
              setCachedSensorData(null);
            }
          }
        } else {
          setCachedSensorData(null);
        }

        /* ------------------------------------------------------
           ACTUATOR CACHE
        ------------------------------------------------------ */

        if (actuatorRaw) {
          try {
            const parsedActuator =
              JSON.parse(actuatorRaw);

            if (!cancelled) {
              setCachedActuatorStatus(
                parsedActuator || {}
              );
            }
          } catch (error) {
            console.warn(
              "Invalid cached actuator data:",
              error
            );

            if (!cancelled) {
              setCachedActuatorStatus(null);
            }
          }
        } else {
          setCachedActuatorStatus(null);
        }
      } catch (error) {
        console.error(
          "Failed to load dashboard cache:",
          error
        );
      } finally {
        if (!cancelled) {
          setIsCacheLoaded(true);
        }
      }
    };

    loadCachedDashboardData();

    return () => {
      cancelled = true;
    };
  }, [
    cacheDeviceKey,
    sensorCacheKey,
    actuatorCacheKey,
  ]);

  /* ============================================================
     MERGED DATA
     
     CACHE is the initial source.
     LIVE MQTT overrides only values that actually exist.
  ============================================================ */

  const sensorData = mergeDefinedValues(
    cachedSensorData || {},
    liveSensorData || {}
  );

  const actuatorStatus = mergeDefinedValues(
    cachedActuatorStatus || {},
    liveActuatorStatus || {}
  );

  /* ============================================================
     REAL LIVE SENSOR DATA CHECK
  ============================================================ */

  const hasRealSensorData =
    !!liveSensorData &&
    SENSOR_CONFIG.some(
      (sensor) =>
        liveSensorData[sensor.dataKey] !==
          undefined &&
        liveSensorData[sensor.dataKey] !== null
    );

  /* ============================================================
     SAVE LIVE SENSOR DATA TO CACHE
     
     IMPORTANT:
     We save only when actual MQTT data exists.
  ============================================================ */

  useEffect(() => {
    if (
      !sensorCacheKey ||
      !hasRealSensorData ||
      !liveSensorData
    ) {
      return;
    }

    const saveSensorData = async () => {
      try {
        await AsyncStorage.setItem(
          sensorCacheKey,
          JSON.stringify(liveSensorData)
        );
      } catch (error) {
        console.error(
          "Failed to cache sensor data:",
          error
        );
      }
    };

    saveSensorData();
  }, [
    sensorCacheKey,
    liveSensorData,
    hasRealSensorData,
  ]);

  /* ============================================================
     REAL LIVE ACTUATOR DATA CHECK
  ============================================================ */

  const hasRealActuatorData =
    !!liveActuatorStatus &&
    Object.keys(liveActuatorStatus).length > 0;

  /* ============================================================
     SAVE LIVE ACTUATOR DATA TO CACHE
  ============================================================ */

  useEffect(() => {
    if (
      !actuatorCacheKey ||
      !hasRealActuatorData ||
      !liveActuatorStatus
    ) {
      return;
    }

    const saveActuatorData = async () => {
      try {
        await AsyncStorage.setItem(
          actuatorCacheKey,
          JSON.stringify(liveActuatorStatus)
        );
      } catch (error) {
        console.error(
          "Failed to cache actuator data:",
          error
        );
      }
    };

    saveActuatorData();
  }, [
    actuatorCacheKey,
    liveActuatorStatus,
    hasRealActuatorData,
  ]);

  /* ============================================================
     PUMP
  ============================================================ */

  const [pumpStatus, setPumpStatus] =
    useState(null);

  const [isPublishing, setIsPublishing] =
    useState(false);

  const [optimisticPumpStatus, setOptimisticPumpStatus] =
    useState(null);

  const [showNoDevicePopup, setShowNoDevicePopup] =
    useState(false);

  /* ============================================================
     DATA AVAILABLE
  ============================================================ */

  const hasCachedData =
    SENSOR_CONFIG.some(
      (sensor) =>
        sensorData?.[sensor.dataKey] !==
          undefined &&
        sensorData?.[sensor.dataKey] !== null
    );

  const hasData =
    hasReceivedData ||
    isLiveData ||
    hasCachedData;

  /* ============================================================
     DEVICE STATUS
  ============================================================ */

  const isDeviceOnline =
    isDeviceOnlineFromContext &&
    connectionState === "online";

  const isDeviceWaiting =
    connectionState === "connecting" ||
    connectionState === "waiting" ||
    connectionState === "idle";

  const isDeviceOffline =
    connectionState === "offline" ||
    connectionState === "disconnected" ||
    connectionState === "error";

  const canPublish =
    isConnected &&
    isDeviceOnline &&
    isManualMode &&
    !isModeSwitching &&
    !isPublishing;

  /* ============================================================
     PUMP STATUS FROM CACHE + LIVE DATA
     
     Cache will be displayed immediately.
     Live MQTT value will automatically override it.
  ============================================================ */

  // useEffect(() => {
  //   if (
  //     actuatorStatus?.water_pump !==
  //       undefined &&
  //     actuatorStatus?.water_pump !== null
  //   ) {
  //     const newStatus =
  //       actuatorStatus.water_pump
  //         ? "ON"
  //         : "OFF";

  //     const prevStatus = pumpStatus;

  //     setPumpStatus(newStatus);

  //     /*
  //      * Once real actuator state arrives,
  //      * optimistic value is no longer needed.
  //      */
  //     setOptimisticPumpStatus(null);

  //     /*
  //      * Don't show alert during first hydration.
  //      *
  //      * Only show alert when the pump had an
  //      * already known state and then changed.
  //      */
  //     if (
  //       prevStatus !== null &&
  //       prevStatus !== newStatus
  //     ) {
  //       const time =
  //         new Date().toLocaleTimeString();

  //       addAlert(
  //         "pump",
  //         newStatus === "ON"
  //           ? "💧 Water Pump ON"
  //           : "💧 Water Pump OFF",
  //         `Water pump ${
  //           newStatus === "ON"
  //             ? "activated"
  //             : "deactivated"
  //         } at ${time}`,
  //         newStatus === "ON"
  //           ? "success"
  //           : "info"
  //       );
  //     }
  //   }
  // }, [
  //   actuatorStatus,
  //   addAlert,
  //   pumpStatus,
  // ]);

useEffect(() => {
  if (
    actuatorStatus?.water_pump === undefined ||
    actuatorStatus?.water_pump === null
  ) {
    return;
  }

  const newStatus = normalizePumpStatus(
    actuatorStatus.water_pump
  );

  const prevStatus = pumpStatus;

  setPumpStatus(newStatus);

  // Real MQTT/cache state aa gaya,
  // isliye optimistic state hata do.
  setOptimisticPumpStatus(null);

  // Initial load par alert mat dikhao.
  if (
    prevStatus !== null &&
    prevStatus !== newStatus
  ) {
    const time =
      new Date().toLocaleTimeString();

    addAlert(
      "pump",
      newStatus === "ON"
        ? "💧 Water Pump ON"
        : "💧 Water Pump OFF",
      `Water pump ${
        newStatus === "ON"
          ? "activated"
          : "deactivated"
      } at ${time}`,
      newStatus === "ON"
        ? "success"
        : "info"
    );
  }
}, [
  actuatorStatus,
  addAlert,
  pumpStatus,
]);
  const normalizePumpStatus = (value) => {
  if (
    value === true ||
    value === 1 ||
    value === "1" ||
    value === "true" ||
    value === "TRUE" ||
    value === "on" ||
    value === "ON"
  ) {
    return "ON";
  }

  return "OFF";
};

  /* ============================================================
     FINAL PUMP DISPLAY VALUE
     
     ONLY ONE declaration.
  ============================================================ */

  const actualPumpStatus = normalizePumpStatus(
  actuatorStatus?.water_pump
);

const displayPumpStatus =
  optimisticPumpStatus ||
  actualPumpStatus;

  

  /* ============================================================
     PUMP TOGGLE
  ============================================================ */

  const performPumpToggle =
    useCallback(async () => {
      if (isPublishing) return;

      if (isDeviceOffline) {
        Alert.alert(
          "Device Offline",
          "Cannot control pump while device is offline."
        );
        return;
      }

      const currentDeviceKey =
        selectedExternalKey;

      if (!currentDeviceKey) {
        Alert.alert(
          "Error",
          "No device selected"
        );
        return;
      }

      const currentPumpStatus =
  normalizePumpStatus(
    actuatorStatus?.water_pump
  ) === "ON";

const newStatus = !currentPumpStatus;

      /*
       * We don't immediately change the actual
       * pump status. MQTT response remains source
       * of truth.
       */
      setIsPublishing(true);

      try {
        const success =
          await toggleDeviceStatus(
            currentDeviceKey,
            "water_pump",
            newStatus
          );

        if (!success) {
          setOptimisticPumpStatus(null);

          setPumpStatus(
            currentPumpStatus
              ? "ON"
              : "OFF"
          );

          Alert.alert(
            "Command Failed",
            "Failed to send pump command."
          );
        } else {
          const time =
            new Date().toLocaleTimeString();

          addAlert(
            "pump",
            newStatus
              ? "💧 Water Pump ON"
              : "💧 Water Pump OFF",
            `Water pump ${
              newStatus
                ? "activated"
                : "deactivated"
            } at ${time}`,
            newStatus
              ? "success"
              : "info"
          );
        }
      } catch (error) {
        console.error(
          "Error toggling pump:",
          error
        );

        setOptimisticPumpStatus(null);

        setPumpStatus(
          currentPumpStatus
            ? "ON"
            : "OFF"
        );
      } finally {
        setIsPublishing(false);
      }
    }, [
      actuatorStatus,
      isPublishing,
      isDeviceOffline,
      selectedExternalKey,
      toggleDeviceStatus,
      addAlert,
    ]);

  /* ============================================================
     TOGGLE PUMP
  ============================================================ */

  const togglePump =
    useCallback(async () => {
      if (
        isPublishing ||
        isModeSwitching
      ) {
        Alert.alert(
          "Busy",
          "Please wait..."
        );
        return;
      }

      if (!isModeLoaded) {
        Alert.alert(
          "Loading",
          "Please wait for system mode to load."
        );
        return;
      }

      if (isDeviceOffline) {
        Alert.alert(
          "Device Offline",
          "Cannot control pump while device is offline."
        );
        return;
      }

      if (isDeviceWaiting) {
        Alert.alert(
          "Connecting",
          "Device is connecting. Please wait..."
        );
        return;
      }

      const canControl =
        checkBeforeActuator(
          "Water Pump"
        );

      if (!canControl) return;

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

  /* ============================================================
     MODE
  ============================================================ */

  const modeIcon =
    isModeSwitching
      ? "⏳"
      : getModeIcon
      ? getModeIcon()
      : isManualMode
      ? "🔧"
      : "🤖";

  const modeColor =
    isModeSwitching
      ? "#FF9800"
      : getModeColor
      ? getModeColor()
      : isManualMode
      ? "#4CAF50"
      : "#FF9800";

  const showMode =
    isModeLoaded &&
    (isDeviceOnline || hasData);

  /* ============================================================
     NO DEVICE LOGIC
     
     IMPORTANT:
     This part still depends on MqttContext.
     
     If availableDevices starts as [] while MQTT is
     initializing, this can still briefly show the
     empty state.
     
     Once MqttContext exposes isDevicesLoaded,
     change this to:
     
     const hasNoDevices =
       isDevicesLoaded &&
       availableDevices?.length === 0;
  ============================================================ */

  const hasNoDevices =
    availableDevices &&
    availableDevices.length === 0;

  /* ============================================================
     ONE-TIME NO DEVICE POPUP
  ============================================================ */

  useEffect(() => {
    if (!hasNoDevices) return;

    const checkPopup = async () => {
      try {
        const shown =
          await AsyncStorage.getItem(
            "no_device_popup_shown"
          );

        if (!shown) {
          setShowNoDevicePopup(true);

          await AsyncStorage.setItem(
            "no_device_popup_shown",
            "true"
          );
        }
      } catch (error) {
        console.error(
          "Failed to check no-device popup:",
          error
        );
      }
    };

    checkPopup();
  }, [hasNoDevices]);

  /* ============================================================
     NO DEVICE POPUP YES
  ============================================================ */

  const handleNoDevicePopupYes =
    () => {
      setShowNoDevicePopup(false);

      router.push(
        "/(main)/devices"
      );
    };

  /* ============================================================
     LAST UPDATED
  ============================================================ */

  const formattedTime =
    formatLastUpdated(
      sensorData?.lastUpdated
    );

  const lastUpdatedLabel =
    formattedTime
      ? isDeviceOnline
        ? ` ${formattedTime}`
        : `Last known: ${formattedTime}`
      : null;

  /* ============================================================
     SENSOR SUMMARY
  ============================================================ */

  const sensorCount =
    SENSOR_CONFIG.length;

  const activeSensors =
    SENSOR_CONFIG.filter(
      (sensor) =>
        sensorData?.[sensor.dataKey] !==
          null &&
        sensorData?.[sensor.dataKey] !==
          undefined
    ).length;

  /* ============================================================
     NO DEVICES EMPTY STATE
  ============================================================ */

  if (hasNoDevices) {
    return (
      <>
        <View
          style={[
            styles.container,
            {
              backgroundColor:
                theme.colors.background,
            },
          ]}
        >
          {/* HEADER */}

          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text
                style={[
                  styles.greeting,
                  {
                    color:
                      theme.colors.text,
                  },
                ]}
              >
                {u_name} 👋
              </Text>
            </View>

            <View style={styles.headerActions}>
              <TouchableOpacity
                onPress={() =>
                  router.push(
                    "/(main)/settings"
                  )
                }
                style={
                  styles.headerIconBtn
                }
                activeOpacity={0.6}
              >
                <Ionicons
                  name="settings-outline"
                  size={20}
                  color={
                    theme.colors
                      .textSecondary
                  }
                />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() =>
                  router.push(
                    "/(main)/profile"
                  )
                }
              >
                <View
                  style={[
                    styles.avatar,
                    {
                      backgroundColor:
                        theme.colors
                          .primary,
                    },
                  ]}
                >
                  <Text
                    style={
                      styles.avatarText
                    }
                  >
                    {user?.name?.charAt(
                      0
                    ) || "F"}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>

          {/* EMPTY STATE */}

          <View style={styles.emptyState}>
            <View
              style={[
                styles.emptyIconWrap,
                {
                  backgroundColor: `${theme.colors.primary}18`,
                },
              ]}
            >
              <Ionicons
                name="hardware-chip-outline"
                size={56}
                color={
                  theme.colors.primary
                }
              />
            </View>

            <Text
              style={[
                styles.emptyTitle,
                {
                  color:
                    theme.colors.text,
                },
              ]}
            >
              No Devices Connected
            </Text>

            <Text
              style={[
                styles.emptyDesc,
                {
                  color:
                    theme.colors
                      .textSecondary,
                },
              ]}
            >
              Add your first AgriArch
              device to start monitoring
              your farm in real time.
            </Text>

            <TouchableOpacity
              onPress={() =>
                router.push(
                  "/(main)/devices"
                )
              }
              style={[
                styles.emptyAddBtn,
                {
                  shadowColor:
                    theme.colors
                      .primaryDark,
                },
              ]}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={[
                  theme.colors.primary,
                  theme.colors.primaryDark,
                ]}
                start={{
                  x: 0,
                  y: 0,
                }}
                end={{
                  x: 1,
                  y: 0,
                }}
                style={
                  styles.emptyAddBtnGradient
                }
              >
                <Ionicons
                  name="add-circle"
                  size={20}
                  color="#FFF"
                />

                <Text
                  style={
                    styles.emptyAddBtnText
                  }
                >
                  Add Your First Device
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>

        {/* ONE-TIME NO DEVICE POPUP */}

        <Modal
          visible={showNoDevicePopup}
          transparent
          animationType="fade"
          onRequestClose={() =>
            setShowNoDevicePopup(false)
          }
        >
          <View
            style={
              styles.noDeviceOverlay
            }
          >
            <View
              style={[
                styles.noDeviceModal,
                {
                  backgroundColor:
                    theme.colors.surface,
                },
              ]}
            >
              <View
                style={[
                  styles.noDeviceIconWrap,
                  {
                    backgroundColor:
                      "#F4433615",
                  },
                ]}
              >
                <Ionicons
                  name="hardware-chip-outline"
                  size={40}
                  color="#F44336"
                />
              </View>

              <Text
                style={[
                  styles.noDeviceTitle,
                  {
                    color:
                      theme.colors.text,
                  },
                ]}
              >
                No Devices Found
              </Text>

              <Text
                style={[
                  styles.noDeviceDesc,
                  {
                    color:
                      theme.colors
                        .textSecondary,
                  },
                ]}
              >
                {
                  "You don't have any devices in your list. Add your first device to start monitoring your farm."
                }
              </Text>

              <View
                style={
                  styles.noDeviceButtons
                }
              >
                <TouchableOpacity
                  style={[
                    styles.noDeviceCancelBtn,
                    {
                      backgroundColor:
                        `${theme.colors.textSecondary}14`,
                    },
                  ]}
                  onPress={() =>
                    setShowNoDevicePopup(
                      false
                    )
                  }
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.noDeviceCancelText,
                      {
                        color:
                          theme.colors.text,
                      },
                    ]}
                  >
                    Later
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={
                    styles.noDeviceYesBtn
                  }
                  onPress={
                    handleNoDevicePopupYes
                  }
                  activeOpacity={0.85}
                >
                  <LinearGradient
                    colors={[
                      theme.colors.primary,
                      theme.colors.primaryDark,
                    ]}
                    start={{
                      x: 0,
                      y: 0,
                    }}
                    end={{
                      x: 1,
                      y: 0,
                    }}
                    style={
                      styles.noDeviceYesGradient
                    }
                  >
                    <Ionicons
                      name="add-circle"
                      size={18}
                      color="#FFF"
                    />

                    <Text
                      style={
                        styles.noDeviceYesText
                      }
                    >
                      Add Device
                    </Text>
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

  return (
    <ScrollView
      ref={scrollRef}
      style={[
        styles.container,
        {
          backgroundColor:
            theme.colors.background,
        },
      ]}
      contentContainerStyle={{
        paddingBottom:
          24 + insets.bottom,
        paddingTop: headerHeight,
      }}
      showsVerticalScrollIndicator={false}
      onScroll={onScroll}
      scrollEventThrottle={16}
    >
      {/* ======================================================
          HEADER
      ====================================================== */}

      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text
            style={[
              styles.greeting,
              {
                color:
                  theme.colors.text,
              },
            ]}
          >
            {u_name}
          </Text>
        </View>

        <View style={styles.headerActions}>
          {showMode && (
            <TouchableOpacity
              style={[
                styles.modePill,
                {
                  backgroundColor:
                    `${modeColor}18`,
                },
              ]}
              onPress={() => {
                if (
                  !isModeSwitching &&
                  !modeLocked &&
                  isConnected
                ) {
                  toggleMode();
                }
              }}
              disabled={
                isModeSwitching ||
                modeLocked ||
                !isConnected
              }
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.modePillText,
                  {
                    color:
                      isModeSwitching
                        ? "#FF9800"
                        : modeColor,
                  },
                ]}
              >
                {isModeSwitching
                  ? "⏳"
                  : modeIcon}{" "}
                {isManualMode
                  ? "Manual"
                  : "Auto"}
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            onPress={() =>
              router.push(
                "/(main)/settings"
              )
            }
            style={
              styles.headerIconBtn
            }
            activeOpacity={0.6}
          >
            <Ionicons
              name="settings-outline"
              size={20}
              color={
                theme.colors
                  .textSecondary
              }
            />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() =>
              router.push(
                "/(main)/profile"
              )
            }
          >
            <View
              style={[
                styles.avatar,
                {
                  backgroundColor:
                    theme.colors
                      .primary,
                },
              ]}
            >
              <Text
                style={
                  styles.avatarText
                }
              >
                {user?.name?.charAt(0) ||
                  "F"}
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      {/* ======================================================
          QUICK SUMMARY CARD
      ====================================================== */}

      <View style={styles.summaryCard}>
        <View style={styles.summaryRow}>
          {/* DEVICE */}

          <View style={styles.summaryItem}>
            <View
              style={[
                styles.summaryIconWrap,
                {
                  backgroundColor:
                    "#4CAF5018",
                },
              ]}
            >
              <Ionicons
                name="hardware-chip-outline"
                size={16}
                color="#4CAF50"
              />
            </View>

            <View>
              <Text
                style={[
                  styles.summaryValue,
                  {
                    color:
                      theme.colors.text,
                  },
                ]}
                numberOfLines={1}
              >
                {externalKey
                  ? "•••••" +
                    externalKey.slice(
                      -5
                    )
                  : "N/A"}
              </Text>

              <Text
                style={[
                  styles.summaryLabel,
                  {
                    color:
                      theme.colors
                        .textSecondary,
                  },
                ]}
              >
                Device
              </Text>
            </View>
          </View>

          <View style={styles.summarySep} />

          {/* SENSORS */}

          <View style={styles.summaryItem}>
            <View
              style={[
                styles.summaryIconWrap,
                {
                  backgroundColor:
                    "#2196F318",
                },
              ]}
            >
              <Ionicons
                name="analytics-outline"
                size={16}
                color="#2196F3"
              />
            </View>

            <View>
              <Text
                style={[
                  styles.summaryValue,
                  {
                    color:
                      theme.colors.text,
                  },
                ]}
              >
                {activeSensors}/
                {sensorCount}
              </Text>

              <Text
                style={[
                  styles.summaryLabel,
                  {
                    color:
                      theme.colors
                        .textSecondary,
                  },
                ]}
              >
                Sensors
              </Text>
            </View>
          </View>

          <View style={styles.summarySep} />

          {/* LAST UPDATED */}

          <View style={styles.summaryItem}>
            <View
              style={[
                styles.summaryIconWrap,
                {
                  backgroundColor:
                    isDeviceOnline
                      ? "#4CAF5018"
                      : "#F4433618",
                },
              ]}
            >
              <Ionicons
                name="radio-outline"
                size={16}
                color={
                  isDeviceOnline
                    ? "#4CAF50"
                    : "#F44336"
                }
              />
            </View>

            <View>
              <Text
                style={[
                  styles.summaryValue,
                  {
                    color:
                      theme.colors.text,
                  },
                ]}
                numberOfLines={1}
              >
                {lastUpdatedLabel ||
                  "No data"}
              </Text>

              <Text
                style={[
                  styles.summaryLabel,
                  {
                    color:
                      theme.colors
                        .textSecondary,
                  },
                ]}
              >
                Last Updated
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* ======================================================
          PUMP CARD
      ====================================================== */}

      {/* <View
        style={
          styles.pumpCardWrapper
        }
      >
        <LinearGradient
          colors={
            isDeviceOffline
              ? [
                  "#78909C",
                  "#546E7A",
                ]
              : displayPumpStatus ===
                "ON"
              ? [
                  "#43A047",
                  "#2E7D32",
                ]
              : [
                  "#EF5350",
                  "#C62828",
                ]
          }
          start={{
            x: 0,
            y: 0,
          }}
          end={{
            x: 1,
            y: 1,
          }}
          style={styles.pumpCard}
        >
          <View
            style={styles.pumpDeco1}
          />

          <View
            style={styles.pumpDeco2}
          />

          <View
            style={styles.pumpContent}
          >
            <View
              style={styles.pumpLeft}
            >
              <View
                style={
                  styles.pumpIconCircle
                }
              >
                <Ionicons
                  name={
                    displayPumpStatus ===
                    "ON"
                      ? "water"
                      : "water-outline"
                  }
                  size={22}
                  color="#FFF"
                />
              </View>

              <View
                style={{
                  flex: 1,
                }}
              >
                <Text
                  style={
                    styles.pumpTitle
                  }
                >
                  Water Pump
                </Text>

                <Text
                  style={
                    styles.pumpSubtitle
                  }
                >
                  {isDeviceOffline
                    ? "Device offline"
                    : isModeSwitching
                    ? "Switching mode..."
                    : isAutoMode
                    ? "Auto mode active"
                    : isDeviceWaiting
                    ? "Connecting..."
                    : displayPumpStatus ===
                      "ON"
                    ? "● Running"
                    : "○ Stopped"}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={[
                styles.pumpToggleBtn,
                (!canPublish ||
                  isPublishing ||
                  isModeSwitching) && {
                  opacity: 0.4,
                },
              ]}
              onPress={togglePump}
              disabled={
                !canPublish ||
                isPublishing ||
                isModeSwitching
              }
              activeOpacity={0.7}
            >
              <View
                style={
                  styles.pumpToggleInner
                }
              >
                <View
                  style={[
                    styles.pumpToggleDot,
                    {
                      backgroundColor:
                        displayPumpStatus ===
                        "ON"
                          ? "#FFF"
                          : "rgba(255,255,255,0.4)",
                    },
                  ]}
                />

                <Text
                  style={
                    styles.pumpToggleText
                  }
                >
                  {displayPumpStatus ===
                  "ON"
                    ? "OFF"
                    : "ON"}
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </View> */}

      {/* ======================================================
    WATER PUMP CARD
====================================================== */}

<View style={styles.pumpCardWrapper}>
  <LinearGradient
    colors={
      displayPumpStatus === "ON"
        ? ["#43A047", "#2E7D32"]
        : ["#78909C", "#546E7A"]
    }
    start={{
      x: 0,
      y: 0,
    }}
    end={{
      x: 1,
      y: 1,
    }}
    style={styles.pumpCard}
  >
    {/* Decorative circles */}
    <View style={styles.pumpDeco1} />
    <View style={styles.pumpDeco2} />

    <View style={styles.pumpContent}>

      {/* LEFT SIDE */}
      <View style={styles.pumpLeft}>

        {/* WATER PUMP ICON */}
        <View style={styles.pumpIconCircle}>
          <Ionicons
            name="water"
            size={24}
            color="#FFFFFF"
          />
        </View>

        <View style={{ flex: 1 }}>

          {/* TITLE */}
          <Text style={styles.pumpTitle}>
            Water Pump
          </Text>

          {/* CURRENT STATUS */}
          <View style={styles.pumpStatusRow}>
            <View
              style={[
                styles.pumpStatusDot,
                {
                  backgroundColor:
                    displayPumpStatus === "ON"
                      ? "#FFFFFF"
                      : "rgba(255,255,255,0.55)",
                },
              ]}
            />

            <Text style={styles.pumpSubtitle}>
              {displayPumpStatus}
            </Text>
          </View>

        </View>
      </View>

      {/* CURRENT ON/OFF STATUS */}
      <TouchableOpacity
        style={[
          styles.pumpToggleBtn,
          (!canPublish ||
            isPublishing ||
            isModeSwitching) && {
            opacity: 0.45,
          },
        ]}
        onPress={togglePump}
        disabled={
          !canPublish ||
          isPublishing ||
          isModeSwitching
        }
        activeOpacity={0.8}
      >
        <View style={styles.pumpToggleInner}>

          <Ionicons
            name="water"
            size={15}
            color="#FFFFFF"
          />

          <Text style={styles.pumpToggleText}>
            {displayPumpStatus}
          </Text>

        </View>
      </TouchableOpacity>

    </View>
  </LinearGradient>
</View>

      {/* ======================================================
          SENSOR HEADER
      ====================================================== */}

      <View
        style={styles.sectionHeader}
      >
        <View
          style={
            styles.sectionTitleRow
          }
        >
          <View
            style={styles.sectionDot}
          />

          <Text
            style={[
              styles.sectionTitle,
              {
                color:
                  theme.colors.text,
              },
            ]}
          >
            Sensors
          </Text>
        </View>

        <TouchableOpacity
          onPress={() =>
            router.push(
              "/(main)/sensor-tabs"
            )
          }
          activeOpacity={0.6}
        >
          <Text
            style={[
              styles.sectionLink,
              {
                color:
                  theme.colors
                    .primary,
              },
            ]}
          >
            View All →
          </Text>
        </TouchableOpacity>
      </View>

      {/* ======================================================
          SENSOR GRID
      ====================================================== */}

      <View
        style={styles.sensorsGrid}
      >
        {SENSOR_CONFIG.map(
          (sensor, index) => (
            <React.Fragment
              key={sensor.id}
            >
              <SensorTile
                sensor={sensor}
                sensorData={sensorData}
                isDeviceOnline={
                  isDeviceOnline
                }
                isDeviceWaiting={
                  isDeviceWaiting
                }
                theme={theme}
                onPress={() =>
                  router.push({
                    pathname:
                      "/(main)/sensor-tabs",
                    params: {
                      type: sensor.id,
                    },
                  })
                }
              />

              {index === 7 && (
                <ValveCard
                  actuatorStatus={
                    actuatorStatus
                  }
                  theme={theme}
                />
              )}
            </React.Fragment>
          )
        )}
      </View>
    </ScrollView>
  );
}

/* ============================================================
   STYLES
============================================================ */

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  /* ----------------------------------------------------------
     HEADER
  ---------------------------------------------------------- */

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 6,
  },

  headerLeft: {
    flex: 1,
    marginRight: 12,
  },

  greeting: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.3,
  },

  headerMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
  },

  deviceName: {
    fontSize: 12,
    flex: 1,
  },

  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  modePill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },

  modePillText: {
    fontSize: 11,
    fontWeight: "700",
  },

  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: "center",
    alignItems: "center",
  },

  avatarText: {
    color: "#FFF",
    fontWeight: "700",
    fontSize: 16,
  },

  connDotRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },

  connDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },

  headerIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor:
      "rgba(0,0,0,0.04)",
    justifyContent: "center",
    alignItems: "center",
  },

  /* ----------------------------------------------------------
     EMPTY STATE
  ---------------------------------------------------------- */

  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingBottom: 60,
  },

  emptyIconWrap: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },

  emptyTitle: {
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 8,
  },

  emptyDesc: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 21,
    marginBottom: 28,
    paddingHorizontal: 8,
  },

  emptyAddBtn: {
    borderRadius: 50,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },

  emptyAddBtnGradient: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 50,
  },

  emptyAddBtnText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "700",
  },

  /* ----------------------------------------------------------
     SUMMARY
  ---------------------------------------------------------- */

  summaryCard: {
    marginHorizontal: 16,
    marginBottom: 14,
    borderRadius: 14,
    paddingRight: 32,
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor:
      "rgba(0,0,0,0.05)",
    paddingVertical: 12,
    paddingHorizontal: 10,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },

  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  summaryItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  summarySep: {
    width: 1,
    height: 28,
    backgroundColor:
      "rgba(0,0,0,0.06)",
    marginHorizontal: 4,
  },

  summaryIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },

  summaryValue: {
    fontSize: 11,
    fontWeight: "700",
  },

  summaryLabel: {
    fontSize: 9,
    fontWeight: "500",
    marginTop: 1,
  },

  /* ----------------------------------------------------------
     PUMP
  ---------------------------------------------------------- */

  pumpCardWrapper: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 18,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 5,
    overflow: "hidden",
  },

  pumpCard: {
    padding: 16,
    borderRadius: 18,
  },

  pumpDeco1: {
    position: "absolute",
    top: -20,
    right: -20,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor:
      "rgba(255,255,255,0.08)",
  },

  pumpDeco2: {
    position: "absolute",
    bottom: -30,
    left: -10,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor:
      "rgba(255,255,255,0.06)",
  },

  pumpContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  pumpLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },

  pumpIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor:
      "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },

  pumpTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFF",
  },

  pumpSubtitle: {
    fontSize: 11,
    color: "rgba(255,255,255,0.85)",
    marginTop: 1,
    fontWeight: "500",
  },

  pumpToggleBtn: {
    width: 60,
    height: 34,
    borderRadius: 17,
    backgroundColor:
      "rgba(255,255,255,0.22)",
    justifyContent: "center",
    alignItems: "center",
  },

  pumpToggleInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },

  pumpToggleDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  pumpToggleText: {
    color: "#FFF",
    fontSize: 12,
    fontWeight: "700",
  },

  /* ----------------------------------------------------------
     SENSOR SECTION
  ---------------------------------------------------------- */

  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginHorizontal: 20,
    marginBottom: 10,
  },

  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  sectionDot: {
    width: 4,
    height: 16,
    borderRadius: 2,
    backgroundColor: "#4CAF50",
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
  },

  sectionLink: {
    fontSize: 12,
    fontWeight: "600",
  },

  sensorsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: SENSOR_PAD,
    gap: SENSOR_GAP,
  },

  sensorCard: {
    width: SENSOR_CARD_W,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },

  sensorCardInner: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    height: 140,
    borderWidth: 1,
    borderColor:
      "rgba(0,0,0,0.05)",
    alignItems: "center",
    justifyContent:
      "space-between",
    paddingVertical: 0,
    overflow: "hidden",
  },

  sensorAccent: {
    width: "100%",
    height: 3,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },

  sensorIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 10,
    marginBottom: 4,
  },

  sensorValue: {
    fontSize: 16,
    fontWeight: "800",
    textAlign: "center",
  },

  sensorUnit: {
    fontSize: 10,
    fontWeight: "600",
    textAlign: "center",
    marginTop: -1,
  },

  sensorLabel: {
    fontSize: 10,
    fontWeight: "500",
    textAlign: "center",
    marginTop: 2,
    marginBottom: 10,
    paddingHorizontal: 4,
  },

  /* ----------------------------------------------------------
     VALVE
  ---------------------------------------------------------- */

  valveCard: {
    width: SENSOR_CARD_W,
    backgroundColor: "#FFF",
    borderRadius: 16,
    height: 140,
    borderWidth: 1,
    borderColor:
      "rgba(0,0,0,0.05)",
    alignItems: "center",
    justifyContent:
      "space-between",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },

  valveSplit: {
    flexDirection: "row",
    width: "100%",
    borderTopWidth: 1,
    borderTopColor:
      "rgba(0,0,0,0.05)",
    paddingVertical: 12,
  },

  valveItem: {
    flex: 1,
    alignItems: "center",
    gap: 4,
    position: "relative",
  },

  valveName: {
    fontSize: 8,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  valveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginVertical: 2,
  },

  valveGlow: {
    position: "absolute",
    width: 20,
    height: 20,
    borderRadius: 10,
    top: "50%",
    marginTop: -13,
    left: "50%",
    marginLeft: -10,
    zIndex: -1,
  },

  valveStatus: {
    fontSize: 10,
    fontWeight: "800",
  },

  valveDividerV: {
    width: 1,
    backgroundColor:
      "rgba(0,0,0,0.06)",
  },

  /* ----------------------------------------------------------
     NO DEVICE POPUP
  ---------------------------------------------------------- */

  noDeviceOverlay: {
    flex: 1,
    backgroundColor:
      "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },

  noDeviceModal: {
    borderRadius: 20,
    padding: 28,
    width: "100%",
    maxWidth: 360,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
  },

  noDeviceIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },

  noDeviceTitle: {
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 8,
    textAlign: "center",
  },

  noDeviceDesc: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 21,
    marginBottom: 24,
    paddingHorizontal: 4,
  },

  noDeviceButtons: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },

  noDeviceCancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: "center",
  },

  noDeviceCancelText: {
    fontSize: 14,
    fontWeight: "600",
  },

  noDeviceYesBtn: {
    flex: 1,
    borderRadius: 12,
    overflow: "hidden",
  },

  noDeviceYesGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 13,
  },

  noDeviceYesText: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "700",
  },
  pumpStatusRow: {
  flexDirection: "row",
  alignItems: "center",
  marginTop: 4,
},

pumpStatusDot: {
  width: 7,
  height: 7,
  borderRadius: 4,
  marginRight: 6,
},
});