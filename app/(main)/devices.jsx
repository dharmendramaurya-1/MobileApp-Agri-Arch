

















































// app/(main)/devices.jsx — Devices tab
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Dimensions,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import AddDeviceWizard from "../../components/AddDeviceWizard";
import { useAuth } from "../../src/context/AuthContext";
import { useMqtt } from "../../src/context/MqttContext";
import { useScroll, useScrollReset } from "../../src/context/ScrollContext";
import { useTheme } from "../../src/context/ThemContext";
import {
  getAllThings,
  getStoredExternalKey,
  getStoredPublisherId,
  setActiveDevice
} from "../../src/services/identify/identify";

const { height } = Dimensions.get("window");

// ── Storage Keys ──────────────────────────────────────────────────────────
const STORAGE_KEYS = {
  EXTERNAL_KEY: 'external_key',
  ACTIVE_DEVICE_ID: 'active_device_id',
  PUBLISHER_ID: 'publisher_id',
};

// ── Registered device card ───────────────────────────────────────────────────
function DeviceCard({
  device,
  isActive,
  onConnect,
  onDelete,
  theme,
  connectionStatus,
  hasReceivedData,
  deviceStatusFlags,
  connectionState,
}) {
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  // ✅ Determine device status with proper states
  const getStatus = () => {
    // Not active device
    if (!isActive) {
      return {
        status: 'inactive',
        color: theme.colors.textSecondary,
        bg: `${theme.colors.textSecondary}16`,
        label: "Not Connected",
        icon: "power-outline",
        isOnline: false,
      };
    }

    // Active device - checking connection
    if (isActive) {
      // ✅ Device is ONLINE - data received and online flag true
      if (hasReceivedData && deviceStatusFlags?.online === true) {
        return {
          status: 'online',
          color: "#4CAF50",
          bg: "rgba(76,175,80,0.12)",
          label: "Online",
          icon: "checkmark-circle",
          isOnline: true,
        };
      }

      // ✅ Device is CONNECTING - waiting for first data
      if (connectionState === 'connecting' || connectionState === 'waiting') {
        return {
          status: 'connecting',
          color: "#FF9800",
          bg: "rgba(255,152,0,0.14)",
          label: "Connecting…",
          icon: "sync",
          isOnline: false,
        };
      }

      // ✅ Device is OFFLINE - only after timeout
      if (connectionState === 'offline' || connectionState === 'error') {
        return {
          status: 'offline',
          color: "#F44336",
          bg: "rgba(244,67,54,0.10)",
          label: "Offline",
          icon: "close-circle",
          isOnline: false,
        };
      }

      // ✅ Default: Not Connected (no data yet)
      return {
        status: 'not_connected',
        color: theme.colors.textSecondary,
        bg: `${theme.colors.textSecondary}16`,
        label: "Not Connected",
        icon: "power-outline",
        isOnline: false,
      };
    }

    return {
      status: 'not_connected',
      color: theme.colors.textSecondary,
      bg: `${theme.colors.textSecondary}16`,
      label: "Not Connected",
      icon: "power-outline",
      isOnline: false,
    };
  };

  const statusInfo = getStatus();

  const handleConnect = async () => {
    await onConnect(device);
  };

  const confirmDelete = async () => {
    if (deleteConfirmText.toLowerCase() !== "delete") {
      Alert.alert("Confirmation Required", 'Please type "delete" to confirm.');
      return;
    }
    setShowDeleteModal(false);
    setDeleteConfirmText("");
    await onDelete(device);
  };

  return (
    <>
      <TouchableOpacity
        style={[
          styles.deviceCard,
          {
            backgroundColor: theme.colors.surface,
            borderColor: isActive ? theme.colors.primary : theme.colors.border,
            borderWidth: isActive ? 1.5 : 1,
            opacity: isActive ? 1 : 0.7,
          },
        ]}
        activeOpacity={0.8}
      >
        <View style={styles.deviceCardHeader}>
          <View
            style={[
              styles.deviceIconContainer,
              { backgroundColor: statusInfo.bg },
            ]}
          >
            <Ionicons
              name={
                device.type === "device"
                  ? "hardware-chip-outline"
                  : "sensor-outline"
              }
              size={22}
              color={statusInfo.color}
            />
          </View>
          <View style={styles.deviceInfo}>
            <View style={styles.deviceNameRow}>
              <Text
                style={[styles.deviceName, { color: theme.colors.text }]}
                numberOfLines={1}
              >
                {device.name || "Unnamed Device"}
              </Text>
              {isActive && (
                <View
                  style={[
                    styles.activePill,
                    { backgroundColor: statusInfo.isOnline ? "#4CAF50" : "#FF9800" },
                  ]}
                >
                  <Text style={styles.activePillText}>
                    {statusInfo.isOnline ? "ONLINE" : "WAITING"}
                  </Text>
                </View>
              )}
            </View>
            <Text style={[styles.deviceType, { color: theme.colors.textSecondary }]}>
              {device.type || "device"} · ID {device.id?.substring(0, 8)}…
            </Text>
            <View style={[styles.statusPill, { backgroundColor: statusInfo.bg }]}>
              {statusInfo.status === "connecting" ? (
                <ActivityIndicator size={10} color={statusInfo.color} />
              ) : (
                <Ionicons name={statusInfo.icon} size={12} color={statusInfo.color} />
              )}
              <Text style={[styles.statusPillText, { color: statusInfo.color }]}>
                {statusInfo.label}
              </Text>
            </View>
          </View>
        </View>

        <View style={[styles.deviceCardFooter, { borderTopColor: theme.colors.border }]}>
          <View style={styles.lastSeen}>
            <Ionicons name="time-outline" size={14} color={theme.colors.textSecondary} />
            <Text style={[styles.lastSeenText, { color: theme.colors.textSecondary }]}>
              {isActive 
                ? (hasReceivedData ? "Receiving data" : "Waiting for data…") 
                : "Select device to connect"}
            </Text>
          </View>
          <View style={styles.cardActions}>
            {isActive ? (
              <View style={[styles.connectBtn, { 
                backgroundColor: statusInfo.isOnline ? "#4CAF50" : "#FF9800",
                opacity: 1,
              }]}>
                <Ionicons 
                  name={statusInfo.isOnline ? "checkmark-circle" : "time-outline"} 
                  size={16} 
                  color="#FFF" 
                />
                <Text style={styles.connectBtnText}>
                  {statusInfo.isOnline ? "Connected" : "Connecting…"}
                </Text>
              </View>
            ) : (
              <TouchableOpacity
                style={[
                  styles.connectBtn,
                  { backgroundColor: theme.colors.primary },
                ]}
                onPress={handleConnect}
                activeOpacity={0.85}
              >
                <Ionicons name="flash" size={16} color="#FFF" />
                <Text style={styles.connectBtnText}>Connect</Text>
              </TouchableOpacity>
            )}
            {!isActive && (
              <TouchableOpacity
                style={[styles.deleteBtn, { borderColor: theme.colors.border }]}
                onPress={() => setShowDeleteModal(true)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Delete ${device.name || "device"}`}
              >
                <Ionicons name="trash-outline" size={18} color="#F44336" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </TouchableOpacity>

      {/* ── Delete Confirmation Modal ── */}
      <Modal
        visible={showDeleteModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDeleteModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.colors.surface }]}>
            <View style={styles.modalHeader}>
              <View style={[styles.modalWarningIcon, { backgroundColor: "#F4433615" }]}>
                <Ionicons name="warning" size={26} color="#F44336" />
              </View>
              <Text style={[styles.modalTitle, { color: theme.colors.text }]}>
                Delete Device
              </Text>
            </View>

            <Text style={[styles.modalMessage, { color: theme.colors.textSecondary }]}>
              This action cannot be undone. All data associated with{" "}
              <Text style={{ fontWeight: "700", color: theme.colors.text }}>
                {device?.name || "this device"}
              </Text>{" "}
              will be permanently removed.
            </Text>

            <View style={[styles.deviceInfoBox, { backgroundColor: `${theme.colors.textSecondary}0D` }]}>
              <View style={styles.deviceInfoRow}>
                <Text style={[styles.deviceInfoLabel, { color: theme.colors.textSecondary }]}>
                  Device ID
                </Text>
                <Text style={[styles.deviceInfoValue, { color: theme.colors.text }]} numberOfLines={1}>
                  {device?.id || "N/A"}
                </Text>
              </View>
            </View>

            <Text style={[styles.confirmLabel, { color: theme.colors.textSecondary }]}>
              Type <Text style={{ fontWeight: "700", color: "#F44336" }}>&quot;delete&quot;</Text> to confirm:
            </Text>

            <View style={styles.confirmInputContainer}>
              <TextInput
                style={[
                  styles.confirmInput,
                  {
                    color: theme.colors.text,
                    borderColor:
                      deleteConfirmText.toLowerCase() === "delete"
                        ? "#4CAF50"
                        : theme.colors.border,
                    backgroundColor: theme.colors.inputBackground,
                  },
                ]}
                placeholder='Type "delete" here…'
                placeholderTextColor={theme.colors.textSecondary}
                value={deleteConfirmText}
                onChangeText={setDeleteConfirmText}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[
                  styles.modalButton,
                  styles.modalCancelButton,
                  { backgroundColor: `${theme.colors.textSecondary}14` },
                ]}
                onPress={() => {
                  setShowDeleteModal(false);
                  setDeleteConfirmText("");
                }}
                activeOpacity={0.8}
              >
                <Text style={[styles.modalButtonText, { color: theme.colors.text }]}>
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalButton,
                  styles.modalDeleteButton,
                  { opacity: deleteConfirmText.toLowerCase() === "delete" ? 1 : 0.5 },
                ]}
                onPress={confirmDelete}
                disabled={deleteConfirmText.toLowerCase() !== "delete"}
                activeOpacity={0.85}
              >
                <Text style={styles.modalDeleteButtonText}>Delete Device</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────
export default function Devices() {
  const { theme } = useTheme();
  const { onScroll, headerHeight } = useScroll();
  const scrollRef = useRef(null);
  useScrollReset(scrollRef);
  
  const {
    isConnected,
    externalKey,
    sensorData,
    connectionState,
    hasReceivedData,
    forceReconnect,
    switchToDevice,
    isReady,
    deviceStatusFlags,
  } = useMqtt();

  const { deleteThing } = useAuth();

  // ── Registered device state ──
  const [registeredDevices, setRegisteredDevices] = useState([]);
  const [loadingDevices, setLoadingDevices] = useState(true);
  const [activeDevice, setActiveDeviceState] = useState(null);
  const [deviceConnStatus, setDeviceConnStatus] = useState({});
  const [showAddWizard, setShowAddWizard] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [autoConnectAttempted, setAutoConnectAttempted] = useState(false);

  // ── Auto-connect to last used device ──────────────────────────────────────
  const autoConnectToLastDevice = async () => {
    try {
      console.log("🔄 Attempting auto-connect to last device...");
      
      const storedExternalKey = await getStoredExternalKey();
      const storedPublisherId = await getStoredPublisherId();
      
      console.log("📦 Stored - External Key:", storedExternalKey, "Publisher ID:", storedPublisherId);
      
      if (storedExternalKey && storedPublisherId) {
        const deviceExists = registeredDevices.find(d => d.id === storedPublisherId);
        
        if (deviceExists) {
          console.log("✅ Found matching device in list:", deviceExists.name);
          setActiveDeviceState(deviceExists);
          
          if (externalKey !== storedExternalKey) {
            console.log("🔄 Auto-connecting to:", storedExternalKey);
            await switchToDevice(storedPublisherId, storedExternalKey);
          } else {
            console.log("✅ Already connected to the stored device");
          }
          
          setAutoConnectAttempted(true);
          return true;
        }
      }
      
      // ✅ Fallback: Connect to first device
      if (registeredDevices.length > 0 && !autoConnectAttempted) {
        const firstDevice = registeredDevices[0];
        console.log("🔄 Auto-connecting to first device:", firstDevice.name);
        await setActiveDevice(firstDevice.id, firstDevice.external_key);
        setActiveDeviceState(firstDevice);
        
        if (externalKey !== firstDevice.external_key) {
          await switchToDevice(firstDevice.id, firstDevice.external_key);
        }
        setAutoConnectAttempted(true);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error("❌ Auto-connect error:", error);
      return false;
    }
  };

  // ── Load registered devices ──────────────────────────────────────────────
  const loadDevices = async () => {
    try {
      const allThings = await getAllThings();

      if (allThings && allThings.length > 0) {
        setRegisteredDevices(allThings);

        const storedPublisherId = await getStoredPublisherId();
        const storedExternalKey = await getStoredExternalKey();
        
        if (storedPublisherId && storedExternalKey) {
          const storedDevice = allThings.find((t) => t.id === storedPublisherId);
          if (storedDevice) {
            setActiveDeviceState(storedDevice);
            if (externalKey !== storedExternalKey) {
              console.log("🔄 Auto-connecting to stored device:", storedDevice.name);
              await switchToDevice(storedDevice.id, storedExternalKey);
            }
          } else {
            const firstThing = allThings[0];
            await setActiveDevice(firstThing.id, firstThing.external_key);
            setActiveDeviceState(firstThing);
          }
        } else {
          const firstThing = allThings[0];
          await setActiveDevice(firstThing.id, firstThing.external_key);
          setActiveDeviceState(firstThing);
        }
      } else {
        setRegisteredDevices([]);
        setActiveDeviceState(null);
      }
    } catch (error) {
      console.error("Error loading devices:", error);
    } finally {
      setLoadingDevices(false);
      setRefreshing(false);
      setAutoConnectAttempted(true);
    }
  };

  // ── Load devices on mount ────────────────────────────────────────────────
  useEffect(() => {
    loadDevices();
  }, []);

  // ── Auto-connect when devices are loaded ─────────────────────────────────
  useEffect(() => {
    if (!loadingDevices && registeredDevices.length > 0 && !autoConnectAttempted) {
      autoConnectToLastDevice();
    }
  }, [loadingDevices, registeredDevices]);

  // ── Connect a registered device ─────────────────────────────────────────
  const handleConnectDevice = async (device) => {
    try {
      setDeviceConnStatus((prev) => ({ ...prev, [device.id]: "connecting" }));

      await setActiveDevice(device.id, device.external_key);
      setActiveDeviceState(device);

      await switchToDevice(device.id, device.external_key);

      setDeviceConnStatus((prev) => ({
        ...prev,
        [device.id]: connectionState || "waiting",
      }));

      Alert.alert(
        "✅ Device Selected",
        `${device.name || "Device"} is now active.\n\nWaiting for device to connect...`,
        [{ text: "OK" }]
      );
    } catch (error) {
      console.error("Error connecting to device:", error);
      setDeviceConnStatus((prev) => ({ ...prev, [device.id]: "error" }));
      Alert.alert(
        "Connection Failed",
        `Failed to connect to ${device.name}. Please try again.`
      );
    }
  };

  // ── Delete a registered device ──────────────────────────────────────────
  const handleDeleteDevice = async (device) => {
    try {
      console.log(`🗑️ Attempting to delete device: ${device.id}`);

      const result = await deleteThing(device.id);

      if (result && result.success) {
        Alert.alert(
          "✅ Device Deleted",
          `${device.name || "Device"} has been deleted successfully.`,
          [
            {
              text: "OK",
              onPress: () => {
                loadDevices();
                if (activeDevice?.id === device.id) {
                  setActiveDeviceState(null);
                }
              },
            },
          ]
        );
      } else {
        Alert.alert(
          "❌ Deletion Failed",
          `Failed to delete ${device.name || "device"}. ${result?.error || "Please try again."}`
        );
      }
    } catch (error) {
      console.error("Error deleting device:", error);
      Alert.alert(
        "❌ Error",
        `An error occurred while deleting ${device.name || "device"}. Please try again.`
      );
    }
  };

  // ── Device added from wizard ────────────────────────────────────────────
  const handleDeviceAdded = async (device) => {
    setShowAddWizard(false);
    await loadDevices();

    if (device?.id && device?.externalKey) {
      try {
        await switchToDevice(device.id, device.externalKey);
        setActiveDeviceState(device);
        Alert.alert(
          "✅ Device Added",
          `${device.name || "Device"} has been added and connected successfully!`,
          [{ text: "OK" }]
        );
      } catch (error) {
        console.error("Auto-connect to new device failed:", error);
      }
    }
  };

  // ── Refresh ─────────────────────────────────────────────────────────────
  const onRefresh = async () => {
    setRefreshing(true);
    await loadDevices();
  };

  // ── Connection status for a registered device ───────────────────────────
  const getDeviceConnectionStatus = (deviceId) => {
    if (activeDevice?.id === deviceId) {
      return connectionState || "offline";
    }
    return deviceConnStatus[deviceId] || "disconnected";
  };

  const openAddWizard = () => setShowAddWizard(true);

  const primary = theme.colors.primary;
  const primaryDark = theme.colors.primaryDark;

  // ✅ Check if device is online
  const isDeviceOnline = hasReceivedData && deviceStatusFlags?.online === true;

  // ── Back Handler ──────────────────────────────────────────────────────────
  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      // ✅ If AddDeviceWizard is open, close it first
      if (showAddWizard) {
        setShowAddWizard(false);
        return true; // Prevent default back behavior
      }
      
      // ✅ If any modal is open, close it
      // (Modals are handled inside DeviceCard)
      
      // ✅ Default behavior - go back
      router.back();
      return true;
    });

    return () => backHandler.remove();
  }, [showAddWizard]);

  // ── Check and navigate back if no devices ──────────────────────────────
  useEffect(() => {
    // If no devices and not loading, auto-navigate to add device
    if (!loadingDevices && registeredDevices.length === 0 && !showAddWizard) {
      // Uncomment if you want auto-open add wizard when no devices
      // setShowAddWizard(true);
    }
  }, [loadingDevices, registeredDevices]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        ref={scrollRef}
        style={styles.container}
        contentContainerStyle={[
          styles.scrollViewContent,
          {
            paddingBottom: Platform.OS === "ios" ? height * 0.14 : height * 0.12,
            paddingTop: headerHeight,
          },
        ]}
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[primary]}
            tintColor={primary}
          />
        }
      >
        {/* ── Header ───────────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={[styles.title, { color: theme.colors.text }]}>Devices</Text>
            <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
              {loadingDevices
                ? "Loading…"
                : registeredDevices.length > 0
                ? `${registeredDevices.length} registered${
                    activeDevice?.name ? ` · ${activeDevice.name}` : ""
                  }`
                : "No devices connected yet"}
            </Text>
          </View>
          {/* ❌ REMOVED + ICON - No add button in header */}
        </View>

        {/* ── Active Device Status Banner ─────────────────────────────────── */}
        {activeDevice && (
          <View
            style={[
              styles.activeDeviceBanner,
              {
                backgroundColor: isDeviceOnline ? `${primary}1A` : "#FFF3E0",
                borderColor: isDeviceOnline ? primary : "#FF9800",
                borderWidth: 1,
              },
            ]}
          >
            <View style={styles.bannerContent}>
              <View style={styles.bannerIcon}>
                <Ionicons
                  name={isDeviceOnline ? "checkmark-circle" : "time-outline"}
                  size={20}
                  color={isDeviceOnline ? primary : "#FF9800"}
                />
              </View>
              <View style={styles.bannerTextContainer}>
                <Text style={[styles.bannerTitle, { color: theme.colors.text }]}>
                  {isDeviceOnline ? "✅ Device Connected" : "⏳ Connecting to Device..."}
                </Text>
                <Text style={[styles.bannerSubtitle, { color: theme.colors.textSecondary }]}>
                  {isDeviceOnline
                    ? `${activeDevice.name || "Device"} is ready and receiving data`
                    : `Waiting for ${activeDevice.name || "device"} to connect...`}
                </Text>
              </View>
              {!isDeviceOnline && (
                <TouchableOpacity
                  style={[styles.bannerRetryBtn, { backgroundColor: "#FF9800" }]}
                  onPress={() => {
                    if (activeDevice) {
                      handleConnectDevice(activeDevice);
                    }
                  }}
                >
                  <Text style={styles.bannerRetryText}>Retry</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* ── Loading / Empty states ───────────────────────────────────────── */}
        {loadingDevices ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={primary} />
            <Text style={[styles.loadingText, { color: theme.colors.textSecondary }]}>
              Loading devices…
            </Text>
          </View>
        ) : registeredDevices.length === 0 ? (
          <View style={styles.emptyState}>
            <LinearGradient
              colors={[`${primary}1F`, `${primaryDark}1F`]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.emptyIconWrap}
            >
              <Ionicons name="hardware-chip-outline" size={48} color={primary} />
            </LinearGradient>
            <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>
              No Devices Connected
            </Text>
            <Text style={[styles.emptySubtitle, { color: theme.colors.textSecondary }]}>
              Add your first AgriArch sensor device to start monitoring your farm in real time.
            </Text>
            <TouchableOpacity
              style={[styles.emptyButton, { shadowColor: primaryDark }]}
              onPress={openAddWizard}
              activeOpacity={0.85}
              accessibilityRole="button"
            >
              <LinearGradient
                colors={[primary, primaryDark]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.emptyButtonGradient}
              >
                <Ionicons name="add-circle" size={20} color="#FFF" />
                <Text style={styles.emptyButtonText}>Add Your First Device</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* ── My Devices ────────────────────────────────────────────────── */}
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
                My Devices
              </Text>
              <View style={[styles.countBadge, { backgroundColor: `${primary}1A` }]}>
                <Text style={[styles.countBadgeText, { color: primary }]}>
                  {registeredDevices.length}
                </Text>
              </View>
            </View>

            {registeredDevices.map((item) => (
              <DeviceCard
                key={item.id}
                device={item}
                isActive={activeDevice?.id === item.id}
                onConnect={handleConnectDevice}
                onDelete={handleDeleteDevice}
                theme={theme}
                connectionStatus={getDeviceConnectionStatus(item.id)}
                hasReceivedData={hasReceivedData}
                deviceStatusFlags={deviceStatusFlags}
                connectionState={connectionState}
              />
            ))}

            {/* Dashed add card */}
            <TouchableOpacity
              style={[styles.addDeviceCard, { borderColor: theme.colors.primary }]}
              onPress={openAddWizard}
              activeOpacity={0.8}
              accessibilityRole="button"
            >
              <View style={[styles.addDeviceCardIcon, { backgroundColor: `${primary}1A` }]}>
                <Ionicons name="add" size={22} color={primary} />
              </View>
              <View style={styles.addDeviceCardTextWrap}>
                <Text style={[styles.addDeviceCardTitle, { color: theme.colors.text }]}>
                  Add New Device
                </Text>
                <Text style={[styles.addDeviceCardSub, { color: theme.colors.textSecondary }]}>
                  Scan a QR code or enter the ID manually
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          </>
        )}

        {/* ── Device Status Footer ───────────────────────────────────────────── */}
        {registeredDevices.length > 0 && (
          <View
            style={[
              styles.footer,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <View style={styles.footerRow}>
              <View style={styles.footerStatus}>
                <View
                  style={[
                    styles.footerDot,
                    { 
                      backgroundColor: isDeviceOnline ? "#4CAF50" : 
                                     (connectionState === 'waiting' || connectionState === 'connecting') ? "#FF9800" : 
                                     "#F44336" 
                    },
                  ]}
                />
                <Text style={[styles.footerText, { color: theme.colors.textSecondary }]}>
                  {isDeviceOnline ? "Device Connected" : 
                    (connectionState === 'waiting' || connectionState === 'connecting') ? "Connecting..." : 
                    "Device Offline"}
                </Text>
              </View>
              {externalKey && (
                <Text style={[styles.deviceIdText, { color: theme.colors.textSecondary }]}>
                  ID: {externalKey.slice(0, 8)}…
                </Text>
              )}
            </View>
            <TouchableOpacity onPress={onRefresh} style={styles.refreshButton}>
              <Ionicons name="refresh-outline" size={18} color={primary} />
              <Text style={[styles.refreshText, { color: primary }]}>Refresh</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* ❌ REMOVED FAB - No floating add button */}

      {/* ── Add Device Wizard ──────────────────────────────────────────────── */}
      <AddDeviceWizard
        visible={showAddWizard}
        onClose={() => setShowAddWizard(false)}
        onDeviceAdded={handleDeviceAdded}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollViewContent: { padding: 16, paddingTop: Platform.OS === "ios" ? 8 : 16 },

  // ── Header ─────────────────────────────────────────────────────────────
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  headerLeft: { flex: 1, marginRight: 12 },
  title: { fontSize: 28, fontWeight: "700" },
  subtitle: { fontSize: 13, marginTop: 4, opacity: 0.9 },

  // ── Active Device Banner ────────────────────────────────────────────────
  activeDeviceBanner: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
  },
  bannerContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  bannerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  bannerTextContainer: { flex: 1 },
  bannerTitle: { fontSize: 14, fontWeight: "700" },
  bannerSubtitle: { fontSize: 12, marginTop: 2 },
  bannerRetryBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
  },
  bannerRetryText: { color: "#FFF", fontSize: 12, fontWeight: "600" },

  // ── Loading / empty ────────────────────────────────────────────────────
  loadingBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  loadingText: { marginTop: 12, fontSize: 14 },
  emptyState: {
    alignItems: "center",
    paddingVertical: 40,
    paddingHorizontal: 12,
  },
  emptyIconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  emptyTitle: { fontSize: 20, fontWeight: "800", textAlign: "center" },
  emptySubtitle: {
    fontSize: 14,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 26,
    lineHeight: 21,
    paddingHorizontal: 8,
  },
  emptyButton: {
    borderRadius: 50,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },
  emptyButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 50,
  },
  emptyButtonText: { color: "#FFF", fontSize: 16, fontWeight: "700" },

  // ── Section headers ────────────────────────────────────────────────────
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  countBadge: {
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  countBadgeText: { fontSize: 13, fontWeight: "700" },

  // ── Registered device cards ────────────────────────────────────────────
  deviceCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  deviceCardHeader: { flexDirection: "row", alignItems: "flex-start" },
  deviceIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  deviceInfo: { flex: 1 },
  deviceNameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  deviceName: { fontSize: 16, fontWeight: "600", flexShrink: 1 },
  activePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  activePillText: { color: "#FFF", fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  deviceType: { fontSize: 12, marginTop: 3 },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 8,
  },
  statusPillText: { fontSize: 11, fontWeight: "600" },
  deviceCardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  lastSeen: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1 },
  lastSeenText: { fontSize: 12 },
  cardActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  connectBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 10,
  },
  connectBtnText: { color: "#FFF", fontSize: 13, fontWeight: "700" },
  deleteBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  // ── Dashed add card ────────────────────────────────────────────────────
  addDeviceCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1.5,
    borderStyle: "dashed",
    marginTop: 4,
  },
  addDeviceCardIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  addDeviceCardTextWrap: { flex: 1 },
  addDeviceCardTitle: { fontSize: 15, fontWeight: "700" },
  addDeviceCardSub: { fontSize: 12, marginTop: 2 },

  // ── Sensor summary ─────────────────────────────────────────────────────
  sensorSummary: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 18,
    marginBottom: 12,
  },
  sensorSummaryTitle: { fontSize: 14, fontWeight: "600", marginBottom: 12 },
  sensorGrid: { flexDirection: "row", justifyContent: "space-around" },
  sensorItem: { alignItems: "center", gap: 4 },
  sensorLabel: { fontSize: 11, fontWeight: "500" },
  sensorValue: { fontSize: 16, fontWeight: "700" },

  // ── Footer ─────────────────────────────────────────────────────────────
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 8,
  },
  footerRow: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  footerStatus: { flexDirection: "row", alignItems: "center", gap: 8 },
  footerDot: { width: 8, height: 8, borderRadius: 4 },
  footerText: { fontSize: 12, fontWeight: "500" },
  deviceIdText: { fontSize: 10, opacity: 0.6 },
  refreshButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  refreshText: { fontSize: 12, fontWeight: "500" },

  // ── Delete modal ───────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    borderRadius: 20,
    padding: 24,
    width: "100%",
    maxWidth: 400,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
  },
  modalWarningIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  modalTitle: { fontSize: 20, fontWeight: "700" },
  modalMessage: {
    fontSize: 14,
    marginBottom: 16,
    lineHeight: 21,
  },
  deviceInfoBox: {
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
  },
  deviceInfoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  deviceInfoLabel: { fontSize: 12, fontWeight: "500" },
  deviceInfoValue: { fontSize: 13, fontWeight: "600", flexShrink: 1 },
  confirmLabel: { fontSize: 14, marginBottom: 8 },
  confirmInputContainer: { marginBottom: 20 },
  confirmInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
  },
  modalButtons: { flexDirection: "row", gap: 12 },
  modalButton: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: "center",
  },
  modalCancelButton: {},
  modalDeleteButton: { backgroundColor: "#F44336" },
  modalButtonText: { fontSize: 15, fontWeight: "600" },
  modalDeleteButtonText: { color: "#FFF", fontSize: 15, fontWeight: "700" },
});