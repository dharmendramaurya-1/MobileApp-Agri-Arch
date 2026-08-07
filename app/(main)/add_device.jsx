// app/(main)/add_device.jsx
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
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { debugStoredData, identifyAndGetExternalKey } from "../../src/services/identify/identify";

const { width } = Dimensions.get("window");
const BASE_URL = process.env.EXPO_PUBLIC_API_URL;

// ─── Get or fetch profile ID ──────────────────────────────────────────────────
const getProfileId = async () => {
  try {
    // First check if we have it stored
    let profileId = await AsyncStorage.getItem("profile_id");
    
    if (profileId) {
      console.log("✅ Using stored profile ID:", profileId);
      return profileId;
    }

    // If not, fetch it from the API
    console.log("🔍 No profile ID in storage, fetching from API...");
    
    const authToken = await AsyncStorage.getItem("authToken");
    if (!authToken) {
      throw new Error("No auth token found. Please login again.");
    }

    // Get user's profiles
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
  const authToken = await AsyncStorage.getItem("authToken");

  if (!authToken) {
    throw new Error("No auth token found. Please login again.");
  }

  // ✅ Get profile ID (from storage or fetch from API)
  const profileId = await getProfileId();
  
  console.log("📡 Step 1: Creating thing");
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
    
    // ─── Step 2: Identify and get the server's external_key ──────────────
    console.log("🔍 Step 2: Identifying and getting server external_key...");
    const result = await identifyAndGetExternalKey();
    
    if (result && result.id && result.externalKey) {
      console.log("✅ Step 3: Device fully configured!");
      console.log("   📌 Publisher ID (from server):", result.id);
      console.log("   📌 External Key (from server):", result.externalKey);
      
      await debugStoredData();
      
      // ✅ Navigate to device selection screen
      router.push("/(main)/device-selection");
    } else {
      console.error("❌ Failed to identify device");
      throw new Error("Could not identify device. Please try again.");
    }
  }

  return response;
};

export default function AddDevice() {
  const [permission, requestPermission] = useCameraPermissions();
  const [qrModalVisible, setQrModalVisible] = useState(false);
  const [manualModalVisible, setManualModalVisible] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const scanLockRef = useRef(false);

  const [manualName, setManualName] = useState("");
  const [manualExternalKey, setManualExternalKey] = useState("");
  const [manualType, setManualType] = useState("device");

  // ─── Scan flow ──────────────────────────────────────────────────────────
  const handleBarCodeScanned = async ({ data }) => {
    if (scanLockRef.current) return;
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
    }

    console.log("📱 QR Scanned:");
    console.log("   Name:", name);
    console.log("   User External Key:", userExternalKey);

    setIsCreating(true);
    try {
      await createThing(name, type, userExternalKey);
      setQrModalVisible(false);
    } catch (error) {
      console.error("❌ Error:", error);
      
      if (error.response?.status === 409) {
        Alert.alert(
          "Device Already Connected",
          `"${name}" is already connected to your account.`,
          [
            {
              text: "Cancel",
              style: "cancel",
            },
            {
              text: "Continue",
              onPress: async () => {
                try {
                  const result = await identifyAndGetExternalKey();
                  if (result && result.id) {
                    router.push("/(main)/device-selection");
                  }
                } catch (err) {
                  Alert.alert("Error", "Could not find existing device.");
                }
              },
            },
          ]
        );
      } else {
        Alert.alert(
          "Error", 
          error.response?.data?.message || "Could not connect this device. Please try again."
        );
      }
    } finally {
      setIsCreating(false);
      setScanned(false);
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
      await createThing(manualName, manualType, manualExternalKey);
      setManualModalVisible(false);
      setManualName("");
      setManualExternalKey("");
      setManualType("device");
    } catch (error) {
      console.error("❌ Error:", error);
      
      if (error.response?.status === 409) {
        Alert.alert(
          "Device Already Connected",
          `"${manualName}" is already connected to your account.`,
          [
            {
              text: "Cancel",
              style: "cancel",
            },
            {
              text: "Continue",
              onPress: async () => {
                try {
                  const result = await identifyAndGetExternalKey();
                  if (result && result.id) {
                    router.push("/(main)/device-selection");
                  }
                } catch (err) {
                  Alert.alert("Error", "Could not find existing device.");
                }
              },
            },
          ]
        );
      } else {
        Alert.alert(
          "Error", 
          error.response?.data?.message || "Could not connect this device. Please try again."
        );
      }
    } finally {
      setIsCreating(false);
    }
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
        );
        return;
      }
    }
    scanLockRef.current = false;
    setScanned(false);
    setCameraReady(false);
    setQrModalVisible(true);
    console.log("3. opening QR modal");
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

        <TouchableOpacity
          style={styles.btn}
          onPress={handleQRCode}
          activeOpacity={0.85}
        >
          <Ionicons name="qr-code" size={20} color="#fff" />
          <Text style={styles.btnText}>Scan QR Code</Text>
        </TouchableOpacity>

        <Text style={styles.or}>or</Text>

        <TouchableOpacity
          style={styles.btnOutline}
          onPress={() => setManualModalVisible(true)}
          activeOpacity={0.85}
        >
          <Ionicons name="create-outline" size={20} color="#4CAF50" />
          <Text style={styles.btnOutlineText}>Enter Device Manually</Text>
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
        onRequestClose={() => setQrModalVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: "#000" }}>
          <View style={styles.qrHeader}>
            <TouchableOpacity
              onPress={() => setQrModalVisible(false)}
              style={styles.qrBackButton}
            >
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.qrTitle}>Scan QR Code</Text>
            <View style={{ width: 40 }} />
          </View>

          {permission?.granted && (
            <CameraView
              style={StyleSheet.absoluteFillObject}
              facing="back"
              onCameraReady={() => setCameraReady(true)}
              onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            />
          )}

          {!cameraReady && permission?.granted && (
            <View style={styles.cameraLoading}>
              <ActivityIndicator size="large" color="#4CAF50" />
              <Text style={styles.cameraLoadingText}>Starting camera...</Text>
            </View>
          )}

          <View style={styles.scanOverlay}>
            <View style={styles.scanFrame} />
            <Text style={styles.scanInstruction}>
              Align the QR code within the frame
            </Text>
          </View>
        </View>
      </Modal>

      {/* Manual Entry Modal */}
      <Modal visible={manualModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Enter Device Details</Text>

            <TextInput
              placeholder="Device name"
              placeholderTextColor="#999"
              value={manualName}
              onChangeText={setManualName}
              style={styles.input}
            />
            <TextInput
              placeholder="External key (e.g., SENSOR-001)"
              placeholderTextColor="#999"
              value={manualExternalKey}
              onChangeText={setManualExternalKey}
              autoCapitalize="characters"
              style={styles.input}
            />
            <TextInput
              placeholder="Device type (e.g., device, sensor)"
              placeholderTextColor="#999"
              value={manualType}
              onChangeText={setManualType}
              style={styles.input}
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