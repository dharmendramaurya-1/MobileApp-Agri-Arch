// app/(auth)/add_device.jsx
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import { CameraView, useCameraPermissions } from "expo-camera";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Linking,
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
import { useMqtt } from "../../src/context/MqttContext";
import { useTheme } from "../../src/context/ThemContext";
import { debugStoredData, identifyAndGetExternalKey } from "../../src/services/identify/identify";

const { width } = Dimensions.get("window");
const BASE_URL = process.env.EXPO_PUBLIC_API_URL;

// ─── Get or fetch profile ID ──────────────────────────────────────────────────
const getProfileId = async () => {
  try {
    let profileId = await AsyncStorage.getItem("profile_id");

    if (profileId) {
      console.log("✅ Using stored profile ID:", profileId);
      return profileId;
    }

    console.log("🔍 No profile ID in storage, fetching from API...");

    const authToken = await AsyncStorage.getItem("authToken");
    if (!authToken) {
      throw new Error("No auth token found. Please login again.");
    }

    const response = await axios.get(
      `${BASE_URL}/profiles`,
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
          "Content-Type": "application/json",
        }
      }
    );

    console.log("📡 Profiles response:", response.status);

    if (response.data && response.data.profiles && response.data.profiles.length > 0) {
      const profile = response.data.profiles[0];
      profileId = profile.id;

      await AsyncStorage.setItem("profile_id", profileId);
      console.log("✅ Profile ID fetched and stored:", profileId);

      return profileId;
    }

    throw new Error("No profiles found for this user");
  } catch (error) {
    console.error("❌ Error getting profile ID:", error);
    if (error.response) {
      console.error("Status:", error.response.status);
      console.error("Data:", JSON.stringify(error.response.data, null, 2));
    }
    throw new Error("Could not get profile ID. Please try again.");
  }
};

// ─── Create thing with user-provided external_key ──────────────────────────
const createThing = async (name, type, userExternalKey) => {
  try {
    const authToken = await AsyncStorage.getItem("authToken");
    const profileId = await getProfileId();

    if (!authToken) {
      throw new Error("No auth token found. Please login again.");
    }

    if (!profileId) {
      throw new Error("No profile ID found. Please login again.");
    }

    console.log("📡 Creating thing");
    console.log("   Name:", name);
    console.log("   Type:", type);
    console.log("   User External Key:", userExternalKey);
    console.log("   Profile ID:", profileId);

    const response = await axios.post(
      `${BASE_URL}/profiles/${profileId}/things`,
      [{ name, type, external_key: userExternalKey }],
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("✅ Thing created, status:", response.status);
    console.log("   Response data:", JSON.stringify(response.data, null, 2));

    if (response.status === 201 || response.status === 200) {
      console.log("📦 Thing created successfully!");

      // ─── Wait for server to process with retry logic ──────────────────────────
      console.log("⏳ Waiting for server to process...");

      let result = null;
      let attempts = 0;
      const maxAttempts = 8;
      const initialDelay = 2000;

      while (attempts < maxAttempts) {
        attempts++;
        const delay = initialDelay * attempts;
        console.log(`🔄 Attempt ${attempts}/${maxAttempts} - Waiting ${delay}ms before checking...`);

        await new Promise(resolve => setTimeout(resolve, delay));

        console.log(`🔍 Attempt ${attempts}: Identifying and getting server external_key...`);
        result = await identifyAndGetExternalKey();

        if (result && result.id && result.externalKey) {
          console.log("✅ Step 3: Device fully configured!");
          console.log("   📌 Publisher ID (from server):", result.id);
          console.log("   📌 External Key (from server):", result.externalKey);
          await debugStoredData();

          // ✅ Navigate to add crops
          router.replace("/(auth)/add_crops");
          return { success: true };
        }

        console.log(`⚠️ Attempt ${attempts} failed - result:`, result);

        // If it's the last attempt, don't wait more
        if (attempts >= maxAttempts) {
          console.log("❌ Max attempts reached, moving to add_crops anyway");
          router.replace("/(auth)/add_crops");
          return {
            success: true,
            warning: "Device created but identification pending"
          };
        }
      }
    }

    return { success: true };
  } catch (error) {
    console.error("❌ Create thing error:", error);

    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;

      console.error("   Status:", status);
      console.error("   Data:", data);

      return {
        success: false,
        error: data?.message || `Server error (${status}). Please try again.`,
        errorType: "server"
      };
    } else if (error.request) {
      return {
        success: false,
        error: "Network error. Please check your internet connection.",
        errorType: "network"
      };
    } else {
      return {
        success: false,
        error: error.message || "An unexpected error occurred.",
        errorType: "unknown"
      };
    }
  }
};

// Small benefit bullet used to explain why this screen matters
const BenefitItem = ({ icon, label, color, textColor }) => (
  <View style={styles.benefitItem}>
    <View style={[styles.benefitIcon, { backgroundColor: `${color}1A` }]}>
      <Ionicons name={icon} size={16} color={color} />
    </View>
    <Text style={[styles.benefitText, { color: textColor }]}>{label}</Text>
  </View>
);

export default function AddDevice() {
  const { theme } = useTheme();
  const { forceReconnect } = useMqtt();

  const [permission, requestPermission] = useCameraPermissions();
  const [qrModalVisible, setQrModalVisible] = useState(false);
  const [manualModalVisible, setManualModalVisible] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const scanLockRef = useRef(false);

  const [manualName, setManualName] = useState("");
  const [manualExternalKey, setManualExternalKey] = useState("");
  const [manualType, setManualType] = useState("device");

  // Animated scanning line inside the QR frame
  const scanAnim = useRef(new Animated.Value(0)).current;
  const scanLoopRef = useRef(null);

  useEffect(() => {
    if (qrModalVisible) {
      scanAnim.setValue(0);
      const loop = Animated.loop(
        Animated.timing(scanAnim, {
          toValue: 1,
          duration: 2200,
          useNativeDriver: true,
        })
      );
      scanLoopRef.current = loop;
      loop.start();
    } else {
      scanLoopRef.current?.stop();
      scanLoopRef.current = null;
    }
    return () => {
      scanLoopRef.current?.stop();
      scanLoopRef.current = null;
    };
  }, [qrModalVisible]);

  // ─── Scan flow ──────────────────────────────────────────────────────────
  const handleBarCodeScanned = async ({ data }) => {
    if (scanLockRef.current) return;
    if (isCreating) return;

    scanLockRef.current = true;
    setScanned(true);

    let name = "Unknown Device";
    let type = "device";
    let userExternalKey = data;

    try {
      const parsed = JSON.parse(data);
      name = parsed.name || name;
      type = parsed.type || type;
      userExternalKey = parsed.external_key || parsed.id || data;
    } catch {
      name = `Device_${data.substring(0, 10)}`;
      userExternalKey = data;
    }

    console.log("📱 QR Scanned:");
    console.log("   Name:", name);
    console.log("   User External Key:", userExternalKey);
    console.log("   Type:", type);

    setIsCreating(true);
    try {
      const result = await createThing(name, type, userExternalKey);

      if (result.success) {
        // ✅ Store the external key for MQTT
        await AsyncStorage.setItem("external_key", userExternalKey);

        // ✅ Try to connect MQTT with the new key
        try {
          console.log("🔄 Connecting MQTT with new key...");
          await forceReconnect(userExternalKey);
          console.log("✅ MQTT reconnection attempted");
        } catch (error) {
          console.error("❌ MQTT reconnection error:", error);
        }

        setQrModalVisible(false);
        // Navigation happens inside createThing
      } else {
        Alert.alert(
          "Connection Failed",
          result.error || "Could not connect this device. Please try again.",
          [{ text: "OK" }]
        );
        setScanned(false);
      }
    } catch (error) {
      console.error("❌ Error:", error);
      Alert.alert(
        "Error",
        error.message || "An unexpected error occurred. Please try again.",
        [{ text: "OK" }]
      );
    } finally {
      setIsCreating(false);
      scanLockRef.current = false;
    }
  };

  // ─── Manual flow ────────────────────────────────────────────────────────
  const handleManualEntry = async () => {
    if (!manualName.trim()) {
      Alert.alert("Error", "Please enter a device name");
      return;
    }
    if (!manualExternalKey.trim()) {
      Alert.alert("Error", "Please enter a device ID/External Key");
      return;
    }

    console.log("📝 Manual Entry:");
    console.log("   Name:", manualName);
    console.log("   User External Key:", manualExternalKey);

    setIsCreating(true);
    try {
      const result = await createThing(manualName, manualType, manualExternalKey);

      if (result.success) {
        // ✅ Store the external key for MQTT
        await AsyncStorage.setItem("external_key", manualExternalKey);

        // ✅ Try to connect MQTT with the new key
        try {
          console.log("🔄 Connecting MQTT with new key...");
          await forceReconnect(manualExternalKey);
          console.log("✅ MQTT reconnection attempted");
        } catch (error) {
          console.error("❌ MQTT reconnection error:", error);
        }

        setManualModalVisible(false);
        setManualName("");
        setManualExternalKey("");
        setManualType("device");
        // Navigation happens inside createThing
      } else {
        Alert.alert(
          "Connection Failed",
          result.error || "Could not connect this device. Please try again.",
          [{ text: "OK" }]
        );
      }
    } catch (error) {
      console.error("❌ Error:", error);
      Alert.alert(
        "Error",
        error.message || "An unexpected error occurred. Please try again.",
        [{ text: "OK" }]
      );
    } finally {
      setIsCreating(false);
    }
  };

  // ─── Skip device setup ──────────────────────────────────────────────────
  const handleSkip = async () => {
    Alert.alert(
      "Skip Device Setup?",
      "You can add a device later from the dashboard. Would you like to proceed to crop selection?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Proceed to Crops",
          onPress: async () => {
            try {
              router.replace("/(auth)/add_crops");
            } catch (error) {
              console.error("Error skipping device setup:", error);
              Alert.alert("Error", "Failed to proceed. Please try again.");
            }
          }
        }
      ]
    );
  };

  const handleQRCode = async () => {
    console.log("1. handleQRCode pressed, permission:", permission);

    if (!permission?.granted) {
      const result = await requestPermission();
      console.log("2. requestPermission result:", result);
      if (!result.granted) {
        Alert.alert(
          "Camera Permission Required",
          "Please allow camera access to scan a QR code.",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Open Settings",
              onPress: () => {
                if (Platform.OS === 'ios') {
                  Linking.openURL('app-settings:');
                } else {
                  Linking.openSettings();
                }
              }
            }
          ]
        );
        return;
      }
    }

    scanLockRef.current = false;
    setScanned(false);
    setCameraReady(false);
    setTorchOn(false);
    setQrModalVisible(true);
    console.log("3. opening QR modal");
  };

  const closeQrScanner = () => {
    setQrModalVisible(false);
    setScanned(false);
    setCameraReady(false);
    setTorchOn(false);
    scanLockRef.current = false;
  };

  const primary = theme.colors.primary;
  const primaryDark = theme.colors.primaryDark;

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      edges={["top", "bottom"]}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header with back button */}
        <View style={styles.header}>
          {/* <TouchableOpacity
            onPress={() => router.back()}
            style={[styles.backButton, { backgroundColor: theme.colors.surface }]}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
          </TouchableOpacity> */}
          <View></View>

          <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
            Add Device
          </Text>

          {/* Step indicator - explains where you are in setup */}
          <View style={[styles.stepBadge, { backgroundColor: `${primary}1A` }]}>
            <Text style={[styles.stepBadgeText, { color: primary }]}>
              Step 2 of 3
            </Text>
          </View>
        </View>

        {/* Centered content */}
        <View style={styles.content}>
          <LinearGradient
            colors={[primary, primaryDark]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.iconContainer}
          >
            <Ionicons name="hardware-chip" size={44} color="#fff" />
          </LinearGradient>

          <Text style={[styles.title, { color: theme.colors.text }]}>
            Connect Your Device
          </Text>
          <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
            Link your AgriArch sensor device so your farm can be monitored in
            real time. Scan the QR code on your device or enter its details
            manually.
          </Text>

          {/* Why connect a device */}
          <View style={[styles.benefitsCard, { backgroundColor: theme.colors.surface }]}>
            <BenefitItem
              icon="pulse-outline"
              label="Live soil, water & weather monitoring"
              color={primary}
              textColor={theme.colors.text}
            />
            <BenefitItem
              icon="notifications-outline"
              label="Smart alerts for irrigation & pumps"
              color={primary}
              textColor={theme.colors.text}
            />
            <BenefitItem
              icon="leaf-outline"
              label="Automated crop recommendations"
              color={primary}
              textColor={theme.colors.text}
            />
          </View>

          <TouchableOpacity
            style={[styles.btn, { shadowColor: primaryDark }]}
            onPress={handleQRCode}
            activeOpacity={0.85}
            disabled={isCreating}
            accessibilityRole="button"
          >
            <LinearGradient
              colors={[primary, primaryDark]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.btnGradient}
            >
              <Ionicons name="qr-code" size={20} color="#fff" />
              <Text style={styles.btnText}>Scan QR Code</Text>
            </LinearGradient>
          </TouchableOpacity>

          <View style={styles.orRow}>
            <View style={[styles.orLine, { backgroundColor: theme.colors.border }]} />
            <Text style={[styles.or, { color: theme.colors.textSecondary }]}>or</Text>
            <View style={[styles.orLine, { backgroundColor: theme.colors.border }]} />
          </View>

          <TouchableOpacity
            style={[styles.btnOutline, { borderColor: primary }]}
            onPress={() => setManualModalVisible(true)}
            activeOpacity={0.85}
            disabled={isCreating}
            accessibilityRole="button"
          >
            <Ionicons name="create-outline" size={20} color={primary} />
            <Text style={[styles.btnOutlineText, { color: primary }]}>
              Enter Device Manually
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.skipButton}
            onPress={handleSkip}
            disabled={isCreating}
            accessibilityRole="button"
          >
            <Text style={[styles.skipText, { color: theme.colors.textSecondary }]}>
              Skip for now
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Loading overlay */}
      {isCreating && (
        <View
          style={[
            styles.loadingOverlay,
            {
              backgroundColor: theme.dark
                ? "rgba(18,18,18,0.92)"
                : "rgba(255,255,255,0.92)",
            },
          ]}
        >
          <ActivityIndicator size="large" color={primary} />
          <Text style={[styles.loadingText, { color: theme.colors.text }]}>
            Connecting device...
          </Text>
        </View>
      )}

      {/* QR Scanner Modal */}
      <Modal
        visible={qrModalVisible}
        animationType="slide"
        onRequestClose={closeQrScanner}
      >
        <View style={{ flex: 1, backgroundColor: "#000" }}>
          <View style={styles.qrHeader}>
            <TouchableOpacity
              onPress={closeQrScanner}
              style={styles.qrHeaderButton}
              accessibilityRole="button"
              accessibilityLabel="Close scanner"
            >
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.qrTitle}>Scan QR Code</Text>
            <TouchableOpacity
              onPress={() => setTorchOn(!torchOn)}
              style={styles.qrHeaderButton}
              accessibilityRole="button"
              accessibilityLabel={torchOn ? "Turn off flashlight" : "Turn on flashlight"}
            >
              <Ionicons
                name={torchOn ? "flash" : "flash-outline"}
                size={26}
                color={torchOn ? "#FFD54F" : "#fff"}
              />
            </TouchableOpacity>
          </View>

          {permission?.granted ? (
            <CameraView
              style={StyleSheet.absoluteFillObject}
              facing="back"
              torch={torchOn ? "on" : "off"}
              onCameraReady={() => {
                console.log("✅ Camera ready");
                setCameraReady(true);
              }}
              onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
              barcodeScannerSettings={{
                barcodeTypes: ["qr"],
                interval: 1000,
              }}
            />
          ) : (
            <View style={styles.cameraLoading}>
              <Ionicons name="camera-off" size={48} color="#666" />
              <Text style={styles.cameraLoadingText}>Camera not available</Text>
              <TouchableOpacity
                style={[styles.cameraRetryButton, { backgroundColor: primary }]}
                onPress={handleQRCode}
              >
                <Text style={styles.cameraRetryText}>Request Permission</Text>
              </TouchableOpacity>
            </View>
          )}

          {!cameraReady && permission?.granted && (
            <View style={styles.cameraLoading}>
              <ActivityIndicator size="large" color={primary} />
              <Text style={styles.cameraLoadingText}>Starting camera...</Text>
            </View>
          )}

          {/* Scan Overlay Frame with corner brackets + animated line */}
          <View style={styles.scanOverlay}>
            <View style={styles.scanFrame}>
              <View style={[styles.corner, styles.cornerTL, { borderColor: primary }]} />
              <View style={[styles.corner, styles.cornerTR, { borderColor: primary }]} />
              <View style={[styles.corner, styles.cornerBL, { borderColor: primary }]} />
              <View style={[styles.corner, styles.cornerBR, { borderColor: primary }]} />
              <Animated.View
                style={[
                  styles.scanLine,
                  {
                    backgroundColor: primary,
                    transform: [
                      {
                        translateY: scanAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [4, width * 0.7 - 8],
                        }),
                      },
                    ],
                  },
                ]}
              />
            </View>
            <Text style={styles.scanInstruction}>
              Align the QR code within the frame
            </Text>
          </View>
        </View>
      </Modal>

      {/* Manual Entry Modal */}
      <Modal
        visible={manualModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setManualModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalContent, { backgroundColor: theme.colors.surface }]}>
            <View style={[styles.modalHandle, { backgroundColor: theme.colors.border }]} />
            <Text style={[styles.modalTitle, { color: theme.colors.text }]}>
              Enter Device Details
            </Text>
            <Text style={[styles.modalSubtitle, { color: theme.colors.textSecondary }]}>
              The ID is printed on your device label
            </Text>

            <View
              style={[
                styles.inputGroup,
                {
                  backgroundColor: theme.colors.inputBackground,
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <Ionicons name="cube-outline" size={18} color={theme.colors.textSecondary} />
              <TextInput
                placeholder="Device name"
                placeholderTextColor={theme.colors.textSecondary}
                value={manualName}
                onChangeText={setManualName}
                style={[styles.input, { color: theme.colors.text }]}
                editable={!isCreating}
                returnKeyType="next"
              />
            </View>

            <View
              style={[
                styles.inputGroup,
                {
                  backgroundColor: theme.colors.inputBackground,
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <Ionicons name="key-outline" size={18} color={theme.colors.textSecondary} />
              <TextInput
                placeholder="External key (e.g., SENSOR-001)"
                placeholderTextColor={theme.colors.textSecondary}
                value={manualExternalKey}
                onChangeText={setManualExternalKey}
                autoCapitalize="characters"
                style={[styles.input, { color: theme.colors.text }]}
                editable={!isCreating}
                returnKeyType="next"
              />
            </View>

            <View
              style={[
                styles.inputGroup,
                {
                  backgroundColor: theme.colors.inputBackground,
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <Ionicons name="options-outline" size={18} color={theme.colors.textSecondary} />
              <TextInput
                placeholder="Device type (e.g., device, sensor)"
                placeholderTextColor={theme.colors.textSecondary}
                value={manualType}
                onChangeText={setManualType}
                style={[styles.input, { color: theme.colors.text }]}
                editable={!isCreating}
                returnKeyType="done"
                onSubmitEditing={handleManualEntry}
              />
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton, { borderColor: theme.colors.border }]}
                onPress={() => setManualModalVisible(false)}
                disabled={isCreating}
              >
                <Text style={[styles.cancelButtonText, { color: theme.colors.text }]}>
                  Cancel
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, { shadowColor: primaryDark }]}
                onPress={handleManualEntry}
                disabled={isCreating}
                accessibilityRole="button"
              >
                <LinearGradient
                  colors={[primary, primaryDark]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.createButtonGradient}
                >
                  {isCreating ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.createButtonText}>Connect</Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingBottom: "5%" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
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
  headerTitle: { fontSize: 20, fontWeight: "700" , textAlign: "center", paddingLeft: 76, letterSpacing: 0.3},
  stepBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  stepBadgeText: { fontSize: 12, fontWeight: "700", letterSpacing: 0.3 },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 28,
    paddingVertical: 32,
  },
  iconContainer: {
    width: 104,
    height: 104,
    borderRadius: 52,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
    shadowColor: "#1B5E20",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    textAlign: "center",
    letterSpacing: 0.2,
  },
  subtitle: {
    fontSize: 14.5,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 24,
    lineHeight: 21,
    opacity: 0.85,
  },
  benefitsCard: {
    width: "100%",
    borderRadius: 16,
    padding: 16,
    gap: 12,
    marginBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  benefitItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  benefitIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  benefitText: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: "500",
  },
  btn: {
    width: "100%",
    borderRadius: 50,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },
  btnGradient: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "700", letterSpacing: 0.3 },
  orRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginVertical: 18,
    width: "100%",
  },
  orLine: { flex: 1, height: 1 },
  or: { fontSize: 13, fontWeight: "600" },
  btnOutline: {
    width: "100%",
    flexDirection: "row",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 50,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  btnOutlineText: { fontSize: 15, fontWeight: "600" },
  skipButton: {
    marginTop: 18,
    paddingVertical: 12,
  },
  skipText: {
    fontSize: 14,
    textDecorationLine: "underline",
  },
  loadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 50,
  },
  loadingText: { marginTop: 12, fontSize: 14, fontWeight: "500" },
  qrHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 20,
    backgroundColor: "rgba(0,0,0,0.55)",
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 30,
  },
  qrHeaderButton: { padding: 8 },
  qrTitle: { fontSize: 18, fontWeight: "600", color: "#fff" },
  scanOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  scanFrame: {
    width: width * 0.7,
    height: width * 0.7,
    borderRadius: 12,
    overflow: "hidden",
  },
  corner: {
    position: "absolute",
    width: 32,
    height: 32,
    borderWidth: 4,
    zIndex: 10,
  },
  cornerTL: { top: 0, left: 0, borderBottomWidth: 0, borderRightWidth: 0, borderTopLeftRadius: 12 },
  cornerTR: { top: 0, right: 0, borderBottomWidth: 0, borderLeftWidth: 0, borderTopRightRadius: 12 },
  cornerBL: { bottom: 0, left: 0, borderTopWidth: 0, borderRightWidth: 0, borderBottomLeftRadius: 12 },
  cornerBR: { bottom: 0, right: 0, borderTopWidth: 0, borderLeftWidth: 0, borderBottomRightRadius: 12 },
  scanLine: {
    position: "absolute",
    top: 0,
    left: 10,
    right: 10,
    height: 2,
    borderRadius: 1,
  },
  scanInstruction: {
    color: "#fff",
    fontSize: 14,
    marginTop: 24,
    textAlign: "center",
    paddingHorizontal: 20,
  },
  cameraLoading: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#000",
    zIndex: 20,
  },
  cameraLoadingText: { color: "#fff", fontSize: 14, marginTop: 10 },
  cameraRetryButton: {
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  cameraRetryText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    width: "88%",
    borderRadius: 24,
    padding: 24,
    paddingTop: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 10,
  },
  modalHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
  },
  modalSubtitle: {
    fontSize: 13,
    textAlign: "center",
    marginTop: 4,
    marginBottom: 20,
  },
  inputGroup: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 50,
    marginBottom: 12,
  },
  input: {
    flex: 1,
    fontSize: 15,
    paddingHorizontal: 10,
    paddingVertical: 0,
    height: "100%",
  },
  modalButtons: { flexDirection: "row", gap: 12, marginTop: 8 },
  modalButton: {
    flex: 1,
    borderRadius: 50,
    overflow: "hidden",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },
  cancelButton: { borderWidth: 1, alignItems: "center", justifyContent: "center", paddingVertical: 14, shadowOpacity: 0, elevation: 0 },
  cancelButtonText: { fontSize: 15, fontWeight: "600" },
  createButtonGradient: {
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  createButtonText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
