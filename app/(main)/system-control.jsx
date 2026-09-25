// app/(main)/system-control.jsx — System Control tab
// Device toggles with inline expandable timing inputs + single Submit button.
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Dimensions,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import SliderControl from "../../components/SettingsSlider";
import { useMqtt } from "../../src/context/MqttContext";
import { useScroll, useScrollReset } from "../../src/context/ScrollContext";
import { useSystemMode } from "../../src/context/SystemModeContext";
import { useTankSafety } from "../../src/context/TankSafetyContext";
import { useTheme } from "../../src/context/ThemContext";
import { getDisplayStatus } from "../../src/utils/deviceStatusParser";

// ✅ Import SVG icons
import {
  InletValveIcon,
  OutletValveIcon,
  WaterPumpIcon,
} from "../../components/SvgIcons";

const { height } = Dimensions.get("window");

// ── Device configuration with SVG icons ──
const DEVICE_CONFIG = {
  water_pump: {
    displayName: "Water Pump",
    icon: "water",
    description: "Main water circulation pump",
    category: "pump",
    actuatorKey: "water_pump",
    color: "#2196F3",
    svgIcon: WaterPumpIcon,
  },
  water_ILvalve: {
    displayName: "Inlet Valve",
    icon: "arrow-down-circle",
    description: "Water inlet control valve",
    category: "valve",
    actuatorKey: "water_ILvalve",
    color: "#00BCD4",
    svgIcon: InletValveIcon,
  },
  water_OLvalve: {
    displayName: "Outlet Valve",
    icon: "arrow-up-circle",
    description: "Water outlet control valve",
    category: "valve",
    actuatorKey: "water_OLvalve",
    color: "#FF9800",
    svgIcon: OutletValveIcon,
  },
  nutrient_pump: {
    displayName: "Nutrient Pump",
    icon: "leaf",
    description: "Nutrient solution pump",
    category: "pump",
    actuatorKey: "nutrient_pump",
    color: "#4CAF50",
    svgIcon: WaterPumpIcon,
  },
  ac_stat: {
    displayName: "AC Status",
    icon: "thermometer",
    description: "AC control status",
    category: "system",
    actuatorKey: "ac_stat",
    color: "#9C27B0",
    svgIcon: null,
  },
};

const DEVICE_ORDER = ["water_pump", "water_ILvalve", "water_OLvalve", "nutrient_pump", "ac_stat"];
const CATEGORY_TITLES = { pump: "Pumps", valve: "Valves", system: "System" };
const CATEGORY_ICONS = { pump: "water", valve: "git-network", system: "hardware-chip" };
const CONTROL_COLORS = {
  primary: "#2E7D32",
  secondary: "#43A047",
  accent: "#0288D1",
  soft: "#EAF5EC",
};



// ── Dimming Card Component ──
function DimmingCard({
  dimmingLevel,
  onLightChange,
  ledOn,
  locked,
  theme,
  cardBg,
  borderC,
}) {
  const parseLevel = (val) => {
    if (val !== null && val !== undefined && !isNaN(val)) {
      return Math.max(0, Math.min(100, Math.round(Number(val))));
    }
    return null;
  };

  const confirmedLevel = parseLevel(dimmingLevel);
  // Confirmed light state strictly from device response:
  const isConfirmedOn = confirmedLevel !== null ? confirmedLevel > 0 : Boolean(ledOn);

  const initialVal = confirmedLevel ?? (isConfirmedOn ? 100 : 0);
  const [localValue, setLocalValue] = useState(initialVal);
  const [isSwitchPending, setIsSwitchPending] = useState(false);
  const isSlidingRef = useRef(false);
  const slidingTimerRef = useRef(null);

  // Sync from incoming device status only if user is not actively dragging the slider
  useEffect(() => {
    if (!isSlidingRef.current) {
      const parsed = parseLevel(dimmingLevel);
      if (parsed !== null) {
        setLocalValue(parsed);
      }
    }
    // Device response arrived -> clear pending switch state
    setIsSwitchPending(false);
  }, [dimmingLevel, ledOn]);

  // Clean up debounce timer on unmount
  useEffect(() => {
    return () => {
      if (slidingTimerRef.current) {
        clearTimeout(slidingTimerRef.current);
      }
    };
  }, []);

  // Safety fallback: if no response arrives within 8 seconds, clear pending state
  useEffect(() => {
    if (isSwitchPending) {
      const timer = setTimeout(() => {
        setIsSwitchPending(false);
      }, 8000);
      return () => clearTimeout(timer);
    }
  }, [isSwitchPending]);

  // Real-time slider drag: update UI smoothly without spamming MQTT payloads
  const handleSliderChange = (val) => {
    const rounded = Math.max(0, Math.min(100, Math.round(val)));
    isSlidingRef.current = true;
    setLocalValue(rounded);

    // Debounce fallback: if user pauses finger in place for 600ms, send once
    if (slidingTimerRef.current) {
      clearTimeout(slidingTimerRef.current);
    }
    slidingTimerRef.current = setTimeout(() => {
      isSlidingRef.current = false;
      onLightChange(rounded, true);
    }, 600);
  };

  // User released touch / stopped sliding: send payload ONCE immediately
  const handleSlidingComplete = (val) => {
    if (slidingTimerRef.current) {
      clearTimeout(slidingTimerRef.current);
      slidingTimerRef.current = null;
    }
    isSlidingRef.current = false;
    const rounded = Math.max(0, Math.min(100, Math.round(val ?? localValue)));
    setLocalValue(rounded);
    onLightChange(rounded, true);
  };

  // Quick % Pill tap (immediate send)
  const handlePillSelect = (v) => {
    if (slidingTimerRef.current) {
      clearTimeout(slidingTimerRef.current);
      slidingTimerRef.current = null;
    }
    isSlidingRef.current = false;
    const rounded = Math.max(0, Math.min(100, Math.round(v)));
    setLocalValue(rounded);
    onLightChange(rounded, true);
  };

  // Light Switch toggle: does NOT change UI immediately!
  // It keeps the SAME state until device response arrives!
  const handleSwitchToggle = () => {
    if (locked || isSwitchPending) return;
    if (slidingTimerRef.current) {
      clearTimeout(slidingTimerRef.current);
      slidingTimerRef.current = null;
    }
    isSlidingRef.current = false;

    // Target dimming:
    // If currently confirmed ON -> target is 0 (OFF)
    // If currently confirmed OFF -> target is 100 (or previous localValue if > 0)
    const targetDimming = isConfirmedOn ? 0 : (localValue > 0 ? localValue : 100);

    // Keep switch in SAME state and show Sending... until response comes!
    setIsSwitchPending(true);
    const ok = onLightChange(targetDimming, true);
    if (ok === false) {
      setIsSwitchPending(false);
    }
  };

  const accentColor = CONTROL_COLORS.accent;
  const ledColor = "#FFC107";

  return (
    <View style={[styles.dimmCard, { backgroundColor: cardBg, borderColor: borderC }]}>

      {/* ── Header Row: icon + title + % badge ── */}
      <View style={styles.dimmHeader}>
        <View style={[styles.dimmIconCircle, { backgroundColor: `${accentColor}15` }]}>
          <Ionicons name="sunny" size={20} color={accentColor} />
        </View>
        <View style={styles.dimmTitleWrap}>
          <Text style={[styles.dimmTitle, { color: theme.colors.text }]}>Light Dimming</Text>
          <Text style={[styles.dimmSubtitle, { color: theme.colors.textSecondary }]}>Adjust grow light intensity</Text>
        </View>
        <View style={[styles.dimmValueBadge, { backgroundColor: `${accentColor}12` }]}>
          <Text style={[styles.dimmValueText, { color: accentColor }]}>{localValue}%</Text>
        </View>
      </View>

      {/* ── Slider Row ── */}
      <View style={styles.dimmSliderRow}>
        <Ionicons name="sunny-outline" size={13} color={theme.colors.textSecondary} style={{ marginTop: 1 }} />
        <View style={styles.dimmSliderFlex}>
          <SliderControl
            single
            min={0}
            max={100}
            minValue={localValue}
            step={1}
            onChange={handleSliderChange}
            onSlidingComplete={handleSlidingComplete}
            tintColor={accentColor}
            thumbColor="#FFFFFF"
            trackColor={`${accentColor}22`}
            disabled={locked}
            formatValue={(v) => `${Math.round(v)}%`}
          />
        </View>
        <Text style={[styles.dimmSliderEndLabel, { color: theme.colors.textSecondary }]}>100%</Text>
      </View>

      {/* ── Quick-select % Pills ── */}
      <View style={styles.dimmPillsRow}>
        {[0, 25, 50, 75, 100].map((v) => (
          <TouchableOpacity
            key={v}
            style={[
              styles.dimmPill,
              {
                backgroundColor: localValue === v ? `${accentColor}18` : theme.dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
                borderColor: localValue === v ? accentColor : borderC,
              },
            ]}
            onPress={() => handlePillSelect(v)}
            disabled={locked}
            activeOpacity={0.7}
          >
            <Text
              style={{
                fontSize: 11,
                fontWeight: localValue === v ? "700" : "500",
                color: localValue === v ? accentColor : theme.colors.textSecondary,
              }}
            >
              {v}%
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Light Switch Row (State updates ONLY when device response arrives) ── */}
      <View style={[styles.ledRow, { borderTopColor: borderC }]}>
        {/* Icon */}
        <View
          style={[
            styles.ledIconCircle,
            { backgroundColor: isConfirmedOn ? `${ledColor}20` : theme.dark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)" },
          ]}
        >
          <Ionicons
            name={isConfirmedOn ? "bulb" : "bulb-outline"}
            size={18}
            color={isConfirmedOn ? ledColor : theme.colors.textSecondary}
          />
        </View>

        {/* Label */}
        <View style={styles.ledTextWrap}>
          <Text style={[styles.ledLabel, { color: theme.colors.text }]}>Light Switch</Text>
          <Text style={[styles.ledSub, { color: isSwitchPending ? theme.colors.textSecondary : isConfirmedOn ? ledColor : theme.colors.textSecondary }]}>
            {isSwitchPending
              ? "Sending..."
              : isConfirmedOn
              ? `● ON (${confirmedLevel ?? localValue}%)`
              : "○ OFF (0%)"}
          </Text>
        </View>

        {/* Switch: remains in same state until device response arrives */}
        <Switch
          value={isConfirmedOn}
          onValueChange={handleSwitchToggle}
          trackColor={{ false: "#E0E0E0", true: `${ledColor}80` }}
          thumbColor={isSwitchPending ? "#BDBDBD" : isConfirmedOn ? ledColor : "#FAFAFA"}
          disabled={locked || isSwitchPending}
          style={styles.ledSwitch}
        />
      </View>
    </View>
  );
}

// ── Clean Actuator Card with SVG Icons ──
function ActuatorCard({ device, isOn, locked, isToggling, toggleTime, onToggle, theme, cardBg, borderC }) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const accentColor = CONTROL_COLORS.primary;

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

  const statusColor = isOn ? accentColor : "#757575";
  const SvgIcon = device.svgIcon;

  return (
    <Animated.View style={[styles.card, {
      backgroundColor: cardBg,
      borderColor: isOn ? `${accentColor}40` : borderC,
      borderWidth: isOn ? 1.5 : 1,
      transform: [{ scale: pulseAnim }],
    }]}>
      <View style={styles.cardMain}>
        <View style={[styles.iconCircle, { backgroundColor: `${statusColor}12` }]}>
          {SvgIcon ? (
            <SvgIcon
              active={isOn}
              size={32}
              color={accentColor}
              status="normal"
            />
          ) : (
            <Ionicons name={isOn ? device.icon : `${device.icon}-outline`} size={22} color={statusColor} />
          )}
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
            onValueChange={(nextValue) => onToggle(device, nextValue)}
            trackColor={{ false: "#E0E0E0", true: `${accentColor}60` }}
            thumbColor={isToggling ? "#BDBDBD" : isOn ? accentColor : "#FAFAFA"}
            disabled={locked || isToggling}
            style={styles.largeSwitch}
          />
        </View>
      </View>
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
    getSelectedDeviceSensorData,
    getSelectedDeviceName,
    getSelectedDeviceCropSettings,
    selectedExternalKey,
    deviceStatusFlags,
    isConnected,
    publishActuatorStatus,
    publishSettings,
    connectionState,
    deviceOnlineStatus,
    deviceInitialLoadComplete,
    externalKey,
  } = useMqtt();

  const actuatorStatus = getSelectedDeviceActuatorStatus();
  const sensorData = getSelectedDeviceSensorData();
  const cropSettings = getSelectedDeviceCropSettings();
  const selectedDeviceName = getSelectedDeviceName();
  const { isManualMode, toggleMode } = useSystemMode();
  const { cleanTankActive, currentLevel } = useTankSafety();

  const [toggleTimes, setToggleTimes] = useState({});
  const publishTimerRef = useRef(null);
  const pendingActuatorValuesRef = useRef({});

  // ── ✅ FIX: STABLE STATUS DERIVATION (SAME AS LAYOUT) ──
  const deviceKey = selectedExternalKey || externalKey;

  // ✅ STABLE: Device online status (only changes when definitive)
  const isDeviceOnline = useMemo(() => {
    if (!deviceKey) return false;
    return deviceOnlineStatus[deviceKey] === true;
  }, [deviceKey, deviceOnlineStatus]);

  // ✅ STABLE: Initial load complete (only changes once)
  const isInitialLoadComplete = useMemo(() => {
    if (!deviceKey) return false;
    return deviceInitialLoadComplete[deviceKey] === true;
  }, [deviceKey, deviceInitialLoadComplete]);

  // ✅ STABLE: Loading state (derived from initial load)
  const isLoading = useMemo(() => {
    if (!deviceKey) return false;
    return !isDeviceOnline && !isInitialLoadComplete;
  }, [deviceKey, isDeviceOnline, isInitialLoadComplete]);

  // ✅ STABLE: Offline state (only when confirmed)
  const isOffline = useMemo(() => {
    return isInitialLoadComplete && !isDeviceOnline;
  }, [isInitialLoadComplete, isDeviceOnline]);

  // ✅ STABLE: Waiting state
  const isWaiting = useMemo(() => {
    if (isDeviceOnline) return false;
    return (!isInitialLoadComplete && !isLoading) ||
      connectionState === "connecting" ||
      connectionState === "waiting" ||
      connectionState === "idle";
  }, [isDeviceOnline, isInitialLoadComplete, isLoading, connectionState]);

  // ✅ STABLE: Is not connected
  const isNotConnected = useMemo(() => {
    if (isDeviceOnline) return false;
    return connectionState === "idle" || connectionState === "disconnected" || connectionState === "error";
  }, [isDeviceOnline, connectionState]);

  // ── ✅ STATUS DISPLAY (SAME AS LAYOUT) ──
  const getStatusDisplay = useCallback(() => {
    // ✅ When loading or waiting, show NOTHING
    if (isLoading || isWaiting) return null;
    // ✅ When online, show Online
    if (isDeviceOnline) return { text: 'Online', color: '#4CAF50' };
    // ✅ When offline (confirmed), show Offline
    if (isOffline) return { text: 'Offline', color: '#f44336' };
    // ✅ Default: show nothing
    return null;
  }, [isLoading, isWaiting, isDeviceOnline, isOffline]);

  const statusDisplay = getStatusDisplay();

  // ── ✅ DEVICE READY STATE (stable, no flicker) ──
  const isDeviceReady = useMemo(() => {
    return isConnected && isDeviceOnline;
  }, [isConnected, isDeviceOnline]);

  // ── ✅ DEVICE LOCKED (only lock when definitely offline or disconnected) ──
  const deviceLocked = useMemo(() => {
    return !isConnected || isNotConnected || isOffline;
  }, [isConnected, isNotConnected, isOffline]);



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

  // Keep the optimistic switch state until the device confirms the target value.
  const prevActuatorRef = useRef(actuatorStatus);
  useEffect(() => {
    prevActuatorRef.current = actuatorStatus;

    const confirmed = { ...pendingActuatorValuesRef.current };
    let changed = false;
    Object.entries(confirmed).forEach(([key, expectedValue]) => {
      if (actuatorStatus?.[key] === expectedValue) {
        delete confirmed[key];
        changed = true;
      }
    });
    if (changed) {
      pendingActuatorValuesRef.current = confirmed;
    }
  }, [actuatorStatus]);

  useEffect(() => () => {
    if (publishTimerRef.current) clearTimeout(publishTimerRef.current);
  }, []);

  // ── Get mode label from device status flags ──
  const displayStatus = getDisplayStatus(deviceStatusFlags);
  const rawMode = displayStatus?.mode;
  const modeLabel = rawMode === "AUTO" ? "AUTO" : rawMode === "MANUAL" ? "MANUAL" : null;



  // ── Light / Dimming handler (publishes via actuator payload to /actuator, NOT /settings) ──
  const handleLightChange = useCallback((dimmingValue, immediate = false) => {
    if (!selectedExternalKey) return false;
    if (!isManualMode) {
      Alert.alert(
        "🤖 AUTO Mode Active",
        "Cannot control light while system is in AUTO mode.\n\nSwitch to MANUAL mode?",
        [
          { text: "No", style: "cancel" },
          { text: "Yes, Go to Settings", onPress: () => router.push("/(main)/settings") },
        ]
      );
      return false;
    }
    if (deviceLocked) return false;
    if (publishTimerRef.current) clearTimeout(publishTimerRef.current);

    const send = async () => {
      try {
        const fullStatus = {};
        for (const dev of devices) {
          fullStatus[dev.actuatorKey] = pendingActuatorValuesRef.current[dev.actuatorKey] ?? dev.vb;
        }
        const isLightOn = dimmingValue > 0;
        fullStatus['led'] = isLightOn;
        fullStatus['dimming'] = dimmingValue;
        pendingActuatorValuesRef.current['led'] = isLightOn;
        pendingActuatorValuesRef.current['dimming'] = dimmingValue;
        await publishActuatorStatus(selectedExternalKey, fullStatus);
      } catch (err) {
        console.error("Light actuator publish error:", err);
      }
    };

    if (immediate) {
      send();
    } else {
      publishTimerRef.current = setTimeout(send, 350);
    }
    return true;
  }, [deviceLocked, selectedExternalKey, devices, publishActuatorStatus, isManualMode]);

  // ── ✅ STABLE MODE PILL (SHOW NOTHING DURING LOADING) ──
  const getModePillStyle = useCallback(() => {
    // ✅ When loading or waiting, show NOTHING (return null)
    if (isLoading || isWaiting) {
      return null;
    }
    // ✅ When offline or disconnected, show OFFLINE
    if (isNotConnected || isOffline) {
      return { bg: "#F44336", icon: "wifi-outline", label: "OFFLINE" };
    }
    // ✅ When online and manual mode
    if (isDeviceOnline && modeLabel === "MANUAL") {
      return { bg: "#4CAF50", icon: "hand-left-outline", label: "MANUAL" };
    }
    // ✅ When online and auto mode
    if (isDeviceOnline && modeLabel === "AUTO") {
      return { bg: "#FF9800", icon: "sync-outline", label: "AUTO" };
    }
    // ✅ Default: show nothing for unknown states
    return null;
  }, [isLoading, isWaiting, isNotConnected, isOffline, isDeviceOnline, modeLabel]);

  const modePill = getModePillStyle();

  const cardBg = theme.colors.card || theme.colors.surface || "#FFFFFF";
  const borderC = theme.colors.border || "#E0E0E0";

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ paddingTop: headerHeight, }}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: useScroll().scrollY } } }],
          { useNativeDriver: false }
        )}
        scrollEventThrottle={16}
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={[styles.title, { color: theme.colors.text }]}>System Control</Text>
            {selectedDeviceName && (
              <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
                {selectedDeviceName}
              </Text>
            )}
          </View>
          <View style={styles.headerRightControls}>
            {/* Only show Online badge when device is online; offline is shown by modePill alone */}
            {statusDisplay && statusDisplay.text === 'Online' && (
              <View style={[styles.statusBadge, { backgroundColor: statusDisplay.color }]}>
                <View style={styles.onlineDot} />
                <Text style={[styles.statusBadgeText, { color: "#FFF" }]}>{statusDisplay.text}</Text>
              </View>
            )}
            {modePill && (
              <TouchableOpacity
                style={[styles.modePill, { backgroundColor: modePill.bg }]}
                onPress={() => router.push("/(main)/settings")}
                activeOpacity={0.7}
              >
                <Ionicons name={modePill.icon} size={12} color="#FFF" />
                <Text style={styles.modePillText}>{modePill.label}</Text>
                <Ionicons name="chevron-forward" size={10} color="#FFF" opacity={0.7} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* ── Device Info ── */}
        {/* {deviceKey && (
          <View style={[
            styles.deviceInfo,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            }
          ]}>
            <Ionicons name="hardware-chip-outline" size={16} color={theme.colors.primary} />
            <Text style={[styles.deviceIdText, { color: theme.colors.text }]}>
              Device: {deviceKey.slice(0, 12)}...
            </Text>
           
            {isDeviceOnline && isInitialLoadComplete && (
              <View style={[styles.onlineDot, { backgroundColor: '#4CAF50' }]} />
            )}
          </View>
        )} */}

        {/* ── BANNERS: ONLY show when definitely offline/disconnected ── */}
        {isNotConnected && (
          <View style={[styles.banner, { backgroundColor: "#F4433612" }]}>
            <Ionicons name="wifi-outline" size={15} color="#F44336" />
            <Text style={[styles.bannerText, { color: "#F44336" }]}>Not connected. Check your connection.</Text>
          </View>
        )}
        {/* {isOffline && !isNotConnected && (
          <View style={[styles.banner, { backgroundColor: "#FF980012" }]}>
            <Ionicons name="alert-circle-outline" size={15} color="#FF9800" />
            <Text style={[styles.bannerText, { color: "#FF9800" }]}>Device offline. Waiting for connection...</Text>
          </View>
        )} */}

        {/* ── Dimming Card ── */}
        <DimmingCard
          dimmingLevel={deviceStatusFlags?.dimmingLevel ?? actuatorStatus?.dimming ?? null}
          onLightChange={handleLightChange}
          ledOn={actuatorStatus?.led === true}
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
                isOn={device.vb === true}
                locked={deviceLocked}
                isToggling={false}
                toggleTime={toggleTimes[device.id]}
                onToggle={(d, nextValue) => {
                  if (!selectedExternalKey) {
                    Alert.alert("Error", "No device selected");
                    return;
                  }
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
                  if (deviceLocked) {
                    Alert.alert(
                      "Device Not Ready",
                      isOffline
                        ? "Device is offline. Please wait for device to connect."
                        : "Device is not ready. Please wait."
                    );
                    return;
                  }
                  const newVal = nextValue ?? !d.vb;

                  const nextPending = {
                    ...pendingActuatorValuesRef.current,
                    [d.actuatorKey]: newVal,
                  };
                  pendingActuatorValuesRef.current = nextPending;
                  const time = new Date().toLocaleTimeString();
                  if (publishTimerRef.current) clearTimeout(publishTimerRef.current);
                  publishTimerRef.current = setTimeout(async () => {
                    const fullStatus = {};
                    for (const dev of devices) {
                      fullStatus[dev.actuatorKey] = pendingActuatorValuesRef.current[dev.actuatorKey] ?? dev.vb;
                    }

                    try {
                      const success = await publishActuatorStatus(selectedExternalKey, fullStatus);
                      if (success) {
                        setToggleTimes((prev) => ({ ...prev, [d.id]: time }));
                      } else {
                        const failedPending = { ...pendingActuatorValuesRef.current };
                        delete failedPending[d.actuatorKey];
                        pendingActuatorValuesRef.current = failedPending;
                      }
                    } catch (error) {
                      console.error(`Failed to toggle ${d.displayName}:`, error);
                      const failedPending = { ...pendingActuatorValuesRef.current };
                      delete failedPending[d.actuatorKey];
                      pendingActuatorValuesRef.current = failedPending;
                    }
                    publishTimerRef.current = null;
                  }, 500);
                }}
                theme={theme}
                cardBg={cardBg}
                borderC={borderC}
              />
            ))}
          </View>
        ))}

        {/* ── Timings & Clean Tank (1 per row, placed right after AC) ── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="options-outline" size={14} color={theme.colors.textSecondary} />
            <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>
              Timings & Maintenance
            </Text>
          </View>

          {/* System Timings (Full Row) */}
          <TouchableOpacity
            style={[styles.quickActionCardFull, { backgroundColor: cardBg, borderColor: borderC }]}
            onPress={() => router.push("/(main)/timings")}
            activeOpacity={0.7}
          >
            <View style={[styles.quickActionIconCircle, { backgroundColor: "#2E7D3215" }]}>
              <Ionicons name="timer-outline" size={22} color="#2E7D32" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.quickActionTitle, { color: theme.colors.text }]}>System Timings</Text>
              <Text style={[styles.quickActionDesc, { color: theme.colors.textSecondary }]}>Pumps, EC & pH timings</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
          </TouchableOpacity>

          {/* Clean Tank (Full Row) */}
          <TouchableOpacity
            style={[styles.quickActionCardFull, { backgroundColor: cardBg, borderColor: borderC }]}
            onPress={() => router.push("/(main)/clean-tank")}
            activeOpacity={0.7}
          >
            <View style={[styles.quickActionIconCircle, { backgroundColor: cleanTankActive ? "#FF980020" : "#0288D115" }]}>
              <Ionicons name="water-outline" size={22} color={cleanTankActive ? "#FF9800" : "#0288D1"} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={[styles.quickActionTitle, { color: theme.colors.text }]}>Clean Tank</Text>
                {cleanTankActive && (
                  <View style={styles.activeTag}>
                    <Text style={styles.activeTagText}>ACTIVE</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.quickActionDesc, { color: theme.colors.textSecondary }]}>
                {cleanTankActive ? "Cycle in progress" : (currentLevel !== null ? `Tank: ${Math.round(currentLevel)}%` : "Automated drain/fill")}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

// ── Styles ──
const styles = StyleSheet.create({
  container: { flex: 1, padding: 10, paddingBottom: 0 },

  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  headerLeft: { flex: 1, marginRight: 10 },
  title: { fontSize: 26, fontWeight: "700" },
  subtitle: { fontSize: 13, marginTop: 2, opacity: 0.8 },

  headerRightControls: { alignItems: "flex-end", gap: 6 },
  modePill: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12,
  },
  modePillText: { color: "#FFF", fontSize: 11, fontWeight: "700", letterSpacing: 0.4 },

  // ── Device Info ──
  deviceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
    gap: 8,
  },
  deviceIdText: {
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  onlineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },

  // ── Status Badge ──
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 10,
  },
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
  statusBadgeText: { fontSize: 11, fontWeight: "700" },
  timeText: { fontSize: 9, opacity: 0.5 },
  cardRight: { flexDirection: "row", alignItems: "center", gap: 6, paddingRight: 6 },
  largeSwitch: {
    transform: [{ scaleX: 1.25 }, { scaleY: 1.25 }],
  },

  // Quick actions
  quickActionCardFull: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    padding: 13,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  quickActionIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  quickActionTitle: { fontSize: 14, fontWeight: "700" },
  quickActionDesc: { fontSize: 11, marginTop: 2 },
  activeTag: {
    backgroundColor: "#FF9800",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  activeTagText: { color: "#FFFFFF", fontSize: 8, fontWeight: "800" },

  // Footer
  footer: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    padding: 12, borderRadius: 10, borderWidth: 1, marginTop: 14, marginBottom: 8,
  },
  footerText: { fontSize: 12, fontWeight: "500" },
  footerStatus: { flexDirection: "row", alignItems: "center", gap: 5 },
  footerDot: { width: 7, height: 7, borderRadius: 4 },
  footerLabel: { fontSize: 11, fontWeight: "500" },

  // ── Dimming Card ──
  dimmCard: {
    borderRadius: 16,
    marginBottom: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  dimmHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  dimmIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  dimmTitleWrap: { flex: 1, minWidth: 0 },
  dimmTitle: { fontSize: 14, fontWeight: "700", letterSpacing: -0.1 },
  dimmSubtitle: { fontSize: 11, marginTop: 1, opacity: 0.65 },
  dimmValueBadge: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    minWidth: 50,
    alignItems: "center",
    flexShrink: 0,
  },
  dimmValueText: { fontSize: 17, fontWeight: "800" },

  // Slider
  dimmSliderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
  },
  dimmSliderFlex: { flex: 1 },
  dimmSliderEndLabel: { fontSize: 10, fontWeight: "600", minWidth: 30, textAlign: "right" },

  // Quick pills
  dimmPillsRow: {
    flexDirection: "row",
    gap: 5,
    marginBottom: 12,
  },
  dimmPill: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 7,
    borderRadius: 9,
    borderWidth: 1,
  },

  // ── LED Row ──
  ledRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingTop: 10,
    paddingBottom: 2,
    borderTopWidth: 1,
  },
  ledIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 11,
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  ledTextWrap: { flex: 1, minWidth: 0 },
  ledLabel: { fontSize: 13, fontWeight: "700" },
  ledSub: { fontSize: 10, marginTop: 1, fontWeight: "600" },
  ledSwitch: { transform: [{ scaleX: 1.1 }, { scaleY: 1.1 }] },
});