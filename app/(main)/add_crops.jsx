// app/(main)/add_crops.jsx - Wizard UI
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react"; // ✅ Added useMemo
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Easing,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import SliderControl from "../../components/SettingsSlider";
import { useMqtt } from "../../src/context/MqttContext";
import { useScroll, useScrollReset } from "../../src/context/ScrollContext";
import { useSystemMode } from "../../src/context/SystemModeContext";
import { useTheme } from "../../src/context/ThemContext";
import {
  getAllCrops,
  getParameterById,
  getParametersByCropName,
} from "../../src/services/add_crops/add_crops";

// Wizard step order (used by the slide transition to decide direction)
const STEP_ORDER = ["crop", "variety", "stage", "details"];

// Last-known crops list fetched from the API. Keeps the list visible whenever
// this screen is re-mounted (e.g. navigating back to it), even if the refetch
// fails or is slow — the crop list can never appear empty after a back nav.
let cropsCache = null;

// ============================================
// SENML FORMAT CONVERTER
// ============================================
function convertToSenML(cropData, customSettings) {
  const baseTime = Math.floor(Date.now() / 1000);

  // Safely extract values — handle undefined/null cropData or customSettings
  const safe = (obj, key, fallback) => (obj && obj[key] !== undefined && obj[key] !== null ? obj[key] : fallback);
  const crop = cropData || {};
  const settings = customSettings || {};

  return [
    { bn: "urn:dev:hydro-001:", bt: baseTime },
    { n: "temp_low", v: safe(settings, 'tempLow', safe(crop, 'temperature_min', 0)) },
    { n: "temp_high", v: safe(settings, 'tempHigh', safe(crop, 'temperature_max', 0)) },
    { n: "humidity_low", v: safe(settings, 'humidityLow', safe(crop, 'humidity_min', 0)) },
    { n: "humidity_high", v: safe(settings, 'humidityHigh', safe(crop, 'humidity_max', 0)) },
    { n: "water_temp_low", v: safe(settings, 'waterTempLow', safe(crop, 'nutrient_temp_min', 20)) },
    { n: "water_temp_high", v: safe(settings, 'waterTempHigh', safe(crop, 'nutrient_temp_max', 28)) },
    { n: "water_level_low", v: safe(settings, 'waterLevelLow', 25) },
    { n: "water_level_high", v: safe(settings, 'waterLevelHigh', 90) },
    { n: "ph_low", v: safe(settings, 'phLow', safe(crop, 'ph_min', 0)) },
    { n: "ph_high", v: safe(settings, 'phHigh', safe(crop, 'ph_max', 0)) },
    { n: "co2_low", v: safe(settings, 'co2Low', safe(crop, 'co2_min', 400)) },
    { n: "co2_high", v: safe(settings, 'co2High', safe(crop, 'co2_max', 1500)) },
    { n: "lux_low", v: safe(settings, 'luxLow', Math.round(safe(crop, 'ppfd_min', 0) * 60)) },
    { n: "lux_high", v: safe(settings, 'luxHigh', Math.round(safe(crop, 'ppfd_max', 0) * 60)) },
    { n: "dimming", v: safe(settings, 'dimming', 75) },
  ];
}

// ============================================
// CUSTOMIZE SETTINGS — SLIDER SECTIONS
// ============================================
const SLIDER_SECTIONS = [
  {
    section: "🌡️ Temperature",
    lowKey: "tempLow",
    highKey: "tempHigh",
    config: { min: 0, max: 50, step: 1, unit: "°C", decimals: 0 },
  },
  {
    section: "💧 Humidity",
    lowKey: "humidityLow",
    highKey: "humidityHigh",
    config: { min: 0, max: 100, step: 1, unit: "%", decimals: 0 },
  },
  {
    section: "🌊 Water Temperature",
    lowKey: "waterTempLow",
    highKey: "waterTempHigh",
    config: { min: 0, max: 40, step: 1, unit: "°C", decimals: 0 },
  },
  {
    section: "💧 Water Level",
    lowKey: "waterLevelLow",
    highKey: "waterLevelHigh",
    config: { min: 0, max: 100, step: 1, unit: "%", decimals: 0 },
  },
  {
    section: "🧪 pH",
    lowKey: "phLow",
    highKey: "phHigh",
    config: { min: 0, max: 14, step: 0.1, unit: "", decimals: 1 },
  },
  {
    section: "🌬️ CO₂",
    lowKey: "co2Low",
    highKey: "co2High",
    config: { min: 0, max: 2000, step: 50, unit: "ppm", decimals: 0 },
  },
  {
    section: "💡 Light",
    lowKey: "luxLow",
    highKey: "luxHigh",
    config: { min: 0, max: 200000, step: 500, unit: "lux", decimals: 0 },
  },
  {
    section: "🎛️ Dimming",
    single: true,
    key: "dimming",
    config: { min: 0, max: 100, step: 1, unit: "%", decimals: 0 },
  },
];

// ============================================
// CUSTOMIZE SETTINGS MODAL
// ============================================
function CustomizeSettingsModal({
  visible,
  onClose,
  customSettings,
  cropDetails,
  theme,
  onApply,
}) {
  const [draft, setDraft] = useState(() => {
    const initial = {};
    Object.keys(customSettings).forEach((key) => {
      initial[key] = String(customSettings[key] || 0);
    });
    return initial;
  });

  useEffect(() => {
    if (visible) {
      const initial = {};
      Object.keys(customSettings).forEach((key) => {
        initial[key] = String(customSettings[key] || 0);
      });
      setDraft(initial);
    }
  }, [visible, customSettings]);

  const updateDraft = (key, value) => setDraft((prev) => ({ ...prev, [key]: value }));

  const handleApply = () => {
    const parsed = {};
    Object.keys(draft).forEach((key) => {
      parsed[key] = parseFloat(draft[key]) || 0;
    });
    onApply(parsed);
    Alert.alert("✅ Success", "Settings updated successfully!");
  };

  const handleReset = () => {
    if (!cropDetails) return;
    const resetData = {
      tempLow: cropDetails.temperature_min || 0,
      tempHigh: cropDetails.temperature_max || 0,
      humidityLow: cropDetails.humidity_min || 0,
      humidityHigh: cropDetails.humidity_max || 0,
      waterTempLow: cropDetails.nutrient_temp_min || 20,
      waterTempHigh: cropDetails.nutrient_temp_max || 28,
      waterLevelLow: 25,
      waterLevelHigh: 90,
      phLow: cropDetails.ph_min || 0,
      phHigh: cropDetails.ph_max || 0,
      co2Low: cropDetails.co2_min || 400,
      co2High: cropDetails.co2_max || 1500,
      luxLow: Math.round((cropDetails.ppfd_min || 0) * 60),
      luxHigh: Math.round((cropDetails.ppfd_max || 0) * 60),
      dimming: 75,
    };
    const stringified = {};
    Object.keys(resetData).forEach((key) => {
      stringified[key] = String(resetData[key]);
    });
    setDraft(stringified);
  };

  const primary = theme.colors.primary;
  const primaryDark = theme.colors.primaryDark;

  const fmt = (value, config) => {
    const decimals = config.decimals > 0 && value % 1 !== 0 ? config.decimals : 0;
    return `${value.toFixed(decimals)}${config.unit ? ` ${config.unit}` : ""}`;
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalContainer}>
        <View style={[styles.modalContent, { backgroundColor: theme.colors.surface }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: theme.colors.text }]}>Customize Settings</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={theme.colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator contentContainerStyle={styles.modalScrollContent} keyboardShouldPersistTaps="handled">
            {SLIDER_SECTIONS.map((sec) => {
              if (sec.single) {
                const val = Number(draft[sec.key]) || 0;
                const lo = Math.min(sec.config.min, val);
                const hi = Math.max(sec.config.max, val);
                return (
                  <View
                    key={sec.section}
                    style={[styles.sliderCard, { backgroundColor: theme.colors.inputBackground, borderColor: theme.colors.border }]}
                  >
                    <View style={styles.sliderHeaderRow}>
                      <Text style={[styles.sliderSectionTitle, { color: theme.colors.text }]}>{sec.section}</Text>
                      <Text style={[styles.sliderValueBadge, { color: primary, backgroundColor: `${primary}14` }]}>
                        {fmt(val, sec.config)}
                      </Text>
                    </View>
                    <SliderControl
                      single
                      min={lo}
                      max={hi}
                      minValue={val}
                      step={sec.config.step}
                      onChange={(v) => updateDraft(sec.key, String(v))}
                      formatValue={(v) => fmt(v, sec.config)}
                      tintColor={primary}
                      thumbColor={theme.colors.surface}
                      trackColor={theme.colors.border}
                    />
                    <View style={styles.sliderScaleRow}>
                      <Text style={[styles.sliderScaleText, { color: theme.colors.textSecondary }]}>{fmt(lo, sec.config)}</Text>
                      <Text style={[styles.sliderScaleText, { color: theme.colors.textSecondary }]}>{fmt(hi, sec.config)}</Text>
                    </View>
                  </View>
                );
              }

              const rawLow = Number(draft[sec.lowKey]) || 0;
              const rawHigh = Number(draft[sec.highKey]) || 0;
              const low = Math.min(rawLow, rawHigh);
              const high = Math.max(rawLow, rawHigh);
              const lo = Math.min(sec.config.min, low, high);
              const hi = Math.max(sec.config.max, low, high);
              return (
                <View
                  key={sec.section}
                  style={[styles.sliderCard, { backgroundColor: theme.colors.inputBackground, borderColor: theme.colors.border }]}
                >
                  <View style={styles.sliderHeaderRow}>
                    <Text style={[styles.sliderSectionTitle, { color: theme.colors.text }]}>{sec.section}</Text>
                    <Text style={[styles.sliderValueBadge, { color: primary, backgroundColor: `${primary}14` }]}>
                      {fmt(low, sec.config)} – {fmt(high, sec.config)}
                    </Text>
                  </View>
                  <SliderControl
                    min={lo}
                    max={hi}
                    minValue={low}
                    maxValue={high}
                    step={sec.config.step}
                    onChange={(l, h) => {
                      updateDraft(sec.lowKey, String(l));
                      updateDraft(sec.highKey, String(h));
                    }}
                    formatValue={(v) => fmt(v, sec.config)}
                    tintColor={primary}
                    thumbColor={theme.colors.surface}
                    trackColor={theme.colors.border}
                  />
                  <View style={styles.sliderScaleRow}>
                    <Text style={[styles.sliderScaleText, { color: theme.colors.textSecondary }]}>MIN {fmt(low, sec.config)}</Text>
                    <Text style={[styles.sliderScaleText, { color: theme.colors.textSecondary }]}>MAX {fmt(high, sec.config)}</Text>
                  </View>
                </View>
              );
            })}

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.resetButton, { borderColor: theme.colors.border }]}
                onPress={handleReset}
              >
                <Text style={[styles.resetButtonText, { color: theme.colors.textSecondary }]}>Reset to Default</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { shadowColor: primaryDark }]}
                onPress={handleApply}
              >
                <LinearGradient
                  colors={[primary, primaryDark]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.applyGradient}
                >
                  <Text style={styles.applyButtonText}>Apply</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ============================================
// SENML PREVIEW MODAL
// ============================================
function SenMLPreviewModal({ visible, onClose, cropDetails, customSettings, theme }) {
  if (!cropDetails) return null;
  const senmlData = convertToSenML(cropDetails, customSettings);

  const SENSOR_GROUPS = [
    {
      title: "Temperature",
      icon: "thermometer-outline",
      color: "#F44336",
      items: ["temp_low", "temp_high"],
    },
    {
      title: "Humidity",
      icon: "water-outline",
      color: "#2196F3",
      items: ["humidity_low", "humidity_high"],
    },
    {
      title: "Water Temperature",
      icon: "water-outline",
      color: "#00BCD4",
      items: ["water_temp_low", "water_temp_high"],
    },
    {
      title: "Water Level",
      icon: "speedometer-outline",
      color: "#009688",
      items: ["water_level_low", "water_level_high"],
    },
    {
      title: "pH",
      icon: "flask-outline",
      color: "#9C27B0",
      items: ["ph_low", "ph_high"],
    },
    {
      title: "CO₂",
      icon: "cloud-outline",
      color: "#607D8B",
      items: ["co2_low", "co2_high"],
    },
    {
      title: "Light",
      icon: "sunny-outline",
      color: "#FF9800",
      items: ["lux_low", "lux_high"],
    },
    {
      title: "Dimming",
      icon: "contrast-outline",
      color: "#795548",
      items: ["dimming"],
    },
  ];

  const senmlMap = {};
  senmlData.forEach((item) => {
    if (item.n) senmlMap[item.n] = item;
  });

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalContainer}>
        <View style={[styles.modalContent, { maxHeight: "85%", backgroundColor: theme.colors.surface }]}>
          <View style={styles.modalHeader}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={[styles.previewHeaderIcon, { backgroundColor: "rgba(33,150,243,0.12)" }]}>
                <Ionicons name="code-working-outline" size={20} color="#2196F3" />
              </View>
              <View>
                <Text style={[styles.modalTitle, { color: theme.colors.text, fontSize: 18 }]}>SenML Preview</Text>
                <Text style={[styles.previewSubtitle, { color: theme.colors.textSecondary }]}>Sensor data format</Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={[styles.previewCloseBtn, { backgroundColor: theme.colors.inputBackground || theme.colors.background }]}
            >
              <Ionicons name="close" size={20} color={theme.colors.text} />
            </TouchableOpacity>
          </View>

          <View style={[styles.previewCropChip, { backgroundColor: `${theme.colors.primary}10`, borderColor: `${theme.colors.primary}30` }]}>
            <Ionicons name="leaf-outline" size={14} color={theme.colors.primary} />
            <Text style={[styles.previewCropChipText, { color: theme.colors.primary }]}>
              {cropDetails.crop_name} · {cropDetails.crop_variety_name || "General"} · {cropDetails.stage_id || "N/A"}
            </Text>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
            <View style={[styles.previewInfoCard, { backgroundColor: theme.colors.inputBackground || theme.colors.background, borderColor: theme.colors.border }]}>
              <View style={styles.previewInfoRow}>
                <Ionicons name="finger-print-outline" size={16} color={theme.colors.textSecondary} />
                <Text style={[styles.previewInfoLabel, { color: theme.colors.textSecondary }]}>Base Name</Text>
                <Text style={[styles.previewInfoValue, { color: theme.colors.text }]} numberOfLines={1}>{senmlData[0]?.bn || "—"}</Text>
              </View>
              <View style={[styles.previewInfoDivider, { backgroundColor: theme.colors.border }]} />
              <View style={styles.previewInfoRow}>
                <Ionicons name="time-outline" size={16} color={theme.colors.textSecondary} />
                <Text style={[styles.previewInfoLabel, { color: theme.colors.textSecondary }]}>Timestamp</Text>
                <Text style={[styles.previewInfoValue, { color: theme.colors.text }]} numberOfLines={1}>
                  {senmlData[0]?.bt ? new Date(senmlData[0].bt * 1000).toLocaleString() : "—"}
                </Text>
              </View>
            </View>

            {SENSOR_GROUPS.map((group) => (
              <View key={group.title} style={[styles.previewGroupCard, { backgroundColor: theme.colors.inputBackground || theme.colors.background, borderColor: theme.colors.border }]}>
              <View style={[styles.previewGroupHeader, { borderLeftColor: group.color }]}>
                <View style={[styles.previewGroupIconWrap, { backgroundColor: `${group.color}18` }]}>
                  <Ionicons name={group.icon} size={16} color={group.color} />
                </View>
                <Text style={[styles.previewGroupTitle, { color: theme.colors.text }]}>{group.title}</Text>
              </View>
              {group.items.map((name) => {
                const item = senmlMap[name];
                if (!item) return null;
                return (
                  <View key={name} style={[styles.previewSensorRow, { borderTopColor: theme.colors.border }]}>
                    <Text style={[styles.previewSensorName, { color: theme.colors.textSecondary }]}>{name}</Text>
                    <Text style={[styles.previewSensorValue, { color: theme.colors.text }]}>{item.v}</Text>
                  </View>
                );
              })}
            </View>
          ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================
export default function AddCrops() {
  const { theme } = useTheme();
  const { onScroll, headerHeight } = useScroll();
  const scrollRef = useRef(null);
  useScrollReset(scrollRef);
  
  const {
    isConnected,
    externalKey,
    forceReconnect,
    publishSettings,
    connectionState,
    isLiveData,
    deviceStatusFlags,
    deviceOnlineStatus,
    deviceInitialLoadComplete,
    selectedExternalKey,
  } = useMqtt();

  const { isAutoMode, isManualMode } = useSystemMode();

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
    return !isInitialLoadComplete;
  }, [deviceKey, isInitialLoadComplete]);

  // ✅ STABLE: Offline state (only when confirmed)
  const isOffline = useMemo(() => {
    return isInitialLoadComplete && !isDeviceOnline;
  }, [isInitialLoadComplete, isDeviceOnline]);

  // ✅ STABLE: Waiting state
  const isWaiting = useMemo(() => {
    return (!isInitialLoadComplete && !isLoading) ||
      connectionState === "connecting" ||
      connectionState === "waiting" ||
      connectionState === "idle";
  }, [isInitialLoadComplete, isLoading, connectionState]);

  // ✅ STABLE: Is not connected
  const isNotConnected = useMemo(() => {
    return connectionState === "idle" || connectionState === "disconnected" || connectionState === "error";
  }, [connectionState]);

  // ── ✅ STATUS DISPLAY (SAME AS LAYOUT) ──
  const getStatusDisplay = useCallback(() => {
    // ✅ When loading or waiting, show NOTHING
    if (isLoading || isWaiting) return null;
    // ✅ When online, show Online
    if (isDeviceOnline) return { label: "Online", color: "#4CAF50", bg: "rgba(76,175,80,0.12)" };
    // ✅ When offline (confirmed), show Offline
    if (isOffline) return { label: "Offline", color: "#F44336", bg: "rgba(244,67,54,0.12)" };
    // ✅ Default: show nothing
    return null;
  }, [isLoading, isWaiting, isDeviceOnline, isOffline]);

  const liveStatus = getStatusDisplay();

  // Wizard step: 'crop' -> 'variety' -> 'stage' -> 'details'
  const [step, setStep] = useState("crop");

  // Data from the 3 APIs
  const [crops, setCrops] = useState([]);
  const [varietyData, setVarietyData] = useState([]);
  const [cropDetails, setCropDetails] = useState(null);

  // Selections
  const [selectedCropName, setSelectedCropName] = useState("");
  const [selectedVariety, setSelectedVariety] = useState(null);
  const [selectedStageItem, setSelectedStageItem] = useState(null);

  // UI state
  const [loading, setLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState("checking");
  const [showCustomizeModal, setShowCustomizeModal] = useState(false);
  const [showSenMLPreview, setShowSenMLPreview] = useState(false);

  // Custom settings state
  const [customSettings, setCustomSettings] = useState({
    tempLow: 0,
    tempHigh: 0,
    humidityLow: 0,
    humidityHigh: 0,
    waterTempLow: 20,
    waterTempHigh: 28,
    waterLevelLow: 25,
    waterLevelHigh: 90,
    phLow: 0,
    phHigh: 0,
    co2Low: 400,
    co2High: 1500,
    luxLow: 0,
    luxHigh: 0,
    dimming: 75,
  });

  // ─── Step slide transition ────
  const screenW = Dimensions.get("window").width;
  const [displayStep, setDisplayStep] = useState("crop");
  const [incomingStep, setIncomingStep] = useState(null);
  const baseX = useRef(new Animated.Value(0)).current;
  const incomingX = useRef(new Animated.Value(0)).current;
  const transitionLock = useRef(false);
  const prevStepRef = useRef("crop");
  const stepRef = useRef(step);
  stepRef.current = step;
  const settleTimer = useRef(null);

  const settlePanels = () => {
    if (settleTimer.current) {
      clearTimeout(settleTimer.current);
      settleTimer.current = null;
    }
    transitionLock.current = false;
    setDisplayStep(stepRef.current);
    setIncomingStep(null);
    baseX.setValue(0);
    incomingX.setValue(0);
  };

  useEffect(() => {
    const prev = prevStepRef.current;
    if (prev === step) return;
    prevStepRef.current = step;

    if (transitionLock.current) {
      baseX.stopAnimation();
      incomingX.stopAnimation();
      settlePanels();
      return;
    }

    const dir = STEP_ORDER.indexOf(step) > STEP_ORDER.indexOf(prev) ? "forward" : "back";
    transitionLock.current = true;

    setDisplayStep(prev);
    setIncomingStep(step);
    baseX.setValue(0);
    incomingX.setValue(dir === "forward" ? -screenW : screenW);

    requestAnimationFrame(() => {
      Animated.parallel([
        Animated.timing(baseX, {
          toValue: dir === "forward" ? screenW : -screenW,
          duration: 300,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
        Animated.timing(incomingX, {
          toValue: 0,
          duration: 300,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
      ]).start(() => settlePanels());
    });

    settleTimer.current = setTimeout(settlePanels, 450);
  }, [step]);

  useEffect(
    () => () => {
      baseX.stopAnimation();
      incomingX.stopAnimation();
      if (settleTimer.current) clearTimeout(settleTimer.current);
    },
    []
  );

  // ============================================
  // CHECK MQTT CONNECTION + LOAD CROPS ON MOUNT
  // ============================================
  useEffect(() => {
    checkConnection();
  }, [isConnected]);

  useEffect(() => {
    loadCrops();
  }, []);

  const checkConnection = async () => {
    const key = await AsyncStorage.getItem("external_key");

    if (!key) {
      setConnectionStatus("no_key");
      return;
    }

    if (isConnected) {
      setConnectionStatus("connected");
      return;
    }

    setConnectionStatus("reconnecting");

    try {
      await forceReconnect(key);
      setConnectionStatus("connected");
    } catch (error) {
      console.error("MQTT reconnect failed:", error);
      setConnectionStatus("failed");
    }
  };

  // ============================================
  // API 1: LOAD CROP NAMES
  // ============================================
  const loadCrops = async () => {
    try {
      setLoading(true);
      if (cropsCache && cropsCache.length > 0) setCrops(cropsCache);
      const result = await getAllCrops();
      if (result.success && Array.isArray(result.data) && result.data.length > 0) {
        cropsCache = result.data;
        setCrops(result.data);
      } else if (!cropsCache || cropsCache.length === 0) {
        Alert.alert("Error", result.message || "Failed to load crops");
      }
    } catch (error) {
      console.error("Error loading crops:", error);
      if (!cropsCache || cropsCache.length === 0) {
        Alert.alert("Error", "Failed to load crops");
      }
    } finally {
      setLoading(false);
    }
  };

  // ============================================
  // API 3: FETCH FULL DETAILS
  // ============================================
  const handleSelectStage = useCallback(async (stageItem) => {
    setSelectedStageItem(stageItem);
    setLoading(true);

    try {
      const result = await getParameterById(stageItem.parameter_id);

      if (result.success && result.data) {
        const data = result.data;
        setCropDetails(data);

        setCustomSettings({
          tempLow: data.temperature_min || 0,
          tempHigh: data.temperature_max || 0,
          humidityLow: data.humidity_min || 0,
          humidityHigh: data.humidity_max || 0,
          waterTempLow: data.nutrient_temp_min || 20,
          waterTempHigh: data.nutrient_temp_max || 28,
          waterLevelLow: 25,
          waterLevelHigh: 90,
          phLow: data.ph_min || 0,
          phHigh: data.ph_max || 0,
          co2Low: data.co2_min || 400,
          co2High: data.co2_max || 1500,
          luxLow: Math.round((data.ppfd_min || 0) * 60),
          luxHigh: Math.round((data.ppfd_max || 0) * 60),
          dimming: 75,
        });

        setStep("details");
      } else {
        Alert.alert("Error", result.message || "Failed to fetch crop details");
      }
    } catch (error) {
      console.error("Error selecting stage:", error);
      Alert.alert("Error", "Failed to fetch crop details");
    } finally {
      setLoading(false);
    }
  }, []);

  // ============================================
  // Pick a variety
  // ============================================
  const handleSelectVariety = useCallback((varietyName) => {
    setSelectedVariety(varietyName);
    const stagesForVariety = varietyData.filter(
      (item) => (item.crop_variety_name || "General") === varietyName
    );

    if (stagesForVariety.length === 1) {
      handleSelectStage(stagesForVariety[0]);
    } else {
      setStep("stage");
    }
  }, [varietyData, handleSelectStage]);

  // ============================================
  // API 2: FETCH VARIETIES/STAGES
  // ============================================
  const handleSelectCrop = useCallback(async (cropName) => {
    setSelectedCropName(cropName);
    setSelectedVariety(null);
    setSelectedStageItem(null);
    setCropDetails(null);
    setLoading(true);

    try {
      const result = await getParametersByCropName(cropName);

      if (result.success && result.data && result.data.length > 0) {
        setVarietyData(result.data);

        const varietyNames = [...new Set(result.data.map((i) => i.crop_variety_name || "General"))];

        if (varietyNames.length === 1) {
          const onlyVariety = varietyNames[0];
          setSelectedVariety(onlyVariety);
          const stagesForVariety = result.data.filter(
            (i) => (i.crop_variety_name || "General") === onlyVariety
          );
          if (stagesForVariety.length === 1) {
            await handleSelectStage(stagesForVariety[0]);
          } else {
            setStep("stage");
          }
        } else {
          setStep("variety");
        }
      } else {
        Alert.alert("No Data", "No varieties found for this crop");
      }
    } catch (error) {
      console.error("Error selecting crop:", error);
      Alert.alert("Error", "Failed to fetch crop details");
    } finally {
      setLoading(false);
    }
  }, [handleSelectStage]);

  // ============================================
  // BACK NAVIGATION
  // ============================================
  const handleBack = () => {
    if (step === "crop") {
      router.back();
      return;
    }

    if (step === "variety") {
      setStep("crop");
      setSelectedCropName("");
      setVarietyData([]);
      return;
    }

    if (step === "stage") {
      const varietyNames = [...new Set(varietyData.map((i) => i.crop_variety_name || "General"))];
      if (varietyNames.length > 1) {
        setStep("variety");
        setSelectedVariety(null);
      } else {
        setStep("crop");
        setSelectedCropName("");
        setVarietyData([]);
      }
      return;
    }

    if (step === "details") {
      const stagesForVariety = varietyData.filter(
        (i) => (i.crop_variety_name || "General") === selectedVariety
      );
      const varietyNames = [...new Set(varietyData.map((i) => i.crop_variety_name || "General"))];

      setSelectedStageItem(null);

      if (stagesForVariety.length > 1) {
        setStep("stage");
      } else if (varietyNames.length > 1) {
        setStep("variety");
        setSelectedVariety(null);
      } else {
        setStep("crop");
        setSelectedCropName("");
        setVarietyData([]);
      }
    }
  };

  // ============================================
  // PUBLISH TO MQTT
  // ============================================
  const handlePublish = async () => {
    if (!cropDetails) {
      Alert.alert("Error", "Please select a crop first");
      return;
    }

    if (!isConnected) {
      Alert.alert("Not Connected", "MQTT is not connected. Please try again.");
      return;
    }

    if (!externalKey) {
      Alert.alert("No Device", "No device key found. Please add a device first.");
      return;
    }

    // ✅ FIX: Check if device is actually online
    if (!isDeviceOnline) {
      Alert.alert(
        "Device Offline",
        isLoading || isWaiting
          ? "Device is still connecting. Please wait for the device to come online before publishing crop settings."
          : "Device is offline. Please make sure the device is connected and try again."
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const cropSettings = {
        CropId: cropDetails.parameter_id || 0,
        tempLow: customSettings.tempLow ?? cropDetails.temperature_min,
        tempHigh: customSettings.tempHigh ?? cropDetails.temperature_max,
        humidityLow: customSettings.humidityLow ?? cropDetails.humidity_min,
        humidityHigh: customSettings.humidityHigh ?? cropDetails.humidity_max,
        waterTempLow: customSettings.waterTempLow ?? cropDetails.nutrient_temp_min,
        waterTempHigh: customSettings.waterTempHigh ?? cropDetails.nutrient_temp_max,
        waterLevelLow: customSettings.waterLevelLow ?? 25,
        waterLevelHigh: customSettings.waterLevelHigh ?? 90,
        phLow: customSettings.phLow ?? cropDetails.ph_min,
        phHigh: customSettings.phHigh ?? cropDetails.ph_max,
        co2Low: customSettings.co2Low ?? cropDetails.co2_min,
        co2High: customSettings.co2High ?? cropDetails.co2_max,
        luxLow: customSettings.luxLow ?? Math.round((cropDetails.ppfd_min || 0) * 60),
        luxHigh: customSettings.luxHigh ?? Math.round((cropDetails.ppfd_max || 0) * 60),
        dimming: customSettings.dimming ?? 75,
      };

      let success = false;

      if (typeof publishSettings === "function") {
        success = await publishSettings(externalKey, cropSettings);
      }

      if (success) {
        Alert.alert(
          "✅ Success",
          `Crop settings for ${cropDetails.crop_name || selectedCropName} published successfully!`,
          [
            {
              text: "Go to Dashboard",
              onPress: () => router.push("/(main)/dashboard")
            }
          ]
        );
      } else {
        Alert.alert("Failed", "Could not publish settings. Please try again.");
      }
    } catch (error) {
      console.error("❌ Publish error:", error);
      Alert.alert("Error", "An error occurred while publishing.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ============================================
  // STEP 1: RENDER CROP LIST
  // ============================================
  const renderCropStep = () => (
    <FlatList
      ref={scrollRef}
      data={crops}
      onScroll={onScroll}
      scrollEventThrottle={16}
      keyExtractor={(item, index) => `${item}-${index}`}
      ListHeaderComponent={renderWizardHeader("crop")}
      renderItem={({ item }) => {
        const isSelected = selectedCropName === item;
        const isLoading = loading && isSelected;
        return (
          <TouchableOpacity
            style={[
              styles.optionCard,
              { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
              isSelected && { borderColor: primary, backgroundColor: `${primary}0D` },
            ]}
            onPress={() => handleSelectCrop(item)}
            activeOpacity={0.7}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel={`Select crop ${item}`}
          >
            <View style={[styles.optionIcon, { backgroundColor: `${primary}1A` }]}>
              <Ionicons name="leaf-outline" size={20} color={primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.optionTitle, { color: theme.colors.text }]}>{item}</Text>
              <Text style={[styles.optionSub, { color: theme.colors.textSecondary }]}>
                Configure growing parameters
              </Text>
            </View>
            {isLoading ? (
              <ActivityIndicator size="small" color={primary} />
            ) : (
              <Ionicons name="chevron-forward" size={20} color={theme.colors.textSecondary} />
            )}
          </TouchableOpacity>
        );
      }}
      contentContainerStyle={[styles.listContent, { paddingTop: headerHeight }]}
      showsVerticalScrollIndicator={false}
      ListEmptyComponent={
        !loading && (
          <View style={styles.emptyContainer}>
            <Ionicons name="leaf-outline" size={48} color={theme.colors.textSecondary} />
            <Text style={[styles.emptyText, { color: theme.colors.text }]}>No crops found</Text>
          </View>
        )
      }
    />
  );

  // ============================================
  // STEP 2: RENDER VARIETY LIST
  // ============================================
  const renderVarietyStep = () => {
    const varietyNames = [...new Set(varietyData.map((i) => i.crop_variety_name || "General"))];

    return (
      <FlatList
        ref={scrollRef}
        data={varietyNames}
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyExtractor={(item, index) => `${item}-${index}`}
        ListHeaderComponent={renderWizardHeader("variety")}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[
              styles.optionCard,
              { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
            ]}
            onPress={() => handleSelectVariety(item)}
            activeOpacity={0.7}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel={`Select variety ${item}`}
          >
            <View style={[styles.optionIcon, { backgroundColor: `${primary}1A` }]}>
              <Ionicons name="git-branch-outline" size={20} color={primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.optionTitle, { color: theme.colors.text }]}>{item}</Text>
              <Text style={[styles.optionSub, { color: theme.colors.textSecondary }]}>
                {selectedCropName} variety
              </Text>
            </View>
            {loading && selectedVariety === item ? (
              <ActivityIndicator size="small" color={primary} />
            ) : (
              <Ionicons name="chevron-forward" size={20} color={theme.colors.textSecondary} />
            )}
          </TouchableOpacity>
        )}
        contentContainerStyle={[styles.listContent, { paddingTop: headerHeight }]}
        showsVerticalScrollIndicator={false}
      />
    );
  };

  // ============================================
  // STEP 3: RENDER STAGE LIST
  // ============================================
  const renderStageStep = () => {
    const stagesForVariety = varietyData.filter(
      (item) => (item.crop_variety_name || "General") === selectedVariety
    );

    return (
      <FlatList
        ref={scrollRef}
        data={stagesForVariety}
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyExtractor={(item) => String(item.parameter_id)}
        ListHeaderComponent={renderWizardHeader("stage")}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[
              styles.optionCard,
              { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
            ]}
            onPress={() => handleSelectStage(item)}
            activeOpacity={0.7}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel={`Select stage ${item.stage_id || "Unknown"}`}
          >
            <View style={[styles.optionIcon, { backgroundColor: `${primary}1A` }]}>
              <Ionicons name="trending-up-outline" size={20} color={primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.optionTitle, { color: theme.colors.text }]}>
                {item.stage_id || "Unknown Stage"}
              </Text>
              <Text style={[styles.optionSub, { color: theme.colors.textSecondary }]}>
                {selectedVariety} · growth stage
              </Text>
            </View>
            {loading && selectedStageItem?.parameter_id === item.parameter_id ? (
              <ActivityIndicator size="small" color={primary} />
            ) : (
              <Ionicons name="chevron-forward" size={20} color={theme.colors.textSecondary} />
            )}
          </TouchableOpacity>
        )}
        contentContainerStyle={[styles.listContent, { paddingTop: headerHeight }]}
        showsVerticalScrollIndicator={false}
      />
    );
  };

  // ============================================
  // STEP 4: RENDER DETAILS + ACTIONS
  // ============================================
  const renderDetailsStep = () => {
    if (!cropDetails) return null;

    return (
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.detailsScrollContent, { paddingTop: headerHeight }]}
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        {renderWizardHeader("details")}

        {/* Summary card */}
        <View style={[styles.detailsCard, { backgroundColor: theme.colors.surface }]}>
          <View style={styles.detailsHeader}>
            <View style={[styles.detailsHeaderIcon, { backgroundColor: `${primary}1A` }]}>
              <Ionicons name="leaf" size={22} color={primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.detailsTitle, { color: theme.colors.text }]}>
                {cropDetails.crop_name || selectedCropName}
              </Text>
              <Text style={[styles.detailsChip, { color: theme.colors.textSecondary }]}>
                {cropDetails.crop_variety_name || selectedVariety || "General"} ·{" "}
                {cropDetails.stage_id || selectedStageItem?.stage_id || "N/A"}
              </Text>
            </View>
          </View>

          <View style={[styles.detailsDivider, { backgroundColor: theme.colors.border }]} />

          <View style={styles.detailRow}>
            <Ionicons name="thermometer-outline" size={16} color={theme.colors.textSecondary} />
            <Text style={[styles.detailLabel, { color: theme.colors.textSecondary }]}>Temperature</Text>
            <Text style={[styles.detailValue, { color: theme.colors.text }]}>
              {customSettings.tempLow}°C - {customSettings.tempHigh}°C
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Ionicons name="water-outline" size={16} color={theme.colors.textSecondary} />
            <Text style={[styles.detailLabel, { color: theme.colors.textSecondary }]}>Humidity</Text>
            <Text style={[styles.detailValue, { color: theme.colors.text }]}>
              {customSettings.humidityLow}% - {customSettings.humidityHigh}%
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Ionicons name="flask-outline" size={16} color={theme.colors.textSecondary} />
            <Text style={[styles.detailLabel, { color: theme.colors.textSecondary }]}>pH</Text>
            <Text style={[styles.detailValue, { color: theme.colors.text }]}>
              {customSettings.phLow} - {customSettings.phHigh}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Ionicons name="cloud-outline" size={16} color={theme.colors.textSecondary} />
            <Text style={[styles.detailLabel, { color: theme.colors.textSecondary }]}>CO₂</Text>
            <Text style={[styles.detailValue, { color: theme.colors.text }]}>
              {customSettings.co2Low} - {customSettings.co2High} ppm
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Ionicons name="sunny-outline" size={16} color={theme.colors.textSecondary} />
            <Text style={[styles.detailLabel, { color: theme.colors.textSecondary }]}>PPFD</Text>
            <Text style={[styles.detailValue, { color: theme.colors.text }]}>
              {Math.round((customSettings.luxLow || 0) / 60)} - {Math.round((customSettings.luxHigh || 0) / 60)} µmol/m²/s
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Ionicons name="contrast-outline" size={16} color={theme.colors.textSecondary} />
            <Text style={[styles.detailLabel, { color: theme.colors.textSecondary }]}>Dimming</Text>
            <Text style={[styles.detailValue, { color: theme.colors.text }]}>{customSettings.dimming || 0}%</Text>
          </View>
        </View>

        {/* Auto Mode Banner */}
        {isAutoMode && (
          <View style={[styles.autoModeBanner, { backgroundColor: "rgba(255,152,0,0.08)", borderColor: "rgba(255,152,0,0.2)" }]}>
            <Ionicons name="lock-closed-outline" size={18} color="#FF9800" />
            <View style={{ flex: 1 }}>
              <Text style={[styles.autoModeBannerTitle, { color: "#E65100" }]}>Auto Mode Active</Text>
              <Text style={[styles.autoModeBannerText, { color: "#F57C00" }]}>Settings are managed automatically. Switch to Manual mode to customize.</Text>
            </View>
          </View>
        )}

        {/* Customize + Preview */}
        <View style={styles.actionContainer}>
          <TouchableOpacity
            style={[styles.actionButton, { shadowColor: "#E65100", opacity: (isAutoMode || !isDeviceOnline) ? 0.5 : 1 }]}
            onPress={() => !isAutoMode && isDeviceOnline && setShowCustomizeModal(true)}
            activeOpacity={0.85}
            disabled={isAutoMode || !isDeviceOnline}
            accessibilityRole="button"
          >
            <LinearGradient
              colors={isAutoMode || !isDeviceOnline ? ["#BDBDBD", "#9E9E9E"] : ["#FFB300", "#F57C00"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.actionGradient}
            >
              <Ionicons name={isAutoMode || !isDeviceOnline ? "lock-closed-outline" : "settings-outline"} size={18} color="#fff" />
              <Text style={styles.actionButtonText}>
                {isAutoMode ? "Locked" : !isDeviceOnline ? "Offline" : "Customize"}
              </Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, { shadowColor: "#1565C0" }]}
            onPress={() => setShowSenMLPreview(true)}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            <LinearGradient
              colors={["#42A5F5", "#1E88E5"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.actionGradient}
            >
              <Ionicons name="eye-outline" size={18} color="#fff" />
              <Text style={styles.actionButtonText}>Preview</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* Publish */}
        <TouchableOpacity
          style={[
            styles.publishBtn,
            (isConnected && isManualMode && isDeviceOnline) ? { shadowColor: primaryDark } : null,
            (isAutoMode || !isDeviceOnline) && { opacity: 0.5 },
          ]}
          onPress={handlePublish}
          disabled={!isConnected || isSubmitting || isAutoMode || !isDeviceOnline}
          activeOpacity={0.85}
          accessibilityRole="button"
        >
          <LinearGradient
            colors={
              isConnected && isManualMode && isDeviceOnline
                ? [primary, primaryDark]
                : ["#9E9E9E", "#757575"]
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.publishGradient}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name={isAutoMode || !isDeviceOnline ? "lock-closed-outline" : "cloud-upload-outline"} size={20} color="#fff" />
                <Text style={styles.publishButtonText}>
                  {isAutoMode ? "Switch to Manual to Publish" : 
                   !isDeviceOnline ? "Device Offline" :
                   isConnected ? "Publish Settings" : "Device Not Connected"}
                </Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>

        {/* ✅ FIX: Show status messages - NOTHING while loading */}
        {!isConnected && (
          <Text style={[styles.statusMessage, { color: '#f44336' }]}>
            ⚠️ Device not connected. Please check your connection.
          </Text>
        )}
        {isConnected && isOffline && (
          <Text style={[styles.statusMessage, { color: '#f44336' }]}>
            ⚠️ Device is offline. Please wait for device to connect.
          </Text>
        )}
        {/* ✅ REMOVED the "Connecting..." message - show nothing while loading */}
      </ScrollView>
    );
  };

  // Renders whichever wizard step is requested
  const renderStepFor = (s) => {
    if (s === "crop") return renderCropStep();
    if (s === "variety") return renderVarietyStep();
    if (s === "stage") return renderStageStep();
    if (s === "details") return renderDetailsStep();
    return null;
  };

  // Shared wizard header
  const renderWizardHeader = (s) => {
    const idx = STEP_ORDER.indexOf(s) + 1;
    return (
      <View>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={handleBack}
            style={[styles.backButton, { backgroundColor: theme.colors.surface }]}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
          </TouchableOpacity>

          <View style={styles.headerCenter}>
            <Text style={[styles.headerTitle, { color: theme.colors.text }]}>{stepTitles[s]}</Text>
          </View>

          <View style={styles.headerRight} />
        </View>

        <View style={styles.progressWrap}>
          <View style={styles.progressTrack}>
            {STEP_ORDER.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.progressSegment,
                  { backgroundColor: i + 1 <= idx ? primary : theme.colors.border },
                ]}
              />
            ))}
          </View>
          <View style={styles.progressMeta}>
            <Text style={[styles.stepLabel, { color: theme.colors.textSecondary }]}>
              Step {idx} of 4 · {stepLabels[s]}
            </Text>
            {/* ✅ FIX: Show status ONLY when not loading - SAME AS LAYOUT */}
            <View style={[styles.statusPill, { backgroundColor: liveStatus ? liveStatus.bg : 'transparent' }]}>
              {liveStatus && (
                <>
                  <View style={[styles.statusDot, { backgroundColor: liveStatus.color }]} />
                  <Text style={[styles.statusPillText, { color: liveStatus.color }]}>
                    {liveStatus.label}
                  </Text>
                </>
              )}
            </View>
          </View>
        </View>

        <Text style={[styles.headerSubtitle, { color: theme.colors.textSecondary }]}>
          {stepSubtitles[s]}
        </Text>
      </View>
    );
  };

  const primary = theme.colors.primary;
  const primaryDark = theme.colors.primaryDark;

  const stepTitles = {
    crop: "Select Crop",
    variety: "Select Variety",
    stage: "Select Stage",
    details: "Crop Details",
  };

  const stepSubtitles = {
    crop: "Choose a crop to configure its growing parameters",
    variety: `Choose a variety for ${selectedCropName}`,
    stage: `Choose a growth stage for ${selectedVariety}`,
    details: "Review, customize, and publish these settings",
  };

  const stepLabels = {
    crop: "Choose crop",
    variety: "Choose variety",
    stage: "Choose stage",
    details: "Review & publish",
  };

  // ============================================
  // CONNECTION ERROR SCREENS
  // ============================================
  if (connectionStatus === "no_key") {
    return (
      <SafeAreaView style={[styles.container, styles.centerContainer, { backgroundColor: theme.colors.background, paddingTop: headerHeight }]} edges={["top", "bottom"]}>
        <View style={[styles.errorIconWrap, { backgroundColor: `${primary}1A` }]}>
          <Ionicons name="warning-outline" size={52} color="#FF9800" />
        </View>
        <Text style={[styles.errorTitle, { color: theme.colors.text }]}>No Device Found</Text>
        <Text style={[styles.errorText, { color: theme.colors.textSecondary }]}>
          Please add a device first before selecting crops.
        </Text>
        <TouchableOpacity
          style={[styles.primaryBtn, { shadowColor: primaryDark }]}
          onPress={() => router.push("/(main)/devices")}
          activeOpacity={0.85}
          accessibilityRole="button"
        >
          <LinearGradient
            colors={[primary, primaryDark]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.primaryBtnGradient}
          >
            <Ionicons name="hardware-chip" size={20} color="#fff" />
            <Text style={styles.primaryBtnText}>Add Device</Text>
          </LinearGradient>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (connectionStatus === "failed") {
    return (
      <SafeAreaView style={[styles.container, styles.centerContainer, { backgroundColor: theme.colors.background, paddingTop: headerHeight }]} edges={["top", "bottom"]}>
        <View style={[styles.errorIconWrap, { backgroundColor: `${theme.colors.error}1A` }]}>
          <Ionicons name="close-circle-outline" size={52} color={theme.colors.error} />
        </View>
        <Text style={[styles.errorTitle, { color: theme.colors.text }]}>Connection Failed</Text>
        <Text style={[styles.errorText, { color: theme.colors.textSecondary }]}>
          Could not connect to MQTT broker. Please try again.
        </Text>
        <TouchableOpacity
          style={[styles.primaryBtn, { shadowColor: primaryDark }]}
          onPress={() => {
            setConnectionStatus("checking");
            checkConnection();
          }}
          activeOpacity={0.85}
          accessibilityRole="button"
        >
          <LinearGradient
            colors={[primary, primaryDark]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.primaryBtnGradient}
          >
            <Ionicons name="refresh" size={20} color="#fff" />
            <Text style={styles.primaryBtnText}>Retry Connection</Text>
          </LinearGradient>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // ============================================
  // MAIN RENDER
  // ============================================
  return (
    <SafeAreaView
      style={[
        styles.container,
        { backgroundColor: theme.colors.background },
      ]}
      edges={["bottom"]}
    >
      <View style={styles.stepBody}>
        <Animated.View
          style={[
            StyleSheet.absoluteFillObject,
            { transform: [{ translateX: baseX }] },
          ]}
        >
          {renderStepFor(displayStep)}
        </Animated.View>

        {incomingStep && (
          <Animated.View
            style={[
              StyleSheet.absoluteFillObject,
              { transform: [{ translateX: incomingX }] },
            ]}
          >
            {renderStepFor(incomingStep)}
          </Animated.View>
        )}

        {loading && step !== "crop" && step !== "details" && (
          <View
            style={[
              styles.loadingOverlay,
              {
                backgroundColor: theme.dark
                  ? "rgba(18,18,18,0.4)"
                  : "rgba(255,255,255,0.4)",
              },
            ]}
            pointerEvents="none"
          >
            <ActivityIndicator size="large" color={primary} />
          </View>
        )}
      </View>

      <CustomizeSettingsModal
        visible={showCustomizeModal}
        onClose={() => setShowCustomizeModal(false)}
        customSettings={customSettings}
        cropDetails={cropDetails}
        theme={theme}
        onApply={(parsed) => {
          setCustomSettings(parsed);
          setShowCustomizeModal(false);
        }}
      />

      <SenMLPreviewModal
        visible={showSenMLPreview}
        onClose={() => setShowSenMLPreview(false)}
        cropDetails={cropDetails}
        customSettings={customSettings}
        theme={theme}
      />
    </SafeAreaView>
  );
}

// ============================================
// STYLES
// ============================================
const styles = StyleSheet.create({
  container: { flex: 1 },
  centerContainer: { justifyContent: "center", alignItems: "center", padding: 20 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 8,
    paddingBottom: 4,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  headerCenter: { flex: 1, alignItems: "center" },
  headerTitle: { fontSize: 20, fontWeight: "700", letterSpacing: 0.3 },
  headerRight: { width: 40 },
  headerSubtitle: {
    fontSize: 13.5,
    marginBottom: 10,
    opacity: 0.9,
    lineHeight: 19,
  },
  progressWrap: {
    paddingTop: 6,
    paddingBottom: 4,
  },
  progressTrack: {
    flexDirection: "row",
    gap: 8,
  },
  progressSegment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },
  progressMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
  },
  stepLabel: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusPillText: { fontSize: 11, fontWeight: "700" },
  stepBody: { flex: 1, overflow: "hidden" },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  listContent: { paddingHorizontal: 16, paddingBottom: 16 },
  detailsScrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  optionCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 16,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  optionIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  optionTitle: { fontSize: 16, fontWeight: "700" },
  optionSub: { fontSize: 12, marginTop: 2, opacity: 0.85 },
  detailsCard: {
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  detailsHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  detailsHeaderIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  detailsTitle: { fontSize: 18, fontWeight: "800" },
  detailsChip: { fontSize: 12.5, marginTop: 3, fontWeight: "600" },
  detailsDivider: { height: 1, marginVertical: 14 },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
  },
  detailLabel: { flex: 1, fontSize: 13.5, fontWeight: "500", marginLeft: 2 },
  detailValue: { fontSize: 13.5, fontWeight: "700" },
  actionContainer: { flexDirection: "row", gap: 10, marginBottom: 14 },
  actionButton: {
    flex: 1,
    borderRadius: 50,
    overflow: "hidden",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },
  actionGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
  },
  actionButtonText: { color: "#fff", fontSize: 14.5, fontWeight: "700" },
  publishBtn: {
    borderRadius: 50,
    overflow: "hidden",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
    marginBottom: Platform.OS === "ios" ? "6%" : "4%",
  },
  publishGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
  },
  publishButtonText: { color: "#fff", fontSize: 16, fontWeight: "700", letterSpacing: 0.3 },
  primaryBtn: {
    width: "80%",
    borderRadius: 50,
    overflow: "hidden",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },
  primaryBtnGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 15,
  },
  primaryBtnText: { color: "#fff", fontSize: 16, fontWeight: "700", letterSpacing: 0.3 },
  modalContainer: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalContent: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: "90%" },
  modalScrollContent: { paddingBottom: 40 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: "700" },
  sliderSectionTitle: { fontSize: 15, fontWeight: "700" },
  sliderHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  sliderValueBadge: {
    fontSize: 13,
    fontWeight: "700",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
    overflow: "hidden",
  },
  sliderScaleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 2,
    paddingHorizontal: 2,
  },
  sliderScaleText: { fontSize: 10.5, fontWeight: "600", letterSpacing: 0.3 },
  sliderCard: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    marginBottom: 12,
  },
  modalButtons: { flexDirection: "row", gap: 10, marginTop: 16, marginBottom: 20 },
  modalButton: { flex: 1, borderRadius: 50, overflow: "hidden" },
  resetButton: { borderWidth: 1, alignItems: "center", justifyContent: "center", paddingVertical: 13 },
  resetButtonText: { fontWeight: "600", fontSize: 14 },
  applyGradient: {
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  applyButtonText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  previewHeaderIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  previewSubtitle: { fontSize: 11.5, marginTop: 1, opacity: 0.7 },
  previewCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: "center",
    alignItems: "center",
  },
  previewCropChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 14,
  },
  previewCropChipText: { fontSize: 12, fontWeight: "600", flex: 1 },
  previewInfoCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 12,
  },
  previewInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
  },
  previewInfoLabel: { fontSize: 12, fontWeight: "500", width: 80 },
  previewInfoValue: { fontSize: 12, fontWeight: "600", flex: 1, textAlign: "right" },
  previewInfoDivider: { height: 1, marginVertical: 2 },
  previewGroupCard: {
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
    overflow: "hidden",
  },
  previewGroupHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderLeftWidth: 3,
  },
  previewGroupIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  previewGroupTitle: { fontSize: 13, fontWeight: "700" },
  previewSensorRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderTopWidth: 1,
  },
  previewSensorName: { fontSize: 12.5, fontWeight: "500", flex: 1 },
  previewSensorValue: { fontSize: 13, fontWeight: "700" },
  emptyContainer: { alignItems: "center", justifyContent: "center", paddingVertical: 40, gap: 12 },
  emptyText: { fontSize: 16, fontWeight: "500" },
  autoModeBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 14,
  },
  autoModeBannerTitle: { fontSize: 13, fontWeight: "700", marginBottom: 2 },
  autoModeBannerText: { fontSize: 11.5, lineHeight: 16, opacity: 0.85 },
  errorIconWrap: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  errorTitle: { fontSize: 22, fontWeight: "800", marginTop: 4 },
  errorText: { fontSize: 14, textAlign: "center", marginTop: 8, marginBottom: 28, lineHeight: 20, opacity: 0.9 },
  statusMessage: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 12,
    fontWeight: '600',
  },
});