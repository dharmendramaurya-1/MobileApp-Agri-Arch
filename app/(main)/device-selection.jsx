// app/(main)/device-selection.jsx
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Modal,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../src/context/AuthContext";
import { useMqtt } from "../../src/context/MqttContext";
import { useTheme } from "../../src/context/ThemContext";
import { ConnectionStatusBanner } from "../../components/ConnectionStatusBanner";
import {
  getActiveDevice,
  getAllThings,
  setActiveDevice,
} from "../../src/services/identify/identify";

const { width, height } = Dimensions.get("window");

// ── Connection Status Component ──────────────────────────────────────────────
function ConnectionStatusIndicator({ status, theme }) {
  const getStatusConfig = () => {
    switch (status) {
      case 'online':
        return {
          icon: 'checkmark-circle',
          color: '#4CAF50',
          text: 'Online',
          bgColor: `${theme.colors.success}15`,
        };
      case 'waiting':
        // Kept for safety only — no data means Offline, never Waiting.
        return {
          icon: 'close-circle',
          color: '#F44336',
          text: 'Offline',
          bgColor: `${theme.colors.error}15`,
        };
      case 'connecting':
        return {
          icon: 'sync-outline',
          color: '#FFC107',
          text: 'Connecting...',
          bgColor: `${theme.colors.warning}15`,
        };
      case 'offline':
        return {
          icon: 'close-circle',
          color: '#F44336',
          text: 'Offline',
          bgColor: `${theme.colors.error}15`,
        };
      case 'error':
        return {
          icon: 'alert-circle',
          color: '#F44336',
          text: 'Connection Error',
          bgColor: `${theme.colors.error}15`,
        };
      default:
        return {
          icon: 'help-circle',
          color: theme.colors.textSecondary,
          text: 'Unknown',
          bgColor: 'transparent',
        };
    }
  };

  const config = getStatusConfig();

  return (
    <View style={[styles.statusContainer, { backgroundColor: config.bgColor }]}>
      {status === 'connecting' ? (
        <ActivityIndicator size="small" color={config.color} />
      ) : (
        <Ionicons name={config.icon} size={16} color={config.color} />
      )}
      <Text style={[styles.statusText, { color: config.color }]}>
        {config.text}
      </Text>
    </View>
  );
}

// ── Device Card Component ──────────────────────────────────────────────────
function DeviceCard({ 
  device, 
  isActive, 
  onSelect, 
  onConnect, 
  onDelete,
  theme, 
  connectionStatus,
  hasReceivedData,
}) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  // ✅ Get connection status from MqttContext
  const getStatus = () => {
    if (isActive) {
      if (connectionStatus === 'online' && hasReceivedData) return 'online';
      if (connectionStatus === 'connecting') return 'connecting';
      if (connectionStatus === 'error') return 'error';
      // No data (or anything else) -> Offline directly. No waiting state.
      return 'offline';
    }
    return 'disconnected';
  };

  const status = getStatus();

  const handleConnect = async () => {
    setIsConnecting(true);
    await onConnect(device);
    setIsConnecting(false);
  };

  const handleDelete = () => {
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (deleteConfirmText.toLowerCase() !== 'delete') {
      Alert.alert('Confirmation Required', 'Please type "delete" to confirm.');
      return;
    }
    setShowDeleteModal(false);
    await onDelete(device);
  };

  const getStatusColor = () => {
    switch (status) {
      case 'online': return '#4CAF50';
      case 'waiting': return '#F44336';
      case 'connecting': return '#FFC107';
      case 'offline': return '#F44336';
      case 'error': return '#F44336';
      default: return theme.colors.textSecondary;
    }
  };

  const getStatusLabel = () => {
    switch (status) {
      case 'online': return '🟢 Online';
      case 'waiting': return '🔴 Offline';
      case 'connecting': return '🟡 Connecting...';
      case 'offline': return '🔴 Offline';
      case 'error': return '🔴 Error';
      default: return '⚪ Disconnected';
    }
  };

  return (
    <>
      <TouchableOpacity
        style={[
          styles.deviceCard,
          {
            backgroundColor: theme.colors.surface,
            borderColor: isActive && status === 'online' 
              ? '#4CAF50' 
              : isActive && status === 'offline'
              ? '#F44336'
              : status === 'connecting' 
              ? '#FFC107' 
              : theme.colors.border,
            borderWidth: isActive && status === 'online' ? 2 : 1,
            opacity: status === 'connecting' ? 0.8 : 1,
          },
        ]}
        onPress={() => onSelect(device)}
        activeOpacity={0.7}
        disabled={status === 'connecting'}
      >
        <View style={styles.deviceHeader}>
          <View style={styles.deviceIconContainer}>
            <Ionicons 
              name={device.type === "device" ? "hardware-chip-outline" : "sensor-outline"} 
              size={24} 
              color={status === 'online' ? '#4CAF50' : status === 'offline' ? '#F44336' : theme.colors.textSecondary} 
            />
          </View>
          <View style={styles.deviceInfo}>
            <Text style={[styles.deviceName, { color: theme.colors.text }]}>
              {device.name || "Unnamed Device"}
            </Text>
            <Text style={[styles.deviceType, { color: theme.colors.textSecondary }]}>
              {device.type || "device"} • ID: {device.id.substring(0, 8)}...
            </Text>
          </View>
          {isActive && status === 'online' && (
            <View style={[styles.activeBadge, { backgroundColor: '#4CAF50' }]}>
              <Text style={styles.activeBadgeText}>Active</Text>
            </View>
          )}
          {(status === 'connecting' || status === 'offline') && isActive && (
            <View style={[styles.activeBadge, { backgroundColor: status === 'connecting' ? '#FFC107' : '#F44336' }]}>
              <Text style={styles.activeBadgeText}>
                {status === 'connecting' ? 'Connecting' : 'Offline'}
              </Text>
            </View>
          )}
        </View>

        {/* Connection Status Indicator */}
        <View style={styles.statusRow}>
          <ConnectionStatusIndicator status={status} theme={theme} />
          
          <View style={styles.statusDotContainer}>
            <View style={[styles.statusDot, { backgroundColor: getStatusColor() }]} />
            <Text style={[styles.statusDotLabel, { color: getStatusColor() }]}>
              {getStatusLabel()}
            </Text>
          </View>
        </View>

        <View style={styles.deviceDetails}>
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: theme.colors.textSecondary }]}>
              External Key:
            </Text>
            <Text style={[styles.detailValue, { color: theme.colors.text }]}>
              {device.external_key || "N/A"}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: theme.colors.textSecondary }]}>
              Last Seen:
            </Text>
            <Text style={[styles.detailValue, { color: theme.colors.text }]}>
              {hasReceivedData ? 'Just now' : 'Never'}
            </Text>
          </View>
        </View>

        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[
              styles.connectButton,
              {
                backgroundColor: status === 'online' 
                  ? '#4CAF50' 
                  : status === 'connecting' 
                  ? '#FFC107' 
                  : theme.colors.primary,
                opacity: status === 'connecting' || status === 'online' ? 0.7 : 1,
                flex: 1,
              },
            ]}
            onPress={handleConnect}
            disabled={status === 'connecting' || status === 'online'}
          >
            {status === 'connecting' ? (
              <View style={styles.buttonLoadingContainer}>
                <ActivityIndicator size="small" color="#FFF" />
                <Text style={styles.connectButtonText}>Connecting...</Text>
              </View>
            ) : status === 'online' ? (
              <Text style={styles.connectButtonText}>✓ Connected</Text>
            ) : (
              <Text style={styles.connectButtonText}>Connect</Text>
            )}
          </TouchableOpacity>

          {!isActive && (
            <TouchableOpacity
              style={[styles.deleteButton, { backgroundColor: '#F44336' }]}
              onPress={handleDelete}
            >
              <Ionicons name="trash-outline" size={20} color="#FFF" />
            </TouchableOpacity>
          )}
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
              <Ionicons name="warning" size={32} color="#F44336" />
              <Text style={[styles.modalTitle, { color: theme.colors.text }]}>
                ⚠️ Delete Device
              </Text>
            </View>
            
            <Text style={[styles.modalMessage, { color: theme.colors.text }]}>
              Are you sure you want to delete this device?
            </Text>
            
            <View style={styles.deviceInfoBox}>
              <Text style={[styles.deviceInfoLabel, { color: theme.colors.textSecondary }]}>
                Device Name:
              </Text>
              <Text style={[styles.deviceInfoValue, { color: theme.colors.text }]}>
                {device?.name || 'Unnamed'}
              </Text>
              <Text style={[styles.deviceInfoLabel, { color: theme.colors.textSecondary, marginTop: 4 }]}>
                Device ID:
              </Text>
              <Text style={[styles.deviceInfoValue, { color: theme.colors.text }]}>
                {device?.id || 'N/A'}
              </Text>
            </View>

            <Text style={[styles.modalWarning, { color: '#F44336' }]}>
              ⚠️ This action cannot be undone. All data associated with this device will be permanently deleted.
            </Text>

            <Text style={[styles.confirmLabel, { color: theme.colors.textSecondary }]}>
              Type <Text style={{ fontWeight: '700', color: '#F44336' }}>"delete"</Text> to confirm:
            </Text>
            
            <View style={styles.confirmInputContainer}>
              <TextInput
                style={[
                  styles.confirmInput,
                  {
                    color: theme.colors.text,
                    borderColor: deleteConfirmText.toLowerCase() === 'delete' ? '#4CAF50' : theme.colors.border,
                  }
                ]}
                placeholder="Type delete here..."
                placeholderTextColor={theme.colors.textSecondary}
                value={deleteConfirmText}
                onChangeText={setDeleteConfirmText}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancelButton]}
                onPress={() => {
                  setShowDeleteModal(false);
                  setDeleteConfirmText('');
                }}
              >
                <Text style={[styles.modalButtonText, { color: theme.colors.text }]}>
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalButton, 
                  styles.modalDeleteButton,
                  { 
                    opacity: deleteConfirmText.toLowerCase() === 'delete' ? 1 : 0.5,
                  }
                ]}
                onPress={confirmDelete}
                disabled={deleteConfirmText.toLowerCase() !== 'delete'}
              >
                <Text style={styles.modalDeleteButtonText}>
                  Delete Device
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────
export default function DeviceSelection() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { 
    reconnect, 
    forceReconnect, 
    isConnected, 
    hasReceivedData, 
    deviceStatus,
    deviceStatusFlags,
    connectionState,
    activeDeviceId,
  } = useMqtt();
  
  const { deleteThing } = useAuth();

  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeDevice, setActiveDeviceState] = useState(null);
  const [connectingDeviceId, setConnectingDeviceId] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState({});
  const [showConnectionSuccess, setShowConnectionSuccess] = useState(false);
  const [connectedDeviceName, setConnectedDeviceName] = useState('');

  // ── Load devices ──────────────────────────────────────────────────────────
  const loadDevices = async () => {
    try {
      setLoading(true);
      const allThings = await getAllThings();
      
      if (allThings && allThings.length > 0) {
        setDevices(allThings);
        
        const active = await getActiveDevice();
        if (active && active.publisherId) {
          const activeThing = allThings.find(t => t.id === active.publisherId);
          setActiveDeviceState(activeThing || allThings[0]);
        } else {
          setActiveDeviceState(allThings[0]);
          await setActiveDevice(allThings[0].id, allThings[0].external_key);
        }
      } else {
        setDevices([]);
        setActiveDeviceState(null);
      }
    } catch (error) {
      console.error("Error loading devices:", error);
      Alert.alert("Error", "Failed to load devices. Please try again.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadDevices();
  }, []);

  // ── Monitor MQTT connection status ──────────────────────────────────────
  useEffect(() => {
    if (activeDevice) {
      setConnectionStatus(prev => ({
        ...prev,
        [activeDevice.id]: connectionState
      }));
    }
  }, [connectionState, activeDevice]);

  // ── Monitor when device becomes online ──────────────────────────────────
  useEffect(() => {
    // ✅ When active device becomes online, show success popup
    if (activeDevice && connectionState === 'online' && hasReceivedData && showConnectionSuccess) {
      Alert.alert(
        "✅ Device Connected",
        `${activeDevice.name || 'Device'} is now online and ready to use!`,
        [
          {
            text: "Go to Dashboard",
            onPress: () => router.replace("/(main)/dashboard")
          },
          {
            text: "Stay Here",
            style: "cancel"
          }
        ]
      );
      setShowConnectionSuccess(false);
    }
  }, [connectionState, activeDevice, hasReceivedData, showConnectionSuccess]);

  // ── Handle device connection ─────────────────────────────────────────────
  const handleConnectDevice = async (device) => {
    try {
      setConnectingDeviceId(device.id);
      setConnectionStatus(prev => ({
        ...prev,
        [device.id]: 'connecting'
      }));
      
      await setActiveDevice(device.id, device.external_key);
      setActiveDeviceState(device);
      
      await forceReconnect(device.external_key);
      
      setConnectionStatus(prev => ({
        ...prev,
        [device.id]: connectionState || 'offline'
      }));
      
      setConnectedDeviceName(device.name || 'Device');
      
      // ✅ Show waiting alert - device is connecting
      Alert.alert(
        "🔄 Connecting",
        `Connecting to ${device.name || 'Device'}...\n\nThe device will show as Online once it starts reporting data.`,
        [
          {
            text: "OK",
            onPress: () => {
              // ✅ Set flag to show success popup when device becomes online
              setShowConnectionSuccess(true);
            }
          }
        ]
      );
      
    } catch (error) {
      console.error("Error connecting to device:", error);
      setConnectionStatus(prev => ({
        ...prev,
        [device.id]: 'error'
      }));
      Alert.alert(
        "Connection Failed",
        `Failed to connect to ${device.name}. Please try again.`
      );
      setShowConnectionSuccess(false);
    } finally {
      setConnectingDeviceId(null);
    }
  };

  // ── Handle device selection ──────────────────────────────────────────────
  const handleSelectDevice = (device) => {
    if (connectionStatus[device.id] !== 'connecting') {
      setActiveDeviceState(device);
    }
  };

  // ── Handle device deletion ──────────────────────────────────────────────
  const handleDeleteDevice = async (device) => {
    try {
      console.log(`🗑️ Attempting to delete device: ${device.id}`);
      
      const result = await deleteThing(device.id);
      
      if (result && result.success) {
        Alert.alert(
          "✅ Device Deleted",
          `${device.name || 'Device'} has been deleted successfully.`,
          [
            {
              text: "OK",
              onPress: () => {
                loadDevices();
                if (activeDevice?.id === device.id) {
                  setActiveDeviceState(null);
                }
              }
            }
          ]
        );
      } else {
        Alert.alert(
          "❌ Deletion Failed",
          `Failed to delete ${device.name || 'device'}. ${result?.error || 'Please try again.'}`
        );
      }
    } catch (error) {
      console.error("Error deleting device:", error);
      Alert.alert(
        "❌ Error",
        `An error occurred while deleting ${device.name || 'device'}. Please try again.`
      );
    }
  };

  // ── Add new device ──────────────────────────────────────────────────────
  const handleAddDevice = () => {
    router.push("/(main)/add_device");
  };

  // ── Refresh ──────────────────────────────────────────────────────────────
  const onRefresh = () => {
    setRefreshing(true);
    loadDevices();
  };

  // ── Get connection status for device ─────────────────────────────────────
  const getDeviceConnectionStatus = (deviceId) => {
    if (activeDevice?.id === deviceId) {
      return connectionState || 'offline';
    }
    return connectionStatus[deviceId] || 'disconnected';
  };

  // ── Loading State ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[styles.container, { 
        backgroundColor: theme.colors.background,
        justifyContent: 'center',
        alignItems: 'center'
      }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={{ color: theme.colors.text, marginTop: 16 }}>
          Loading devices...
        </Text>
      </View>
    );
  }

  // ── No Devices State ──────────────────────────────────────────────────────
  if (devices.length === 0) {
    return (
      <View style={[styles.container, { 
        backgroundColor: theme.colors.background,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
      }]}>
        <Ionicons name="hardware-chip-outline" size={64} color={theme.colors.textSecondary} />
        <Text style={[styles.noDevicesTitle, { color: theme.colors.text }]}>
          No Devices Found
        </Text>
        <Text style={[styles.noDevicesSubtitle, { color: theme.colors.textSecondary }]}>
          You don't have any devices connected yet. Add a new device to get started.
        </Text>
        <TouchableOpacity
          style={[styles.addDeviceButton, { backgroundColor: theme.colors.primary }]}
          onPress={handleAddDevice}
        >
          <Ionicons name="add-circle-outline" size={24} color="#FFF" />
          <Text style={styles.addDeviceButtonText}>Add New Device</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Main Render ────────────────────────────────────────────────────────────
  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
          Select Device
        </Text>
        <TouchableOpacity onPress={handleAddDevice} style={styles.addButton}>
          <Ionicons name="add" size={24} color={theme.colors.primary} />
        </TouchableOpacity>
      </View>

      <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
        {devices.length} device{devices.length > 1 ? 's' : ''} found
      </Text>

      {/* Active Device Status Banner — DevStat online/offline */}
      {activeDevice && (
        <ConnectionStatusBanner
          connectionState={connectionState}
          hasReceivedData={hasReceivedData}
          deviceStatus={deviceStatus}
          deviceStatusFlags={deviceStatusFlags}
          deviceName={activeDevice.name || "Active Device"}
        />
      )}

      <FlatList
        data={devices}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <DeviceCard
            device={item}
            isActive={activeDevice?.id === item.id}
            onSelect={handleSelectDevice}
            onConnect={handleConnectDevice}
            onDelete={handleDeleteDevice}
            theme={theme}
            connectionStatus={getDeviceConnectionStatus(item.id)}
            hasReceivedData={hasReceivedData}
          />
        )}
        contentContainerStyle={[styles.listContent, { paddingBottom: height * 0.05 }]} // ✅ 5% bottom margin
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[theme.colors.primary]}
            tintColor={theme.colors.primary}
          />
        }
        ListFooterComponent={
          <TouchableOpacity
            style={[styles.addDeviceCard, { borderColor: theme.colors.border }]}
            onPress={handleAddDevice}
          >
            <Ionicons name="add-circle-outline" size={32} color={theme.colors.primary} />
            <Text style={[styles.addDeviceCardText, { color: theme.colors.primary }]}>
              Add New Device
            </Text>
          </TouchableOpacity>
        }
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  backButton: { padding: 8 },
  headerTitle: { fontSize: 20, fontWeight: "700" },
  addButton: { padding: 8 },
  subtitle: {
    fontSize: 14,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  listContent: {
    paddingHorizontal: 16,
  },
  deviceCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
  },
  deviceHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  deviceIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.05)",
    marginRight: 12,
  },
  deviceInfo: { flex: 1 },
  deviceName: { fontSize: 16, fontWeight: "600" },
  deviceType: { fontSize: 12, marginTop: 2 },
  activeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  activeBadgeText: {
    color: "#FFF",
    fontSize: 10,
    fontWeight: "600",
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  statusContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "500",
  },
  statusDotContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusDotLabel: {
    fontSize: 12,
    fontWeight: "500",
  },
  deviceDetails: {
    marginBottom: 12,
    gap: 4,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  detailLabel: { fontSize: 12 },
  detailValue: { fontSize: 12, fontWeight: "500" },
  buttonRow: {
    flexDirection: "row",
    gap: 8,
  },
  connectButton: {
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  connectButtonText: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "600",
  },
  deleteButton: {
    width: 44,
    height: 44,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  buttonLoadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  noDevicesTitle: {
    fontSize: 20,
    fontWeight: "700",
    marginTop: 16,
  },
  noDevicesSubtitle: {
    fontSize: 14,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 24,
  },
  addDeviceButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  addDeviceButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
  },
  addDeviceCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: "dashed",
    gap: 8,
    marginTop: 8,
  },
  addDeviceCardText: {
    fontSize: 16,
    fontWeight: "600",
  },
  // ── Modal Styles ──────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  modalMessage: {
    fontSize: 16,
    marginBottom: 16,
    lineHeight: 22,
  },
  deviceInfoBox: {
    backgroundColor: 'rgba(0,0,0,0.05)',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  deviceInfoLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  deviceInfoValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  modalWarning: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 16,
    textAlign: 'center',
  },
  confirmLabel: {
    fontSize: 14,
    marginBottom: 8,
  },
  confirmInputContainer: {
    marginBottom: 20,
  },
  confirmInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalCancelButton: {
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  modalDeleteButton: {
    backgroundColor: '#F44336',
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  modalDeleteButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
});