// app/(auth)/add_device.jsx
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import { CameraView, useCameraPermissions } from "expo-camera";
import { router } from "expo-router";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
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
import { useAuth } from "../../src/context/AuthContext";
import { useMqtt } from "../../src/context/MqttContext";
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

export default function AddDevice() {
  const { resetSignupFlow } = useAuth();
  const { forceReconnect } = useMqtt();
  
  const [permission, requestPermission] = useCameraPermissions();
  const [qrModalVisible, setQrModalVisible] = useState(false);
  const [manualModalVisible, setManualModalVisible] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const scanLockRef = useRef(false);

  const [manualName, setManualName] = useState("");
  const [manualExternalKey, setManualExternalKey] = useState("");
  const [manualType, setManualType] = useState("device");

  // ─── Scan flow ──────────────────────────────────────────────────────────
  const handleBarCodeScanned = async ({ data }) => {
    if (scanLockRef.current) return;
    if (isCreating) return;
    
    scanLockRef.current = true;
    setScanned(true);
    setErrorMessage("");

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
    setErrorMessage("");
    setQrModalVisible(true);
    console.log("3. opening QR modal");
  };

  const closeQrScanner = () => {
    setQrModalVisible(false);
    setScanned(false);
    setCameraReady(false);
    scanLockRef.current = false;
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color="#1a1a1a" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Add Device</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Centered content */}
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Ionicons name="hardware-chip" size={72} color="#4CAF50" />
        </View>

        <Text style={styles.title}>Connect Your Device</Text>
        <Text style={styles.subtitle}>
          Scan your device's QR code or enter its details manually to connect it
          to your mobile app.
        </Text>

        {errorMessage ? (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={20} color="#FF3B30" />
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={styles.btn}
          onPress={handleQRCode}
          activeOpacity={0.85}
          disabled={isCreating}
        >
          <Ionicons name="qr-code" size={20} color="#fff" />
          <Text style={styles.btnText}>Scan QR Code</Text>
        </TouchableOpacity>

        <Text style={styles.or}>or</Text>

        <TouchableOpacity
          style={styles.btnOutline}
          onPress={() => setManualModalVisible(true)}
          activeOpacity={0.85}
          disabled={isCreating}
        >
          <Ionicons name="create-outline" size={20} color="#4CAF50" />
          <Text style={styles.btnOutlineText}>Enter Device Manually</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.skipButton}
          onPress={handleSkip}
          disabled={isCreating}
        >
          <Text style={styles.skipText}>Skip for now</Text>
        </TouchableOpacity>
      </View>

      {/* Loading overlay */}
      {isCreating && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={styles.loadingText}>Connecting device...</Text>
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
              style={styles.qrBackButton}
            >
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.qrTitle}>Scan QR Code</Text>
            <View style={{ width: 40 }} />
          </View>

          {permission?.granted ? (
            <CameraView
              style={StyleSheet.absoluteFillObject}
              facing="back"
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
                style={styles.cameraRetryButton}
                onPress={handleQRCode}
              >
                <Text style={styles.cameraRetryText}>Request Permission</Text>
              </TouchableOpacity>
            </View>
          )}

          {!cameraReady && permission?.granted && (
            <View style={styles.cameraLoading}>
              <ActivityIndicator size="large" color="#4CAF50" />
              <Text style={styles.cameraLoadingText}>Starting camera...</Text>
            </View>
          )}

          {/* Scan Overlay Frame */}
          <View style={styles.scanOverlay}>
            <View style={styles.scanFrame} />
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
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Enter Device Details</Text>

            <TextInput
              placeholder="Device name"
              placeholderTextColor="#999"
              value={manualName}
              onChangeText={setManualName}
              style={styles.input}
              editable={!isCreating}
            />
            <TextInput
              placeholder="External key (e.g., SENSOR-001)"
              placeholderTextColor="#999"
              value={manualExternalKey}
              onChangeText={setManualExternalKey}
              autoCapitalize="characters"
              style={styles.input}
              editable={!isCreating}
            />
            <TextInput
              placeholder="Device type (e.g., device, sensor)"
              placeholderTextColor="#999"
              value={manualType}
              onChangeText={setManualType}
              style={styles.input}
              editable={!isCreating}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setManualModalVisible(false)}
                disabled={isCreating}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.createButton]}
                onPress={handleManualEntry}
                disabled={isCreating}
              >
                {isCreating ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.createButtonText}>Connect</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  scrollContent: { flexGrow: 1, paddingBottom: "5%" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 20,
  },
  backButton: { padding: 8 },
  headerTitle: { fontSize: 20, fontWeight: "700", color: "#1a1a1a" },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
    paddingVertical: 40,
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
    backgroundColor: "rgba(76, 175, 80, 0.1)",
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1a1a1a",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    marginTop: 8,
    marginBottom: 32,
    lineHeight: 20,
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFEBEE",
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    width: "100%",
    gap: 8,
  },
  errorText: {
    color: "#FF3B30",
    fontSize: 14,
    flex: 1,
  },
  btn: {
    width: "100%",
    flexDirection: "row",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#4CAF50",
  },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  or: { marginVertical: 16, color: "#999" },
  btnOutline: {
    width: "100%",
    flexDirection: "row",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#4CAF50",
    alignItems: "center",
    justifyContent: "center",
  },
  btnOutlineText: { fontSize: 16, fontWeight: "600", color: "#4CAF50" },
  skipButton: {
    marginTop: 20,
    paddingVertical: 12,
  },
  skipText: {
    fontSize: 14,
    color: "#666",
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
    backgroundColor: "rgba(255,255,255,0.9)",
  },
  loadingText: { marginTop: 10, fontSize: 14, color: "#1a1a1a" },
  qrHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 20,
    backgroundColor: "rgba(0,0,0,0.5)",
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 30,
  },
  qrBackButton: { padding: 8 },
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
    borderWidth: 2,
    borderColor: "#4CAF50",
    borderRadius: 12,
  },
  scanInstruction: {
    color: "#fff",
    fontSize: 14,
    marginTop: 20,
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
    backgroundColor: "#4CAF50",
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
    width: "85%",
    borderRadius: 16,
    padding: 20,
    backgroundColor: "#fff",
    elevation: 5,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 16,
    textAlign: "center",
    color: "#1a1a1a",
  },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 12,
    color: "#1a1a1a",
  },
  modalButtons: { flexDirection: "row", gap: 12, marginTop: 8 },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelButton: { borderWidth: 1, borderColor: "#ddd" },
  cancelButtonText: { fontSize: 16, fontWeight: "600", color: "#1a1a1a" },
  createButton: { backgroundColor: "#4CAF50" },
  createButtonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});