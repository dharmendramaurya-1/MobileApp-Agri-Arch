// app/(main)/devices.jsx — Devices tab
// Add Device wizard + registered device list (auto-connect)
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef, useState } from "react";
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
import { useScroll, useScrollReset } from "../../src/context/ScrollContext";
import { useTheme } from "../../src/context/ThemContext";
import {
  getActiveDevice,
  getAllThings
} from "../../src/services/identify/identify";

const { height } = Dimensions.get("window");

// ── Constants ──
const STATUS_CHECK_TIMEOUT = 2 * 60 * 1000; // 2 minutes

// ── Registered device card ───────────────────────────────────────────────────
function DeviceCard({
  device,
  isActive,
  isGloballySelected,
  onSelect,
  onDelete,
  theme,
  connectionStatus,
  isOnline,
  isStatusChecked,
  isSelectable,
}) {
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  // ── Determine status ──
  const getStatus = () => {
    // If we have a definitive online status from GET_STAT
    if (isStatusChecked) {
      if (isOnline === true) return "online";
      if (isOnline === false) return "offline";
    }
    
    // If globally selected but not checked yet, show checking
    if (isGloballySelected && !isStatusChecked) {
      return "checking";
    }
    
    // Fallback for other states
    if (isActive || isGloballySelected) {
      if (connectionStatus === "connecting") return "connecting";
      if (connectionStatus === "error") return "error";
      // If not checked yet, show checking
      if (!isStatusChecked) return "checking";
      return "offline";
    }
    return "disconnected";
  };

  const status = getStatus();
  const isDeviceOnline = status === "online";
  const isDeviceOffline = status === "offline";
  const isDeviceChecking = status === "checking" || status === "connecting";

  const statusConfig = {
    online: {
      color: "#4CAF50",
      bg: "rgba(76,175,80,0.12)",
      label: "Active",
      message: "✅ Device is active and ready",
    },
    offline: {
      color: "#F44336",
      bg: "rgba(244,67,54,0.10)",
      label: "Offline",
      message: "❌ Device is offline - Cannot select as Global",
    },
    checking: {
      color: "#FF9800",
      bg: "rgba(255,152,0,0.14)",
      label: "Checking…",
      message: "⏳ Checking device status... (up to 2 min)",
    },
    connecting: {
      color: "#FF9800",
      bg: "rgba(255,152,0,0.14)",
      label: "Connecting…",
      message: "⏳ Connecting to device...",
    },
    error: {
      color: "#F44336",
      bg: "rgba(244,67,54,0.10)",
      label: "Error",
      message: "❌ Connection error",
    },
    disconnected: {
      color: theme.colors.textSecondary,
      bg: `${theme.colors.textSecondary}16`,
      label: "Inactive",
      message: "🔌 Device is not active",
    },
  }[status];

  const handleSelect = () => {
    // ✅ Check if device is selectable (online and status checked)
    if (!isSelectable) {
      if (isDeviceOffline) {
        Alert.alert(
          "⚠️ Device Offline",
          `${device.name || "Device"} is currently OFFLINE.\n\nPlease check the device connection and try again.`,
          [{ text: "OK" }]
        );
      } else if (isDeviceChecking) {
        Alert.alert(
          "⏳ Checking Status",
          `Status is still being checked for ${device.name || "Device"}.\n\nPlease wait a moment and try again.`,
          [{ text: "OK" }]
        );
      } else {
        Alert.alert(
          "⚠️ Device Not Ready",
          `${device.name || "Device"} is not ready to be selected.\n\nPlease check the device connection.`,
          [{ text: "OK" }]
        );
      }
      return;
    }
    
    onSelect(device);
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

  // ── Derived card data ──
  const typeLabel = device.type === "device" ? "Controller" : "Sensor";
  const keyOrId = device.external_key || device.id || "";
  const metaLine = keyOrId
    ? `${typeLabel} · ${keyOrId.length > 16 ? keyOrId.slice(0, 16) + "…" : keyOrId}`
    : `${typeLabel} · ID ${device.id?.slice(0, 8) || "—"}`;

  const getCardBorderColor = () => {
    if (isGloballySelected && isDeviceOnline) {
      return "#4CAF50";
    }
    if (isActive) {
      return theme.colors.primary;
    }
    if (isDeviceOffline && isStatusChecked) {
      return "#F4433644";
    }
    return theme.colors.border;
  };

  // Card opacity for offline devices
  const cardOpacity = (isDeviceOffline && isStatusChecked) ? 0.7 : 1;

  return (
    <>
      <TouchableOpacity
        style={[
          styles.deviceCard,
          isGloballySelected && styles.deviceCardGloballySelected,
          isActive && styles.deviceCardActive,
          {
            backgroundColor: theme.colors.surface,
            borderColor: getCardBorderColor(),
            borderLeftColor: isGloballySelected ? "#4CAF50" : (isActive ? theme.colors.primary : theme.colors.border),
            opacity: cardOpacity,
          },
        ]}
        activeOpacity={0.85}
        onPress={handleSelect}
      >
        {/* ── Header row: icon · name · status ──────────────────────────── */}
        <View style={styles.cardHeader}>
          <View
            style={[
              styles.iconChip,
              {
                backgroundColor: statusConfig.bg,
                borderColor: `${statusConfig.color}33`,
              },
            ]}
          >
            <Ionicons
              name={
                device.type === "device"
                  ? "hardware-chip-outline"
                  : "sensor-outline"
              }
              size={20}
              color={statusConfig.color}
            />
          </View>

          <View style={styles.cardInfo}>
            <View style={styles.nameRow}>
              <Text
                style={[styles.deviceName, { color: theme.colors.text }]}
                numberOfLines={1}
              >
                {device.name || "Unnamed Device"}
              </Text>
              {isGloballySelected && (
                <View style={[styles.globalPill, { backgroundColor: "#4CAF50" }]}>
                  <Ionicons name="globe-outline" size={10} color="#FFF" />
                  <Text style={styles.globalPillText}>GLOBAL</Text>
                </View>
              )}
              {isActive && !isGloballySelected && (
                <View
                  style={[
                    styles.activePill,
                    { backgroundColor: isDeviceOnline ? "#4CAF50" : theme.colors.primary },
                  ]}
                >
                  <Text style={styles.activePillText}>ACTIVE</Text>
                </View>
              )}
              {/* ✅ Show offline badge */}
              {isDeviceOffline && isStatusChecked && (
                <View style={[styles.offlinePill, { backgroundColor: "#F44336" }]}>
                  <Ionicons name="wifi-outline" size={10} color="#FFF" />
                  <Text style={styles.offlinePillText}>OFFLINE</Text>
                </View>
              )}
            </View>
            <Text
              style={[styles.metaLine, { color: theme.colors.textSecondary }]}
              numberOfLines={1}
            >
              {metaLine}
            </Text>
          </View>

          <View style={[styles.statusPill, { backgroundColor: statusConfig.bg }]}>
            {status === "checking" || status === "connecting" ? (
              <ActivityIndicator size={9} color={statusConfig.color} />
            ) : (
              <View style={[styles.statusDot, { backgroundColor: statusConfig.color }]} />
            )}
            <Text style={[styles.statusPillText, { color: statusConfig.color }]}>
              {statusConfig.label}
            </Text>
          </View>
        </View>

        {/* ── Status message ── */}
        <View style={styles.statusMessageContainer}>
          <Text style={[styles.statusMessage, { color: theme.colors.textSecondary }]}>
            {statusConfig.message}
          </Text>
        </View>

        {/* ── Footer: delete button only ── */}
        <View style={styles.cardFooter}>
          <TouchableOpacity
            style={[styles.deleteBtn, { borderColor: theme.colors.border }]}
            onPress={() => setShowDeleteModal(true)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`Delete ${device.name || "device"}`}
          >
            <Ionicons name="trash-outline" size={16} color="#F44336" />
          </TouchableOpacity>
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
    connectionState,
    isLiveData,
    forceReconnect,
    switchToDevice,
    deviceOnlineStatus,
    requestStatusForAllDevices,
    requestDeviceStatus,
    selectDevice,
    selectedDeviceId,
    selectedDeviceName,
    selectedExternalKey,
  } = useMqtt();

  const { deleteThing } = useAuth();

  // ── Registered device state ──
  const [registeredDevices, setRegisteredDevices] = useState([]);
  const [loadingDevices, setLoadingDevices] = useState(true);
  const [activeDevice, setActiveDeviceState] = useState(null);
  const [showAddWizard, setShowAddWizard] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [statusCheckDone, setStatusCheckDone] = useState(false);
  const [statusCheckedDevices, setStatusCheckedDevices] = useState({});
  const [checkingTimeout, setCheckingTimeout] = useState(null);

  // ── Helper to get device online status ──
  const getDeviceOnlineStatus = (deviceId) => {
    // First check by UUID
    if (deviceOnlineStatus && deviceOnlineStatus[deviceId] !== undefined) {
      return deviceOnlineStatus[deviceId];
    }
    // Then check by external key
    const device = registeredDevices.find(d => d.id === deviceId);
    if (device && device.external_key && deviceOnlineStatus[device.external_key] !== undefined) {
      return deviceOnlineStatus[device.external_key];
    }
    return null;
  };

  // ── Check if device is selectable (online and status checked) ──
  const isDeviceSelectable = (deviceId) => {
    const isChecked = statusCheckedDevices[deviceId] === true;
    const isOnline = getDeviceOnlineStatus(deviceId);
    
    // Device must be checked AND online to be selectable
    return isChecked && isOnline === true;
  };

  // ── Load registered devices ──────────────────────────────────────────────
  const loadDevices = async () => {
    try {
      const allThings = await getAllThings();

      if (allThings && allThings.length > 0) {
        setRegisteredDevices(allThings);

        // Check if selected device exists and is online
        let selectedExists = false;
        let selectedExternal = null;
        
        if (selectedDeviceId) {
          const selectedThing = allThings.find((t) => t.id === selectedDeviceId);
          if (selectedThing) {
            selectedExists = true;
            selectedExternal = selectedThing.external_key;
            setActiveDeviceState(selectedThing);
          }
        }

        // If selected device doesn't exist or no device selected, auto-select first ONLINE device
        if (!selectedExists || !selectedDeviceId) {
          const active = await getActiveDevice();
          let deviceToSelect = null;
          
          if (active && active.publisherId) {
            const activeThing = allThings.find((t) => t.id === active.publisherId);
            if (activeThing) {
              deviceToSelect = activeThing;
            }
          }
          
          // If no active device found, try to find first online device
          if (!deviceToSelect) {
            // Wait a bit for status checks to complete
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // Find first device that is online
            for (const thing of allThings) {
              const isOnline = getDeviceOnlineStatus(thing.id) || getDeviceOnlineStatus(thing.external_key);
              if (isOnline === true) {
                deviceToSelect = thing;
                break;
              }
            }
            
            // If still no online device, just pick the first one
            if (!deviceToSelect && allThings.length > 0) {
              deviceToSelect = allThings[0];
            }
          }
          
          if (deviceToSelect) {
            await selectDevice(deviceToSelect.id, deviceToSelect.name);
            setActiveDeviceState(deviceToSelect);
            selectedExternal = deviceToSelect.external_key;
            setTimeout(() => {
              requestDeviceStatus(deviceToSelect.external_key);
            }, 1000);
          }
        } else {
          // Request status for the selected device
          if (selectedExternal) {
            setTimeout(() => {
              requestDeviceStatus(selectedExternal);
            }, 1000);
          }
        }

        // Auto-request status for all devices
        setTimeout(() => {
          requestStatusForAllDevices();
        }, 2000);

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

  // ── Status check timeout (2 minutes) ──
  useEffect(() => {
    if (!loadingDevices && registeredDevices.length > 0) {
      if (checkingTimeout) {
        clearTimeout(checkingTimeout);
      }

      const timeout = setTimeout(() => {
        const checked = { ...statusCheckedDevices };
        let hasNewCheck = false;
        
        registeredDevices.forEach((device) => {
          const deviceId = device.id;
          if (!checked[deviceId]) {
            checked[deviceId] = true;
            hasNewCheck = true;
          }
        });
        
        if (hasNewCheck) {
          setStatusCheckedDevices(checked);
          console.log("✅ Auto-marked devices as checked after 2 minutes timeout");
          setStatusCheckDone(true);
          
          // Try to auto-select an online device if none is selected
          if (!selectedDeviceId) {
            autoSelectOnlineDevice();
          }
        }
      }, STATUS_CHECK_TIMEOUT);

      setCheckingTimeout(timeout);
      return () => clearTimeout(timeout);
    }
  }, [loadingDevices, registeredDevices]);

  // ── Auto-select online device ──
  const autoSelectOnlineDevice = async () => {
    if (selectedDeviceId) return;
    
    for (const device of registeredDevices) {
      const isOnline = getDeviceOnlineStatus(device.id) || getDeviceOnlineStatus(device.external_key);
      if (isOnline === true) {
        console.log(`🤖 Auto-selecting online device: ${device.name}`);
        await selectDevice(device.id, device.name);
        setActiveDeviceState(device);
        return;
      }
    }
  };

  // ── Mark devices as checked when status is received ──
  useEffect(() => {
    if (deviceOnlineStatus) {
      const checked = { ...statusCheckedDevices };
      let hasNewCheck = false;
      
      for (const key of Object.keys(deviceOnlineStatus)) {
        let deviceId = key;
        const device = registeredDevices.find(d => d.external_key === key || d.id === key);
        if (device) {
          deviceId = device.id;
        }
        
        if (!checked[deviceId]) {
          checked[deviceId] = true;
          hasNewCheck = true;
        }
      }
      
      if (hasNewCheck) {
        setStatusCheckedDevices(checked);
        console.log("✅ Devices status checked via response:", Object.keys(checked));
        
        if (Object.keys(checked).length >= registeredDevices.length) {
          if (checkingTimeout) {
            clearTimeout(checkingTimeout);
            setCheckingTimeout(null);
          }
          setStatusCheckDone(true);
          
          // Auto-select online device if none selected
          if (!selectedDeviceId) {
            autoSelectOnlineDevice();
          }
        }
      }
    }
  }, [deviceOnlineStatus, registeredDevices.length]);

  // ── Select/Activate a device (GLOBAL CONTROL) ──
  const handleSelectDevice = async (device) => {
    if (selectedDeviceId === device.id) {
      return;
    }

    console.log(`🔌 Selecting device for global control: ${device.id} (${device.name})`);
    console.log(`   External key: ${device.external_key}`);
    
    // ✅ Double check - device should already be validated in the card
    // but we check again for safety
    const isOnline = getDeviceOnlineStatus(device.id);
    const isChecked = statusCheckedDevices[device.id] === true;
    
    if (!isChecked || isOnline !== true) {
      Alert.alert(
        "⚠️ Device Not Available",
        `${device.name || "Device"} is not in an active state.\n\nPlease check the device connection and try again.`,
        [{ text: "OK" }]
      );
      return;
    }
    
    try {
      await selectDevice(device.id, device.name);
      setActiveDeviceState(device);
      
      if (device.external_key) {
        setTimeout(() => {
          requestDeviceStatus(device.external_key);
        }, 500);
      }
      
      // Reset status check for this device
      setStatusCheckedDevices(prev => ({
        ...prev,
        [device.id]: false
      }));
      
      Alert.alert(
        "✅ Device Selected",
        `${device.name || "Device"} is now the GLOBAL device.\n\nAll controls and data will use this device.`,
        [{ text: "OK" }]
      );
    } catch (error) {
      console.error("Error selecting device:", error);
      Alert.alert("Error", `Failed to select ${device.name}. Please try again.`);
    }
  };

  // ── Delete a registered device ──
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
                if (selectedDeviceId === device.id) {
                  const remaining = registeredDevices.filter(d => d.id !== device.id);
                  if (remaining.length > 0) {
                    // Try to select an online device first
                    for (const d of remaining) {
                      const isOnline = getDeviceOnlineStatus(d.id) || getDeviceOnlineStatus(d.external_key);
                      if (isOnline === true) {
                        selectDevice(d.id, d.name);
                        setActiveDeviceState(d);
                        return;
                      }
                    }
                    // If no online device, select first one
                    selectDevice(remaining[0].id, remaining[0].name);
                    setActiveDeviceState(remaining[0]);
                  }
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

  // ── Device added from wizard ──
  const handleDeviceAdded = async (device) => {
    setShowAddWizard(false);
    await loadDevices();

    if (device?.id && device?.externalKey) {
      try {
        await selectDevice(device.id, device.name);
        setActiveDeviceState(device);
        setTimeout(() => {
          requestDeviceStatus(device.externalKey);
        }, 1000);
      } catch (error) {
        console.error("Auto-connect to new device failed:", error);
      }
    }
    setStatusCheckDone(false);
    setStatusCheckedDevices({});
  };

  // ── Refresh ──
  const onRefresh = async () => {
    setRefreshing(true);
    setStatusCheckDone(false);
    setStatusCheckedDevices({});
    
    if (checkingTimeout) {
      clearTimeout(checkingTimeout);
      setCheckingTimeout(null);
    }
    
    await loadDevices();
    
    setTimeout(() => {
      requestStatusForAllDevices();
    }, 2000);
  };

  // ── Get device connection status ──
  const getDeviceConnectionStatus = (deviceId) => {
    if (selectedDeviceId === deviceId) {
      return connectionState || "offline";
    }
    return "disconnected";
  };

  const openAddWizard = () => setShowAddWizard(true);

  const primary = theme.colors.primary;
  const primaryDark = theme.colors.primaryDark;

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

            {/* ── Active device indicator ── */}
            {selectedDeviceName && selectedExternalKey && (
              <View style={[styles.activeIndicator, { backgroundColor: `${primary}0D` }]}>
                <Ionicons name="checkmark-circle" size={16} color={primary} />
                <Text style={[styles.activeIndicatorText, { color: theme.colors.text }]}>
                  Global Device: {selectedDeviceName}
                </Text>
              </View>
            )}

            {/* ── Info: Only online devices can be selected ── */}
            <View style={[styles.infoBanner, { backgroundColor: `${theme.colors.textSecondary}0D` }]}>
              <Ionicons name="information-circle" size={16} color={theme.colors.textSecondary} />
              <Text style={[styles.infoBannerText, { color: theme.colors.textSecondary }]}>
                💡 Only devices with <Text style={{ fontWeight: "700" }}>Active</Text> status can be set as the Global device.
              </Text>
            </View>

            {registeredDevices.map((item) => {
              const isGloballySelected = selectedDeviceId === item.id;
              const isActive = activeDevice?.id === item.id;
              const isOnline = getDeviceOnlineStatus(item.id);
              const isChecked = statusCheckedDevices[item.id] === true;
              const isSelectable = isChecked && isOnline === true;
              
              return (
                <DeviceCard
                  key={item.id}
                  device={item}
                  isActive={isActive}
                  isGloballySelected={isGloballySelected}
                  onSelect={handleSelectDevice}
                  onDelete={handleDeleteDevice}
                  theme={theme}
                  connectionStatus={getDeviceConnectionStatus(item.id)}
                  isOnline={isOnline}
                  isStatusChecked={isChecked}
                  isSelectable={isSelectable}
                />
              );
            })}

            {/* ── Status check info ── */}
            {!statusCheckDone && (
              <View style={[styles.infoBanner, { backgroundColor: `${theme.colors.textSecondary}0D` }]}>
                <ActivityIndicator size="small" color={theme.colors.primary} />
                <Text style={[styles.infoBannerText, { color: theme.colors.textSecondary }]}>
                  Checking device status... This may take up to 2 minutes.
                </Text>
              </View>
            )}
          </>
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

  activeIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: 10,
    marginBottom: 12,
  },
  activeIndicatorText: {
    fontSize: 13,
    fontWeight: "600",
  },

  deviceCard: {
    borderRadius: 18,
    padding: 14,
    paddingLeft: 15,
    marginBottom: 12,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  deviceCardActive: {
    borderLeftWidth: 4,
    paddingLeft: 12,
  },
  deviceCardGloballySelected: {
    borderLeftWidth: 4,
    paddingLeft: 12,
    borderLeftColor: "#4CAF50",
    shadowColor: "#4CAF50",
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  iconChip: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  cardInfo: { flex: 1, marginRight: 8 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  deviceName: { fontSize: 16, fontWeight: "700", flexShrink: 1 },
  activePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  activePillText: { color: "#FFF", fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  globalPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  globalPillText: { color: "#FFF", fontSize: 8, fontWeight: "800", letterSpacing: 0.3 },
  offlinePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  offlinePillText: { color: "#FFF", fontSize: 8, fontWeight: "800", letterSpacing: 0.3 },
  metaLine: {
    fontSize: 11.5,
    marginTop: 3,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }),
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusPillText: { fontSize: 11, fontWeight: "700" },

  statusMessageContainer: {
    marginTop: 8,
    paddingVertical: 4,
  },
  statusMessage: {
    fontSize: 13,
    fontWeight: "500",
  },

  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    marginTop: 8,
  },
  deleteBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  infoBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 10,
    marginTop: 8,
  },
  infoBannerText: {
    fontSize: 12,
    flex: 1,
    lineHeight: 18,
  },

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