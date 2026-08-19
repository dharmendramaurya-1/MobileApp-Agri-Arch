// components/AddDeviceWizard.jsx — Fullscreen modal wizard (Method → Details → Connect)
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import { CameraView, useCameraPermissions } from "expo-camera";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
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
import { useTheme } from "../src/context/ThemContext";
import {
  debugStoredData,
  getThingExternalKey,
  identifyAndGetExternalKey,
  setActiveDevice,
} from "../src/services/identify/identify";

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
    const response = await axios.get(`${BASE_URL}/profiles`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
      },
    });

    if (
      response.data &&
      response.data.profiles &&
      response.data.profiles.length > 0
    ) {
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
// Returns the identified device { id, externalKey } on success.
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

  if (response.status === 201 || response.status === 200) {
    // ── Step 2: Resolve the created thing id + fresh external_key ─────────
    // Prefer the id straight from the POST response — never the AsyncStorage
    // cache (which may point to an older device).
    const created =
      response.data?.things?.[0] ||
      (Array.isArray(response.data) ? response.data[0] : response.data) ||
      null;
    const createdId = created?.id || created?.thing_id || null;

    console.log("🔍 Step 2: Resolving created device external_key...");
    let deviceId = createdId;
    let externalKey = null;

    if (createdId) {
      externalKey = await getThingExternalKey(createdId);
    }

    // Fallback: if the POST response didn't give us a usable id, fall back to
    // the identify flow (works for the very first device).
    if (!deviceId || !externalKey) {
      const result = await identifyAndGetExternalKey();
      if (result && result.id && result.externalKey) {
        deviceId = result.id;
        externalKey = result.externalKey;
      }
    }

    if (deviceId && externalKey) {
      await setActiveDevice(deviceId, externalKey);
      await debugStoredData();
      console.log("✅ Device fully configured!");
      console.log("   📌 Publisher ID (from server):", deviceId);
      console.log("   📌 External Key (from server):", externalKey);

      return { id: deviceId, externalKey, name, type };
    }

    console.error("❌ Failed to identify device");
    throw new Error("Could not identify device. Please try again.");
  }

  return response;
};

// ─── Fullscreen modal wizard ─────────────────────────────────────────────────
export default function AddDeviceWizard({ visible, onClose, onDeviceAdded }) {
  const { theme } = useTheme();

  const [permission, requestPermission] = useCameraPermissions();
  const [step, setStep] = useState(1); // 1 = method, 2 = details, 3 = connecting
  const [method, setMethod] = useState(null); // "scan" | "manual"
  const [scanned, setScanned] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectError, setConnectError] = useState(null);
  const [torchOn, setTorchOn] = useState(false);
  const [focusedField, setFocusedField] = useState(null);

  const [manualName, setManualName] = useState("");
  const [manualExternalKey, setManualExternalKey] = useState("");
  const [manualType, setManualType] = useState("device");
  const [summary, setSummary] = useState(null);

  const scanLockRef = useRef(false);
  const successTimerRef = useRef(null);

  // Animations
  const stepAnim = useRef(new Animated.Value(0)).current;
  const scanAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const scanLoopRef = useRef(null);
  const pulseLoopRef = useRef(null);

  // Clear any pending success timer on unmount
  useEffect(() => {
    return () => {
      if (successTimerRef.current) {
        clearTimeout(successTimerRef.current);
        successTimerRef.current = null;
      }
    };
  }, []);

  // Reset wizard state every time the modal is dismissed
  useEffect(() => {
    if (!visible) {
      if (successTimerRef.current) {
        clearTimeout(successTimerRef.current);
        successTimerRef.current = null;
      }
      setStep(1);
      setMethod(null);
      setScanned(false);
      setCameraReady(false);
      setConnectError(null);
      setTorchOn(false);
      setFocusedField(null);
      setSummary(null);
      setIsConnecting(false);
      setManualName("");
      setManualExternalKey("");
      setManualType("device");
      scanLockRef.current = false;
    }
  }, [visible]);

  // Fade/slide transition between wizard steps
  useEffect(() => {
    stepAnim.setValue(0);
    Animated.timing(stepAnim, {
      toValue: 1,
      duration: 260,
      useNativeDriver: true,
    }).start();
  }, [step, stepAnim]);

  // Animated scan line — runs only while on the scan step
  useEffect(() => {
    if (step === 2 && method === "scan") {
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
  }, [step, method, scanAnim]);

  // Pulsing glow on the connecting step
  useEffect(() => {
    if (step === 3) {
      pulseAnim.setValue(0);
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 850,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 0,
            duration: 850,
            useNativeDriver: true,
          }),
        ])
      );
      pulseLoopRef.current = loop;
      loop.start();
    } else {
      pulseLoopRef.current?.stop();
      pulseLoopRef.current = null;
    }
    return () => {
      pulseLoopRef.current?.stop();
      pulseLoopRef.current = null;
    };
  }, [step, pulseAnim]);

  // ─── Shared connect runner (used by scan + manual) ─────────────────────────
  const beginConnect = async (name, type, externalKey) => {
    setSummary({ name, type, externalKey });
    setConnectError(null);
    setStep(3);
    setIsConnecting(true);

    try {
      const result = await createThing(name, type, externalKey);
      // Let the success state render briefly before handing back to the parent
      successTimerRef.current = setTimeout(() => {
        onDeviceAdded?.({
          id: result.id,
          externalKey: result.externalKey,
          name,
          type,
        });
      }, 600);
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
                    onDeviceAdded?.({
                      id: result.id,
                      externalKey: result.externalKey,
                      name,
                      type,
                    });
                  }
                } catch {
                  Alert.alert("Error", "Could not find existing device.");
                }
              },
            },
          ]
        );
        setConnectError("This device is already connected to your account.");
      } else {
        setConnectError(
          error.response?.data?.message ||
            "Could not connect this device. Please try again."
        );
      }
    } finally {
      setIsConnecting(false);
    }
  };

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

    await beginConnect(name, type, userExternalKey);
    scanLockRef.current = false;
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

    await beginConnect(manualName, manualType, manualExternalKey);
  };

  // ─── Camera access ──────────────────────────────────────────────────────
  const requestCamera = async () => {
    console.log("Requesting camera permission...");
    if (!permission?.granted) {
      const result = await requestPermission();
      console.log("requestPermission result:", result);
      if (!result.granted) {
        Alert.alert(
          "Camera Permission Required",
          "Please allow camera access to scan a QR code."
        );
        return;
      }
    }
    scanLockRef.current = false;
    setScanned(false);
    setCameraReady(false);
    setTorchOn(false);
    setStep(2);
    setMethod("scan");
  };

  const selectManual = () => {
    setMethod("manual");
    setStep(2);
  };

  const resetScanState = () => {
    setScanned(false);
    setCameraReady(false);
    scanLockRef.current = false;
  };

  const goBack = () => {
    if (step === 1) {
      onClose?.();
    } else if (step === 2) {
      setStep(1);
    } else {
      // step 3: back to details
      setConnectError(null);
      setIsConnecting(false);
      resetScanState();
      setStep(2);
    }
  };

  const primary = theme.colors.primary;
  const primaryDark = theme.colors.primaryDark;

  const renderStepIndicator = () => (
    <View style={styles.progressWrap}>
      <View style={styles.progressTrack}>
        {[1, 2, 3].map((i) => (
          <View
            key={i}
            style={[
              styles.progressSegment,
              { backgroundColor: i <= step ? primary : theme.colors.border },
            ]}
          />
        ))}
      </View>
      <Text style={[styles.stepLabel, { color: theme.colors.textSecondary }]}>
        Step {step} of 3 ·{" "}
        {step === 1
          ? "Choose method"
          : step === 2
          ? "Enter details"
          : "Connecting"}
      </Text>
    </View>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={goBack}
    >
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.colors.background }]}
        edges={["bottom"]}
      >
        {/* ─── Header ─────────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={goBack}
            style={[styles.iconButton, { backgroundColor: theme.colors.surface }]}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
          </TouchableOpacity>

          <View style={styles.headerCenter}>
            <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
              Add Device
            </Text>
          </View>

          <TouchableOpacity
            onPress={onClose}
            style={[styles.iconButton, { backgroundColor: theme.colors.surface }]}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={22} color={theme.colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {renderStepIndicator()}

        {/* ─── Step content with transition ──────────────────────────────── */}
        <Animated.View
          style={[
            styles.stepBody,
            {
              opacity: stepAnim,
              transform: [
                {
                  translateY: stepAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [16, 0],
                  }),
                },
              ],
            },
          ]}
        >
          {/* STEP 1 — Choose method */}
          {step === 1 && (
            <ScrollView
              contentContainerStyle={styles.stepContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <LinearGradient
                colors={[primary, primaryDark]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.heroIcon}
              >
                <Ionicons name="hardware-chip" size={40} color="#fff" />
              </LinearGradient>

              <Text style={[styles.title, { color: theme.colors.text }]}>
                Connect a New Device
              </Text>
              <Text
                style={[styles.subtitle, { color: theme.colors.textSecondary }]}
              >
                Link another AgriArch sensor device so your farm keeps
                reporting in real time. Choose how you&apos;d like to connect.
              </Text>

              {/* Method cards */}
              <TouchableOpacity
                style={[
                  styles.methodCard,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor: method === "scan" ? primary : theme.colors.border,
                  },
                ]}
                onPress={requestCamera}
                activeOpacity={0.9}
                accessibilityRole="button"
                accessibilityLabel="Scan QR code on device"
              >
                <View style={[styles.methodIcon, { backgroundColor: `${primary}1A` }]}>
                  <Ionicons name="qr-code" size={26} color={primary} />
                </View>
                <View style={styles.methodTextWrap}>
                  <Text style={[styles.methodTitle, { color: theme.colors.text }]}>
                    Scan QR Code
                  </Text>
                  <Text
                    style={[styles.methodDesc, { color: theme.colors.textSecondary }]}
                  >
                    Fastest way — scan the code on your device
                  </Text>
                </View>
                <Ionicons
                  name={method === "scan" ? "radio-button-on" : "radio-button-off"}
                  size={24}
                  color={method === "scan" ? primary : theme.colors.border}
                />
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.methodCard,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor: method === "manual" ? primary : theme.colors.border,
                  },
                ]}
                onPress={selectManual}
                activeOpacity={0.9}
                accessibilityRole="button"
                accessibilityLabel="Enter device details manually"
              >
                <View style={[styles.methodIcon, { backgroundColor: `${primary}1A` }]}>
                  <Ionicons name="create-outline" size={26} color={primary} />
                </View>
                <View style={styles.methodTextWrap}>
                  <Text style={[styles.methodTitle, { color: theme.colors.text }]}>
                    Enter Manually
                  </Text>
                  <Text
                    style={[styles.methodDesc, { color: theme.colors.textSecondary }]}
                  >
                    Type the ID printed on your device label
                  </Text>
                </View>
                <Ionicons
                  name={method === "manual" ? "radio-button-on" : "radio-button-off"}
                  size={24}
                  color={method === "manual" ? primary : theme.colors.border}
                />
              </TouchableOpacity>
            </ScrollView>
          )}

          {/* STEP 2 — Manual details */}
          {step === 2 && method === "manual" && (
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : undefined}
              style={styles.formContainer}
            >
              <ScrollView
                contentContainerStyle={styles.formContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                <Text style={[styles.formEyebrow, { color: primary }]}>
                  DEVICE DETAILS
                </Text>
                <Text style={[styles.formTitle, { color: theme.colors.text }]}>
                  Tell us about your device
                </Text>
                <Text
                  style={[styles.formSub, { color: theme.colors.textSecondary }]}
                >
                  You&apos;ll find the ID on the label attached to your sensor device.
                </Text>

                {/* Device name */}
                <Text
                  style={[styles.fieldLabel, { color: theme.colors.textSecondary }]}
                >
                  Device name
                </Text>
                <View
                  style={[
                    styles.inputGroup,
                    {
                      backgroundColor: theme.colors.inputBackground,
                      borderColor:
                        focusedField === "name" ? primary : theme.colors.border,
                    },
                  ]}
                >
                  <Ionicons
                    name="cube-outline"
                    size={18}
                    color={
                      focusedField === "name"
                        ? primary
                        : theme.colors.textSecondary
                    }
                  />
                  <TextInput
                    placeholder="e.g. Garden Sensor 1"
                    placeholderTextColor={theme.colors.textSecondary}
                    value={manualName}
                    onChangeText={setManualName}
                    onFocus={() => setFocusedField("name")}
                    onBlur={() => setFocusedField(null)}
                    style={[styles.input, { color: theme.colors.text }]}
                    editable={!isConnecting}
                    returnKeyType="next"
                    accessibilityLabel="Device name"
                  />
                </View>

                {/* External key */}
                <Text
                  style={[styles.fieldLabel, { color: theme.colors.textSecondary }]}
                >
                  Device ID / External key
                </Text>
                <View
                  style={[
                    styles.inputGroup,
                    {
                      backgroundColor: theme.colors.inputBackground,
                      borderColor:
                        focusedField === "key" ? primary : theme.colors.border,
                    },
                  ]}
                >
                  <Ionicons
                    name="key-outline"
                    size={18}
                    color={
                      focusedField === "key" ? primary : theme.colors.textSecondary
                    }
                  />
                  <TextInput
                    placeholder="e.g. SENSOR-001"
                    placeholderTextColor={theme.colors.textSecondary}
                    value={manualExternalKey}
                    onChangeText={setManualExternalKey}
                    onFocus={() => setFocusedField("key")}
                    onBlur={() => setFocusedField(null)}
                    autoCapitalize="characters"
                    style={[styles.input, { color: theme.colors.text }]}
                    editable={!isConnecting}
                    returnKeyType="next"
                    accessibilityLabel="Device external key"
                  />
                </View>

                {/* Device type */}
                <Text
                  style={[styles.fieldLabel, { color: theme.colors.textSecondary }]}
                >
                  Device type
                </Text>
                <View
                  style={[
                    styles.inputGroup,
                    {
                      backgroundColor: theme.colors.inputBackground,
                      borderColor:
                        focusedField === "type" ? primary : theme.colors.border,
                    },
                  ]}
                >
                  <Ionicons
                    name="options-outline"
                    size={18}
                    color={
                      focusedField === "type"
                        ? primary
                        : theme.colors.textSecondary
                    }
                  />
                  <TextInput
                    placeholder="e.g. device, sensor"
                    placeholderTextColor={theme.colors.textSecondary}
                    value={manualType}
                    onChangeText={setManualType}
                    onFocus={() => setFocusedField("type")}
                    onBlur={() => setFocusedField(null)}
                    style={[styles.input, { color: theme.colors.text }]}
                    editable={!isConnecting}
                    returnKeyType="done"
                    onSubmitEditing={handleManualEntry}
                    accessibilityLabel="Device type"
                  />
                </View>

                <TouchableOpacity
                  style={[styles.primaryBtn, { shadowColor: primaryDark }]}
                  onPress={handleManualEntry}
                  activeOpacity={0.85}
                  disabled={isConnecting}
                  accessibilityRole="button"
                >
                  <LinearGradient
                    colors={[primary, primaryDark]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.primaryBtnGradient}
                  >
                    {isConnecting ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="link" size={20} color="#fff" />
                        <Text style={styles.primaryBtnText}>Connect Device</Text>
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.switchLink}
                  onPress={requestCamera}
                  disabled={isConnecting}
                  accessibilityRole="button"
                >
                  <Text style={[styles.switchLinkText, { color: primary }]}>
                    Prefer scanning? Use the QR scanner
                  </Text>
                </TouchableOpacity>
              </ScrollView>
            </KeyboardAvoidingView>
          )}

          {/* STEP 2 — QR scan */}
          {step === 2 && method === "scan" && (
            <View style={styles.scanStep}>
              {permission?.granted ? (
                <>
                  <CameraView
                    style={styles.camera}
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

                  {!cameraReady && (
                    <View style={styles.cameraLoading}>
                      <ActivityIndicator size="large" color={primary} />
                      <Text style={styles.cameraLoadingText}>Starting camera...</Text>
                    </View>
                  )}

                  {/* Scan overlay frame */}
                  <View pointerEvents="none" style={styles.scanOverlay}>
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
                                  outputRange: [4, width * 0.66 - 8],
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
                </>
              ) : (
                <View style={styles.permissionCard}>
                  <View style={[styles.permissionIcon, { backgroundColor: `${primary}1A` }]}>
                    <Ionicons name="camera-outline" size={40} color={primary} />
                  </View>
                  <Text style={[styles.permissionTitle, { color: theme.colors.text }]}>
                    Camera access required
                  </Text>
                  <Text style={[styles.permissionText, { color: theme.colors.textSecondary }]}>
                    Allow camera access to scan the QR code on your device.
                  </Text>
                  <TouchableOpacity
                    style={[styles.primaryBtn, { shadowColor: primaryDark }]}
                    onPress={requestCamera}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                  >
                    <LinearGradient
                      colors={[primary, primaryDark]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.primaryBtnGradient}
                    >
                      <Text style={styles.primaryBtnText}>Allow Camera Access</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.switchLink}
                    onPress={selectManual}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.switchLinkText, { color: primary }]}>
                      Enter details manually instead
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Torch toggle */}
              {permission?.granted && (
                <TouchableOpacity
                  onPress={() => setTorchOn(!torchOn)}
                  style={[styles.torchButton, { backgroundColor: "rgba(0,0,0,0.55)" }]}
                  accessibilityRole="button"
                  accessibilityLabel={torchOn ? "Turn off flashlight" : "Turn on flashlight"}
                >
                  <Ionicons
                    name={torchOn ? "flash" : "flash-outline"}
                    size={26}
                    color={torchOn ? "#FFD54F" : "#fff"}
                  />
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* STEP 3 — Connecting */}
          {step === 3 && (
            <ScrollView
              contentContainerStyle={styles.stepContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.connectingWrap}>
                <Animated.View
                  style={[
                    styles.pulseRing,
                    {
                      backgroundColor: `${primary}26`,
                      transform: [
                        {
                          scale: pulseAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [1, 1.45],
                          }),
                        },
                      ],
                      opacity: pulseAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.7, 0],
                      }),
                    },
                  ]}
                />
                <LinearGradient
                  colors={[primary, primaryDark]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.connectingIcon}
                >
                  {connectError ? (
                    <Ionicons name="alert-circle" size={44} color="#fff" />
                  ) : isConnecting ? (
                    <ActivityIndicator size="large" color="#fff" />
                  ) : (
                    <Ionicons name="checkmark" size={44} color="#fff" />
                  )}
                </LinearGradient>
              </View>

              <Text style={[styles.title, { color: theme.colors.text }]}>
                {connectError
                  ? "Connection failed"
                  : isConnecting
                  ? "Connecting your device..."
                  : "Device connected!"}
              </Text>
              <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
                {connectError
                  ? "We couldn't connect this device. Please check the details and try again."
                  : isConnecting
                  ? "This usually takes a few seconds. Please don't close the app."
                  : "Your device is live and reporting to your farm."}
              </Text>

              {/* Device summary card */}
              {summary && (
                <View style={[styles.summaryCard, { backgroundColor: theme.colors.surface }]}>
                  <View style={styles.summaryRow}>
                    <Ionicons name="cube-outline" size={18} color={primary} />
                    <Text style={[styles.summaryLabel, { color: theme.colors.textSecondary }]}>
                      Name
                    </Text>
                    <Text style={[styles.summaryValue, { color: theme.colors.text }]}>
                      {summary.name}
                    </Text>
                  </View>
                  <View style={[styles.summaryDivider, { backgroundColor: theme.colors.border }]} />
                  <View style={styles.summaryRow}>
                    <Ionicons name="key-outline" size={18} color={primary} />
                    <Text style={[styles.summaryLabel, { color: theme.colors.textSecondary }]}>
                      ID
                    </Text>
                    <Text style={[styles.summaryValue, { color: theme.colors.text }]}>
                      {summary.externalKey}
                    </Text>
                  </View>
                </View>
              )}

              {connectError && (
                <View style={styles.errorActions}>
                  <TouchableOpacity
                    style={[styles.primaryBtn, { shadowColor: primaryDark }]}
                    onPress={() => {
                      setConnectError(null);
                      setSummary(null);
                      resetScanState();
                      setStep(2);
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
                      <Text style={styles.primaryBtnText}>Try Again</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          )}
        </Animated.View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  iconButton: {
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
  progressWrap: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 10,
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
  stepLabel: {
    fontSize: 12,
    fontWeight: "600",
    marginTop: 8,
    letterSpacing: 0.2,
  },
  stepBody: { flex: 1 },
  stepContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 18,
    paddingBottom: 24,
    alignItems: "center",
  },
  heroIcon: {
    width: 92,
    height: 92,
    borderRadius: 46,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
    shadowColor: "#1B5E20",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    textAlign: "center",
    letterSpacing: 0.2,
  },
  subtitle: {
    fontSize: 14.5,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 26,
    lineHeight: 21,
    opacity: 0.9,
  },
  methodCard: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 16,
    marginBottom: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  methodIcon: {
    width: 50,
    height: 50,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  methodTextWrap: { flex: 1 },
  methodTitle: { fontSize: 16, fontWeight: "700" },
  methodDesc: { fontSize: 12.5, marginTop: 3, lineHeight: 17 },
  // Form
  formContainer: { flex: 1 },
  formContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 14,
    paddingBottom: 24,
  },
  formEyebrow: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  formTitle: {
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  formSub: {
    fontSize: 13.5,
    lineHeight: 20,
    marginTop: 6,
    marginBottom: 22,
    opacity: 0.9,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 7,
    marginLeft: 4,
  },
  inputGroup: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 52,
    marginBottom: 18,
  },
  input: {
    flex: 1,
    fontSize: 15,
    paddingHorizontal: 10,
    paddingVertical: 0,
    height: "100%",
  },
  primaryBtn: {
    width: "100%",
    borderRadius: 50,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
    marginTop: 8,
  },
  primaryBtnGradient: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: { color: "#fff", fontSize: 16, fontWeight: "700", letterSpacing: 0.3 },
  switchLink: {
    marginTop: 16,
    paddingVertical: 8,
    alignSelf: "center",
  },
  switchLinkText: { fontSize: 14, fontWeight: "600" },
  // Scan
  scanStep: { flex: 1, backgroundColor: "#000" },
  camera: { flex: 1 },
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
  scanOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  scanFrame: {
    width: width * 0.66,
    height: width * 0.66,
    borderRadius: 14,
    overflow: "hidden",
  },
  corner: {
    position: "absolute",
    width: 34,
    height: 34,
    borderWidth: 4,
    zIndex: 10,
  },
  cornerTL: { top: 0, left: 0, borderBottomWidth: 0, borderRightWidth: 0, borderTopLeftRadius: 14 },
  cornerTR: { top: 0, right: 0, borderBottomWidth: 0, borderLeftWidth: 0, borderTopRightRadius: 14 },
  cornerBL: { bottom: 0, left: 0, borderTopWidth: 0, borderRightWidth: 0, borderBottomLeftRadius: 14 },
  cornerBR: { bottom: 0, right: 0, borderTopWidth: 0, borderLeftWidth: 0, borderBottomRightRadius: 14 },
  scanLine: {
    position: "absolute",
    top: 0,
    left: 12,
    right: 12,
    height: 2.5,
    borderRadius: 1.5,
  },
  scanInstruction: {
    color: "#fff",
    fontSize: 14,
    marginTop: 22,
    textAlign: "center",
    paddingHorizontal: 20,
    fontWeight: "500",
  },
  torchButton: {
    position: "absolute",
    bottom: 36,
    alignSelf: "center",
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
  },
  permissionCard: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  permissionIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 18,
  },
  permissionTitle: { fontSize: 20, fontWeight: "800" },
  permissionText: {
    fontSize: 14,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 24,
    lineHeight: 20,
  },
  // Connecting
  connectingWrap: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 40,
    marginBottom: 26,
  },
  pulseRing: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  connectingIcon: {
    width: 110,
    height: 110,
    borderRadius: 55,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#1B5E20",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  summaryCard: {
    width: "100%",
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 6,
    marginTop: 22,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 13,
  },
  summaryLabel: {
    fontSize: 13,
    fontWeight: "600",
    width: 48,
  },
  summaryValue: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: "700",
    textAlign: "right",
  },
  summaryDivider: { height: 1, width: "100%" },
  errorActions: { width: "100%", marginTop: 22 },
});
