// app/(main)/devices.jsx — Devices tab
// Add Device wizard + registered device list with checkbox selection
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

// ── Registered device card ───────────────────────────────────────────────────
function DeviceCard({
  device,
  isSelected,
  onSelect,
  onDelete,
  theme,
  isOnline,
  isDeviceLoading,
  isDeviceWaiting,  // ✅ NEW: Waiting state (connecting but no status yet)
  canDelete = true,
}) {
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  // ── ✅ STATUS DISPLAY - SAME AS LAYOUT ──
  // Shows NOTHING during loading/waiting, only shows Online or Offline
  const getStatusDisplay = useCallback(() => {
    // ✅ When loading (actively fetching), show nothing
    if (isDeviceLoading) {
      return null;
    }
    // ✅ When waiting (initial connection), show nothing
    if (isDeviceWaiting) {
      return null;
    }
    // ✅ When online, show Online
    if (isOnline === true) {
      return { text: 'Online', color: '#4CAF50', bg: 'rgba(76,175,80,0.12)' };
    }
    // ✅ When offline (confirmed), show Offline
    if (isOnline === false) {
      return { text: 'Offline', color: '#f44336', bg: 'rgba(244,67,54,0.10)' };
    }
    // ✅ Default: show nothing for unknown states
    return null;
  }, [isDeviceLoading, isDeviceWaiting, isOnline]);

  const statusDisplay = getStatusDisplay();

  // ── ✅ Get status dot color - hidden when loading/waiting ──
  const getStatusDotColor = useCallback(() => {
    if (isDeviceLoading || isDeviceWaiting) return 'transparent';
    if (isOnline === true) return '#4CAF50';
    return '#F44336';
  }, [isDeviceLoading, isDeviceWaiting, isOnline]);

  // ── ✅ Get status label - hidden when loading/waiting ──
  const getStatusLabel = useCallback(() => {
    if (isDeviceLoading || isDeviceWaiting) return '';
    if (isOnline === true) return 'Online';
    return 'Offline';
  }, [isDeviceLoading, isDeviceWaiting, isOnline]);

  const statusDotColor = getStatusDotColor();
  const statusLabel = getStatusLabel();

  const handleSelect = () => {
    // ✅ Only allow selection when device is online
    if (isDeviceLoading || isDeviceWaiting) {
      Alert.alert(
        "⏳ Connecting",
        `${device.name || "Device"} is still connecting. Please wait...`,
        [{ text: "OK" }]
      );
      return;
    }
    if (isOnline !== true) {
      Alert.alert(
        "⚠️ Device Offline",
        `${device.name || "Device"} is currently OFFLINE.\n\nPlease check the device connection.`,
        [{ text: "OK" }]
      );
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

  const typeLabel = device.type === "device" ? "Controller" : "Sensor";
  const keyOrId = device.external_key || device.id || "";
  const metaLine = keyOrId
    ? `${typeLabel} · ${keyOrId.length > 16 ? keyOrId.slice(0, 16) + "…" : keyOrId}`
    : `${typeLabel} · ID ${device.id?.slice(0, 8) || "—"}`;

  // ── ✅ Get card border color - neutral when loading/waiting ──
  const getCardBorderColor = useCallback(() => {
    if (isSelected) return theme.colors.primary;
    if (isDeviceLoading || isDeviceWaiting) return theme.colors.border;
    if (isOnline === true) return "#4CAF50";
    return "#F4433644";
  }, [isSelected, isDeviceLoading, isDeviceWaiting, isOnline, theme.colors.primary, theme.colors.border]);

  const cardOpacity = (isDeviceLoading || isDeviceWaiting) ? 1 : (isOnline === false ? 0.7 : 1);

  // ── ✅ Get icon color - neutral when loading/waiting ──
  const getIconColor = useCallback(() => {
    if (isDeviceLoading || isDeviceWaiting) return theme.colors.textSecondary;
    if (isOnline === true) return '#4CAF50';
    return '#F44336';
  }, [isDeviceLoading, isDeviceWaiting, isOnline, theme.colors.textSecondary]);

  // ── ✅ Get icon background - transparent when loading/waiting ──
  const getIconBg = useCallback(() => {
    if (isDeviceLoading || isDeviceWaiting) return 'transparent';
    if (isOnline === true) return 'rgba(76,175,80,0.12)';
    return 'rgba(244,67,54,0.10)';
  }, [isDeviceLoading, isDeviceWaiting, isOnline]);

  const iconColor = getIconColor();
  const iconBg = getIconBg();

  return (
    <>
      <TouchableOpacity
        style={[
          styles.deviceCard,
          isSelected && styles.deviceCardSelected,
          {
            backgroundColor: theme.colors.surface,
            borderColor: getCardBorderColor(),
            borderLeftColor: isSelected
              ? theme.colors.primary
              : (isDeviceLoading || isDeviceWaiting)
              ? theme.colors.border
              : isOnline === true
              ? "#4CAF50"
              : theme.colors.border,
            opacity: cardOpacity,
          },
        ]}
        activeOpacity={0.85}
        onPress={handleSelect}
      >
        <View style={styles.cardBody}>
          {/* Checkbox */}
          <TouchableOpacity
            style={[
              styles.checkbox,
              {
                borderColor: isSelected ? theme.colors.primary : theme.colors.border,
                backgroundColor: isSelected ? theme.colors.primary : "transparent",
              },
            ]}
            onPress={handleSelect}
            activeOpacity={0.7}
          >
            {isSelected && (
              <Ionicons name="checkmark" size={16} color="#FFF" />
            )}
          </TouchableOpacity>

          {/* Device Icon */}
          <View
            style={[
              styles.iconChip,
              {
                backgroundColor: iconBg,
                borderColor: (isDeviceLoading || isDeviceWaiting) ? theme.colors.border : (isOnline === true ? '#4CAF5033' : '#F4433633'),
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
              color={iconColor}
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
            </View>
            <Text
              style={[styles.metaLine, { color: theme.colors.textSecondary }]}
              numberOfLines={1}
            >
              {metaLine}
            </Text>
          </View>

          {/* ✅ Status Badge - Show NOTHING when loading/waiting (SAME AS LAYOUT) */}
          {statusDisplay && (
            <View style={[styles.statusBadge, { backgroundColor: statusDisplay.bg }]}>
              <View style={[styles.statusDot, { backgroundColor: statusDotColor }]} />
              <Text style={[styles.statusBadgeText, { color: statusDisplay.color }]}>
                {statusDisplay.text}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.cardFooter}>
          <TouchableOpacity
            style={[styles.deleteBtn, { borderColor: canDelete ? theme.colors.border : theme.colors.border + "30", opacity: canDelete ? 1 : 0.4 }]}
            onPress={() => canDelete && setShowDeleteModal(true)}
            activeOpacity={0.7}
            disabled={!canDelete}
            accessibilityRole="button"
            accessibilityLabel={`Delete ${device.name || "device"}`}
          >
            <Ionicons name="trash-outline" size={14} color="#F44336" />
            <Text style={[styles.deleteBtnText, { color: "#F44336" }]}>Delete</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>

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
    // ✅ Direct context access - SAME AS LAYOUT
    deviceOnlineStatus,
    deviceInitialLoadComplete,
    deviceInitialLoadStatus,
    connectionState,
    quickStatusCheck,
    checkSingleDeviceStatus,
    selectDevice,
    selectedDeviceId,
    selectedExternalKey,
    clearSelectedDevice,
    isConnected,
  } = useMqtt();

  const { deleteThing } = useAuth();

  const [registeredDevices, setRegisteredDevices] = useState([]);
  const [loadingDevices, setLoadingDevices] = useState(true);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [showAddWizard, setShowAddWizard] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const isDeletingRef = useRef(false);

  // ── ✅ STABLE STATUS DERIVATION (SAME AS LAYOUT) ──
  const deviceStatusMap = useMemo(() => {
    const map = {};
    registeredDevices.forEach((device) => {
      const key = device?.external_key || device?.id;
      if (!key) {
        map[device.id] = { isOnline: false, isLoading: false, isWaiting: false };
        return;
      }
      
      // ✅ Directly read from context - same as Layout
      const isOnline = deviceOnlineStatus[key] === true;
      const isLoadComplete = deviceInitialLoadComplete[key] === true;
      const isLoading = !isLoadComplete && deviceInitialLoadStatus[key] === true;
      
      // ✅ Waiting state - same as Layout
      const isWaiting = (!isLoadComplete && !isLoading) ||
        connectionState === "connecting" ||
        connectionState === "waiting" ||
        connectionState === "idle";
      
      map[device.id] = { isOnline, isLoading, isWaiting };
    });
    return map;
  }, [registeredDevices, deviceOnlineStatus, deviceInitialLoadComplete, deviceInitialLoadStatus, connectionState]);

  // ── ✅ Helper: Get device status from the map ──
  const getDeviceStatus = useCallback((device) => {
    return deviceStatusMap[device.id] || { isOnline: false, isLoading: false, isWaiting: false };
  }, [deviceStatusMap]);

  // ── Load registered devices ──
  const loadDevices = async () => {
    try {
      const allThings = await getAllThings();

      if (allThings && allThings.length > 0) {
        setRegisteredDevices(allThings);

        // Restore selected device from context
        if (selectedExternalKey) {
          const thing = allThings.find((t) => t.external_key === selectedExternalKey);
          if (thing) {
            setSelectedDevice(thing);
          }
        } else if (selectedDeviceId) {
          const thing = allThings.find((t) => t.id === selectedDeviceId);
          if (thing) {
            setSelectedDevice(thing);
          }
        } else {
          const active = await getActiveDevice();
          if (active && active.publisherId) {
            const thing = allThings.find((t) => t.id === active.publisherId);
            if (thing) {
              setSelectedDevice(thing);
              await selectDevice(thing.id, thing.name);
            }
          }
        }

        setTimeout(() => {
          quickStatusCheck();
        }, 1500);
      } else {
        setRegisteredDevices([]);
        setSelectedDevice(null);
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

  // ── ✅ Auto-switch: when selected device goes offline, pick next online device ──
  useEffect(() => {
    if (!selectedDevice || !registeredDevices.length || isDeletingRef.current) return;

    const key = selectedDevice.external_key || selectedDevice.id;
    if (!key) return;

    const isOnline = deviceOnlineStatus[key] === true;
    const isLoadComplete = deviceInitialLoadComplete[key] === true;
    const isLoading = !isLoadComplete && deviceInitialLoadStatus[key] === true;

    if (!isOnline && !isLoading) {
      const nextOnline = registeredDevices.find((d) => {
        if (d.id === selectedDevice.id) return false;
        const dKey = d.external_key || d.id;
        return deviceOnlineStatus[dKey] === true;
      });

      if (nextOnline) {
        console.log(`🔄 Selected device went offline, switching to ${nextOnline.name || nextOnline.external_key}`);
        selectDevice(nextOnline.id, nextOnline.name)
          .then(() => setSelectedDevice(nextOnline))
          .catch((err) => console.error("Auto-switch failed:", err));
      } else {
        console.log("⚠️ No online devices available, clearing selection");
        setSelectedDevice(null);
      }
    }
  }, [deviceOnlineStatus, deviceInitialLoadComplete, deviceInitialLoadStatus]);

  // ── Handle device selection ──
  const handleSelectDevice = async (device) => {
    if (selectedDevice?.id === device.id) return;

    const key = device.external_key || device.id;
    if (!key) return;

    const isOnline = deviceOnlineStatus[key] === true;
    const isLoadComplete = deviceInitialLoadComplete[key] === true;
    const isLoading = !isLoadComplete && deviceInitialLoadStatus[key] === true;

    if (isLoading) {
      Alert.alert(
        "⏳ Connecting",
        `${device.name || "Device"} is still connecting. Please wait...`,
        [{ text: "OK" }]
      );
      return;
    }

    if (isOnline !== true) {
      Alert.alert(
        "⚠️ Device Offline",
        `${device.name || "Device"} is currently OFFLINE.\n\nPlease check the device connection.`,
        [{ text: "OK" }]
      );
      return;
    }

    try {
      await selectDevice(device.id, device.name);
      setSelectedDevice(device);
    } catch (error) {
      console.error("Error selecting device:", error);
      Alert.alert("Error", `Failed to select ${device.name}. Please try again.`);
    }
  };

  // ── Delete a registered device ──
  const handleDeleteDevice = async (device) => {
    try {
      isDeletingRef.current = true;
      const result = await deleteThing(device.id);

      if (result && result.success) {
        const remaining = registeredDevices.filter((d) => d.id !== device.id);
        setRegisteredDevices(remaining);

        if (remaining.length === 0) {
          setSelectedDevice(null);
          await clearSelectedDevice();
        } else if (selectedDevice?.id === device.id) {
          const nextOnline = remaining.find((d) => {
            const key = d.external_key || d.id;
            return deviceOnlineStatus[key] === true;
          });

          if (nextOnline) {
            await selectDevice(nextOnline.id, nextOnline.name);
            setSelectedDevice(nextOnline);
          } else {
            setSelectedDevice(null);
          }
        }

        isDeletingRef.current = false;
        Alert.alert(
          "✅ Device Deleted",
          `${device.name || "Device"} has been deleted successfully.`,
          [{ text: "OK" }]
        );
      } else {
        isDeletingRef.current = false;
        Alert.alert(
          "❌ Deletion Failed",
          `Failed to delete ${device.name || "device"}. ${result?.error || "Please try again."}`
        );
      }
    } catch (error) {
      console.error("Error deleting device:", error);
      isDeletingRef.current = false;
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
      const isOnline = await checkSingleDeviceStatus(device.externalKey);

      if (isOnline === true) {
        try {
          await selectDevice(device.id, device.name);
          setSelectedDevice(device);
        } catch (error) {
          console.error("Auto-connect to new device failed:", error);
        }
      }
    }
  };

  // ── Refresh ──
  const onRefresh = async () => {
    setRefreshing(true);
    await loadDevices();

    setTimeout(() => {
      quickStatusCheck();
    }, 1500);
  };

  const openAddWizard = () => setShowAddWizard(true);

  const primary = theme.colors.primary;
  const primaryDark = theme.colors.primaryDark;

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
            <View>
              <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>
                No Devices Connected
              </Text>
              <Text style={[styles.emptySubtitle, { color: theme.colors.textSecondary }]}>
                Add your first AgriArch sensor device to start monitoring your farm in real time.
              </Text>
            </View>
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
                <View>
                  <Text style={styles.emptyButtonText}>Add Your First Device</Text>
                </View>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionHeaderLeft}>
                <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
                  My Devices
                </Text>
                <View style={[styles.countBadge, { backgroundColor: `${primary}1A` }]}>
                  <Text style={[styles.countBadgeText, { color: primary }]}>
                    {registeredDevices.length}
                  </Text>
                </View>
              </View>
              {selectedDevice && (
                <View style={[styles.selectionInfo, { backgroundColor: `${primary}12` }]}>
                  <Ionicons name="checkmark-circle" size={14} color={primary} />
                  <Text style={[styles.selectionInfoText, { color: primary }]}>Selected</Text>
                </View>
              )}
            </View>

            {registeredDevices.map((item) => {
              const isSelected = selectedDevice?.id === item.id;
              const status = getDeviceStatus(item);
              const isOnline = status.isOnline;
              const isDeviceLoading = status.isLoading;
              const isDeviceWaiting = status.isWaiting;

              return (
                <DeviceCard
                  key={item.id}
                  device={item}
                  isSelected={isSelected}
                  onSelect={handleSelectDevice}
                  onDelete={handleDeleteDevice}
                  theme={theme}
                  isOnline={isOnline}
                  isDeviceLoading={isDeviceLoading}
                  isDeviceWaiting={isDeviceWaiting}
                  canDelete={registeredDevices.length > 1 || !isSelected}
                />
              );
            })}
          </>
        )}
      </ScrollView>

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
  sectionHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
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
  selectionInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  selectionInfoText: { fontSize: 12, fontWeight: "600" },

  deviceCard: {
    borderRadius: 16,
    padding: 14,
    paddingLeft: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderLeftWidth: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  deviceCardSelected: {
    shadowColor: "#2196F3",
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 4,
  },
  cardBody: {
    flexDirection: "row",
    alignItems: "center",
  },

  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  iconChip: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },

  cardInfo: { flex: 1 },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  deviceName: { fontSize: 15, fontWeight: "700", flexShrink: 1 },
  metaLine: {
    fontSize: 11,
    marginTop: 2,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }),
  },

  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 6,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusBadgeText: { fontSize: 10, fontWeight: "700" },

  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.05)",
  },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  deleteBtnText: { fontSize: 11, fontWeight: "600" },

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