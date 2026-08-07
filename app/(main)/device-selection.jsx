// app/(main)/device-selection.jsx
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    FlatList,
    RefreshControl,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMqtt } from "../../src/context/MqttContext";
import { useTheme } from "../../src/context/ThemContext";
import {
    getActiveDevice,
    getAllThings,
    setActiveDevice,
} from "../../src/services/identify/identify";

const { width } = Dimensions.get("window");

// ── Connection Status Component ──────────────────────────────────────────────
function ConnectionStatusIndicator({ status, deviceId, theme }) {
  const getStatusConfig = () => {
    switch (status) {
      case 'connected':
        return {
          icon: 'checkmark-circle',
          color: '#4CAF50',
          text: 'Connected',
          bgColor: `${theme.colors.success}15`,
        };
      case 'connecting':
        return {
          icon: 'sync-outline',
          color: '#FF9800',
          text: 'Connecting...',
          bgColor: `${theme.colors.warning}15`,
        };
      case 'disconnected':
        return {
          icon: 'close-circle',
          color: '#F44336',
          text: 'Disconnected',
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

// ── Circular Progress for Device Connection ──────────────────────────────────
function ConnectionProgress({ progress, size = 50, color = "#4CAF50" }) {
  const circumference = 2 * Math.PI * (size / 2 - 4);
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <View style={[styles.progressContainer, { width: size, height: size }]}>
      <View style={[styles.progressBg, { width: size, height: size, borderRadius: size / 2 }]} />
      <View
        style={[
          styles.progressFill,
          {
            width: size - 8,
            height: size - 8,
            borderRadius: (size - 8) / 2,
            borderWidth: 4,
            borderColor: color,
          },
        ]}
      />
      <Text style={[styles.progressText, { fontSize: size / 4, color }]}>
        {Math.round(progress)}%
      </Text>
    </View>
  );
}

// ── Device Card Component ──────────────────────────────────────────────────
function DeviceCard({ device, isActive, onSelect, onConnect, theme, connectionStatus, connectionProgress }) {
  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnect = async () => {
    setIsConnecting(true);
    await onConnect(device);
    setIsConnecting(false);
  };

  const getStatus = () => {
    if (isActive && connectionStatus === 'connected') return 'connected';
    if (isConnecting || connectionStatus === 'connecting') return 'connecting';
    if (isActive && connectionStatus === 'error') return 'error';
    if (isActive) return 'connected';
    return 'disconnected';
  };

  const status = getStatus();

  return (
    <TouchableOpacity
      style={[
        styles.deviceCard,
        {
          backgroundColor: theme.colors.surface,
          borderColor: isActive && status === 'connected' 
            ? theme.colors.primary 
            : status === 'connecting' 
            ? '#FF9800' 
            : theme.colors.border,
          borderWidth: isActive && status === 'connected' ? 2 : 1,
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
            color={status === 'connected' ? theme.colors.primary : theme.colors.textSecondary} 
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
        {isActive && status === 'connected' && (
          <View style={[styles.activeBadge, { backgroundColor: theme.colors.primary }]}>
            <Text style={styles.activeBadgeText}>Active</Text>
          </View>
        )}
        {status === 'connecting' && (
          <View style={[styles.activeBadge, { backgroundColor: '#FF9800' }]}>
            <Text style={styles.activeBadgeText}>Connecting</Text>
          </View>
        )}
      </View>

      {/* Connection Status Indicator */}
      <View style={styles.statusRow}>
        <ConnectionStatusIndicator status={status} deviceId={device.id} theme={theme} />
        
        {status === 'connecting' && (
          <View style={styles.progressWrapper}>
            <ConnectionProgress 
              progress={connectionProgress || 0} 
              size={40} 
              color="#FF9800" 
            />
          </View>
        )}
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
            Status:
          </Text>
          <Text style={[styles.detailValue, { 
            color: status === 'connected' ? '#4CAF50' : status === 'connecting' ? '#FF9800' : '#F44336',
            fontWeight: '600',
          }]}>
            {status === 'connected' ? '🟢 Online' : status === 'connecting' ? '🟡 Connecting...' : '🔴 Offline'}
          </Text>
        </View>
      </View>

      <TouchableOpacity
        style={[
          styles.connectButton,
          {
            backgroundColor: status === 'connected' 
              ? theme.colors.primary 
              : status === 'connecting' 
              ? '#FF9800' 
              : theme.colors.primary,
            opacity: status === 'connecting' ? 0.7 : 1,
          },
        ]}
        onPress={handleConnect}
        disabled={status === 'connecting' || status === 'connected'}
      >
        {status === 'connecting' ? (
          <View style={styles.buttonLoadingContainer}>
            <ActivityIndicator size="small" color="#FFF" />
            <Text style={styles.connectButtonText}>Connecting...</Text>
          </View>
        ) : status === 'connected' ? (
          <Text style={styles.connectButtonText}>✓ Connected</Text>
        ) : (
          <Text style={styles.connectButtonText}>Connect</Text>
        )}
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────
export default function DeviceSelection() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { reconnect, forceReconnect, isConnected, hasReceivedData, deviceStatus } = useMqtt();

  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeDevice, setActiveDeviceState] = useState(null);
  const [connectingDeviceId, setConnectingDeviceId] = useState(null);
  const [connectionProgress, setConnectionProgress] = useState(0);
  const [connectionStatus, setConnectionStatus] = useState({});

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
          // Set connection status for active device
          setConnectionStatus(prev => ({
            ...prev,
            [activeThing?.id || allThings[0].id]: isConnected ? 'connected' : 'disconnected'
          }));
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
        [activeDevice.id]: isConnected ? 'connected' : 'disconnected'
      }));
    }
  }, [isConnected, activeDevice]);

  // ── Simulate connection progress ─────────────────────────────────────────
  const simulateProgress = () => {
    setConnectionProgress(0);
    const interval = setInterval(() => {
      setConnectionProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          return 100;
        }
        return prev + Math.random() * 15;
      });
    }, 300);
    return interval;
  };

  // ── Handle device connection ─────────────────────────────────────────────
  const handleConnectDevice = async (device) => {
    try {
      setConnectingDeviceId(device.id);
      setConnectionStatus(prev => ({
        ...prev,
        [device.id]: 'connecting'
      }));
      
      const progressInterval = simulateProgress();
      
      // Save as active device
      await setActiveDevice(device.id, device.external_key);
      setActiveDeviceState(device);
      
      // Force reconnect with new external key
      await forceReconnect(device.external_key);
      
      // Complete progress
      clearInterval(progressInterval);
      setConnectionProgress(100);
      
      // Update status
      setConnectionStatus(prev => ({
        ...prev,
        [device.id]: 'connected'
      }));
      
      // Wait a moment then navigate
      setTimeout(() => {
        Alert.alert(
          "✅ Connected",
          `Successfully connected to ${device.name}`,
          [
            {
              text: "Go to Dashboard",
              onPress: () => router.replace("/(main)/dashboard")
            }
          ]
        );
      }, 500);
      
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
    } finally {
      setConnectingDeviceId(null);
      // Reset progress after a delay
      setTimeout(() => setConnectionProgress(0), 3000);
    }
  };

  // ── Handle device selection ──────────────────────────────────────────────
  const handleSelectDevice = (device) => {
    if (connectionStatus[device.id] !== 'connecting') {
      setActiveDeviceState(device);
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

      {activeDevice && connectionStatus[activeDevice.id] === 'connected' && (
        <View style={[styles.activeDeviceInfo, { backgroundColor: theme.colors.primary + '15' }]}>
          <Ionicons name="checkmark-circle" size={20} color={theme.colors.primary} />
          <Text style={[styles.activeDeviceText, { color: theme.colors.text }]}>
            ✅ Connected to: {activeDevice.name}
          </Text>
        </View>
      )}

      {activeDevice && connectionStatus[activeDevice.id] === 'connecting' && (
        <View style={[styles.activeDeviceInfo, { backgroundColor: '#FF980015' }]}>
          <ActivityIndicator size="small" color="#FF9800" />
          <Text style={[styles.activeDeviceText, { color: '#FF9800' }]}>
            ⏳ Connecting to: {activeDevice.name}...
          </Text>
        </View>
      )}

      {activeDevice && connectionStatus[activeDevice.id] === 'error' && (
        <View style={[styles.activeDeviceInfo, { backgroundColor: '#F4433615' }]}>
          <Ionicons name="alert-circle" size={20} color="#F44336" />
          <Text style={[styles.activeDeviceText, { color: '#F44336' }]}>
            ❌ Connection failed: {activeDevice.name}
          </Text>
        </View>
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
            theme={theme}
            connectionStatus={connectionStatus[item.id] || 'disconnected'}
            connectionProgress={connectionProgress}
          />
        )}
        contentContainerStyle={styles.listContent}
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
  activeDeviceInfo: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    gap: 8,
  },
  activeDeviceText: {
    fontSize: 14,
    fontWeight: "500",
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
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
  progressWrapper: {
    marginRight: 4,
  },
  progressContainer: {
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
  },
  progressBg: {
    position: "absolute",
    backgroundColor: "rgba(0,0,0,0.05)",
  },
  progressFill: {
    position: "absolute",
    borderTopColor: "transparent",
    borderRightColor: "transparent",
    transform: [{ rotate: "-45deg" }],
  },
  progressText: {
    fontWeight: "bold",
    zIndex: 1,
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
});