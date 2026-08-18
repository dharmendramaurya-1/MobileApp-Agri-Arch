// app/(main)/system-control.jsx — System Control tab
// MANUAL/AUTO mode switcher (routes to Config to actually change mode) + actuator toggles (pumps, valves, reboot)
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { useAlerts } from "../../src/context/AlertContext";
import { useMqtt } from "../../src/context/MqttContext";
import { useScroll, useScrollReset } from "../../src/context/ScrollContext";
import { useSystemMode } from "../../src/context/SystemModeContext";
import { useTheme } from "../../src/context/ThemContext";
import { getDisplayStatus } from "../../src/utils/deviceStatusParser";

const { height } = Dimensions.get("window");

// ── Constants ──
const STATUS_CHECK_TIMEOUT = 2 * 60 * 1000; // 2 minutes

// ── Actuator configuration ────────────────────────────────────────────────────
const DEVICE_CONFIG = {
  water_pump: {
    displayName: "Water Pump",
    icon: "water",
    description: "Main water circulation pump",
    category: "pump",
    actuatorKey: "water_pump",
  },
  water_ILvalve: {
    displayName: "Inlet Valve",
    icon: "arrow-down-circle",
    description: "Water inlet control valve",
    category: "valve",
    actuatorKey: "water_ILvalve",
  },
  water_OLvalve: {
    displayName: "Outlet Valve",
    icon: "arrow-up-circle",
    description: "Water outlet control valve",
    category: "valve",
    actuatorKey: "water_OLvalve",
  },
  nutrient_pump: {
    displayName: "Nutrient Pump",
    icon: "leaf",
    description: "Nutrient solution pump",
    category: "pump",
    actuatorKey: "nutrient_pump",
  },
  reboot_ack: {
    displayName: "Reboot Acknowledged",
    icon: "refresh",
    description: "System reboot acknowledgment",
    category: "system",
    actuatorKey: "reboot_ack",
  },
};

const DEVICE_ORDER = [
  "water_pump",
  "water_ILvalve",
  "water_OLvalve",
  "nutrient_pump",
  "reboot_ack",
];

function buildStaticDeviceList() {
  return DEVICE_ORDER.filter((deviceName) => deviceName in DEVICE_CONFIG).map(
    (deviceName) => {
      const config = DEVICE_CONFIG[deviceName];
      return {
        id: deviceName,
        n: deviceName,
        vb: null,
        displayName: config.displayName,
        icon: config.icon,
        description: config.description,
        category: config.category,
      };
    }
  );
}

export default function SystemControl() {
  const { theme } = useTheme();
  const { onScroll, headerHeight } = useScroll();
  const scrollRef = useRef(null);
  useScrollReset(scrollRef);

  const {
    actuatorStatus,
    setActuatorStatus,
    publishActuatorStatus,
    externalKey,
    deviceStatusFlags,
    devices: mqttDevices,
    getSelectedDeviceName,
    isConnected,
    isLiveData,
  } = useMqtt();

  // ✅ System Mode Context — used only for the actuator-lock guard rail
  const { checkBeforeActuator, modeLocked } = useSystemMode();

  const { addAlert } = useAlerts();

  const [refreshing, setRefreshing] = useState(false);
  const [updating, setUpdating] = useState(null);
  const [deviceToggleTimes, setDeviceToggleTimes] = useState({});
  const [devices, setDevices] = useState(buildStaticDeviceList);
  const [statusCheckDone, setStatusCheckDone] = useState(false);
  const [checkingTimeout, setCheckingTimeout] = useState(null);

  // Get selected device name
  const selectedDeviceName = getSelectedDeviceName();

  // Get display status from 32-bit flags
  const displayStatus = getDisplayStatus(deviceStatusFlags);
  const rawMode = displayStatus?.mode;
  const isModeLoaded = rawMode === "MANUAL" || rawMode === "AUTO";
  const isManualMode = rawMode === "MANUAL";
  const modeDisplay = isModeLoaded
    ? rawMode.charAt(0) + rawMode.slice(1).toLowerCase()
    : "Unknown";

  // ── Device is considered online if we're receiving live data ──
  const isDeviceOnline = isLiveData && isConnected;

  // ── Seed actuator list from MQTT ──
  useEffect(() => {
    if (mqttDevices && mqttDevices.length > 0) {
      setDevices(mqttDevices);
    } else if (actuatorStatus && Object.keys(actuatorStatus).length > 0) {
      const deviceList = DEVICE_ORDER.filter(
        (deviceName) => deviceName in DEVICE_CONFIG
      ).map((deviceName) => {
        const config = DEVICE_CONFIG[deviceName];
        const status = actuatorStatus[config.actuatorKey];
        return {
          id: deviceName,
          n: deviceName,
          vb: status === undefined ? null : status,
          displayName: config.displayName,
          icon: config.icon,
          description: config.description,
          category: config.category,
        };
      });
      setDevices(deviceList);
    }
  }, [mqttDevices, actuatorStatus]);

  // ── Status check timeout (2 minutes) ──
  useEffect(() => {
    // Clear any existing timeout
    if (checkingTimeout) {
      clearTimeout(checkingTimeout);
      setCheckingTimeout(null);
    }

    // Set a timeout to mark status as checked after 2 minutes
    const timeout = setTimeout(() => {
      setStatusCheckDone(true);
      console.log("✅ Auto-marked status as checked after 2 minutes timeout");
    }, STATUS_CHECK_TIMEOUT);

    setCheckingTimeout(timeout);
    return () => clearTimeout(timeout);
  }, []);

  // ── Mark status as checked when mode is loaded ──
  useEffect(() => {
    if (isModeLoaded && !statusCheckDone) {
      setStatusCheckDone(true);
      if (checkingTimeout) {
        clearTimeout(checkingTimeout);
        setCheckingTimeout(null);
      }
      console.log("✅ Status checked (mode loaded)");
    }
  }, [isModeLoaded]);

  // ── Monitor actuator changes for alerts ──
  useEffect(() => {
    if (actuatorStatus) {
      const now = new Date().toLocaleTimeString();
      const changes = {};
      Object.keys(DEVICE_CONFIG).forEach((key) => {
        if (actuatorStatus[DEVICE_CONFIG[key].actuatorKey] !== undefined) {
          changes[key] = now;
        }
      });
      if (Object.keys(changes).length > 0) {
        setDeviceToggleTimes((prev) => ({ ...prev, ...changes }));
      }
    }
  }, [actuatorStatus]);

  // ── Actuator toggle ──
  const handleToggleDevice = async (device) => {
    if (updating === device.id) return;
    if (device.vb === null) return;

    if (!checkBeforeActuator(device.displayName)) {
      return;
    }

    if (device.id === "reboot_ack") {
      Alert.alert(
        "System Reboot",
        "Are you sure you want to reboot the system?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Reboot",
            style: "destructive",
            onPress: () => {
              toggleDeviceStatus(device);
              addAlert(
                "system",
                "🔄 System Reboot Initiated",
                `System reboot acknowledged at ${new Date().toLocaleTimeString()}`,
                "warning"
              );
            },
          },
        ]
      );
      return;
    }

    toggleDeviceStatus(device);
  };

  const toggleDeviceStatus = async (device) => {
    setUpdating(device.id);
    const newStatus = !device.vb;
    const time = new Date().toLocaleTimeString();

    setDevices((prev) =>
      prev.map((d) => (d.id === device.id ? { ...d, vb: newStatus } : d))
    );

    setDeviceToggleTimes((prev) => ({ ...prev, [device.id]: time }));

    try {
      const config = DEVICE_CONFIG[device.id];
      const currentStatus = actuatorStatus || {};

      const fullStatus = {
        water_pump: currentStatus.water_pump || false,
        water_ILvalve: currentStatus.water_ILvalve || false,
        water_OLvalve: currentStatus.water_OLvalve || false,
        nutrient_pump: currentStatus.nutrient_pump || false,
        reboot_ack: currentStatus.reboot_ack || false,
        [config.actuatorKey]: newStatus,
        lastUpdated: new Date(),
      };

      const success = await publishActuatorStatus(fullStatus);

      if (!success) {
        setDevices((prev) =>
          prev.map((d) => (d.id === device.id ? { ...d, vb: !newStatus } : d))
        );
        Alert.alert("Error", `Failed to toggle ${device.displayName}`);
      } else {
        const deviceName = device.displayName;
        addAlert(
          "device",
          newStatus ? `✅ ${deviceName} ON` : `❌ ${deviceName} OFF`,
          `${deviceName} ${newStatus ? "activated" : "deactivated"} at ${time}`,
          newStatus ? "success" : "info"
        );
        await setActuatorStatus(fullStatus);
      }
    } catch (error) {
      console.error("Toggle error:", error);
      setDevices((prev) =>
        prev.map((d) => (d.id === device.id ? { ...d, vb: !newStatus } : d))
      );
      Alert.alert("Error", `Failed to toggle ${device.displayName}`);
    } finally {
      setTimeout(() => {
        setUpdating(null);
      }, 500);
    }
  };

  // ── Mode switch ── always sends the user to Config to change mode ───────
  const handleModeToggle = () => {
    if (modeLocked) {
      Alert.alert('⏳ Busy', 'A mode change is already in progress. Please wait...');
      return;
    }

    if (!isModeLoaded) {
      Alert.alert('⏳ Loading', 'Please wait for system mode to load.');
      return;
    }

    Alert.alert(
      isManualMode ? "🔄 Switch to AUTO Mode" : "🔄 Switch to MANUAL Mode",
      isManualMode
        ? "To switch to AUTO mode, you need to configure the device settings.\n\nThis ensures proper automation parameters are set."
        : "To switch to MANUAL mode, you need to configure the device settings.\n\nThis will allow manual control of actuators.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Go to Config",
          onPress: () => router.push("/(main)/config"),
        },
      ]
    );
  };

  // ── Actuator card helpers ──
  const getDeviceColor = (device) => {
    if (device.vb === null) return theme.colors.textSecondary;
    if (!isManualMode || !isModeLoaded) return theme.colors.textSecondary;
    if (device.id === "reboot_ack") {
      return device.vb ? "#FF9800" : theme.colors.primary;
    }
    return device.vb ? "#4CAF50" : "#757575";
  };

  const getStatusText = (device) => {
    if (device.vb === null) return "Loading";
    if (!isManualMode || !isModeLoaded) return "Locked";
    if (device.id === "reboot_ack") {
      return device.vb ? "Restarting" : "Idle";
    }
    return device.vb ? "Active" : "Inactive";
  };

  const getDeviceIcon = (device) => {
    if (device.vb === null) return `${device.icon}-outline`;
    if (!isManualMode || !isModeLoaded) return `${device.icon}-outline`;
    if (device.id === "reboot_ack") {
      return device.vb ? "sync" : "refresh-outline";
    }
    return device.vb ? device.icon : `${device.icon}-outline`;
  };

  const groupedDevices = devices.reduce((acc, device) => {
    const category = device.category;
    if (!acc[category]) acc[category] = [];
    acc[category].push(device);
    return acc;
  }, {});

  const categoryTitles = {
    pump: "Pumps",
    valve: "Valves",
    system: "System",
  };

  const primary = theme.colors.primary;

  // ── Check if status is still loading ──
  const isLoading = !statusCheckDone;

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        ref={scrollRef}
        style={styles.container}
        contentContainerStyle={[
          styles.scrollViewContent,
          {
            paddingBottom: Platform.OS === "ios" ? height * 0.04 : height * 0.04,
            paddingTop: headerHeight,
          },
        ]}
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        {/* ── Header ───────────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={[styles.title, { color: theme.colors.text }]}>
              System Control
            </Text>
            <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
              {selectedDeviceName || 'No Device'} · {isLoading ? "Loading..." : (isModeLoaded ? modeDisplay : "Unknown")}
            </Text>
          </View>
          <View
            style={[
              styles.modePill,
              { backgroundColor: isLoading ? "#FF9800" : (isManualMode ? "#4CAF50" : "#FF9800") },
            ]}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Ionicons
                name={isManualMode ? "hand-left-outline" : "sync-outline"}
                size={12}
                color="#FFF"
              />
            )}
            <Text style={styles.modePillText}>
              {isLoading ? "Loading…" : (isModeLoaded ? modeDisplay.toUpperCase() : "…")}
            </Text>
          </View>
        </View>

        {/* ── Status Check Info ── */}
        {isLoading && (
          <View style={[styles.infoBanner, { backgroundColor: `${theme.colors.textSecondary}0D` }]}>
            <ActivityIndicator size="small" color={theme.colors.primary} />
            <Text style={[styles.infoBannerText, { color: theme.colors.textSecondary }]}>
              Checking device status... This may take up to 2 minutes.
            </Text>
          </View>
        )}

        {/* ── Mode Button ──────────────────────────────────────────────────── */}
        <TouchableOpacity
          style={[
            styles.modeButton,
            {
              backgroundColor: isLoading ? "#FF9800" : (!isModeLoaded ? "#888" : isManualMode ? "#4CAF50" : "#FF9800"),
              shadowColor: isLoading ? "#FF9800" : (!isModeLoaded ? "#888" : isManualMode ? "#4CAF50" : "#FF9800"),
              shadowOpacity: 0.3,
              shadowRadius: 8,
              elevation: 4,
              opacity: isLoading ? 0.8 : 1,
            },
          ]}
          onPress={handleModeToggle}
          activeOpacity={0.8}
          disabled={!isModeLoaded || isLoading}
        >
          <View style={styles.modeButtonContent}>
            {isLoading ? (
              <>
                <ActivityIndicator size="small" color="#FFF" />
                <Text style={styles.modeButtonText}>Loading Mode…</Text>
              </>
            ) : !isModeLoaded ? (
              <>
                <Ionicons name="time-outline" size={20} color="#FFF" />
                <Text style={styles.modeButtonText}>Loading Mode…</Text>
              </>
            ) : (
              <>
                <Ionicons
                  name={isManualMode ? "hand-left-outline" : "sync-outline"}
                  size={20}
                  color="#FFF"
                />
                <Text style={styles.modeButtonText}>
                  {isManualMode ? `🔧 ${modeDisplay.toUpperCase()} MODE` : `🤖 ${modeDisplay.toUpperCase()} MODE`}
                </Text>
                <View style={styles.modeIndicator}>
                  <View
                    style={[styles.modeDot, { backgroundColor: isManualMode ? "#4CAF50" : "#FF9800" }]}
                  />
                  <Text style={styles.modeStatusText}>
                    {isManualMode ? "Control Enabled" : "Auto Control"}
                  </Text>
                </View>
              </>
            )}
          </View>
          {!isLoading && isModeLoaded && (
            <Ionicons name="chevron-forward" size={20} color="#FFF" opacity={0.7} />
          )}
        </TouchableOpacity>

        {/* ── Mode Info ────────────────────────────────────────────────────── */}
        {!isLoading && isModeLoaded && (
          <View style={[styles.modeInfo, {
            backgroundColor: isManualMode ? 'rgba(76,175,80,0.08)' : 'rgba(255,152,0,0.08)',
            borderColor: isManualMode ? 'rgba(76,175,80,0.2)' : 'rgba(255,152,0,0.2)',
          }]}>
            <Ionicons
              name="information-circle"
              size={16}
              color={isManualMode ? "#4CAF50" : "#FF9800"}
            />
            <Text style={[styles.modeInfoText, {
              color: isManualMode ? "#2E7D32" : "#E65100"
            }]}>
              {isManualMode
                ? "Manual mode active. You can control each device individually."
                : "Auto mode active. System controls devices automatically."}
            </Text>
          </View>
        )}

        {/* ── Switch mode CTA ── always routes to Config ───────────────────── */}
        {!isLoading && isModeLoaded && (
          <TouchableOpacity
            style={[
              styles.quickSwitchButton,
              {
                backgroundColor: isManualMode ? '#FFF3E0' : '#E8F5E9',
                borderColor: isManualMode ? '#FFB74D' : '#81C784',
              }
            ]}
            onPress={handleModeToggle}
            activeOpacity={0.7}
          >
            <Ionicons
              name={isManualMode ? "sync-outline" : "hand-left-outline"}
              size={18}
              color={isManualMode ? "#FF9800" : "#4CAF50"}
            />
            <Text style={[styles.quickSwitchText, {
              color: isManualMode ? "#E65100" : "#2E7D32"
            }]}>
              {isManualMode ? "Switch to AUTO Mode" : "Switch to MANUAL Mode"}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={isManualMode ? "#FF9800" : "#4CAF50"} />
          </TouchableOpacity>
        )}

        {/* ── Mode Warning ────────────────────────────────────────────────── */}
        {!isLoading && isModeLoaded && !isManualMode && (
          <View style={[styles.modeWarning, { backgroundColor: "#FFF3E0" }]}>
            <Ionicons name="warning-outline" size={16} color="#FF9800" />
            <Text style={[styles.modeWarningText, { color: "#E65100" }]}>
              Manual control disabled. Tap "Switch to MANUAL Mode" to control devices.
            </Text>
          </View>
        )}

        {!isLoading && !isModeLoaded && (
          <View style={[styles.modeWarning, { backgroundColor: "#E3F2FD" }]}>
            <Ionicons name="information-outline" size={16} color="#1976D2" />
            <Text style={[styles.modeWarningText, { color: "#0D47A1" }]}>
              Waiting for system mode from device…
            </Text>
          </View>
        )}

        {/* ── Actuator groups ──────────────────────────────────────────────── */}
        {Object.entries(groupedDevices).map(([category, devicesList]) => (
          <View key={category} style={styles.categorySection}>
            <Text style={[styles.categoryTitle, { color: theme.colors.textSecondary }]}>
              {categoryTitles[category] || category}
            </Text>

            {devicesList.map((device) => {
              const isStatusLoading = device.vb === null;
              const deviceLocked =
                updating === device.id ||
                !isManualMode ||
                !isModeLoaded ||
                isStatusLoading ||
                !isDeviceOnline ||
                isLoading;

              const toggleTime = deviceToggleTimes[device.id];

              const showLocked = (!isManualMode && isModeLoaded) || isLoading;

              return (
                <View
                  key={device.id}
                  style={[
                    styles.actuatorCard,
                    {
                      backgroundColor: theme.colors.card,
                      borderColor: showLocked
                        ? theme.colors.border
                        : device.vb
                        ? "#4CAF50"
                        : theme.colors.border,
                      borderWidth: showLocked ? 1 : device.vb ? 2 : 1,
                      opacity: showLocked ? 0.7 : 1,
                    },
                  ]}
                >
                  <View style={styles.actuatorLeft}>
                    <View
                      style={[
                        styles.actuatorIconContainer,
                        {
                          backgroundColor: showLocked
                            ? `${theme.colors.textSecondary}20`
                            : `${getDeviceColor(device)}20`,
                        },
                      ]}
                    >
                      <Ionicons
                        name={getDeviceIcon(device)}
                        size={26}
                        color={showLocked ? theme.colors.textSecondary : getDeviceColor(device)}
                      />
                    </View>
                    <View style={styles.actuatorInfo}>
                      <Text style={[styles.actuatorName, { color: theme.colors.text }]}>
                        {device.displayName}
                        {showLocked && (
                          <Text style={[styles.lockedLabel, { color: '#FF9800' }]}>
                            {' '}🔒
                          </Text>
                        )}
                      </Text>
                      <Text
                        style={[styles.actuatorDescription, { color: theme.colors.textSecondary }]}
                      >
                        {device.description}
                      </Text>
                      <View
                        style={[
                          styles.statusBadge,
                          {
                            backgroundColor: showLocked
                              ? "rgba(255,152,0,0.15)"
                              : device.vb
                              ? "rgba(76,175,80,0.15)"
                              : "rgba(117,117,117,0.15)",
                          },
                        ]}
                      >
                        {isStatusLoading ? (
                          <ActivityIndicator
                            size="small"
                            color={theme.colors.textSecondary}
                            style={styles.statusLoadingSpinner}
                          />
                        ) : (
                          <View
                            style={[
                              styles.statusDotSmall,
                              {
                                backgroundColor: showLocked
                                  ? "#FF9800"
                                  : device.vb
                                  ? "#4CAF50"
                                  : "#757575",
                              },
                            ]}
                          />
                        )}
                        <Text
                          style={[
                            styles.actuatorStatusText,
                            {
                              color: showLocked
                                ? "#FF9800"
                                : device.vb
                                ? "#4CAF50"
                                : "#757575",
                            },
                          ]}
                        >
                          {isLoading ? "Loading..." :
                           showLocked ? "Locked (Auto)" :
                           isStatusLoading ? "Loading" :
                           getStatusText(device)}
                        </Text>
                      </View>
                      {toggleTime && !isLoading && (
                        <Text style={[styles.toggleTime, { color: theme.colors.textSecondary }]}>
                          Last toggled: {toggleTime}
                        </Text>
                      )}
                    </View>
                  </View>

                  <View style={styles.actuatorRight}>
                    {isStatusLoading ? (
                      <View style={styles.switchLoadingBox}>
                        <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                      </View>
                    ) : (
                      <Switch
                        value={device.vb}
                        onValueChange={() => handleToggleDevice(device)}
                        trackColor={{
                          false: theme.colors.border,
                          true: isManualMode && isModeLoaded && !isLoading && isDeviceOnline
                              ? "#4CAF50"
                              : theme.colors.border,
                        }}
                        thumbColor={
                          showLocked || !isDeviceOnline || isLoading
                            ? theme.colors.textSecondary
                            : updating === device.id
                            ? primary
                            : "#FFF"
                        }
                        disabled={deviceLocked || showLocked || !isDeviceOnline || isLoading}
                      />
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        ))}

        {/* ── Footer ────────────────────────────────────────────────────────── */}
        <View
          style={[
            styles.footer,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <Text style={[styles.footerText, { color: theme.colors.textSecondary }]}>
            {isLoading ? "⏳ Loading status..." : (selectedDeviceName || "No Device")}
          </Text>
          {!isLoading && isModeLoaded && (
            <View style={styles.footerStatus}>
              <View
                style={[
                  styles.footerDot,
                  { backgroundColor: isManualMode ? "#4CAF50" : "#FF9800" },
                ]}
              />
              <Text style={[styles.footerStatusText, { color: theme.colors.textSecondary }]}>
                {isManualMode ? "Manual" : "Auto"}
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollViewContent: { padding: 16, paddingTop: Platform.OS === "ios" ? 8 : 16 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  headerLeft: { flex: 1, marginRight: 12 },
  title: { fontSize: 28, fontWeight: "700" },
  subtitle: { fontSize: 13, marginTop: 4, opacity: 0.9 },
  modePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  modePillText: { color: "#FFF", fontSize: 11, fontWeight: "700", letterSpacing: 0.4 },

  infoBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: 10,
    marginBottom: 12,
  },
  infoBannerText: {
    fontSize: 12,
    flex: 1,
    fontWeight: "500",
  },

  modeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderRadius: 14,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    marginBottom: 8,
  },
  modeButtonContent: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  modeButtonText: {
    color: "#FFF",
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  modeIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  modeDot: { width: 8, height: 8, borderRadius: 4 },
  modeStatusText: { color: "#FFF", fontSize: 11, fontWeight: "500" },

  modeInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
  },
  modeInfoText: {
    fontSize: 12,
    flex: 1,
    fontWeight: "500",
  },

  quickSwitchButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  quickSwitchText: {
    fontSize: 13,
    fontWeight: "600",
  },

  modeWarning: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: 10,
    marginBottom: 8,
  },
  modeWarningText: { fontSize: 12, flex: 1, fontWeight: "500" },

  categorySection: { marginTop: 14 },
  categoryTitle: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 10,
    marginLeft: 2,
  },
  actuatorCard: {
    padding: 16,
    borderRadius: 14,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  actuatorLeft: { flexDirection: "row", alignItems: "center", flex: 1, paddingRight: 60 },
  actuatorIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  actuatorInfo: { flex: 1 },
  actuatorName: { fontSize: 16, fontWeight: "600", marginBottom: 2 },
  lockedLabel: { fontSize: 14, fontWeight: "600" },
  actuatorDescription: { fontSize: 12, marginBottom: 4 },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    alignSelf: "flex-start",
  },
  statusDotSmall: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  statusLoadingSpinner: { marginRight: 6, transform: [{ scale: 0.5 }] },
  actuatorStatusText: { fontSize: 11, letterSpacing: 0.3 },
  toggleTime: { fontSize: 9, marginTop: 2, opacity: 0.6 },
  actuatorRight: {
    position: "absolute",
    right: 16,
    top: "50%",
    transform: [{ translateY: -15 }],
  },
  switchLoadingBox: {
    width: 51,
    height: 31,
    justifyContent: "center",
    alignItems: "center",
  },

  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 8,
  },
  footerText: { fontSize: 12, fontWeight: "500" },
  footerStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  footerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  footerStatusText: {
    fontSize: 11,
    fontWeight: "500",
  },
});