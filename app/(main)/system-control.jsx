// app/(main)/system-control.jsx — System Control tab
// Device toggles with inline expandable timing inputs + single Submit button.
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Dimensions,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import SliderControl from "../../components/SettingsSlider";
import { useAlerts } from "../../src/context/AlertContext";
import { useMqtt } from "../../src/context/MqttContext";
import { useScroll, useScrollReset } from "../../src/context/ScrollContext";
import { useSystemMode } from "../../src/context/SystemModeContext";
import { useTheme } from "../../src/context/ThemContext";
import { getDisplayStatus } from "../../src/utils/deviceStatusParser";

const { height } = Dimensions.get("window");

// ── Timing field definitions, grouped by parent device ──
const TIMING_FIELDS = {
  water_pump: [
    { key: "water_pump_on_time", label: "ON Time", shortLabel: "WPONT", unit: "s", min: 1, max: 60, step: 1, defaultVal: 10 },
    { key: "water_pump_interval", label: "Interval", shortLabel: "WPINT", unit: "s", min: 10, max: 300, step: 10, defaultVal: 60 },
  ],
  nutrient_pump: [
    { key: "nutrient_pump_duration", label: "Duration", shortLabel: "NP_DI", unit: "s", min: 10, max: 600, step: 10, defaultVal: 120 },
    { key: "nutrient_pump_on_time", label: "ON Time", shortLabel: "NP_OT", unit: "s", min: 1, max: 30, step: 1, defaultVal: 5 },
  ],
};

// ── Device configuration ──
const DEVICE_CONFIG = {
  water_pump: {
    displayName: "Water Pump",
    icon: "water",
    description: "Main water circulation pump",
    category: "pump",
    actuatorKey: "water_pump",
    color: "#2196F3",
  },
  water_ILvalve: {
    displayName: "Inlet Valve",
    icon: "arrow-down-circle",
    description: "Water inlet control valve",
    category: "valve",
    actuatorKey: "water_ILvalve",
    color: "#00BCD4",
  },
  water_OLvalve: {
    displayName: "Outlet Valve",
    icon: "arrow-up-circle",
    description: "Water outlet control valve",
    category: "valve",
    actuatorKey: "water_OLvalve",
    color: "#FF9800",
  },
  nutrient_pump: {
    displayName: "Nutrient Pump",
    icon: "leaf",
    description: "Nutrient solution pump",
    category: "pump",
    actuatorKey: "nutrient_pump",
    color: "#4CAF50",
  },
  ac_stat: {
    displayName: "AC Status",
    icon: "thermometer",
    description: "AC control status",
    category: "system",
    actuatorKey: "ac_stat",
    color: "#9C27B0",
  },
};

const DEVICE_ORDER = ["water_pump", "water_ILvalve", "water_OLvalve", "nutrient_pump", "ac_stat"];
const CATEGORY_TITLES = { pump: "Pumps", valve: "Valves", system: "System" };
const CATEGORY_ICONS = { pump: "water", valve: "git-network", system: "hardware-chip" };

// ── Format seconds (firmware now sends seconds, not milliseconds) ──
function fmtSec(sec) {
  if (sec === null || sec === undefined) return "--";
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return rem === 0 ? `${min}m` : `${min}m ${rem}s`;
}

// ── Dimming Card Component ──
function DimmingCard({ dimmingLevel, onDimmingChange, locked, theme, cardBg, borderC }) {
  // Firmware sends 0-127, display as 0-100%
  const percentage = dimmingLevel !== null && dimmingLevel !== undefined
    ? Math.round((dimmingLevel / 127) * 100)
    : 0;
  const [localValue, setLocalValue] = useState(percentage);

  // Sync from device when it changes
  useEffect(() => {
    if (dimmingLevel !== null && dimmingLevel !== undefined) {
      setLocalValue(Math.round((dimmingLevel / 127) * 100));
    }
  }, [dimmingLevel]);

  const handleValueChange = (val) => {
    const rounded = Math.round(val);
    setLocalValue(rounded);
    const firmwareValue = Math.round((rounded / 100) * 127);
    onDimmingChange(firmwareValue);
  };

  const accentColor = "#FFC107";
  return (
    <View style={[styles.dimmCard, { backgroundColor: cardBg, borderColor: borderC }]}>
      <View style={styles.dimmHeader}>
        <View style={[styles.iconCircle, { backgroundColor: `${accentColor}15` }]}>
          <Ionicons name="sunny" size={22} color={accentColor} />
        </View>
        <View style={styles.dimmTitleWrap}>
          <Text style={[styles.dimmTitle, { color: theme.colors.text }]}>Light Dimming</Text>
          <Text style={[styles.dimmSubtitle, { color: theme.colors.textSecondary }]}>Adjust grow light intensity</Text>
        </View>
        <View style={styles.dimmValueBadge}>
          <Text style={[styles.dimmValueText, { color: accentColor }]}>{localValue}%</Text>
        </View>
      </View>

      <View style={styles.dimmSliderWrap}>
        <Ionicons name="sunny-outline" size={14} color={theme.colors.textSecondary} />
        <View style={{ flex: 1 }}>
          <SliderControl
            single
            min={0}
            max={100}
            minValue={localValue}
            step={1}
            onChange={handleValueChange}
            tintColor={accentColor}
            thumbColor="#FFFFFF"
            trackColor={`${accentColor}25`}
            disabled={locked}
            formatValue={(v) => `${Math.round(v)}%`}
          />
        </View>
        <Text style={[styles.dimmSliderEnd, { color: theme.colors.textSecondary }]}>100%</Text>
      </View>

      <View style={styles.dimmLabels}>
        {[0, 25, 50, 75, 100].map((v) => (
          <TouchableOpacity
            key={v}
            style={[styles.dimmQuickBtn, {
              backgroundColor: localValue === v ? `${accentColor}20` : "transparent",
              borderColor: localValue === v ? accentColor : borderC,
            }]}
            onPress={() => handleValueChange(v)}
            disabled={locked}
            activeOpacity={0.7}
          >
            <Text style={{
              fontSize: 11,
              fontWeight: "600",
              color: localValue === v ? accentColor : theme.colors.textSecondary,
            }}>{v}%</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

// ── Expandable Actuator Card with inline timing inputs ──
function ActuatorCard({ device, actuatorStatus, isOn, locked, isToggling, toggleTime, onToggle, timingValues, onTimingChange, theme, cardBg, borderC }) {
  // Pump cards start expanded by default
  const [expanded, setExpanded] = useState(() => {
    const timingFields = TIMING_FIELDS[device.id] || [];
    return timingFields.length > 0;
  });
  const expandAnim = useRef(new Animated.Value(1)).current;
  const rotateAnim = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const accentColor = device.color || "#4CAF50";
  const timingFields = TIMING_FIELDS[device.id] || [];
  const hasTiming = timingFields.length > 0;

  // Pulse on status change
  const prevIsOn = useRef(isOn);
  useEffect(() => {
    if (prevIsOn.current !== isOn) {
      prevIsOn.current = isOn;
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.04, duration: 120, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [isOn, pulseAnim]);

  const toggleExpand = () => {
    if (!hasTiming) return;
    const toExpanded = !expanded;
    setExpanded(toExpanded);
    Animated.parallel([
      Animated.spring(expandAnim, { toValue: toExpanded ? 1 : 0, useNativeDriver: false, friction: 8 }),
      Animated.timing(rotateAnim, { toValue: toExpanded ? 1 : 0, duration: 200, useNativeDriver: true }),
    ]).start();
  };

  const chevronRotation = rotateAnim.interpolate({ inputRange: [0, 1], outputRange: ["-90deg", "0deg"] });
  const statusColor = isOn ? accentColor : "#757575";

  return (
    <Animated.View style={[styles.card, {
      backgroundColor: cardBg,
      borderColor: isOn ? `${accentColor}40` : borderC,
      borderWidth: isOn ? 1.5 : 1,
      transform: [{ scale: pulseAnim }],
    }]}>
      {/* ── Main Row ── */}
      <TouchableOpacity
        style={styles.cardMain}
        onPress={toggleExpand}
        activeOpacity={hasTiming ? 0.7 : 1}
        disabled={locked}
      >
        <View style={[styles.iconCircle, { backgroundColor: `${statusColor}12` }]}>
          <Ionicons name={isOn ? device.icon : `${device.icon}-outline`} size={22} color={statusColor} />
        </View>
        <View style={styles.cardInfo}>
          <Text style={[styles.cardName, { color: theme.colors.text }]}>{device.displayName}</Text>
          <Text style={[styles.cardDesc, { color: theme.colors.textSecondary }]}>{device.description}</Text>
          <View style={styles.cardMeta}>
            <View style={[styles.statusChip, { backgroundColor: `${statusColor}14` }]}>
              <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
              <Text style={[styles.statusText, { color: statusColor }]}>
                {isToggling ? "Sending..." : isOn ? "ON" : "OFF"}
              </Text>
            </View>
            {toggleTime && (
              <Text style={[styles.timeText, { color: theme.colors.textSecondary }]}>{toggleTime}</Text>
            )}
          </View>
        </View>
        <View style={styles.cardRight}>
          <Switch
            value={isOn}
            onValueChange={() => onToggle(device)}
            trackColor={{ false: "#E0E0E0", true: `${accentColor}60` }}
            thumbColor={isToggling ? "#BDBDBD" : isOn ? accentColor : "#FAFAFA"}
            disabled={locked || isToggling}
          />
          {hasTiming && (
            <Animated.View style={{ transform: [{ rotate: chevronRotation }], marginLeft: 6 }}>
              <Ionicons name="chevron-down" size={16} color={accentColor} />
            </Animated.View>
          )}
        </View>
      </TouchableOpacity>

      {/* ── Expandable Timing Section ── */}
      {hasTiming && (
        <Animated.View style={{
          maxHeight: expandAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 130] }),
          opacity: expandAnim,
          overflow: "hidden",
        }}>
          <View style={[styles.timingDivider, { backgroundColor: `${accentColor}15` }]} />
          <View style={styles.timingSectionInner}>
            <View style={styles.timingSectionHeader}>
              <Ionicons name="time-outline" size={13} color={accentColor} />
              <Text style={[styles.timingSectionLabel, { color: accentColor }]}>Timing Settings</Text>
              <Text style={[styles.timingSectionUnit, { color: theme.colors.textSecondary }]}>s</Text>
            </View>
            <View style={styles.timingRowInline}>
              {timingFields.map((field) => {
                const currentValue = timingValues[field.key] ?? actuatorStatus?.[field.key] ?? field.defaultVal;
                const displayVal = currentValue !== null && currentValue !== undefined ? String(currentValue) : String(field.defaultVal);
                const preview = fmtSec(currentValue ?? field.defaultVal);

                return (
                  <View key={field.key} style={[styles.timingInputCard, { borderColor: `${accentColor}20`, backgroundColor: `${accentColor}08` }]}>
                    <View style={styles.timingCardLabelRow}>
                      <View style={[styles.timingDot, { backgroundColor: accentColor }]} />
                      <Text style={[styles.timingInputLabel, { color: theme.colors.text }]} numberOfLines={1}>{field.label}</Text>
                  
                      <Text style={[styles.timingInputPreview, { color: accentColor }]}>{preview}</Text>
                    </View>
                    {/* <Text style={[styles.timingInputSub, { color: theme.colors.textSecondary }]}>{field.shortLabel}</Text> */}
                    <TextInput
                      style={[styles.timingInput, { color: theme.colors.text, borderColor: `${accentColor}30`, backgroundColor: '#FFF' }]}
                      value={displayVal}
                      onChangeText={(text) => {
                        const parsed = parseInt(text, 10);
                        if (!isNaN(parsed)) onTimingChange(field.key, parsed);
                        else if (text === "") onTimingChange(field.key, field.defaultVal);
                      }}
                      keyboardType="number-pad"
                      editable={!locked}
                      selectTextOnFocus
                      placeholder={String(field.defaultVal)}
                      placeholderTextColor="#BDBDBD"
                    />
                    </View>
                );
              })}
            </View>
          </View>
        </Animated.View>
      )}
    </Animated.View>
  );
}

// ── Main Component ──
export default function SystemControl() {
  const { theme } = useTheme();
  const { onScroll, headerHeight } = useScroll();
  const scrollRef = useRef(null);
  useScrollReset(scrollRef);

  const {
    getSelectedDeviceActuatorStatus,
    getSelectedDeviceOnlineStatus,
    getSelectedDeviceName,
    getSelectedDeviceCropSettings,
    selectedExternalKey,
    deviceStatusFlags,
    isConnected,
    isLiveData,
    publishActuatorStatus,
    publishSettings,
    hasReceivedData,
    connectionState,
  } = useMqtt();

  const actuatorStatus = getSelectedDeviceActuatorStatus();
  const cropSettings = getSelectedDeviceCropSettings();
  const isOnline = getSelectedDeviceOnlineStatus();
  const selectedDeviceName = getSelectedDeviceName();
  const { isManualMode, toggleMode } = useSystemMode();
  const { addAlert } = useAlerts();

  const [updating, setUpdating] = useState(null);
  const [toggleTimes, setToggleTimes] = useState({});
  const publishTimerRef = useRef(null);

  // ── Timing values — initialized from actuatorStatus, synced on update ──
  const [timingValues, setTimingValues] = useState(() => {
    const init = {};
    for (const [deviceId, fields] of Object.entries(TIMING_FIELDS)) {
      for (const f of fields) {
        init[f.key] = actuatorStatus?.[f.key] ?? f.defaultVal;
      }
    }
    return init;
  });

  // Sync timing values when actuatorStatus updates (from device data)
  useEffect(() => {
    setTimingValues((prev) => {
      const updated = { ...prev };
      let changed = false;
      for (const [deviceId, fields] of Object.entries(TIMING_FIELDS)) {
        for (const f of fields) {
          const deviceVal = actuatorStatus?.[f.key];
          if (deviceVal !== null && deviceVal !== undefined && deviceVal !== prev[f.key]) {
            updated[f.key] = deviceVal;
            changed = true;
          }
        }
      }
      return changed ? updated : prev;
    });
  }, [actuatorStatus]);

  // Build device list
  const devices = DEVICE_ORDER.filter((k) => k in DEVICE_CONFIG).map((k) => {
    const cfg = DEVICE_CONFIG[k];
    const vb = actuatorStatus[cfg.actuatorKey] ?? false;
    return { id: k, ...cfg, vb };
  });

  const grouped = devices.reduce((acc, d) => {
    if (!acc[d.category]) acc[d.category] = [];
    acc[d.category].push(d);
    return acc;
  }, {});

  // Clear updating when actuatorStatus changes
  const prevActuatorRef = useRef(actuatorStatus);
  useEffect(() => {
    if (updating && prevActuatorRef.current !== actuatorStatus) {
      setUpdating(null);
    }
    prevActuatorRef.current = actuatorStatus;
  }, [actuatorStatus, updating]);

  // Connection state
  const isNotConnected = connectionState === "idle" || connectionState === "disconnected" || connectionState === "error";
  const isLive = isOnline && isConnected && hasReceivedData;
  // ✅ Only lock for connection issues — NOT for AUTO mode (popup handles that)
  const deviceLocked = !isOnline || !isConnected || isNotConnected;

  const displayStatus = getDisplayStatus(deviceStatusFlags);
  const rawMode = displayStatus?.mode;
  const modeLabel = rawMode === "AUTO" ? "AUTO" : rawMode === "MANUAL" ? "MANUAL" : null;

  // ── Timing change handler ──
  const handleTimingChange = useCallback((timingKey, value) => {
    setTimingValues((prev) => ({ ...prev, [timingKey]: value }));
  }, []);

  // ── Dimming handler — publishes on change (debounced) ──
  const handleDimmingChange = useCallback((firmwareValue) => {
    if (!selectedExternalKey) return;
    // ✅ If AUTO mode — show popup
    if (!isManualMode) {
      Alert.alert(
        "🤖 AUTO Mode Active",
        "Cannot change dimming while system is in AUTO mode.\n\nSwitch to MANUAL mode?",
        [
          { text: "No", style: "cancel" },
          { text: "Yes, Go to Settings", onPress: () => router.push("/(main)/settings") },
        ]
      );
      return;
    }
    if (deviceLocked) return;
    // Debounce: clear previous timer
    if (publishTimerRef.current) clearTimeout(publishTimerRef.current);
    publishTimerRef.current = setTimeout(async () => {
      try {
        // Publish dimming as part of crop settings (Dimm field)
        const currentCropSettings = cropSettings || {};
        await publishSettings(selectedExternalKey, { ...currentCropSettings, dimming: firmwareValue });
        const time = new Date().toLocaleTimeString();
        addAlert("device", "☀️ Dimming Updated", `Light dimming set to ${Math.round((firmwareValue / 127) * 100)}% at ${time}`, "success");
      } catch (err) {
        console.error("Dimming publish error:", err);
      }
    }, 500); // 500ms debounce
  }, [deviceLocked, selectedExternalKey, cropSettings, publishSettings, addAlert]);

  // ── Mode toggle ──
  const cardBg = theme.colors.card || theme.colors.surface || "#FFFFFF";
  const borderC = theme.colors.border || "#E0E0E0";

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        ref={scrollRef}
        style={styles.container}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: 24, paddingTop: headerHeight },
        ]}
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={[styles.title, { color: theme.colors.text }]}>System Control</Text>
            {/* <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
              {selectedDeviceName || "No Device"}
              {modeLabel ? ` · ${modeLabel}` : ""}
            </Text> */}
          </View>
          <TouchableOpacity
            style={[styles.modePill, {
              backgroundColor: isNotConnected ? "#F44336" : isLive ? (modeLabel === "MANUAL" ? "#4CAF50" : "#FF9800") : "#9E9E9E",
            }]}
            onPress={() => router.push("/(main)/settings")}
            activeOpacity={0.7}
          >
            <Ionicons name={isNotConnected ? "wifi-outline" : modeLabel === "MANUAL" ? "hand-left-outline" : "sync-outline"} size={12} color="#FFF" />
            <Text style={styles.modePillText}>
              {isNotConnected ? "OFFLINE" : modeLabel ? modeLabel : "NO DATA"}
            </Text>
            <Ionicons name="chevron-forward" size={10} color="#FFF" opacity={0.7} />
          </TouchableOpacity>
        </View>

        {/* ── Connection Banner ── */}
        {isNotConnected && (
          <View style={[styles.banner, { backgroundColor: "#F4433612" }]}>
            <Ionicons name="wifi-outline" size={15} color="#F44336" />
            <Text style={[styles.bannerText, { color: "#F44336" }]}>Not connected. Check your connection.</Text>
          </View>
        )}

        {/* ── Dimming Card ── */}
        <DimmingCard
          dimmingLevel={deviceStatusFlags?.dimmingLevel ?? null}
          onDimmingChange={handleDimmingChange}
          locked={deviceLocked}
          theme={theme}
          cardBg={cardBg}
          borderC={borderC}
        />

        {/* ── Actuator Groups ── */}
        {Object.entries(grouped).map(([category, items]) => (
          <View key={category} style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name={CATEGORY_ICONS[category] || "grid"} size={14} color={theme.colors.textSecondary} />
              <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>
                {CATEGORY_TITLES[category] || category}
              </Text>
            </View>
            {items.map((device) => (
              <ActuatorCard
                key={device.id}
                device={device}
                actuatorStatus={actuatorStatus}
                isOn={device.vb === true}
                locked={deviceLocked}
                isToggling={updating === device.id}
                toggleTime={toggleTimes[device.id]}
                onToggle={(d) => {
                  if (!selectedExternalKey) { Alert.alert("Error", "No device selected"); return; }
                  // ✅ If AUTO mode — show popup instead of silently blocking
                  if (!isManualMode) {
                    Alert.alert(
                      "🤖 AUTO Mode Active",
                      `Cannot control "${d.displayName}" while system is in AUTO mode.\n\nSwitch to MANUAL mode to control devices?`,
                      [
                        { text: "No", style: "cancel" },
                        { text: "Yes, Go to Settings", onPress: () => router.push("/(main)/settings") },
                      ]
                    );
                    return;
                  }
                  if (deviceLocked) return;
                  setUpdating(d.id);
                  const newVal = !d.vb;
                  const time = new Date().toLocaleTimeString();
                  // Build status with current toggles (previous timing preserved by MqttContext)
                  const fullStatus = {};
                  for (const dev of devices) {
                    fullStatus[dev.actuatorKey] = dev.id === d.id ? newVal : dev.vb;
                  }
                  for (const [deviceId, fields] of Object.entries(TIMING_FIELDS)) {
                    for (const f of fields) {
                      fullStatus[f.key] = timingValues[f.key] ?? f.defaultVal;
                    }
                  }
                  publishActuatorStatus(selectedExternalKey, fullStatus).then((success) => {
                    if (success) {
                      setToggleTimes((prev) => ({ ...prev, [d.id]: time }));
                      addAlert("device", newVal ? `${d.displayName} ON` : `${d.displayName} OFF`,
                        `${d.displayName} toggled at ${time}`, newVal ? "success" : "info");
                    } else {
                      Alert.alert("Error", `Failed to toggle ${d.displayName}`);
                    }
                  }).catch(() => {
                    Alert.alert("Error", `Failed to toggle ${d.displayName}`);
                  }).finally(() => setUpdating(null));
                }}
                timingValues={timingValues}
                onTimingChange={handleTimingChange}
                theme={theme}
                cardBg={cardBg}
                borderC={borderC}
              />
            ))}
          </View>
        ))}

        {/* ── Footer ── */}
        {/* <View style={[styles.footer, { backgroundColor: cardBg, borderColor: borderC }]}>
          <Text style={[styles.footerText, { color: theme.colors.textSecondary }]}>
            {selectedDeviceName || "No Device"}
          </Text>
          {modeLabel && isLive && (
            <View style={styles.footerStatus}>
              <View style={[styles.footerDot, { backgroundColor: modeLabel === "MANUAL" ? "#4CAF50" : "#FF9800" }]} />
              <Text style={[styles.footerLabel, { color: theme.colors.textSecondary }]}>{modeLabel}</Text>
            </View>
          )}
        </View> */}
      </ScrollView>
    </View>
  );
}

// ── Styles ──
const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 16, paddingTop: Platform.OS === "ios" ? 8 : 16 },

  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  headerLeft: { flex: 1, marginRight: 10 },
  title: { fontSize: 26, fontWeight: "700" },
  subtitle: { fontSize: 13, marginTop: 2, opacity: 0.8 },
  modePill: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12,
  },
  modePillText: { color: "#FFF", fontSize: 11, fontWeight: "700", letterSpacing: 0.4 },

  banner: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: 10, marginBottom: 10 },
  bannerText: { fontSize: 12, flex: 1, fontWeight: "500" },

  // Sections
  section: { marginTop: 10 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8, marginLeft: 2 },
  sectionTitle: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 },

  // Actuator cards
  card: {
    borderRadius: 14, marginBottom: 8,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 2, elevation: 1,
    overflow: "hidden",
  },
  cardMain: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14,
  },
  iconCircle: {
    width: 42, height: 42, borderRadius: 21,
    justifyContent: "center", alignItems: "center", marginRight: 12,
  },
  cardInfo: { flex: 1, paddingRight: 12 },
  cardName: { fontSize: 15, fontWeight: "600", marginBottom: 1 },
  cardDesc: { fontSize: 11, marginBottom: 4, opacity: 0.7 },
  cardMeta: { flexDirection: "row", alignItems: "center", gap: 8 },
  statusChip: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, alignSelf: "flex-start",
  },
  statusDot: { width: 5, height: 5, borderRadius: 3, marginRight: 5 },
  statusText: { fontSize: 10, fontWeight: "600", letterSpacing: 0.3 },
  timeText: { fontSize: 9, opacity: 0.5 },
  cardRight: { flexDirection: "row", alignItems: "center", gap: 6 },

  // Inline timing section (inside card)
  timingDivider: { height: 1, marginHorizontal: 14 },
  timingSectionInner: { padding: 14, paddingTop: 10 },
  timingSectionHeader: {
    flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10,
  },
  timingSectionLabel: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, flex: 1 },
  timingSectionUnit: { fontSize: 10, fontWeight: "500" },

  // Timing inline row (side by side)
  timingRowInline: {
    flexDirection: "row",
    gap: 10,
  },
  timingInputCard: {
    flex: 1,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    overflow: "hidden",
  },
  timingCardLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 4,
  },
  timingDot: { width: 5, height: 5, borderRadius: 3 },
  timingInputLabel: { fontSize: 11, fontWeight: "600", flexShrink: 1 },
  timingInputSub: { fontSize: 9, fontWeight: "600", opacity: 0.5, marginBottom: 6 },
  timingInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
  },
  timingInputPreview: { fontSize: 10, fontWeight: "700", textAlign: "right",  },

  // Footer
  footer: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    padding: 12, borderRadius: 10, borderWidth: 1, marginTop: 14, marginBottom: 8,
  },
  footerText: { fontSize: 12, fontWeight: "500" },
  footerStatus: { flexDirection: "row", alignItems: "center", gap: 5 },
  footerDot: { width: 7, height: 7, borderRadius: 4 },
  footerLabel: { fontSize: 11, fontWeight: "500" },

  // Dimming Card
  dimmCard: {
    borderRadius: 14, marginBottom: 14,
    borderWidth: 1, padding: 16,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  dimmHeader: {
    flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14,
  },
  dimmTitleWrap: { flex: 1 },
  dimmTitle: { fontSize: 15, fontWeight: "700" },
  dimmSubtitle: { fontSize: 11, marginTop: 1, opacity: 0.7 },
  dimmValueBadge: {
    backgroundColor: "rgba(255,193,7,0.12)", borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 4, minWidth: 48, alignItems: "center",
  },
  dimmValueText: { fontSize: 16, fontWeight: "800" },
  dimmSliderWrap: {
    flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12,
  },
  dimmSliderEnd: { fontSize: 11, fontWeight: "600", minWidth: 32, textAlign: "right" },
  dimmLabels: {
    flexDirection: "row", justifyContent: "space-between", gap: 6,
  },
  dimmQuickBtn: {
    flex: 1, alignItems: "center", paddingVertical: 6,
    borderRadius: 8, borderWidth: 1,
  },
});
