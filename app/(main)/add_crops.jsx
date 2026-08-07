// app/(main)/add_crops.jsx
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { useMqtt } from "../../src/context/MqttContext";
import { useTheme } from "../../src/context/ThemContext";
import {
  getAllCrops,
  getParameterById,
  getParametersByCropName,
} from "../../src/services/add_crops/add_crops";

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
// INPUT FIELD DEFINITIONS (shared by modal)
// ============================================
const CUSTOMIZE_INPUT_FIELDS = [
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

// ============================================
// CUSTOMIZE SETTINGS MODAL (standalone component)
// ============================================
function CustomizeSettingsModal({
  visible,
  onClose,
  customSettings,
  cropDetails,
  selectedCropName,
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

  // Re-sync the draft whenever the modal opens
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

  let currentSection = "";
  const groupedFields = [];
  CUSTOMIZE_INPUT_FIELDS.forEach((field) => {
    if (field.section !== currentSection) {
      currentSection = field.section;
      groupedFields.push({ type: "section", label: currentSection });
    }
    groupedFields.push({ type: "field", ...field });
  });

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
              <TouchableOpacity style={[styles.modalButton, styles.resetButton]} onPress={handleReset}>
                <Text style={styles.resetButtonText}>Reset to Default</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.applyButton, { backgroundColor: theme.colors.primary }]}
                onPress={handleApply}
              >
                <Text style={styles.applyButtonText}>Apply</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ============================================
// SENML PREVIEW MODAL (standalone component)
// ============================================
function SenMLPreviewModal({ visible, onClose, cropDetails, customSettings, theme }) {
  if (!cropDetails) return null;
  const senmlData = convertToSenML(cropDetails, customSettings);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalContainer}>
        <View style={[styles.modalContent, { maxHeight: "80%", backgroundColor: theme.colors.surface }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: theme.colors.text }]}>SenML Preview</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={theme.colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.senmlContainer}>
              {senmlData.map((item, index) => (
                <View key={index} style={styles.senmlItem}>
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
}

// ============================================
// MAIN COMPONENT
// ============================================
export default function AddCrops() {
  const { theme } = useTheme();
  const { isConnected, externalKey, forceReconnect, publishSettings, publishSenML } = useMqtt();

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
  // CHECK MQTT CONNECTION + LOAD CROPS ON MOUNT
  // ============================================
  useEffect(() => {
    checkConnection();
    loadCrops();
  }, []);

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
  // Pick a variety -> either go to stage list, or
  // auto-select if there's only one stage
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

      setCropDetails(null);
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
      data={crops}
      keyExtractor={(item, index) => `${item}-${index}`}
      renderItem={({ item }) => {
        const isSelected = selectedCropName === item;
        const isLoading = loading && isSelected;
        return (
          <TouchableOpacity
            style={[styles.card, isSelected && styles.cardSelected, { backgroundColor: theme.colors.card }]}
            onPress={() => handleSelectCrop(item)}
            activeOpacity={0.7}
            disabled={loading}
          >
            <View style={styles.cardHeader}>
              <View style={styles.radioOuter}>{isSelected && <View style={styles.radioInner} />}</View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cropName, { color: theme.colors.text }]}>{item}</Text>
              </View>
              {isLoading ? (
                <ActivityIndicator size="small" color={theme.colors.primary} />
              ) : (
                <Ionicons name="chevron-forward" size={20} color={theme.colors.textSecondary} />
              )}
            </View>
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
            style={[styles.card, { backgroundColor: theme.colors.card }]}
            onPress={() => handleSelectVariety(item)}
            activeOpacity={0.7}
            disabled={loading}
          >
            <View style={styles.cardHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cropName, { color: theme.colors.text }]}>{item}</Text>
              </View>
              {loading && selectedVariety === item ? (
                <ActivityIndicator size="small" color={theme.colors.primary} />
              ) : (
                <Ionicons name="chevron-forward" size={20} color={theme.colors.textSecondary} />
              )}
            </View>
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
            style={[styles.card, { backgroundColor: theme.colors.card }]}
            onPress={() => handleSelectStage(item)}
            activeOpacity={0.7}
            disabled={loading}
          >
            <View style={styles.cardHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cropName, { color: theme.colors.text }]}>
                  {item.stage_id || "Unknown Stage"}
                </Text>
              </View>
              {loading && selectedStageItem?.parameter_id === item.parameter_id ? (
                <ActivityIndicator size="small" color={theme.colors.primary} />
              ) : (
                <Ionicons name="chevron-forward" size={20} color={theme.colors.textSecondary} />
              )}
            </View>
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
      <ScrollView 
        contentContainerStyle={styles.detailsScrollContent} 
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.detailsCard, { backgroundColor: theme.colors.surface }]}>
          <Text style={[styles.detailsTitle, { color: theme.colors.text }]}>Crop Details</Text>

          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: theme.colors.textSecondary }]}>Crop</Text>
            <Text style={[styles.detailValue, { color: theme.colors.text }]}>
              {cropDetails.crop_name || selectedCropName}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: theme.colors.textSecondary }]}>Variety</Text>
            <Text style={[styles.detailValue, { color: theme.colors.text }]}>
              {cropDetails.crop_variety_name || selectedVariety || "N/A"}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: theme.colors.textSecondary }]}>Stage</Text>
            <Text style={[styles.detailValue, { color: theme.colors.text }]}>
              {cropDetails.stage_id || selectedStageItem?.stage_id || "N/A"}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: theme.colors.textSecondary }]}>Temperature</Text>
            <Text style={[styles.detailValue, { color: theme.colors.text }]}>
              {cropDetails.temperature_min || 0}°C - {cropDetails.temperature_max || 0}°C
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: theme.colors.textSecondary }]}>Humidity</Text>
            <Text style={[styles.detailValue, { color: theme.colors.text }]}>
              {cropDetails.humidity_min || 0}% - {cropDetails.humidity_max || 0}%
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: theme.colors.textSecondary }]}>pH</Text>
            <Text style={[styles.detailValue, { color: theme.colors.text }]}>
              {cropDetails.ph_min || 0} - {cropDetails.ph_max || 0}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: theme.colors.textSecondary }]}>CO₂</Text>
            <Text style={[styles.detailValue, { color: theme.colors.text }]}>
              {cropDetails.co2_min || 0} - {cropDetails.co2_max || 0} ppm
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: theme.colors.textSecondary }]}>PPFD</Text>
            <Text style={[styles.detailValue, { color: theme.colors.text }]}>
              {cropDetails.ppfd_min || 0} - {cropDetails.ppfd_max || 0} µmol/m²/s
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: theme.colors.textSecondary }]}>Dimming</Text>
            <Text style={[styles.detailValue, { color: theme.colors.text }]}>{customSettings.dimming || 0}%</Text>
          </View>
        </View>

        <View style={styles.actionContainer}>
          <TouchableOpacity
            style={[styles.actionButton, styles.customizeButton]}
            onPress={() => setShowCustomizeModal(true)}
          >
            <Ionicons name="settings-outline" size={20} color="#fff" />
            <Text style={styles.actionButtonText}>Customize</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.previewButton]}
            onPress={() => setShowSenMLPreview(true)}
          >
            <Ionicons name="eye-outline" size={20} color="#fff" />
            <Text style={styles.actionButtonText}>Preview</Text>
          </TouchableOpacity>
        </View>

        {/* Publish Button with bottom margin */}
        <View style={styles.publishWrapper}>
          <TouchableOpacity
            style={[
              styles.publishButton,
              { backgroundColor: isConnected ? "#4CAF50" : "#888", opacity: isConnected ? 1 : 0.6 },
            ]}
            onPress={handlePublish}
            disabled={!isConnected || isSubmitting}
            activeOpacity={0.85}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="cloud-upload-outline" size={20} color="#fff" />
                <Text style={styles.publishButtonText}>Publish Settings</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  };

  // ============================================
  // CONNECTION ERROR SCREENS
  // ============================================
  if (connectionStatus === "no_key") {
    return (
      <View style={[styles.container, styles.centerContainer, { backgroundColor: theme.colors.background }]}>
        <Ionicons name="warning-outline" size={60} color="#FF9800" />
        <Text style={[styles.errorTitle, { color: theme.colors.text }]}>No Device Found</Text>
        <Text style={[styles.errorText, { color: theme.colors.textSecondary }]}>
          Please add a device first before selecting crops.
        </Text>
        <TouchableOpacity style={styles.errorButton} onPress={() => router.push("/(main)/add_device")}>
          <Text style={styles.errorButtonText}>Add Device</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (connectionStatus === "failed") {
    return (
      <View style={[styles.container, styles.centerContainer, { backgroundColor: theme.colors.background }]}>
        <Ionicons name="close-circle-outline" size={60} color="#F44336" />
        <Text style={[styles.errorTitle, { color: theme.colors.text }]}>Connection Failed</Text>
        <Text style={[styles.errorText, { color: theme.colors.textSecondary }]}>
          Could not connect to MQTT broker. Please try again.
        </Text>
        <TouchableOpacity
          style={[styles.errorButton, { backgroundColor: theme.colors.primary }]}
          onPress={() => {
            setConnectionStatus("checking");
            checkConnection();
          }}
        >
          <Text style={styles.errorButtonText}>Retry Connection</Text>
        </TouchableOpacity>
      </View>
    );
  }

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

  // ============================================
  // MAIN RENDER
  // ============================================
  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.colors.text }]}>{stepTitles[step]}</Text>
        <View style={{ width: 40 }} />
      </View>

      <Text style={[styles.headerSubtitle, { color: theme.colors.textSecondary }]}>{stepSubtitles[step]}</Text>

      <View style={[styles.statusRow, { marginHorizontal: 20, marginBottom: 12 }]}>
        <View
          style={[styles.statusDot, { backgroundColor: connectionStatus === "connected" ? "#4CAF50" : "#FF9800" }]}
        />
        <Text style={[styles.statusText, { color: theme.colors.textSecondary }]}>
          {connectionStatus === "connected" ? "● Connected" : "● Connecting..."}
        </Text>
      </View>

      {loading && step !== "crop" && step !== "details" ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : (
        <>
          {step === "crop" && renderCropStep()}
          {step === "variety" && renderVarietyStep()}
          {step === "stage" && renderStageStep()}
          {step === "details" && renderDetailsStep()}
        </>
      )}

      {/* ALWAYS RENDER THE MODALS - visibility controlled by `visible` prop */}
      <CustomizeSettingsModal
        visible={showCustomizeModal}
        onClose={() => setShowCustomizeModal(false)}
        customSettings={customSettings}
        cropDetails={cropDetails}
        selectedCropName={selectedCropName}
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
    </View>
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
    paddingTop: 60,
    paddingBottom: 8,
  },
  backButton: { padding: 8 },
  headerTitle: { fontSize: 20, fontWeight: "700" },
  headerSubtitle: { fontSize: 14, paddingHorizontal: 20, marginBottom: 4 },
  statusRow: { flexDirection: "row", alignItems: "center" },
  statusDot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  statusText: { fontSize: 12 },
  listContent: { paddingHorizontal: 16, paddingBottom: 16 },
  detailsScrollContent: { 
    paddingHorizontal: 16, 
    paddingBottom: 40, // Extra bottom padding for the publish button
  },
  card: { borderRadius: 12, borderWidth: 1.5, padding: 16, marginBottom: 10 },
  cardSelected: { borderColor: "#4CAF50", backgroundColor: "rgba(76, 175, 80, 0.06)" },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#4CAF50",
    alignItems: "center",
    justifyContent: "center",
  },
  radioInner: { width: 12, height: 12, borderRadius: 6, backgroundColor: "#4CAF50" },
  cropName: { fontSize: 17, fontWeight: "600" },
  detailsCard: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
  },
  detailsTitle: { fontSize: 16, fontWeight: "700", marginBottom: 12 },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.05)",
  },
  detailLabel: { fontSize: 13 },
  detailValue: { fontSize: 13, fontWeight: "500" },
  actionContainer: { 
    flexDirection: "row", 
    gap: 10, 
    marginBottom: 16,
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
  },
  customizeButton: { backgroundColor: "#FF9800" },
  previewButton: { backgroundColor: "#2196F3" },
  actionButtonText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  publishWrapper: {
    marginBottom: Platform.OS === 'ios' ? '8%' : '5%', // 5% margin from bottom for Android, 8% for iOS
  },
  publishButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  publishButtonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  modalContainer: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: "90%" },
  modalScrollContent: { paddingBottom: 40 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: "700" },
  sectionLabel: { fontSize: 16, fontWeight: "700", marginTop: 16, marginBottom: 10 },
  customInputContainer: { marginBottom: 12 },
  customInputLabel: { fontSize: 13, marginBottom: 4 },
  customInput: { borderWidth: 1, borderRadius: 8, padding: 10, fontSize: 14 },
  modalButtons: { flexDirection: "row", gap: 10, marginTop: 16, marginBottom: 20 },
  modalButton: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: "center" },
  resetButton: { backgroundColor: "#f5f5f5", borderWidth: 1, borderColor: "#ddd" },
  resetButtonText: { color: "#666", fontWeight: "600" },
  applyButton: { backgroundColor: "#4CAF50" },
  applyButtonText: { color: "#fff", fontWeight: "600" },
  senmlContainer: { borderRadius: 10, padding: 12 },
  senmlItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  senmlName: { fontSize: 13, fontWeight: "500" },
  senmlValueContainer: { flexDirection: "row", alignItems: "center" },
  senmlValue: { fontSize: 13, fontWeight: "600" },
  emptyContainer: { alignItems: "center", justifyContent: "center", paddingVertical: 40, gap: 12 },
  emptyText: { fontSize: 16, fontWeight: "500" },
  errorTitle: { fontSize: 20, fontWeight: "700", marginTop: 16 },
  errorText: { fontSize: 14, textAlign: "center", marginTop: 8, marginBottom: 20 },
  errorButton: { backgroundColor: "#FF9800", paddingHorizontal: 30, paddingVertical: 12, borderRadius: 10 },
  errorButtonText: { color: "#FFF", fontSize: 16, fontWeight: "600" },
});