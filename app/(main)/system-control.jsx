// app/(main)/system-control.jsx — System Control tab
// MANUAL/AUTO mode switcher + actuator toggles (pumps, valves, reboot)
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useAlerts } from "../../src/context/AlertContext";
import { useMqtt } from "../../src/context/MqttContext";
import { useSystemMode } from "../../src/context/SystemModeContext";
import { useTheme } from "../../src/context/ThemContext";
import { getDisplayStatus } from "../../src/utils/deviceStatusParser";

const { height } = Dimensions.get("window");

// ── Actuator configuration (from the live MQTT message) ─────────────────────
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

// Build the static device list (shape only, no live values yet)
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
  const {
    isConnected,
    actuatorStatus,
    setActuatorStatus,
    publishActuatorStatus,
    externalKey,
    debugMqttState,
    deviceStatusFlags,
    connectionState,
    devices: mqttDevices,
  } = useMqtt();

  const {
    modeDisplay,
    isManualMode,
    toggleMode,
    isSwitching,
    isModeLoaded,
    checkBeforeActuator,
  } = useSystemMode();

  const { addAlert } = useAlerts();

  const [refreshing, setRefreshing] = useState(false);
  const [updating, setUpdating] = useState(null);
  const [deviceToggleTimes, setDeviceToggleTimes] = useState({});
  const [expandedDevice, setExpandedDevice] = useState(null);
  const [devices, setDevices] = useState(buildStaticDeviceList);

  // Get display status from 32-bit flags
  const displayStatus = getDisplayStatus(deviceStatusFlags);

  // Check if offline
  const isOffline = connectionState === "disconnected" || connectionState === "idle";

  // ── Seed actuator list from MQTT ─────────────────────────────────────────
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

  // ── Monitor actuator changes for alerts ──────────────────────────────────
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

  useEffect(() => {
    if (isConnected) {
      console.log("📡 MQTT Connected, actuatorStatus:", actuatorStatus);
      debugMqttState?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected]);

  // ── Actuator toggle ──────────────────────────────────────────────────────
  const handleToggleDevice = async (device) => {
    if (updating === device.id) return;
    if (device.vb === null) return; // still loading real status, ignore taps

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

    // Update local state immediately for UI feedback
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

  // ── Refresh ─────────────────────────────────────────────────────────────
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      if (externalKey && actuatorStatus) {
        const fullStatus = {
          water_pump: actuatorStatus.water_pump || false,
          water_ILvalve: actuatorStatus.water_ILvalve || false,
          water_OLvalve: actuatorStatus.water_OLvalve || false,
          nutrient_pump: actuatorStatus.nutrient_pump || false,
          reboot_ack: actuatorStatus.reboot_ack || false,
          lastUpdated: new Date(),
        };
        await publishActuatorStatus(fullStatus);
      }
    } catch (error) {
      console.error("Refresh error:", error);
    } finally {
      setRefreshing(false);
    }
  };

  // ── Actuator card helpers ───────────────────────────────────────────────
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

  const toggleExpand = (deviceId) => {
    setExpandedDevice(expandedDevice === deviceId ? null : deviceId);
  };

  const primary = theme.colors.primary;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.scrollViewContent,
          { paddingBottom: Platform.OS === "ios" ? height * 0.06 : height * 0.04 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[primary]}
            tintColor={primary}
          />
        }
      >
        {/* ── Header ───────────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={[styles.title, { color: theme.colors.text }]}>
              System Control
            </Text>
            <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
              {isModeLoaded ? `${modeDisplay} mode` : "Waiting for device…"}
            </Text>
          </View>
          <View
            style={[
              styles.modePill,
              { backgroundColor: isManualMode ? "#4CAF50" : "#FF9800" },
            ]}
          >
            <Ionicons
              name={isManualMode ? "hand-left-outline" : "sync-outline"}
              size={12}
              color="#FFF"
            />
            <Text style={styles.modePillText}>
              {isModeLoaded ? modeDisplay.toUpperCase() : "…"}
            </Text>
          </View>
        </View>

        {/* ── Offline banner ───────────────────────────────────────────────── */}
        {isOffline && (
          <View style={[styles.offlineBanner, { backgroundColor: "#FFEBEE" }]}>
            <Ionicons name="alert-circle" size={20} color="#F44336" />
            <Text style={styles.offlineBannerText}>
              Device is offline — live controls are disabled
            </Text>
          </View>
        )}

        {/* Mode button */}
        <TouchableOpacity
          style={[
            styles.modeButton,
            {
              backgroundColor: !isModeLoaded ? "#888" : isManualMode ? primary : "#FF9800",
              shadowColor: !isModeLoaded ? "#888" : isManualMode ? primary : "#FF9800",
              shadowOpacity: !isModeLoaded ? 0.1 : 0.3,
              shadowRadius: 8,
              elevation: 4,
              opacity: isSwitching ? 0.7 : 1,
            },
          ]}
          onPress={toggleMode}
          activeOpacity={0.8}
          disabled={isSwitching || !isModeLoaded || isOffline}
        >
          <View style={styles.modeButtonContent}>
            {isSwitching ? (
              <>
                <ActivityIndicator size="small" color="#FFF" />
                <Text style={styles.modeButtonText}>Switching Mode…</Text>
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
                    style={[styles.modeDot, { backgroundColor: isManualMode ? primary : "#FF9800" }]}
                  />
                  <Text style={styles.modeStatusText}>
                    {isManualMode ? "Control Enabled" : "Auto Control"}
                  </Text>
                </View>
              </>
            )}
          </View>
          {!isSwitching && isModeLoaded && (
            <Ionicons name="chevron-forward" size={20} color="#FFF" opacity={0.7} />
          )}
        </TouchableOpacity>

        {isModeLoaded && !isManualMode && (
          <View style={[styles.modeWarning, { backgroundColor: "#FFF3E0" }]}>
            <Ionicons name="warning-outline" size={16} color="#FF9800" />
            <Text style={[styles.modeWarningText, { color: "#E65100" }]}>
              Manual control disabled. Switch to MANUAL mode to control devices.
            </Text>
          </View>
        )}

        {!isModeLoaded && (
          <View style={[styles.modeWarning, { backgroundColor: "#E3F2FD" }]}>
            <Ionicons name="information-outline" size={16} color="#1976D2" />
            <Text style={[styles.modeWarningText, { color: "#0D47A1" }]}>
              Waiting for system mode from device…
            </Text>
          </View>
        )}

        {/* Actuator groups */}
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
                isOffline;
              const isExpanded = expandedDevice === device.id;
              const toggleTime = deviceToggleTimes[device.id];

              return (
                <TouchableOpacity
                  key={device.id}
                  style={[
                    styles.actuatorCard,
                    {
                      backgroundColor: theme.colors.card,
                      borderColor:
                        !isManualMode || !isModeLoaded || isOffline
                          ? theme.colors.border
                          : device.vb
                          ? "#4CAF50"
                          : theme.colors.border,
                      borderWidth:
                        !isManualMode || !isModeLoaded || isOffline
                          ? 1
                          : device.vb
                          ? 2
                          : 1,
                      opacity: !isManualMode || !isModeLoaded || isOffline ? 0.6 : 1,
                    },
                  ]}
                  onPress={() => toggleExpand(device.id)}
                  activeOpacity={0.7}
                >
                  <View style={styles.actuatorLeft}>
                    <View
                      style={[
                        styles.actuatorIconContainer,
                        {
                          backgroundColor: deviceLocked
                            ? `${theme.colors.textSecondary}20`
                            : `${getDeviceColor(device)}20`,
                        },
                      ]}
                    >
                      <Ionicons
                        name={getDeviceIcon(device)}
                        size={26}
                        color={deviceLocked ? theme.colors.textSecondary : getDeviceColor(device)}
                      />
                    </View>
                    <View style={styles.actuatorInfo}>
                      <Text style={[styles.actuatorName, { color: theme.colors.text }]}>
                        {device.displayName}
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
                            backgroundColor: deviceLocked
                              ? "rgba(117,117,117,0.15)"
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
                                backgroundColor: deviceLocked
                                  ? "#757575"
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
                              color: deviceLocked
                                ? "#757575"
                                : device.vb
                                ? "#4CAF50"
                                : "#757575",
                            },
                          ]}
                        >
                          {isOffline ? "Offline" : getStatusText(device)}
                        </Text>
                      </View>
                      {toggleTime && isConnected && (
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
                          true:
                            isManualMode && isModeLoaded && !isOffline
                              ? "#4CAF50"
                              : theme.colors.border,
                        }}
                        thumbColor={
                          !isManualMode || !isModeLoaded || isOffline
                            ? theme.colors.textSecondary
                            : updating === device.id
                            ? primary
                            : "#FFF"
                        }
                        disabled={deviceLocked}
                      />
                    )}
                  </View>

                  <View style={styles.expandIcon}>
                    <Ionicons
                      name={isExpanded ? "chevron-up" : "chevron-down"}
                      size={18}
                      color={theme.colors.textSecondary}
                    />
                  </View>

                  {isExpanded && deviceStatusFlags && (
                    <View
                      style={[
                        styles.expandedContent,
                        { borderTopColor: theme.colors.border },
                      ]}
                    >
                      <Text style={[styles.expandedTitle, { color: theme.colors.textSecondary }]}>
                        Related Status Flags
                      </Text>
                      <View style={styles.expandedFlags}>
                        {Object.entries(displayStatus)
                          .filter(([key]) => key !== "rawStatus")
                          .slice(0, 8)
                          .map(([key, value]) => {
                            const isOn =
                              value === "YES" ||
                              value === "ON" ||
                              value === "OPEN" ||
                              value === "AUTO";
                            const isOff =
                              value === "NO" ||
                              value === "OFF" ||
                              value === "CLOSED" ||
                              value === "MANUAL";
                            const color =
                              value === "_ _"
                                ? "#999"
                                : isOn
                                ? "#4CAF50"
                                : isOff
                                ? "#F44336"
                                : "#FF9800";
                            const label = key
                              .replace(/([A-Z])/g, " $1")
                              .replace(/^./, (str) => str.toUpperCase());

                            return (
                              <View key={key} style={styles.expandedFlagItem}>
                                <Text
                                  style={[
                                    styles.expandedFlagLabel,
                                    { color: theme.colors.textSecondary },
                                  ]}
                                >
                                  {label}
                                </Text>
                                <Text style={[styles.expandedFlagValue, { color }]}>{value}</Text>
                              </View>
                            );
                          })}
                      </View>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        ))}

        {/* ── MQTT Status Footer ───────────────────────────────────────────── */}
        <View
          style={[
            styles.footer,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <View style={styles.footerRow}>
            <View style={styles.footerStatus}>
              <View
                style={[
                  styles.footerDot,
                  { backgroundColor: isConnected && !isOffline ? "#4CAF50" : "#F44336" },
                ]}
              />
              <Text style={[styles.footerText, { color: theme.colors.textSecondary }]}>
                {isOffline ? "Device Offline" : isConnected ? "MQTT Connected" : "MQTT Disconnected"}
              </Text>
            </View>
            {externalKey && (
              <Text style={[styles.deviceIdText, { color: theme.colors.textSecondary }]}>
                ID: {externalKey.slice(0, 8)}…
              </Text>
            )}
          </View>
          <TouchableOpacity onPress={onRefresh} style={styles.refreshButton}>
            <Ionicons name="refresh-outline" size={18} color={primary} />
            <Text style={[styles.refreshText, { color: primary }]}>Refresh</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollViewContent: { padding: 16, paddingTop: Platform.OS === "ios" ? 8 : 16 },

  // ── Header ─────────────────────────────────────────────────────────────
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

  // ── Offline banner ─────────────────────────────────────────────────────
  offlineBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
  },
  offlineBannerText: {
    color: "#F44336",
    fontWeight: "600",
    fontSize: 13,
    flex: 1,
  },

  // ── Mode control ───────────────────────────────────────────────────────
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
  modeWarning: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: 10,
    marginBottom: 8,
  },
  modeWarningText: { fontSize: 12, flex: 1, fontWeight: "500" },

  // ── Actuator groups ────────────────────────────────────────────────────
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
    position: "relative",
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
    right: 40,
    top: "50%",
    transform: [{ translateY: -15 }],
  },
  switchLoadingBox: {
    width: 51,
    height: 31,
    justifyContent: "center",
    alignItems: "center",
  },
  expandIcon: { position: "absolute", bottom: 8, right: 8 },
  expandedContent: { borderTopWidth: 1, marginTop: 12, paddingTop: 12 },
  expandedTitle: { fontSize: 11, fontWeight: "600", marginBottom: 8 },
  expandedFlags: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  expandedFlagItem: {
    width: "30%",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  expandedFlagLabel: { fontSize: 9 },
  expandedFlagValue: { fontSize: 9, fontWeight: "600" },

  // ── Footer ─────────────────────────────────────────────────────────────
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 8,
  },
  footerRow: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  footerStatus: { flexDirection: "row", alignItems: "center", gap: 8 },
  footerDot: { width: 8, height: 8, borderRadius: 4 },
  footerText: { fontSize: 12, fontWeight: "500" },
  deviceIdText: { fontSize: 10, opacity: 0.6 },
  refreshButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  refreshText: { fontSize: 12, fontWeight: "500" },
});
