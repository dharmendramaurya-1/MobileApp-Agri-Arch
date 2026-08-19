// app/(main)/system-control.jsx — System Control tab
// Shows actuator toggles (pumps, valves) with real device data.
// Toggle is disabled while waiting for GET_STATUS response.
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useRef, useState } from "react";
import {
  Alert,
  Dimensions,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useAlerts } from "../../src/context/AlertContext";
import { useMqtt } from "../../src/context/MqttContext";
import { useScroll, useScrollReset } from "../../src/context/ScrollContext";
import { useSystemMode } from "../../src/context/SystemModeContext";
import { useTheme } from "../../src/context/ThemContext";
import { getDisplayStatus } from "../../src/utils/deviceStatusParser";

const { height } = Dimensions.get("window");

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
    displayName: "Reboot",
    icon: "refresh",
    description: "Reboot acknowledgment",
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

const CATEGORY_TITLES = { pump: "Pumps", valve: "Valves", system: "System" };

export default function SystemControl() {
  const { theme } = useTheme();
  const { onScroll, headerHeight } = useScroll();
  const scrollRef = useRef(null);
  useScrollReset(scrollRef);

  const {
    getSelectedDeviceActuatorStatus,
    getSelectedDeviceOnlineStatus,
    getSelectedDeviceName,
    selectedExternalKey,
    deviceStatusFlags,
    isConnected,
    isLiveData,
    toggleDeviceStatus: mqttToggleDeviceStatus,
    hasReceivedData,
    connectionState,
  } = useMqtt();

  const actuatorStatus = getSelectedDeviceActuatorStatus();
  const isOnline = getSelectedDeviceOnlineStatus();
  const selectedDeviceName = getSelectedDeviceName();

  const {
    isManualMode,
    toggleMode,
  } = useSystemMode();

  const { addAlert } = useAlerts();

  const [updating, setUpdating] = useState(null);
  const [toggleTimes, setToggleTimes] = useState({});

  // ── Build device list from actuator data ──
  const devices = DEVICE_ORDER.filter((k) => k in DEVICE_CONFIG).map((k) => {
    const cfg = DEVICE_CONFIG[k];
    const vb = actuatorStatus[cfg.actuatorKey];
    return {
      id: k,
      displayName: cfg.displayName,
      icon: cfg.icon,
      description: cfg.description,
      category: cfg.category,
      actuatorKey: cfg.actuatorKey,
      vb,
    };
  });

  const grouped = devices.reduce((acc, d) => {
    if (!acc[d.category]) acc[d.category] = [];
    acc[d.category].push(d);
    return acc;
  }, {});

  // ── Connection state ──
  const isNotConnected = connectionState === "idle" || connectionState === "disconnected" || connectionState === "error";
  const isLive = isOnline && isLiveData && isConnected && hasReceivedData;
  const deviceLocked = !isManualMode || !isLive || isNotConnected;

  // ── Mode info ──
  const displayStatus = getDisplayStatus(deviceStatusFlags);
  const rawMode = displayStatus?.mode;
  const modeLabel = rawMode === "AUTO" ? "AUTO" : rawMode === "MANUAL" ? "MANUAL" : null;

  // ── Toggle handler ──
  const handleToggle = async (device) => {
    if (updating) return;
    if (device.vb === null) return;
    if (deviceLocked) return;

    if (device.id === "reboot_ack") {
      Alert.alert("Reboot", "Reboot the system?", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reboot",
          style: "destructive",
          onPress: () => doToggle(device),
        },
      ]);
      return;
    }

    doToggle(device);
  };

  const doToggle = async (device) => {
    if (!selectedExternalKey) {
      Alert.alert("Error", "No device selected");
      return;
    }

    setUpdating(device.id);
    const newVal = !device.vb;
    const time = new Date().toLocaleTimeString();

    try {
      const success = await mqttToggleDeviceStatus(selectedExternalKey, device.id, newVal);
      if (!success) {
        Alert.alert("Error", `Failed to toggle ${device.displayName}`);
      } else {
        setToggleTimes((prev) => ({ ...prev, [device.id]: time }));
        addAlert(
          "device",
          newVal ? `${device.displayName} ON` : `${device.displayName} OFF`,
          `${device.displayName} toggled at ${time}`,
          newVal ? "success" : "info"
        );
      }
    } catch (err) {
      Alert.alert("Error", `Failed to toggle ${device.displayName}`);
    } finally {
      setTimeout(() => setUpdating(null), 500);
    }
  };

  // ── Mode toggle ──
  const handleModeToggle = () => {
    if (isNotConnected) {
      Alert.alert("Not Connected", "Please check your connection.");
      return;
    }
    if (!hasReceivedData) {
      Alert.alert("Waiting", "Please wait for device data.");
      return;
    }
    if (!modeLabel) {
      Alert.alert("Unknown", "Device mode not detected.");
      return;
    }
    toggleMode();
  };

  // ── Theme colors ──
  const primary = theme.colors.primary;
  const cardBg = theme.colors.card || theme.colors.surface || "#FFFFFF";
  const borderC = theme.colors.border || "#E0E0E0";

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        ref={scrollRef}
        style={styles.container}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingBottom: Platform.OS === "ios" ? height * 0.04 : height * 0.04,
            paddingTop: headerHeight,
          },
        ]}
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={[styles.title, { color: theme.colors.text }]}>
              System Control
            </Text>
            <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
              {selectedDeviceName || "No Device"}
              {modeLabel ? ` · ${modeLabel}` : ""}
            </Text>
          </View>
          <View
            style={[
              styles.modePill,
              {
                backgroundColor: isNotConnected
                  ? "#F44336"
                  : isLive
                  ? modeLabel === "MANUAL"
                    ? "#4CAF50"
                    : "#FF9800"
                  : "#9E9E9E",
              },
            ]}
          >
            <Ionicons
              name={
                isNotConnected
                  ? "wifi-outline"
                  : modeLabel === "MANUAL"
                  ? "hand-left-outline"
                  : "sync-outline"
              }
              size={12}
              color="#FFF"
            />
            <Text style={styles.modePillText}>
              {isNotConnected
                ? "OFFLINE"
                : modeLabel
                ? modeLabel
                : "NO DATA"}
            </Text>
          </View>
        </View>

        {/* ── Connection Banner ── */}
        {isNotConnected && (
          <View style={[styles.banner, { backgroundColor: "#F4433612" }]}>
            <Ionicons name="wifi-outline" size={15} color="#F44336" />
            <Text style={[styles.bannerText, { color: "#F44336" }]}>
              Not connected. Check your connection.
            </Text>
          </View>
        )}

        {/* ── Mode Button ── */}
        <TouchableOpacity
          style={[
            styles.modeButton,
            {
              backgroundColor: isNotConnected
                ? "#F44336"
                : isLive
                ? modeLabel === "MANUAL"
                  ? "#4CAF50"
                  : "#FF9800"
                : "#9E9E9E",
            },
          ]}
          onPress={handleModeToggle}
          activeOpacity={0.8}
          disabled={isNotConnected || !hasReceivedData || !modeLabel}
        >
          <View style={styles.modeBtnRow}>
            <Ionicons
              name={modeLabel === "MANUAL" ? "hand-left-outline" : "sync-outline"}
              size={20}
              color="#FFF"
            />
            <Text style={styles.modeBtnTitle}>
              {modeLabel ? `${modeLabel} MODE` : "NO DATA"}
            </Text>
          </View>
          {modeLabel && isLive && (
            <View style={styles.modeTag}>
              <View style={[styles.modeDot, { backgroundColor: "#FFF" }]} />
              <Text style={styles.modeTagText}>
                {modeLabel === "MANUAL" ? "Control Enabled" : "Auto Control"}
              </Text>
            </View>
          )}
          {isLive && <Ionicons name="chevron-forward" size={18} color="#FFF" opacity={0.7} />}
        </TouchableOpacity>

        {/* ── Mode Info ── */}
        {modeLabel && isLive && (
          <View
            style={[
              styles.infoRow,
              {
                backgroundColor:
                  modeLabel === "MANUAL" ? "rgba(76,175,80,0.06)" : "rgba(255,152,0,0.06)",
                borderColor:
                  modeLabel === "MANUAL" ? "rgba(76,175,80,0.15)" : "rgba(255,152,0,0.15)",
              },
            ]}
          >
            <Ionicons
              name="information-circle"
              size={15}
              color={modeLabel === "MANUAL" ? "#4CAF50" : "#FF9800"}
            />
            <Text
              style={[
                styles.infoText,
                { color: modeLabel === "MANUAL" ? "#2E7D32" : "#E65100" },
              ]}
            >
              {modeLabel === "MANUAL"
                ? "Manual mode active. Control each device individually."
                : "Auto mode active. System controls devices automatically."}
            </Text>
          </View>
        )}

        {/* ── Switch CTA ── */}
        {modeLabel && isLive && (
          <TouchableOpacity
            style={[
              styles.switchBtn,
              {
                backgroundColor: modeLabel === "MANUAL" ? "#FFF3E0" : "#E8F5E9",
                borderColor: modeLabel === "MANUAL" ? "#FFB74D" : "#81C784",
              },
            ]}
            onPress={handleModeToggle}
            activeOpacity={0.7}
          >
            <Ionicons
              name={modeLabel === "MANUAL" ? "sync-outline" : "hand-left-outline"}
              size={17}
              color={modeLabel === "MANUAL" ? "#FF9800" : "#4CAF50"}
            />
            <Text
              style={[
                styles.switchBtnText,
                { color: modeLabel === "MANUAL" ? "#E65100" : "#2E7D32" },
              ]}
            >
              {modeLabel === "MANUAL" ? "Switch to AUTO" : "Switch to MANUAL"}
            </Text>
            <Ionicons
              name="chevron-forward"
              size={15}
              color={modeLabel === "MANUAL" ? "#FF9800" : "#4CAF50"}
            />
          </TouchableOpacity>
        )}

        {/* ── Auto Mode Warning ── */}
        {modeLabel === "AUTO" && isLive && (
          <View style={[styles.banner, { backgroundColor: "#FFF3E0" }]}>
            <Ionicons name="lock-closed-outline" size={15} color="#FF9800" />
            <Text style={[styles.bannerText, { color: "#E65100" }]}>
              Control disabled in AUTO mode. Switch to MANUAL to control devices.
            </Text>
          </View>
        )}

        {/* ── Device Key ── */}
        <View style={[styles.keyRow, { backgroundColor: `${theme.colors.textSecondary}0D` }]}>
          <Text style={[styles.keyText, { color: theme.colors.textSecondary }]}>
            Device: {selectedExternalKey || "—"}{" "}
            {isNotConnected ? "🔴" : isLive ? "🟢" : "⚪"}
          </Text>
        </View>

        {/* ── Actuator Groups ── */}
        {Object.entries(grouped).map(([category, items]) => (
          <View key={category} style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>
              {CATEGORY_TITLES[category] || category}
            </Text>

            {items.map((device) => {
              const isToggling = updating === device.id;
              const hasData = device.vb !== null;
              const isOn = device.vb === true;
              const locked = deviceLocked || !hasData || isToggling;

              const statusColor = !hasData
                ? "#9E9E9E"
                : isOn
                ? "#4CAF50"
                : "#757575";

              return (
                <View
                  key={device.id}
                  style={[
                    styles.card,
                    {
                      backgroundColor: cardBg,
                      borderColor: hasData && isOn ? "#4CAF5040" : borderC,
                      borderWidth: hasData && isOn ? 1.5 : 1,
                    },
                  ]}
                >
                  <View style={styles.cardLeft}>
                    <View
                      style={[
                        styles.iconCircle,
                        { backgroundColor: `${statusColor}18` },
                      ]}
                    >
                      <Ionicons
                        name={isOn && hasData ? device.icon : `${device.icon}-outline`}
                        size={24}
                        color={statusColor}
                      />
                    </View>
                    <View style={styles.cardInfo}>
                      <Text style={[styles.cardName, { color: theme.colors.text }]}>
                        {device.displayName}
                      </Text>
                      <Text style={[styles.cardDesc, { color: theme.colors.textSecondary }]}>
                        {device.description}
                      </Text>
                      <View
                        style={[
                          styles.statusChip,
                          { backgroundColor: `${statusColor}14` },
                        ]}
                      >
                        <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                        <Text style={[styles.statusText, { color: statusColor }]}>
                          {!hasData
                            ? "No data"
                            : isOn
                            ? device.id === "reboot_ack"
                              ? "ACK"
                              : "ON"
                            : device.id === "reboot_ack"
                            ? "OFF"
                            : "OFF"}
                        </Text>
                      </View>
                      {toggleTimes[device.id] && (
                        <Text style={[styles.timeText, { color: theme.colors.textSecondary }]}>
                          Toggled: {toggleTimes[device.id]}
                        </Text>
                      )}
                    </View>
                  </View>

                  <View style={styles.cardRight}>
                    {device.id === "reboot_ack" ? (
                      <TouchableOpacity
                        style={[
                          styles.actionBtn,
                          {
                            backgroundColor: locked ? "#E0E0E0" : isOn ? "#FF980020" : "#F5F5F5",
                          },
                        ]}
                        onPress={() => handleToggle(device)}
                        disabled={locked}
                        activeOpacity={0.7}
                      >
                        <Ionicons
                          name="refresh"
                          size={20}
                          color={locked ? "#BDBDBD" : "#FF9800"}
                        />
                      </TouchableOpacity>
                    ) : (
                      <Switch
                        value={isOn}
                        onValueChange={() => handleToggle(device)}
                        trackColor={{ false: "#E0E0E0", true: "#4CAF5060" }}
                        thumbColor={locked ? "#BDBDBD" : isOn ? "#4CAF50" : "#FAFAFA"}
                        disabled={locked}
                      />
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        ))}

        {/* ── Footer ── */}
        <View
          style={[
            styles.footer,
            { backgroundColor: cardBg, borderColor: borderC },
          ]}
        >
          <Text style={[styles.footerText, { color: theme.colors.textSecondary }]}>
            {selectedDeviceName || "No Device"}
          </Text>
          {modeLabel && isLive && (
            <View style={styles.footerStatus}>
              <View
                style={[
                  styles.footerDot,
                  { backgroundColor: modeLabel === "MANUAL" ? "#4CAF50" : "#FF9800" },
                ]}
              />
              <Text style={[styles.footerLabel, { color: theme.colors.textSecondary }]}>
                {modeLabel}
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
  scrollContent: { padding: 16, paddingTop: Platform.OS === "ios" ? 8 : 16 },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  headerLeft: { flex: 1, marginRight: 10 },
  title: { fontSize: 26, fontWeight: "700" },
  subtitle: { fontSize: 13, marginTop: 2, opacity: 0.8 },
  modePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  modePillText: { color: "#FFF", fontSize: 11, fontWeight: "700", letterSpacing: 0.4 },

  // Banners
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: 10,
    marginBottom: 10,
  },
  bannerText: { fontSize: 12, flex: 1, fontWeight: "500" },

  // Mode button
  modeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderRadius: 14,
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  modeBtnRow: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  modeBtnTitle: { color: "#FFF", fontSize: 15, fontWeight: "700", letterSpacing: 0.5 },
  modeTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  modeDot: { width: 7, height: 7, borderRadius: 4 },
  modeTagText: { color: "#FFF", fontSize: 11, fontWeight: "500" },

  // Info row
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
  },
  infoText: { fontSize: 12, flex: 1, fontWeight: "500" },

  // Switch button
  switchBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  switchBtnText: { fontSize: 13, fontWeight: "600" },

  // Device key row
  keyRow: {
    padding: 8,
    borderRadius: 8,
    marginBottom: 12,
  },
  keyText: { fontSize: 11, fontWeight: "500", opacity: 0.8 },

  // Sections
  section: { marginTop: 10 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 8,
    marginLeft: 2,
  },

  // Actuator cards
  card: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderRadius: 14,
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  cardLeft: { flexDirection: "row", alignItems: "center", flex: 1, paddingRight: 12 },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  cardInfo: { flex: 1 },
  cardName: { fontSize: 15, fontWeight: "600", marginBottom: 1 },
  cardDesc: { fontSize: 11, marginBottom: 4, opacity: 0.7 },
  statusChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  statusDot: { width: 5, height: 5, borderRadius: 3, marginRight: 5 },
  statusText: { fontSize: 10, fontWeight: "600", letterSpacing: 0.3 },
  timeText: { fontSize: 9, marginTop: 2, opacity: 0.5 },
  cardRight: {
    justifyContent: "center",
    alignItems: "center",
  },
  actionBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },

  // Footer
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 8,
  },
  footerText: { fontSize: 12, fontWeight: "500" },
  footerStatus: { flexDirection: "row", alignItems: "center", gap: 5 },
  footerDot: { width: 7, height: 7, borderRadius: 4 },
  footerLabel: { fontSize: 11, fontWeight: "500" },
});