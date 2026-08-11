// app/(main)/devices.jsx — Devices tab
// Add Device wizard + registered device list (connect / delete)
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { useTheme } from "../../src/context/ThemContext";
import {
  getActiveDevice,
  getAllThings,
  setActiveDevice,
} from "../../src/services/identify/identify";

const { height } = Dimensions.get("window");

// ── Registered device card ───────────────────────────────────────────────────
function DeviceCard({
  device,
  isActive,
  onConnect,
  onDelete,
  theme,
  connectionStatus,
  hasReceivedData,
}) {
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  // Get connection status from MqttContext
  const getStatus = () => {
    if (isActive) {
      if (connectionStatus === "online" && hasReceivedData) return "online";
      if (connectionStatus === "connecting") return "connecting";
      if (connectionStatus === "error") return "error";
      return "offline";
    }
    return "disconnected";
  };

  const status = getStatus();

  const statusConfig = {
    online: {
      color: "#4CAF50",
      bg: "rgba(76,175,80,0.12)",
      label: "Online",
      icon: "checkmark-circle",
    },
    connecting: {
      color: "#FF9800",
      bg: "rgba(255,152,0,0.14)",
      label: "Connecting…",
      icon: "sync",
    },
    offline: {
      color: "#F44336",
      bg: "rgba(244,67,54,0.10)",
      label: "Offline",
      icon: "close-circle",
    },
    error: {
      color: "#F44336",
      bg: "rgba(244,67,54,0.10)",
      label: "Error",
      icon: "alert-circle",
    },
    disconnected: {
      color: theme.colors.textSecondary,
      bg: `${theme.colors.textSecondary}16`,
      label: "Disconnected",
      icon: "cloud-offline-outline",
    },
  }[status];

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
          },
        ]}
        activeOpacity={0.8}
      >
        <View style={styles.deviceCardHeader}>
          <View
            style={[
              styles.deviceIconContainer,
              { backgroundColor: statusConfig.bg },
            ]}
          >
            <Ionicons
              name={
                device.type === "device"
                  ? "hardware-chip-outline"
                  : "sensor-outline"
              }
              size={22}
              color={statusConfig.color}
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
                    { backgroundColor: theme.colors.primary },
                  ]}
                >
                  <Text style={styles.activePillText}>ACTIVE</Text>
                </View>
              )}
            </View>
            <Text style={[styles.deviceType, { color: theme.colors.textSecondary }]}>
              {device.type || "device"} · ID {device.id?.substring(0, 8)}…
            </Text>
            <View style={[styles.statusPill, { backgroundColor: statusConfig.bg }]}>
              {status === "connecting" ? (
                <ActivityIndicator size={10} color={statusConfig.color} />
              ) : (
                <Ionicons name={statusConfig.icon} size={12} color={statusConfig.color} />
              )}
              <Text style={[styles.statusPillText, { color: statusConfig.color }]}>
                {statusConfig.label}
              </Text>
            </View>
          </View>
        </View>

        <View style={[styles.deviceCardFooter, { borderTopColor: theme.colors.border }]}>
          <View style={styles.lastSeen}>
            <Ionicons name="time-outline" size={14} color={theme.colors.textSecondary} />
            <Text style={[styles.lastSeenText, { color: theme.colors.textSecondary }]}>
              {isActive && hasReceivedData ? "Receiving data" : "No data yet"}
            </Text>
          </View>
          <View style={styles.cardActions}>
            <TouchableOpacity
              style={[
                styles.connectBtn,
                {
                  backgroundColor: status === "online" ? "#4CAF50" : theme.colors.primary,
                  opacity: status === "online" || status === "connecting" ? 0.85 : 1,
                },
              ]}
              onPress={handleConnect}
              disabled={status === "online" || status === "connecting"}
              activeOpacity={0.85}
            >
              {status === "connecting" ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : status === "online" ? (
                <>
                  <Ionicons name="checkmark-circle" size={16} color="#FFF" />
                  <Text style={styles.connectBtnText}>Connected</Text>
                </>
              ) : (
                <>
                  <Ionicons name="flash" size={16} color="#FFF" />
                  <Text style={styles.connectBtnText}>Connect</Text>
                </>
              )}
            </TouchableOpacity>
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
  const {
    isConnected,
    externalKey,
    sensorData,
    connectionState,
    hasReceivedData,
    forceReconnect,
    switchToDevice,
  } = useMqtt();

  const { deleteThing } = useAuth();

  // ── Registered device state ──
  const [registeredDevices, setRegisteredDevices] = useState([]);
  const [loadingDevices, setLoadingDevices] = useState(true);
  const [activeDevice, setActiveDeviceState] = useState(null);
  const [deviceConnStatus, setDeviceConnStatus] = useState({});
  const [showConnectionSuccess, setShowConnectionSuccess] = useState(false);
  const [connectedDeviceName, setConnectedDeviceName] = useState("");
  const [showAddWizard, setShowAddWizard] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Check if offline
  const isOffline = connectionState === "disconnected" || connectionState === "idle";

  // ── Load registered devices ──────────────────────────────────────────────
  const loadDevices = async () => {
    try {
      const allThings = await getAllThings();

      if (allThings && allThings.length > 0) {
        setRegisteredDevices(allThings);

        const active = await getActiveDevice();
        if (active && active.publisherId) {
          const activeThing = allThings.find((t) => t.id === active.publisherId);
          setActiveDeviceState(activeThing || allThings[0]);
        } else {
          setActiveDeviceState(allThings[0]);
          await setActiveDevice(allThings[0].id, allThings[0].external_key);
        }
      } else {
        setRegisteredDevices([]);
        setActiveDeviceState(null);
      }
    } catch (error) {
      console.error("Error loading devices:", error);
      Alert.alert("Error", "Failed to load devices. Please try again.");
    } finally {
      setLoadingDevices(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadDevices();
  }, []);

  // ── Monitor MQTT connection status for active registered device ─────────
  useEffect(() => {
    if (activeDevice) {
      setDeviceConnStatus((prev) => ({
        ...prev,
        [activeDevice.id]: connectionState,
      }));
    }
  }, [connectionState, activeDevice]);

  // ── Success popup when the active device comes online ────────────────────
  useEffect(() => {
    if (
      activeDevice &&
      connectionState === "online" &&
      hasReceivedData &&
      showConnectionSuccess
    ) {
      Alert.alert(
        "✅ Device Connected",
        `${connectedDeviceName || activeDevice.name || "Device"} is now online and ready to use!`,
        [
          { text: "Go to Dashboard", onPress: () => router.replace("/(main)/dashboard") },
          { text: "Stay Here", style: "cancel" },
        ]
      );
      setShowConnectionSuccess(false);
    }
  }, [connectionState, activeDevice, hasReceivedData, showConnectionSuccess, connectedDeviceName]);

  // ── Connect a registered device ─────────────────────────────────────────
  const handleConnectDevice = async (device) => {
    try {
      setDeviceConnStatus((prev) => ({ ...prev, [device.id]: "connecting" }));

      await setActiveDevice(device.id, device.external_key);
      setActiveDeviceState(device);

      await forceReconnect(device.external_key);

      setDeviceConnStatus((prev) => ({
        ...prev,
        [device.id]: connectionState || "offline",
      }));

      setConnectedDeviceName(device.name || "Device");

      Alert.alert(
        "🔄 Connecting",
        `Connecting to ${device.name || "Device"}...\n\nThe device will show as Online once it starts reporting data.`,
        [
          {
            text: "OK",
            onPress: () => {
              setShowConnectionSuccess(true);
            },
          },
        ]
      );
    } catch (error) {
      console.error("Error connecting to device:", error);
      setDeviceConnStatus((prev) => ({ ...prev, [device.id]: "error" }));
      Alert.alert(
        "Connection Failed",
        `Failed to connect to ${device.name}. Please try again.`
      );
      setShowConnectionSuccess(false);
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
        setConnectedDeviceName(device.name || "Device");
        setShowConnectionSuccess(true);
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

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.scrollViewContent,
          { paddingBottom: Platform.OS === "ios" ? height * 0.14 : height * 0.12 },
        ]}
        showsVerticalScrollIndicator={false}
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
          <TouchableOpacity
            style={[styles.headerAddButton, { backgroundColor: primary }]}
            onPress={openAddWizard}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Add a new device"
          >
            <Ionicons name="add" size={22} color="#FFF" />
          </TouchableOpacity>
        </View>

        {/* ── Offline banner ───────────────────────────────────────────────── */}
        {isOffline && activeDevice && (
          <View style={[styles.offlineBanner, { backgroundColor: "#FFEBEE" }]}>
            <Ionicons name="alert-circle" size={20} color="#F44336" />
            <Text style={styles.offlineBannerText}>
              {activeDevice.name} is offline — live data is paused
            </Text>
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

        {/* ── Live Sensor Summary ──────────────────────────────────────────── */}
        {registeredDevices.length > 0 &&
          sensorData &&
          Object.keys(sensorData).length > 0 &&
          (sensorData.ambientTemperature != null ||
            sensorData.ambientHumidity != null ||
            sensorData.waterLevel != null) && (
            <View
              style={[
                styles.sensorSummary,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <Text style={[styles.sensorSummaryTitle, { color: theme.colors.text }]}>
                📊 Live Sensor Data
              </Text>
              <View style={styles.sensorGrid}>
                <View style={styles.sensorItem}>
                  <Text style={[styles.sensorLabel, { color: theme.colors.textSecondary }]}>
                    🌡️ Temp
                  </Text>
                  <Text style={[styles.sensorValue, { color: theme.colors.text }]}>
                    {sensorData.ambientTemperature?.toFixed(1) || "--"}°C
                  </Text>
                </View>
                <View style={styles.sensorItem}>
                  <Text style={[styles.sensorLabel, { color: theme.colors.textSecondary }]}>
                    💧 Humidity
                  </Text>
                  <Text style={[styles.sensorValue, { color: theme.colors.text }]}>
                    {sensorData.ambientHumidity?.toFixed(1) || "--"}%
                  </Text>
                </View>
                <View style={styles.sensorItem}>
                  <Text style={[styles.sensorLabel, { color: theme.colors.textSecondary }]}>
                    🌊 Water Level
                  </Text>
                  <Text style={[styles.sensorValue, { color: theme.colors.text }]}>
                    {sensorData.waterLevel?.toFixed(0) || "--"}%
                  </Text>
                </View>
              </View>
            </View>
          )}

        {/* ── MQTT Status Footer ───────────────────────────────────────────── */}
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
                    { backgroundColor: isConnected && !isOffline ? "#4CAF50" : "#F44336" },
                  ]}
                />
                <Text style={[styles.footerText, { color: theme.colors.textSecondary }]}>
                  {isOffline ? "Device Offline" : isConnected ? "MQTT Connected" : "MQTT Disconnected"}
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

      {/* ── Floating Action Button ────────────────────────────────────────── */}
      <TouchableOpacity
        style={[styles.fab, { shadowColor: primaryDark }]}
        onPress={openAddWizard}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Add a new device"
      >
        <LinearGradient
          colors={[primary, primaryDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.fabGradient}
        >
          <Ionicons name="add" size={30} color="#FFF" />
        </LinearGradient>
      </TouchableOpacity>

      {/* ── Add Device Wizard (fullscreen modal) ──────────────────────────── */}
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
  headerAddButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#1B5E20",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },

  // ── Offline banner ─────────────────────────────────────────────────────
  offlineBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
  },
  offlineBannerText: {
    color: "#F44336",
    fontWeight: "600",
    fontSize: 13,
    flex: 1,
  },

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

  // ── FAB ────────────────────────────────────────────────────────────────
  fab: {
    position: "absolute",
    right: 20,
    bottom: 24,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  fabGradient: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
  },

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
