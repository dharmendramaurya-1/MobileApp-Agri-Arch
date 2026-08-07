// app/(main)/devices.jsx
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useAlerts } from "../../src/context/AlertContext";
import { useMqtt } from "../../src/context/MqttContext";
import { useSystemMode } from "../../src/context/SystemModeContext";
import { useTheme } from "../../src/context/ThemContext";
import { getDisplayStatus } from "../../src/utils/deviceStatusParser";

const { height } = Dimensions.get("window");

// ✅ Updated DEVICE_CONFIG - ONLY actuator fields from the message
const DEVICE_CONFIG = {
  water_pump: {
    displayName: "Water Pump",
    icon: "water",
    description: "Main water circulation pump",
    category: "pump",
    actuatorKey: "water_pump",
  },
  water_ILvalve: {
    displayName: "Inlet Valve",
    icon: "arrow-down-circle",
    description: "Water inlet control valve",
    category: "valve",
    actuatorKey: "water_ILvalve",
  },
  water_OLvalve: {
    displayName: "Outlet Valve",
    icon: "arrow-up-circle",
    description: "Water outlet control valve",
    category: "valve",
    actuatorKey: "water_OLvalve",
  },
  nutrient_pump: {
    displayName: "Nutrient Pump",
    icon: "leaf",
    description: "Nutrient solution pump",
    category: "pump",
    actuatorKey: "nutrient_pump",
  },
  reboot_ack: {
    displayName: "Reboot Acknowledged",
    icon: "refresh",
    description: "System reboot acknowledgment",
    category: "system",
    actuatorKey: "reboot_ack",
  },
};

// ✅ Updated DEVICE_ORDER - matching actuator message
const DEVICE_ORDER = [
  "water_pump",
  "water_ILvalve",
  "water_OLvalve",
  "nutrient_pump",
  "reboot_ack",
];

// Build the static device list (shape only, no live values yet)
function buildStaticDeviceList() {
  return DEVICE_ORDER.filter((deviceName) => deviceName in DEVICE_CONFIG).map(
    (deviceName) => {
      const config = DEVICE_CONFIG[deviceName];
      return {
        id: deviceName,
        n: deviceName,
        vb: null,
        displayName: config.displayName,
        icon: config.icon,
        description: config.description,
        category: config.category,
      };
    }
  );
}

export default function Devices() {
  const { theme } = useTheme();
  const { 
    isConnected, 
    actuatorStatus,
    setActuatorStatus,
    publishActuatorStatus,
    externalKey,
    debugMqttState,
    sensorData,
    devices: mqttDevices,
    deviceStatusFlags,
    connectionState,
  } = useMqtt();
  
  const { 
    mode, 
    modeDisplay,
    isManualMode, 
    isAutoMode, 
    toggleMode, 
    isSwitching,
    isModeLoaded,
    canPublish,
    checkBeforeActuator,
    getModeIcon,
    getModeColor,
  } = useSystemMode();
  
  const { addAlert } = useAlerts();
  
  const [refreshing, setRefreshing] = useState(false);
  const [updating, setUpdating] = useState(null);
  const [deviceToggleTimes, setDeviceToggleTimes] = useState({});
  const [expandedDevice, setExpandedDevice] = useState(null);
  
  // ✅ Seed with the static shape right away
  const [devices, setDevices] = useState(buildStaticDeviceList);

  // ✅ Get display status from 32-bit flags
  const displayStatus = getDisplayStatus(deviceStatusFlags);

  // ✅ Check if offline
  const isOffline = connectionState === 'disconnected' || connectionState === 'idle';

  useEffect(() => {
    if (mqttDevices && mqttDevices.length > 0) {
      setDevices(mqttDevices);
    } else if (actuatorStatus && Object.keys(actuatorStatus).length > 0) {
      const deviceList = DEVICE_ORDER
        .filter(deviceName => deviceName in DEVICE_CONFIG)
        .map(deviceName => {
          const config = DEVICE_CONFIG[deviceName];
          const status = actuatorStatus[config.actuatorKey];
          return {
            id: deviceName,
            n: deviceName,
            vb: status === undefined ? null : status,
            displayName: config.displayName,
            icon: config.icon,
            description: config.description,
            category: config.category,
          };
        });
      setDevices(deviceList);
    }
  }, [mqttDevices, actuatorStatus]);

  // ✅ Monitor actuator changes for alerts
  useEffect(() => {
    if (actuatorStatus) {
      // Check water pump changes
      if (actuatorStatus.water_pump !== undefined) {
        const key = 'water_pump';
        const time = new Date().toLocaleTimeString();
        setDeviceToggleTimes(prev => ({
          ...prev,
          [key]: time
        }));
      }
      // Check inlet valve changes
      if (actuatorStatus.water_ILvalve !== undefined) {
        const key = 'water_ILvalve';
        const time = new Date().toLocaleTimeString();
        setDeviceToggleTimes(prev => ({
          ...prev,
          [key]: time
        }));
      }
      // Check outlet valve changes
      if (actuatorStatus.water_OLvalve !== undefined) {
        const key = 'water_OLvalve';
        const time = new Date().toLocaleTimeString();
        setDeviceToggleTimes(prev => ({
          ...prev,
          [key]: time
        }));
      }
      // Check nutrient pump changes
      if (actuatorStatus.nutrient_pump !== undefined) {
        const key = 'nutrient_pump';
        const time = new Date().toLocaleTimeString();
        setDeviceToggleTimes(prev => ({
          ...prev,
          [key]: time
        }));
      }
    }
  }, [actuatorStatus]);

  useEffect(() => {
    if (isConnected) {
      console.log("📡 MQTT Connected, actuatorStatus:", actuatorStatus);
      debugMqttState?.();
    }
  }, [isConnected]);

  const handleToggleDevice = async (device) => {
    if (updating === device.id) return;
    if (device.vb === null) return; // still loading real status, ignore taps

    // ✅ Check mode before allowing toggle
    if (!checkBeforeActuator(device.displayName)) {
      return;
    }

    // ✅ Check if device is in reboot_ack - show appropriate message
    if (device.id === "reboot_ack") {
      Alert.alert(
        "System Reboot",
        "Are you sure you want to reboot the system?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Reboot",
            style: "destructive",
            onPress: () => {
              toggleDeviceStatus(device);
              addAlert(
                'system',
                '🔄 System Reboot Initiated',
                `System reboot acknowledged at ${new Date().toLocaleTimeString()}`,
                'warning'
              );
            },
          },
        ]
      );
      return;
    }

    toggleDeviceStatus(device);
  };

  const toggleDeviceStatus = async (device) => {
    setUpdating(device.id);
    const newStatus = !device.vb;
    const time = new Date().toLocaleTimeString();

    // Update local state immediately for UI feedback
    setDevices((prev) =>
      prev.map((d) =>
        d.id === device.id ? { ...d, vb: newStatus } : d
      )
    );

    // Update toggle time
    setDeviceToggleTimes(prev => ({
      ...prev,
      [device.id]: time
    }));

    try {
      const config = DEVICE_CONFIG[device.id];
      
      // Get the current full actuator status
      const currentStatus = actuatorStatus || {};
      
      // ✅ Create full status with ALL actuator fields
      const fullStatus = {
        water_pump: currentStatus.water_pump || false,
        water_ILvalve: currentStatus.water_ILvalve || false,
        water_OLvalve: currentStatus.water_OLvalve || false,
        nutrient_pump: currentStatus.nutrient_pump || false,
        reboot_ack: currentStatus.reboot_ack || false,
        [config.actuatorKey]: newStatus,
        lastUpdated: new Date(),
      };

      console.log(`📤 Updating ${device.displayName} to ${newStatus ? "ON" : "OFF"}`);
      console.log(`📤 Full status being published:`, fullStatus);
      
      // Publish the complete status with all values
      const success = await publishActuatorStatus(fullStatus);
      
      if (!success) {
        // Revert on failure
        setDevices((prev) =>
          prev.map((d) =>
            d.id === device.id ? { ...d, vb: !newStatus } : d
          )
        );
        Alert.alert("Error", `Failed to toggle ${device.displayName}`);
      } else {
        // Add alert for device toggle
        const deviceName = device.displayName;
        addAlert(
          'device',
          newStatus ? `✅ ${deviceName} ON` : `❌ ${deviceName} OFF`,
          `${deviceName} ${newStatus ? 'activated' : 'deactivated'} at ${time}`,
          newStatus ? 'success' : 'info'
        );
        
        // Update actuatorStatus in context with full status
        await setActuatorStatus(fullStatus);
      }
    } catch (error) {
      console.error("Toggle error:", error);
      // Revert on error
      setDevices((prev) =>
        prev.map((d) =>
          d.id === device.id ? { ...d, vb: !newStatus } : d
        )
      );
      Alert.alert("Error", `Failed to toggle ${device.displayName}`);
    } finally {
      setTimeout(() => {
        setUpdating(null);
      }, 500);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    console.log("🔄 Refreshing device status...");
    
    try {
      if (externalKey && actuatorStatus) {
        const fullStatus = {
          water_pump: actuatorStatus.water_pump || false,
          water_ILvalve: actuatorStatus.water_ILvalve || false,
          water_OLvalve: actuatorStatus.water_OLvalve || false,
          nutrient_pump: actuatorStatus.nutrient_pump || false,
          reboot_ack: actuatorStatus.reboot_ack || false,
          lastUpdated: new Date(),
        };
        await publishActuatorStatus(fullStatus);
        console.log("📤 Status refresh requested with full status");
      }
    } catch (error) {
      console.error("Refresh error:", error);
    }
    
    setTimeout(() => {
      setRefreshing(false);
    }, 1000);
  };

  const getDeviceColor = (device) => {
    if (device.vb === null) return theme.colors.textSecondary;
    if (!isManualMode || !isModeLoaded) return theme.colors.textSecondary;
    if (device.id === "reboot_ack") {
      return device.vb ? "#FF9800" : theme.colors.primary;
    }
    return device.vb ? "#4CAF50" : "#757575";
  };

  const getStatusText = (device) => {
    if (device.vb === null) return "Loading";
    if (!isManualMode || !isModeLoaded) return "Locked";
    if (device.id === "reboot_ack") {
      return device.vb ? "Restarting" : "Idle";
    }
    return device.vb ? "Active" : "Inactive";
  };

  const getDeviceIcon = (device) => {
    if (device.vb === null) return `${device.icon}-outline`;
    if (!isManualMode || !isModeLoaded) return `${device.icon}-outline`;
    if (device.id === "reboot_ack") {
      return device.vb ? "sync" : "refresh-outline";
    }
    return device.vb ? device.icon : `${device.icon}-outline`;
  };

  const groupedDevices = devices.reduce((acc, device) => {
    const category = device.category;
    if (!acc[category]) acc[category] = [];
    acc[category].push(device);
    return acc;
  }, {});

  const categoryTitles = {
    pump: "Pumps",
    valve: "Valves",
    system: "System",
  };

  // ✅ Toggle device expansion for status flags view
  const toggleExpand = (deviceId) => {
    setExpandedDevice(expandedDevice === deviceId ? null : deviceId);
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={[
        styles.scrollViewContent,
        { paddingBottom: Platform.OS === "ios" ? height * 0.1 : height * 0.08 }
      ]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={[theme.colors.primary]}
          tintColor={theme.colors.primary}
        />
      }
    >
      {/* ── Offline Banner ────────────────────────────────────────────────── */}
      {isOffline && (
        <View style={[styles.offlineBanner, { backgroundColor: '#FFEBEE' }]}>
          <Ionicons name="alert-circle" size={20} color="#F44336" />
          <Text style={styles.offlineBannerText}>
            Device Offline - Controls Disabled
          </Text>
        </View>
      )}

      {/* ── Status Flags Summary ──────────────────────────────────────────── */}
      <View style={[styles.flagsSummary, { 
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.border,
      }]}>
        <Text style={[styles.flagsTitle, { color: theme.colors.text }]}>
          🚦 System Status Flags
        </Text>
        <View style={styles.flagsGrid}>
          {[
            { key: 'tankLow', label: 'Tank Low', icon: 'water-outline' },
            { key: 'tankHigh', label: 'Tank High', icon: 'water-outline' },
            { key: 'ecHigh', label: 'EC High', icon: 'flask-outline' },
            { key: 'ecLow', label: 'EC Low', icon: 'flask-outline' },
            { key: 'phHigh', label: 'pH High', icon: 'beaker-outline' },
            { key: 'phLow', label: 'pH Low', icon: 'beaker-outline' },
            { key: 'luxLow', label: 'Lux Low', icon: 'sunny-outline' },
            { key: 'luxHigh', label: 'Lux High', icon: 'sunny-outline' },
            { key: 'co2High', label: 'CO₂ High', icon: 'leaf-outline' },
            { key: 'co2Low', label: 'CO₂ Low', icon: 'leaf-outline' },
            { key: 'mode', label: 'Mode', icon: 'settings-outline' },
            { key: 'dimmingLevel', label: 'Dimming', icon: 'contrast-outline' },
          ].map(item => {
            const value = displayStatus[item.key];
            const isOn = value === 'YES' || value === 'ON' || value === 'OPEN' || value === 'AUTO';
            const isOff = value === 'NO' || value === 'OFF' || value === 'CLOSED' || value === 'MANUAL';
            const color = value === '_ _' ? '#999' : isOn ? '#4CAF50' : isOff ? '#F44336' : '#FF9800';
            
            return (
              <View key={item.key} style={styles.flagItem}>
                <Ionicons name={item.icon} size={14} color={color} />
                <Text style={[styles.flagLabel, { color: theme.colors.textSecondary }]}>
                  {item.label}
                </Text>
                <Text style={[styles.flagValue, { color }]}>
                  {value}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* ── Mode Control Header ───────────────────────────────────────────── */}
      <View style={styles.modeHeader}>
        <TouchableOpacity
          style={[
            styles.modeButton,
            { 
              backgroundColor: !isModeLoaded 
                ? '#888' 
                : isManualMode ? '#4CAF50' : '#FF9800',
              shadowColor: !isModeLoaded 
                ? '#888' 
                : isManualMode ? '#4CAF50' : '#FF9800',
              shadowOpacity: !isModeLoaded ? 0.1 : 0.3,
              shadowRadius: 8,
              elevation: 4,
              opacity: isSwitching ? 0.7 : 1,
            }
          ]}
          onPress={toggleMode}
          activeOpacity={0.8}
          disabled={isSwitching || !isModeLoaded || isOffline}
        >
          <View style={styles.modeButtonContent}>
            {isSwitching ? (
              <>
                <ActivityIndicator size="small" color="#FFF" />
                <Text style={styles.modeButtonText}>Switching Mode...</Text>
              </>
            ) : !isModeLoaded ? (
              <>
                <Ionicons name="time-outline" size={20} color="#FFF" />
                <Text style={styles.modeButtonText}>Loading Mode...</Text>
              </>
            ) : (
              <>
                <Ionicons 
                  name={isManualMode ? "hand-left-outline" : "sync-outline"} 
                  size={20} 
                  color="#FFF" 
                />
                <Text style={styles.modeButtonText}>
                  {isManualMode ? `🔧 ${modeDisplay.toUpperCase()} MODE` : `🤖 ${modeDisplay.toUpperCase()} MODE`}
                </Text>
                <View style={styles.modeIndicator}>
                  <View style={[styles.modeDot, { backgroundColor: isManualMode ? '#4CAF50' : '#FF9800' }]} />
                  <Text style={styles.modeStatusText}>
                    {isManualMode ? "Control Enabled" : "Auto Control"}
                  </Text>
                </View>
              </>
            )}
          </View>
          {!isSwitching && isModeLoaded && (
            <Ionicons name="chevron-forward" size={20} color="#FFF" opacity={0.7} />
          )}
        </TouchableOpacity>
        
        {isModeLoaded && !isManualMode && (
          <View style={[styles.modeWarning, { backgroundColor: '#FFF3E0' }]}>
            <Ionicons name="warning-outline" size={16} color="#FF9800" />
            <Text style={[styles.modeWarningText, { color: '#E65100' }]}>
              Manual control disabled. Switch to MANUAL mode to control devices.
            </Text>
          </View>
        )}
        
        {!isModeLoaded && (
          <View style={[styles.modeWarning, { backgroundColor: '#E3F2FD' }]}>
            <Ionicons name="information-outline" size={16} color="#1976D2" />
            <Text style={[styles.modeWarningText, { color: '#0D47A1' }]}>
              Waiting for system mode from device...
            </Text>
          </View>
        )}
      </View>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, { color: theme.colors.text }]}>
            Device Control
          </Text>
          <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
            {isConnected ? "Connected" : "Disconnected"} • {devices.length} Devices
          </Text>
          {isModeLoaded && (
            <View style={styles.modeStatusRow}>
              <Text style={[styles.modeStatusLabel, { color: theme.colors.textSecondary }]}>
                Mode: 
              </Text>
              <Text style={[styles.modeStatusValue, { color: isManualMode ? '#4CAF50' : '#FF9800' }]}>
                {isManualMode ? '🔧 MANUAL' : '🤖 AUTO'}
              </Text>
            </View>
          )}
          {isOffline && (
            <Text style={[styles.offlineStatus, { color: '#F44336' }]}>
              ⚠️ Device Offline
            </Text>
          )}
        </View>
        <View style={styles.statusDot}>
          <View
            style={[
              styles.dot,
              { backgroundColor: isConnected && !isOffline ? "#4CAF50" : "#F44336" },
            ]}
          />
        </View>
      </View>

      {/* ── Device Groups ─────────────────────────────────────────────────── */}
      {Object.entries(groupedDevices).map(([category, devicesList]) => (
        <View key={category} style={styles.categorySection}>
          <Text style={[styles.categoryTitle, { color: theme.colors.text }]}>
            {categoryTitles[category] || category}
          </Text>

          {devicesList.map((device) => {
            const isStatusLoading = device.vb === null;
            const controlsDisabled =
              updating === device.id ||
              !isManualMode ||
              !isModeLoaded ||
              isStatusLoading ||
              isOffline;
            const isExpanded = expandedDevice === device.id;
            const toggleTime = deviceToggleTimes[device.id];

            return (
              <TouchableOpacity
                key={device.id}
                style={[
                  styles.deviceCard,
                  {
                    backgroundColor: theme.colors.card,
                    borderColor: !isManualMode || !isModeLoaded || isOffline
                      ? theme.colors.border 
                      : device.vb ? "#4CAF50" : theme.colors.border,
                    borderWidth: !isManualMode || !isModeLoaded || isOffline ? 1 : device.vb ? 2 : 1,
                    opacity: !isManualMode || !isModeLoaded || isOffline ? 0.6 : 1,
                  },
                ]}
                onPress={() => toggleExpand(device.id)}
                activeOpacity={0.7}
              >
                {/* ── Mode Badge ── */}
                <View style={styles.deviceModeBadge}>
                  <Text style={styles.deviceModeBadgeText}>
                    {!isModeLoaded ? '⏳' : isManualMode ? '🔧 Manual' : '🤖 Auto'}
                  </Text>
                </View>

                {/* ── Device Left ── */}
                <View style={styles.deviceLeft}>
                  <View
                    style={[
                      styles.iconContainer,
                      { 
                        backgroundColor: !isManualMode || !isModeLoaded || isOffline
                          ? `${theme.colors.textSecondary}20` 
                          : `${getDeviceColor(device)}20` 
                      },
                    ]}
                  >
                    <Ionicons
                      name={getDeviceIcon(device)}
                      size={28}
                      color={!isManualMode || !isModeLoaded || isOffline ? theme.colors.textSecondary : getDeviceColor(device)}
                    />
                  </View>
                  <View style={styles.deviceInfo}>
                    <Text style={[styles.deviceName, { color: theme.colors.text }]}>
                      {device.displayName}
                    </Text>
                    <Text
                      style={[
                        styles.deviceDescription,
                        { color: theme.colors.textSecondary },
                      ]}
                    >
                      {device.description}
                    </Text>
                    <View
                      style={[
                        styles.statusBadge,
                        {
                          backgroundColor: !isManualMode || !isModeLoaded || isOffline
                            ? "rgba(117, 117, 117, 0.15)"
                            : device.vb
                            ? "rgba(76, 175, 80, 0.15)"
                            : "rgba(117, 117, 117, 0.15)",
                        },
                      ]}
                    >
                      {isStatusLoading ? (
                        <ActivityIndicator
                          size="small"
                          color={theme.colors.textSecondary}
                          style={styles.statusLoadingSpinner}
                        />
                      ) : (
                        <View
                          style={[
                            styles.statusDotSmall,
                            { 
                              backgroundColor: !isManualMode || !isModeLoaded || isOffline
                                ? "#757575" 
                                : device.vb ? "#4CAF50" : "#757575" 
                            },
                          ]}
                        />
                      )}
                      <Text
                        style={[
                          styles.statusText,
                          {
                            color: !isManualMode || !isModeLoaded || isOffline
                              ? "#757575" 
                              : device.vb ? "#4CAF50" : "#757575",
                            fontWeight: device.vb && isManualMode && isModeLoaded ? "600" : "400",
                          },
                        ]}
                      >
                        {isOffline ? 'Offline' : getStatusText(device)}
                      </Text>
                    </View>
                    {toggleTime && isConnected && (
                      <Text style={[styles.toggleTime, { color: theme.colors.textSecondary }]}>
                        Last toggled: {toggleTime}
                      </Text>
                    )}
                  </View>
                </View>

                {/* ── Device Right ── */}
                <View style={styles.deviceRight}>
                  {isStatusLoading ? (
                    <View style={styles.switchLoadingBox}>
                      <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                    </View>
                  ) : (
                    <Switch
                      value={device.vb}
                      onValueChange={() => handleToggleDevice(device)}
                      trackColor={{
                        false: theme.colors.border,
                        true: isManualMode && isModeLoaded && !isOffline ? "#4CAF50" : theme.colors.border,
                      }}
                      thumbColor={
                        !isManualMode || !isModeLoaded || isOffline
                          ? theme.colors.textSecondary 
                          : updating === device.id
                          ? theme.colors.primary
                          : "#FFF"
                      }
                      disabled={controlsDisabled}
                    />
                  )}
                  {updating === device.id && (
                    <View style={styles.loadingIndicator}>
                      <Ionicons
                        name="sync-outline"
                        size={18}
                        color={theme.colors.primary}
                      />
                    </View>
                  )}
                </View>

                {/* ── Expand/Collapse Indicator ── */}
                <View style={styles.expandIcon}>
                  <Ionicons
                    name={isExpanded ? "chevron-up" : "chevron-down"}
                    size={20}
                    color={theme.colors.textSecondary}
                  />
                </View>

                {/* ── Expanded Status Flags ── */}
                {isExpanded && deviceStatusFlags && (
                  <View style={[styles.expandedContent, { 
                    borderTopColor: theme.colors.border,
                    marginTop: 12,
                    paddingTop: 12,
                  }]}>
                    <Text style={[styles.expandedTitle, { color: theme.colors.textSecondary }]}>
                      Related Status Flags
                    </Text>
                    <View style={styles.expandedFlags}>
                      {Object.entries(displayStatus)
                        .filter(([key]) => key !== 'rawStatus')
                        .slice(0, 8)
                        .map(([key, value]) => {
                          const isOn = value === 'YES' || value === 'ON' || value === 'OPEN' || value === 'AUTO';
                          const isOff = value === 'NO' || value === 'OFF' || value === 'CLOSED' || value === 'MANUAL';
                          const color = value === '_ _' ? '#999' : isOn ? '#4CAF50' : isOff ? '#F44336' : '#FF9800';
                          const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                          
                          return (
                            <View key={key} style={styles.expandedFlagItem}>
                              <Text style={[styles.expandedFlagLabel, { color: theme.colors.textSecondary }]}>
                                {label}
                              </Text>
                              <Text style={[styles.expandedFlagValue, { color }]}>
                                {value}
                              </Text>
                            </View>
                          );
                        })}
                    </View>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      ))}

      {/* ── Sensor Data Summary ───────────────────────────────────────────── */}
      {sensorData && Object.keys(sensorData).length > 0 && (
        <View style={[styles.sensorSummary, { 
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
        }]}>
          <Text style={[styles.sensorSummaryTitle, { color: theme.colors.text }]}>
            📊 Live Sensor Data
          </Text>
          <View style={styles.sensorGrid}>
            <View style={styles.sensorItem}>
              <Text style={[styles.sensorLabel, { color: theme.colors.textSecondary }]}>🌡️ Temp</Text>
              <Text style={[styles.sensorValue, { color: theme.colors.text }]}>
                {sensorData.ambientTemperature?.toFixed(1) || '--'}°C
              </Text>
            </View>
            <View style={styles.sensorItem}>
              <Text style={[styles.sensorLabel, { color: theme.colors.textSecondary }]}>💧 Humidity</Text>
              <Text style={[styles.sensorValue, { color: theme.colors.text }]}>
                {sensorData.ambientHumidity?.toFixed(1) || '--'}%
              </Text>
            </View>
            <View style={styles.sensorItem}>
              <Text style={[styles.sensorLabel, { color: theme.colors.textSecondary }]}>🌊 Water Level</Text>
              <Text style={[styles.sensorValue, { color: theme.colors.text }]}>
                {sensorData.waterLevel?.toFixed(0) || '--'}%
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* ── Last Updated Info ────────────────────────────────────────────── */}
      {actuatorStatus.lastUpdated && (
        <Text style={[styles.lastUpdated, { color: theme.colors.textSecondary }]}>
          Last updated: {new Date(actuatorStatus.lastUpdated).toLocaleTimeString()}
        </Text>
      )}

      {/* ── MQTT Status Footer ────────────────────────────────────────────── */}
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
            <Text
              style={[
                styles.footerText,
                { color: theme.colors.textSecondary },
              ]}
            >
              {isOffline ? 'Device Offline' : isConnected ? "MQTT Connected" : "MQTT Disconnected"}
            </Text>
          </View>
          {externalKey && (
            <Text style={[styles.deviceIdText, { color: theme.colors.textSecondary }]}>
              ID: {externalKey.slice(0, 8)}...
            </Text>
          )}
        </View>
        <TouchableOpacity onPress={onRefresh} style={styles.refreshButton}>
          <Ionicons name="refresh-outline" size={18} color={theme.colors.primary} />
          <Text style={[styles.refreshText, { color: theme.colors.primary }]}>
            Refresh
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollViewContent: {
    padding: 16,
    paddingTop: Platform.OS === "ios" ? 8 : 16,
  },
  
  // ── Offline Banner ──────────────────────────────────────────────────────
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
  },
  offlineBannerText: {
    color: '#F44336',
    fontWeight: '600',
    fontSize: 14,
  },
  offlineStatus: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },

  // ── Flags Summary ──────────────────────────────────────────────────────
  flagsSummary: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  flagsTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 10,
  },
  flagsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  flagItem: {
    width: '23%',
    alignItems: 'center',
    paddingVertical: 4,
    flexDirection: 'column',
  },
  flagLabel: {
    fontSize: 8,
    textAlign: 'center',
    marginTop: 2,
  },
  flagValue: {
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },

  // ── Mode Header ────────────────────────────────────────────────────────
  modeHeader: {
    marginBottom: 20,
  },
  modeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderRadius: 14,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  modeButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  modeButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  modeIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  modeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  modeStatusText: {
    color: "#FFF",
    fontSize: 11,
    fontWeight: "500",
  },
  modeWarning: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: 10,
    marginTop: 8,
  },
  modeWarningText: {
    fontSize: 12,
    flex: 1,
    fontWeight: "500",
  },

  // ── Header ─────────────────────────────────────────────────────────────
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: 13,
    marginTop: 4,
  },
  modeStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    gap: 6,
  },
  modeStatusLabel: {
    fontSize: 12,
    fontWeight: "500",
  },
  modeStatusValue: {
    fontSize: 12,
    fontWeight: "700",
  },
  statusDot: {
    padding: 8,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },

  // ── Category ───────────────────────────────────────────────────────────
  categorySection: {
    marginBottom: 24,
  },
  categoryTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    opacity: 0.8,
  },

  // ── Device Card ────────────────────────────────────────────────────────
  deviceCard: {
    padding: 16,
    borderRadius: 14,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
    position: 'relative',
  },
  deviceModeBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    zIndex: 10,
  },
  deviceModeBadgeText: {
    color: '#FFF',
    fontSize: 8,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  deviceLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    paddingRight: 40,
  },
  iconContainer: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 2,
  },
  deviceDescription: {
    fontSize: 12,
    marginBottom: 4,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    alignSelf: "flex-start",
  },
  statusDotSmall: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  statusLoadingSpinner: {
    marginRight: 6,
    transform: [{ scale: 0.5 }],
  },
  statusText: {
    fontSize: 11,
    letterSpacing: 0.3,
  },
  toggleTime: {
    fontSize: 9,
    marginTop: 2,
    opacity: 0.6,
  },
  deviceRight: {
    flexDirection: "row",
    alignItems: "center",
    position: 'absolute',
    right: 50,
    top: '50%',
    transform: [{ translateY: -15 }],
  },
  switchLoadingBox: {
    width: 51,
    height: 31,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingIndicator: {
    position: "absolute",
    right: -20,
  },
  expandIcon: {
    position: 'absolute',
    bottom: 8,
    right: 8,
  },

  // ── Expanded Content ──────────────────────────────────────────────────
  expandedContent: {
    borderTopWidth: 1,
    marginTop: 12,
    paddingTop: 12,
  },
  expandedTitle: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 8,
  },
  expandedFlags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  expandedFlagItem: {
    width: '30%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  expandedFlagLabel: {
    fontSize: 9,
  },
  expandedFlagValue: {
    fontSize: 9,
    fontWeight: '600',
  },

  // ── Sensor Summary ─────────────────────────────────────────────────────
  sensorSummary: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 8,
    marginBottom: 12,
  },
  sensorSummaryTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 12,
  },
  sensorGrid: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  sensorItem: {
    alignItems: "center",
    gap: 4,
  },
  sensorLabel: {
    fontSize: 11,
    fontWeight: "500",
  },
  sensorValue: {
    fontSize: 16,
    fontWeight: "700",
  },

  // ── Footer ─────────────────────────────────────────────────────────────
  lastUpdated: {
    fontSize: 12,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 12,
    opacity: 0.7,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 8,
    marginBottom: 8,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  footerStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  footerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  footerText: {
    fontSize: 12,
    fontWeight: "500",
  },
  deviceIdText: {
    fontSize: 10,
    opacity: 0.6,
  },
  refreshButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  refreshText: {
    fontSize: 12,
    fontWeight: "500",
  },
});