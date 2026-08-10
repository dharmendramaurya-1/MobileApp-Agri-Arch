// app/(auth)/add_crops.jsx - Wizard UI with resetSignupFlow
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
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
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../src/context/AuthContext"; // ✅ Import useAuth
import { useMqtt } from "../../src/context/MqttContext";
import { useTheme } from "../../src/context/ThemContext";
import {
  getAllCrops,
  getParameterById,
  getParametersByCropName,
} from "../../src/services/add_crops/add_crops";

// Wizard step order (used by the slide transition to decide direction)
const STEP_ORDER = ["crop", "variety", "stage", "details"];

// ============================================
// SENML FORMAT CONVERTER
// ============================================
function convertToSenML(cropData, customSettings) {
  const baseTime = Math.floor(Date.now() / 1000);

  return [
    { bn: "urn:dev:hydro-001:", bt: baseTime },
    { n: "temp_low", v: customSettings.tempLow ?? cropData.temperature_min },
    { n: "temp_high", v: customSettings.tempHigh ?? cropData.temperature_max },
    { n: "humidity_low", v: customSettings.humidityLow ?? cropData.humidity_min },
    { n: "humidity_high", v: customSettings.humidityHigh ?? cropData.humidity_max },
    { n: "water_temp_low", v: customSettings.waterTempLow ?? cropData.nutrient_temp_min },
    { n: "water_temp_high", v: customSettings.waterTempHigh ?? cropData.nutrient_temp_max },
    { n: "water_level_low", v: customSettings.waterLevelLow ?? 25 },
    { n: "water_level_high", v: customSettings.waterLevelHigh ?? 90 },
    { n: "ph_low", v: customSettings.phLow ?? cropData.ph_min },
    { n: "ph_high", v: customSettings.phHigh ?? cropData.ph_max },
    { n: "co2_low", v: customSettings.co2Low ?? cropData.co2_min },
    { n: "co2_high", v: customSettings.co2High ?? cropData.co2_max },
    { n: "lux_low", v: customSettings.luxLow ?? Math.round((cropData.ppfd_min || 0) * 60) },
    { n: "lux_high", v: customSettings.luxHigh ?? Math.round((cropData.ppfd_max || 0) * 60) },
    { n: "dimming", v: customSettings.dimming ?? 75 },
  ];
}

// ============================================
// MAIN COMPONENT
// ============================================
export default function AddCrops() {
  const { theme } = useTheme();
  const { isConnected, externalKey, forceReconnect, publishSettings, publishSenML } = useMqtt();
  const { resetSignupFlow } = useAuth(); // ✅ Get resetSignupFlow from AuthContext

  // Wizard step: 'crop' -> 'variety' -> 'stage' -> 'details'
  const [step, setStep] = useState("crop");

  // Data from the 3 APIs
  const [crops, setCrops] = useState([]);                 // API 1: string[]
  const [varietyData, setVarietyData] = useState([]);     // API 2: raw list for selected crop
  const [cropDetails, setCropDetails] = useState(null);    // API 3: full details

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

  // ============================================
  // CUSTOMIZE MODAL STATE - MOVED TO TOP LEVEL
  // ============================================
  const [draft, setDraft] = useState(() => {
    const initial = {};
    Object.keys(customSettings).forEach((key) => {
      initial[key] = String(customSettings[key] || 0);
    });
    return initial;
  });

  // ─── Step slide transition (forward: left→right, back: right→left) ────
  const screenW = Dimensions.get("window").width;
  const [displayStep, setDisplayStep] = useState("crop"); // step in the base panel
  const [incomingStep, setIncomingStep] = useState(null);   // step sliding in
  // Two stable Animated values drive the two panels. They are created once and
  // animated in parallel, so re-renders during the animation (e.g. a loading
  // flag flipping right after the step change) can never reset the transform
  // and leave the incoming panel stuck off-screen.
  const baseX = useRef(new Animated.Value(0)).current;      // base panel translateX
  const incomingX = useRef(new Animated.Value(0)).current;  // incoming panel translateX
  const transitionLock = useRef(false);
  const prevStepRef = useRef("crop");

  useEffect(() => {
    const prev = prevStepRef.current;
    if (prev === step) return;
    prevStepRef.current = step;

    if (transitionLock.current) {
      // mid-slide change: settle instantly instead of fighting the animation.
      // stopAnimation() forces the in-flight callback to fire with finished:false
      // so its stale `step` closure cannot revert displayStep afterwards.
      baseX.stopAnimation();
      incomingX.stopAnimation();
      setDisplayStep(step);
      setIncomingStep(null);
      baseX.setValue(0);
      incomingX.setValue(0);
      return;
    }

    const dir =
      STEP_ORDER.indexOf(step) > STEP_ORDER.indexOf(prev) ? "forward" : "back";
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
          useNativeDriver: true,
        }),
        Animated.timing(incomingX, {
          toValue: 0,
          duration: 300,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) {
          setDisplayStep(step);
          setIncomingStep(null);
          baseX.setValue(0);
          incomingX.setValue(0);
        }
        transitionLock.current = false;
      });
    });
  }, [step]);

  // Stop any running slide if the screen unmounts mid-animation
  useEffect(
    () => () => {
      baseX.stopAnimation();
      incomingX.stopAnimation();
    },
    []
  );

  // ============================================
  // EFFECTS - MOVED TO TOP LEVEL
  // ============================================
  useEffect(() => {
    checkConnection();
    loadCrops();
  }, []);

  // Update draft when modal opens
  useEffect(() => {
    if (showCustomizeModal) {
      const initial = {};
      Object.keys(customSettings).forEach((key) => {
        initial[key] = String(customSettings[key] || 0);
      });
      setDraft(initial);
    }
  }, [showCustomizeModal]);

  const checkConnection = async () => {
    const key = await AsyncStorage.getItem("external_key");

    if (key && isConnected) {
      setConnectionStatus("connected");
    } else if (key) {
      setConnectionStatus("reconnecting");
      try {
        await forceReconnect(key);
        setConnectionStatus("connected");
      } catch (error) {
        setConnectionStatus("failed");
      }
    } else {
      setConnectionStatus("no_key");
    }
  };

  // ============================================
  // API 1: LOAD CROP NAMES (flat string array)
  // ============================================
  const loadCrops = async () => {
    try {
      setLoading(true);
      const result = await getAllCrops();
      if (result.success) {
        setCrops(Array.isArray(result.data) ? result.data : []);
      } else {
        Alert.alert("Error", result.message || "Failed to load crops");
      }
    } catch (error) {
      console.error("Error loading crops:", error);
      Alert.alert("Error", "Failed to load crops");
    } finally {
      setLoading(false);
    }
  };

  // ============================================
  // API 3: FETCH FULL DETAILS FOR A parameter_id
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
  // Pick a variety -> either go to stage list, or auto-select
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
  // API 2: FETCH VARIETIES/STAGES FOR A SELECTED CROP
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
  // BACK NAVIGATION BETWEEN STEPS
  // ============================================
  const handleBack = () => {
    if (step === "crop") {
      router.push("/(auth)/add_device"); // Navigate back to add_device
      // router.back();
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

      // NOTE: cropDetails is intentionally kept so the details panel stays
      // fully rendered while it slides out (no blank frame during the back swipe).
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

    setIsSubmitting(true);

    try {
      const cropSettings = {
        cropName: cropDetails.crop_name || selectedCropName,
        variety: cropDetails.crop_variety_name || selectedVariety || "General",
        stage: cropDetails.stage_id || selectedStageItem?.stage_id,
        tempLow: customSettings.tempLow,
        tempHigh: customSettings.tempHigh,
        humidityLow: customSettings.humidityLow,
        humidityHigh: customSettings.humidityHigh,
        waterTempLow: customSettings.waterTempLow,
        waterTempHigh: customSettings.waterTempHigh,
        waterLevelLow: customSettings.waterLevelLow,
        waterLevelHigh: customSettings.waterLevelHigh,
        phLow: customSettings.phLow,
        phHigh: customSettings.phHigh,
        co2Low: customSettings.co2Low,
        co2High: customSettings.co2High,
        luxLow: customSettings.luxLow,
        luxHigh: customSettings.luxHigh,
        dimming: customSettings.dimming,
        durationDays: `${cropDetails.stage_duration_min || 0}-${cropDetails.stage_duration_max || 0} DAS`,
        photoperiod: `${cropDetails.photo_period_min || 0}-${cropDetails.photo_period_max || 0} hrs/day`,
        expectedYield: cropDetails.yield_per_plant || "-",
        lastUpdated: new Date(),
      };

      let success = false;

      if (typeof publishSettings === "function") {
        success = await publishSettings(cropSettings);
      } else if (typeof publishSenML === "function") {
        const senmlData = convertToSenML(cropDetails, customSettings);
        success = await publishSenML(senmlData, "settings");
      }

      if (success) {
        // ✅ RESET SIGNUP FLOW AFTER SUCCESSFUL PUBLISH
        console.log("🔄 Resetting signup flow after successful publish");
        await resetSignupFlow();

        Alert.alert(
          "✅ Success",
          `Crop settings for ${cropDetails.crop_name || selectedCropName} published successfully!`,
          [{ text: "Go to Dashboard", onPress: () => router.replace("/(main)/dashboard") }]
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
  // UPDATE DRAFT FUNCTION
  // ============================================
  const updateDraft = (key, value) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  // ============================================
  // HANDLE APPLY CUSTOM SETTINGS
  // ============================================
  const handleApplySettings = () => {
    const parsed = {};
    Object.keys(draft).forEach((key) => {
      parsed[key] = parseFloat(draft[key]) || 0;
    });
    setCustomSettings(parsed);
    setShowCustomizeModal(false);
    Alert.alert("✅ Success", "Settings updated successfully!");
  };

  // ============================================
  // HANDLE RESET CUSTOM SETTINGS
  // ============================================
  const handleResetSettings = () => {
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

  // ============================================
  // STEP 1: RENDER CROP LIST
  // ============================================
  const renderCropStep = () => (
    <FlatList
      data={crops}
      keyExtractor={(item, index) => `${item}-${index}`}
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
      contentContainerStyle={styles.listContent}
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
        data={varietyNames}
        keyExtractor={(item, index) => `${item}-${index}`}
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
        contentContainerStyle={styles.listContent}
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
        data={stagesForVariety}
        keyExtractor={(item) => String(item.parameter_id)}
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
        contentContainerStyle={styles.listContent}
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
      <ScrollView contentContainerStyle={styles.detailsScrollContent} showsVerticalScrollIndicator={false}>
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
              {cropDetails.temperature_min || 0}°C - {cropDetails.temperature_max || 0}°C
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Ionicons name="water-outline" size={16} color={theme.colors.textSecondary} />
            <Text style={[styles.detailLabel, { color: theme.colors.textSecondary }]}>Humidity</Text>
            <Text style={[styles.detailValue, { color: theme.colors.text }]}>
              {cropDetails.humidity_min || 0}% - {cropDetails.humidity_max || 0}%
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Ionicons name="flask-outline" size={16} color={theme.colors.textSecondary} />
            <Text style={[styles.detailLabel, { color: theme.colors.textSecondary }]}>pH</Text>
            <Text style={[styles.detailValue, { color: theme.colors.text }]}>
              {cropDetails.ph_min || 0} - {cropDetails.ph_max || 0}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Ionicons name="cloud-outline" size={16} color={theme.colors.textSecondary} />
            <Text style={[styles.detailLabel, { color: theme.colors.textSecondary }]}>CO₂</Text>
            <Text style={[styles.detailValue, { color: theme.colors.text }]}>
              {cropDetails.co2_min || 0} - {cropDetails.co2_max || 0} ppm
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Ionicons name="sunny-outline" size={16} color={theme.colors.textSecondary} />
            <Text style={[styles.detailLabel, { color: theme.colors.textSecondary }]}>PPFD</Text>
            <Text style={[styles.detailValue, { color: theme.colors.text }]}>
              {cropDetails.ppfd_min || 0} - {cropDetails.ppfd_max || 0} µmol/m²/s
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Ionicons name="contrast-outline" size={16} color={theme.colors.textSecondary} />
            <Text style={[styles.detailLabel, { color: theme.colors.textSecondary }]}>Dimming</Text>
            <Text style={[styles.detailValue, { color: theme.colors.text }]}>{customSettings.dimming || 0}%</Text>
          </View>
        </View>

        {/* Customize + Preview */}
        <View style={styles.actionContainer}>
          <TouchableOpacity
            style={[styles.actionButton, { shadowColor: "#E65100" }]}
            onPress={() => setShowCustomizeModal(true)}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            <LinearGradient
              colors={["#FFB300", "#F57C00"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.actionGradient}
            >
              <Ionicons name="settings-outline" size={18} color="#fff" />
              <Text style={styles.actionButtonText}>Customize</Text>
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
            isConnected ? { shadowColor: primaryDark } : null,
          ]}
          onPress={handlePublish}
          disabled={!isConnected || isSubmitting}
          activeOpacity={0.85}
          accessibilityRole="button"
        >
          <LinearGradient
            colors={
              isConnected
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
                <Ionicons name="cloud-upload-outline" size={20} color="#fff" />
                <Text style={styles.publishButtonText}>
                  {isConnected ? "Publish Settings" : "Device Not Connected"}
                </Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>
    );
  };

  // ============================================
  // SENML PREVIEW MODAL
  // ============================================
  const renderSenMLPreview = () => {
    if (!cropDetails) return null;
    const senmlData = convertToSenML(cropDetails, customSettings);

    return (
      <Modal visible={showSenMLPreview} animationType="slide" transparent onRequestClose={() => setShowSenMLPreview(false)}>
        <View style={styles.modalContainer}>
          <View style={[styles.modalContent, { maxHeight: "80%", backgroundColor: theme.colors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.colors.text }]}>SenML Preview</Text>
              <TouchableOpacity onPress={() => setShowSenMLPreview(false)}>
                <Ionicons name="close" size={24} color={theme.colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.senmlContainer}>
                {senmlData.map((item, index) => (
                  <View key={index} style={[styles.senmlItem, { borderBottomColor: theme.colors.border }]}>
                    <Text style={[styles.senmlName, { color: theme.colors.textSecondary }]}>
                      {item.bn ? "Base Name" : item.n}
                    </Text>
                    <View style={styles.senmlValueContainer}>
                      {item.bn && <Text style={[styles.senmlValue, { color: theme.colors.text }]}>{item.bn}</Text>}
                      {item.bt !== undefined && (
                        <Text style={[styles.senmlValue, { color: theme.colors.text }]}>
                          {new Date(item.bt * 1000).toLocaleString()}
                        </Text>
                      )}
                      {item.v !== undefined && !item.bn && (
                        <Text style={[styles.senmlValue, { color: theme.colors.text }]}>{item.v}</Text>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  };

  // ============================================
  // CUSTOMIZE SETTINGS MODAL
  // ============================================
  const renderCustomizeModal = () => {
    if (!showCustomizeModal) return null;

    const inputFields = [
      { key: "tempLow", label: "Temperature Low (°C)", section: "🌡️ Temperature" },
      { key: "tempHigh", label: "Temperature High (°C)", section: "🌡️ Temperature" },
      { key: "humidityLow", label: "Humidity Low (%)", section: "💧 Humidity" },
      { key: "humidityHigh", label: "Humidity High (%)", section: "💧 Humidity" },
      { key: "waterTempLow", label: "Water Temp Low (°C)", section: "🌊 Water Temperature" },
      { key: "waterTempHigh", label: "Water Temp High (°C)", section: "🌊 Water Temperature" },
      { key: "waterLevelLow", label: "Water Level Low (%)", section: "💧 Water Level" },
      { key: "waterLevelHigh", label: "Water Level High (%)", section: "💧 Water Level" },
      { key: "phLow", label: "pH Low", section: "🧪 pH" },
      { key: "phHigh", label: "pH High", section: "🧪 pH" },
      { key: "co2Low", label: "CO₂ Low (ppm)", section: "🌬️ CO₂" },
      { key: "co2High", label: "CO₂ High (ppm)", section: "🌬️ CO₂" },
      { key: "luxLow", label: "Light Low (Lux)", section: "💡 Light" },
      { key: "luxHigh", label: "Light High (Lux)", section: "💡 Light" },
      { key: "dimming", label: "Dimming (%)", section: "🎛️ Dimming" },
    ];

    let currentSection = "";
    const groupedFields = [];
    inputFields.forEach((field) => {
      if (field.section !== currentSection) {
        currentSection = field.section;
        groupedFields.push({ type: "section", label: currentSection });
      }
      groupedFields.push({ type: "field", ...field });
    });

    return (
      <Modal visible={showCustomizeModal} animationType="slide" transparent onRequestClose={() => setShowCustomizeModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalContainer}>
          <View style={[styles.modalContent, { backgroundColor: theme.colors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.colors.text }]}>Customize Settings</Text>
              <TouchableOpacity onPress={() => setShowCustomizeModal(false)}>
                <Ionicons name="close" size={24} color={theme.colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator contentContainerStyle={styles.modalScrollContent} keyboardShouldPersistTaps="handled">
              {groupedFields.map((item, index) => {
                if (item.type === "section") {
                  return (
                    <Text key={index} style={[styles.sectionLabel, { color: theme.colors.text }]}>
                      {item.label}
                    </Text>
                  );
                }
                return (
                  <View key={item.key} style={styles.customInputContainer}>
                    <Text style={[styles.customInputLabel, { color: theme.colors.textSecondary }]}>{item.label}</Text>
                    <TextInput
                      style={[
                        styles.customInput,
                        { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.inputBackground },
                      ]}
                      value={draft[item.key] || ""}
                      onChangeText={(text) => updateDraft(item.key, text)}
                      keyboardType="decimal-pad"
                      placeholderTextColor={theme.colors.textSecondary}
                    />
                  </View>
                );
              })}

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.resetButton, { borderColor: theme.colors.border }]}
                  onPress={handleResetSettings}
                >
                  <Text style={[styles.resetButtonText, { color: theme.colors.textSecondary }]}>Reset to Default</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, { shadowColor: primaryDark }]}
                  onPress={handleApplySettings}
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
  };

  // Renders whichever wizard step is requested (used by both slide panels)
  const renderStepFor = (s) => {
    if (s === "crop") return renderCropStep();
    if (s === "variety") return renderVarietyStep();
    if (s === "stage") return renderStageStep();
    if (s === "details") return renderDetailsStep();
    return null;
  };

  const primary = theme.colors.primary;
  const primaryDark = theme.colors.primaryDark;

  const currentStepIndex = STEP_ORDER.indexOf(step) + 1;

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
      <SafeAreaView style={[styles.container, styles.centerContainer, { backgroundColor: theme.colors.background }]} edges={["top", "bottom"]}>
        <View style={[styles.errorIconWrap, { backgroundColor: `${primary}1A` }]}>
          <Ionicons name="warning-outline" size={52} color="#FF9800" />
        </View>
        <Text style={[styles.errorTitle, { color: theme.colors.text }]}>No Device Found</Text>
        <Text style={[styles.errorText, { color: theme.colors.textSecondary }]}>
          Please add a device first before selecting crops.
        </Text>
        <TouchableOpacity
          style={[styles.primaryBtn, { shadowColor: primaryDark }]}
          onPress={() => router.push("/(auth)/add_device")}
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
      <SafeAreaView style={[styles.container, styles.centerContainer, { backgroundColor: theme.colors.background }]} edges={["top", "bottom"]}>
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
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      edges={["top", "bottom"]}
    >
      {/* Header */}
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
          <Text style={[styles.headerTitle, { color: theme.colors.text }]}>{stepTitles[step]}</Text>
        </View>

        <View style={styles.headerRight}>
          <View style={[styles.stepBadge, { backgroundColor: `${primary}1A` }]}>
            <Text style={[styles.stepBadgeText, { color: primary }]}>Setup · 3/3</Text>
          </View>
        </View>
      </View>

      {/* Progress indicator */}
      <View style={styles.progressWrap}>
        <View style={styles.progressTrack}>
          {STEP_ORDER.map((_, i) => (
            <View
              key={i}
              style={[
                styles.progressSegment,
                { backgroundColor: i + 1 <= currentStepIndex ? primary : theme.colors.border },
              ]}
            />
          ))}
        </View>
        <View style={styles.progressMeta}>
          <Text style={[styles.stepLabel, { color: theme.colors.textSecondary }]}>
            Step {currentStepIndex} of 4 · {stepLabels[step]}
          </Text>
          <View
            style={[
              styles.statusPill,
              {
                backgroundColor:
                  connectionStatus === "connected" ? "rgba(76,175,80,0.12)" : "rgba(255,152,0,0.12)",
              },
            ]}
          >
            <View
              style={[
                styles.statusDot,
                { backgroundColor: connectionStatus === "connected" ? "#4CAF50" : "#FF9800" },
              ]}
            />
            <Text
              style={[
                styles.statusPillText,
                { color: connectionStatus === "connected" ? "#4CAF50" : "#FF9800" },
              ]}
            >
              {connectionStatus === "connected" ? "Connected" : "Connecting..."}
            </Text>
          </View>
        </View>
      </View>

      <Text style={[styles.headerSubtitle, { color: theme.colors.textSecondary }]}>
        {stepSubtitles[step]}
      </Text>

      {/* Step content with directional slide (no blink) */}
      <View style={styles.stepBody}>
        {/* Base panel — current step (slides out in the travel direction) */}
        <Animated.View
          style={[
            StyleSheet.absoluteFillObject,
            { transform: [{ translateX: baseX }] },
          ]}
        >
          {renderStepFor(displayStep)}
        </Animated.View>

        {/* Incoming panel — next step (slides in from the opposite edge) */}
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

        {/* Loading overlay — keeps current content visible while fetching */}
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

      {renderCustomizeModal()}
      {renderSenMLPreview()}
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
    paddingHorizontal: 16,
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
  headerRight: { width: 88, alignItems: "flex-end" },
  stepBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  stepBadgeText: { fontSize: 11, fontWeight: "700", letterSpacing: 0.3 },
  headerSubtitle: {
    fontSize: 13.5,
    paddingHorizontal: 20,
    marginBottom: 10,
    opacity: 0.9,
    lineHeight: 19,
  },
  progressWrap: {
    paddingHorizontal: 16,
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
  sectionLabel: { fontSize: 16, fontWeight: "700", marginTop: 16, marginBottom: 10 },
  customInputContainer: { marginBottom: 12 },
  customInputLabel: { fontSize: 13, marginBottom: 4 },
  customInput: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 14 },
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
  senmlContainer: { borderRadius: 10, padding: 12 },
  senmlItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottomWidth: 1,
  },
  senmlName: { fontSize: 13, fontWeight: "500" },
  senmlValueContainer: { flexDirection: "row", alignItems: "center" },
  senmlValue: { fontSize: 13, fontWeight: "600" },
  emptyContainer: { alignItems: "center", justifyContent: "center", paddingVertical: 40, gap: 12 },
  emptyText: { fontSize: 16, fontWeight: "500" },
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
});
