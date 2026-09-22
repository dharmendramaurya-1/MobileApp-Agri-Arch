import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useMemo, useRef } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SENSORS } from "../../src/config/sensorConfigs";
import { useMqtt } from "../../src/context/MqttContext";
import { useScroll, useScrollReset } from "../../src/context/ScrollContext";
import { useTheme } from "../../src/context/ThemContext";

import { parseDeviceStatus } from "../../src/utils/deviceStatusParser";

const SENSOR_ALERT_MAP = {
  "ambient-temperature": {
    highFlag: "airTempHigh",
    lowFlag: "airTempLow",
    min: -10,
    max: 60,
  },
  "ambient-humidity": {
    highFlag: "humidityHigh",
    lowFlag: "humidityLow",
    min: 0,
    max: 100,
  },
  co2: {
    highFlag: "co2High",
    lowFlag: "co2Low",
    min: 0,
    max: 5000,
  },
  "light-level": {
    highFlag: "luxHigh",
    lowFlag: "luxLow",
    min: 0,
    max: 200000,
  },
  "ph-level": {
    highFlag: "phHigh",
    lowFlag: "phLow",
    min: 0,
    max: 14,
  },
  "ec-value": {
    highFlag: "ecHigh",
    lowFlag: "ecLow",
    min: 0,
    max: 8000,
  },
  "water-temperature": {
    highFlag: "waterTempHigh",
    lowFlag: "waterTempLow",
    min: -5,
    max: 50,
  },
  "water-level": {
    highFlag: "tankHigh",
    lowFlag: "tankLow",
    min: 0,
    max: 100,
  },
};

const SENSOR_ICONS = {
  "ambient-temperature": "thermometer-outline",
  "ambient-humidity": "water-outline",
  co2: "cloud-outline",
  "light-level": "sunny-outline",
  "ph-level": "flask-outline",
  "ec-value": "flash-outline",
  "water-temperature": "thermometer-outline",
  "water-level": "water-outline",
};

const SENSOR_COLORS = {
  "ambient-temperature": "#F4511E",
  "ambient-humidity": "#1976D2",
  co2: "#8E24AA",
  "light-level": "#F9A825",
  "ph-level": "#43A047",
  "ec-value": "#00838F",
  "water-temperature": "#039BE5",
  "water-level": "#2E7D32",
};

// Firmware Sensor_Fault_t exact bit contract: Bit 1 = Fault, Bit 0 = OK
const SENSOR_FAULT_BITS = {
  co2: 0x01,                   // Bit 0: co2_sensor_fault
  "water-level": 0x02,         // Bit 1: level_sensor_fault
  "light-level": 0x04,         // Bit 2: light_sensor_fault
  "ec-value": 0x08,            // Bit 3: ec_sensor_fault
  "ph-level": 0x10,            // Bit 4: ph_sensor_fault
  "water-temperature": 0x20,   // Bit 5: water_temp_fault
  "ambient-temperature": 0x40, // Bit 6: ambient_temp_fault
  "ambient-humidity": 0x80,    // Bit 7: ambient_humidity_fault
};

function getSensorHealth(sensorKey, value, flags, isDeviceOnline, isDataAvailable, faultBitmask) {
  const hasValue = value !== null && value !== undefined && value !== "" && !isNaN(Number(value));
  const numVal = hasValue ? Number(value) : null;
  const alertConfig = SENSOR_ALERT_MAP[sensorKey];

  // 1. Direct firmware Sensor_Fault_t bit check from SensFlt (Bit 1 = Fault, Bit 0 = OK)
  if (typeof faultBitmask === "number") {
    const faultBit = SENSOR_FAULT_BITS[sensorKey];
    if (faultBit !== undefined) {
      const isFault = (faultBitmask & faultBit) !== 0; // Bit 1 = Fault, Bit 0 = OK
      if (isFault) {
        return {
          status: "fault",
          label: "Fault",
          color: "#D84315",
          icon: "close",
          isOk: false,
        };
      }
    }
  }

  // 2. If no data received yet and device is not online
  if (!hasValue && !isDataAvailable && !isDeviceOnline) {
    return {
      status: "unknown",
      label: "Unknown",
      color: "#9E9E9E",
      icon: "help",
      isOk: null,
    };
  }

  // 3. If device is active/online, but reading is missing
  if (!hasValue) {
    return {
      status: "fault",
      label: "Fault",
      color: "#D84315",
      icon: "close",
      isOk: false,
    };
  }

  // 4. If firmware reported global sensor fault bit (Bit 23 of deviceStatus), check if this reading is out of physical range
  if (flags?.sensorFault) {
    if (alertConfig && (numVal < alertConfig.min || numVal > alertConfig.max)) {
      return {
        status: "fault",
        label: "Fault",
        color: "#D84315",
        icon: "close",
        isOk: false,
      };
    }
  }

  // 5. Check specific threshold alert bits for this sensor
  if (alertConfig && flags) {
    if (flags[alertConfig.highFlag]) {
      return {
        status: "alert",
        label: "High",
        color: "#E65100",
        icon: "arrow-up",
        isOk: false,
      };
    }
    if (flags[alertConfig.lowFlag]) {
      return {
        status: "alert",
        label: "Low",
        color: "#1976D2",
        icon: "arrow-down",
        isOk: false,
      };
    }
  }

  // 6. Reading is valid and no faults or alerts
  return {
    status: "ok",
    label: "OK",
    color: "#2E7D32",
    icon: "checkmark",
    isOk: true,
  };
}

export default function SensorList() {
  const { theme } = useTheme();
  const { headerHeight } = useScroll();
  const scrollRef = useRef(null);
  useScrollReset(scrollRef);
  const {
    getSelectedDeviceName,
    getSelectedDeviceSensorData,
    getSelectedDeviceOnlineStatus,
    deviceStatusFlags,
    hasReceivedData,
    isLiveData,
  } = useMqtt();

  const selectedDeviceName = getSelectedDeviceName();
  const sensorData = getSelectedDeviceSensorData();
  const isDeviceOnline = getSelectedDeviceOnlineStatus ? getSelectedDeviceOnlineStatus() : false;
  const isDataAvailable = Boolean(hasReceivedData || isLiveData || isDeviceOnline);

  const faultBitmask =
    typeof sensorData?.SensFlt === "number"
      ? sensorData.SensFlt
      : typeof sensorData?.sensorFaultStatus === "number"
      ? sensorData.sensorFaultStatus
      : typeof sensorData?.sensFlt === "number"
      ? sensorData.sensFlt
      : typeof sensorData?.sensor_fault === "number"
      ? sensorData.sensor_fault
      : typeof sensorData?.sensorFault === "number"
      ? sensorData.sensorFault
      : null;

  const flags = useMemo(() => {
    if (!deviceStatusFlags) return null;
    if (typeof deviceStatusFlags === "number") return parseDeviceStatus(deviceStatusFlags);
    return deviceStatusFlags;
  }, [deviceStatusFlags]);

  const sensors = SENSORS.filter((sensor) => sensor.key !== "device-status" && sensor.key !== "soil-moisture");

  const sensorStates = useMemo(() => sensors.map((sensor) => {
    const value = sensorData?.[sensor.dataKey];
    const health = getSensorHealth(sensor.key, value, flags, isDeviceOnline, isDataAvailable, faultBitmask);
    return {
      ...sensor,
      isOk: health.isOk,
      health,
      value,
    };
  }), [sensorData, flags, isDeviceOnline, isDataAvailable, faultBitmask, sensors]);

  const okCount = sensorStates.filter((sensor) => sensor.isOk === true).length;
  const faultCount = sensorStates.filter((sensor) => sensor.isOk === false).length;

  return (
    <ScrollView
      ref={scrollRef}
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={[styles.content, { paddingTop: headerHeight }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <TouchableOpacity
          style={[styles.backButton, { backgroundColor: theme.colors.surface }]}
          onPress={() => router.back()}
          accessibilityLabel="Back"
        >
          <Ionicons name="arrow-back" size={21} color={theme.colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          {/* <Text style={[styles.eyebrow, { color: theme.colors.primary }]}>DEVICE HEALTH</Text> */}
          <Text style={[styles.title, { color: theme.colors.text }]}>Sensor List</Text>
          <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]} numberOfLines={1}>
            {selectedDeviceName || "Selected device"}
          </Text>
        </View>
        <View style={[styles.headerIcon, { backgroundColor: `${theme.colors.primary}15` }]}>
          <Ionicons name="hardware-chip-outline" size={22} color={theme.colors.primary} />
        </View>
      </View>

      <View style={[styles.overviewCard, { backgroundColor: theme.colors.primary }]}>
        <View>
          <Text style={styles.overviewLabel}>Sensor health</Text>
          <Text style={styles.overviewValue}>{okCount}/{sensorStates.length} OK</Text>
          <Text style={styles.overviewHint}>
            {faultCount > 0 ? `${faultCount} sensor${faultCount > 1 ? "s" : ""} need attention` : "All sensors are reporting normally"}
          </Text>
        </View>
        <View style={styles.overviewRing}>
          <Ionicons name={faultCount > 0 ? "warning-outline" : "checkmark-circle-outline"} size={34} color="#FFF" />
        </View>
      </View>

      <View style={styles.sectionHeader}>
        <View>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>All sensors</Text>
          <Text style={[styles.sectionSubtitle, { color: theme.colors.textSecondary }]}>Status and latest reading</Text>
        </View>
        <Text style={[styles.sectionCount, { color: theme.colors.primary }]}>{sensorStates.length} sensors</Text>
      </View>

      <View style={styles.list}>
        {sensorStates.map((sensor) => {
          const accent = SENSOR_COLORS[sensor.key] || theme.colors.primary;
          const statusColor = sensor.health.color;
          const statusLabel = sensor.health.label;
          const statusIcon = sensor.health.icon;
          const value = sensor.value === null || sensor.value === undefined ? "--" : String(sensor.value);
          return (
            <TouchableOpacity
              key={sensor.key}
              style={[styles.sensorCard, { backgroundColor: theme.colors.surface, borderColor: `${accent}35` }]}
              onPress={() => router.push({ pathname: "/(main)/sensor/[type]", params: { type: sensor.key } })}
              activeOpacity={0.8}
            >
              <View style={[styles.sensorAccent, { backgroundColor: accent }]} />
              <View style={[styles.sensorIcon, { backgroundColor: `${accent}16` }]}>
                <Ionicons name={SENSOR_ICONS[sensor.key] || "analytics-outline"} size={23} color={accent} />
              </View>
              <View style={styles.sensorInfo}>
                <Text style={[styles.sensorName, { color: theme.colors.text }]}>{sensor.name}</Text>
                <Text style={[styles.sensorReading, { color: theme.colors.textSecondary }]}>
                  Latest: <Text style={{ color: theme.colors.text, fontWeight: "700" }}>{value} {sensor.unit || ""}</Text>
                </Text>
              </View>
              <View style={styles.sensorStatusWrap}>
                <View style={[styles.statusIcon, { backgroundColor: `${statusColor}16` }]}>
                  <Ionicons name={statusIcon} size={14} color={statusColor} />
                </View>
                <Text style={[styles.statusLabel, { color: statusColor }]}>{statusLabel}</Text>
              </View>
              <Ionicons name="chevron-forward" size={17} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 36 },
  header: { flexDirection: "row", alignItems: "center", marginBottom: 18, marginTop: 10 },
  backButton: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", elevation: 2 },
  headerCopy: { flex: 1, marginLeft: 12 },
  eyebrow: { fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  title: { fontSize: 25, fontWeight: "800", marginTop: 2 },
  subtitle: { fontSize: 12, marginTop: 2 },
  headerIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  overviewCard: { borderRadius: 18, padding: 18, flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 22 },
  overviewLabel: { color: "#DDF5E0", fontSize: 12, fontWeight: "700" },
  overviewValue: { color: "#FFF", fontSize: 28, fontWeight: "800", marginTop: 3 },
  overviewHint: { color: "#DDF5E0", fontSize: 11, marginTop: 3 },
  overviewRing: { width: 68, height: 68, borderRadius: 34, borderWidth: 2, borderColor: "#FFFFFF55", alignItems: "center", justifyContent: "center" },
  sectionHeader: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 10 },
  sectionTitle: { fontSize: 17, fontWeight: "800" },
  sectionSubtitle: { fontSize: 11, marginTop: 2 },
  sectionCount: { fontSize: 11, fontWeight: "800" },
  list: { gap: 10 },
  sensorCard: { minHeight: 76, borderRadius: 15, borderWidth: 1, flexDirection: "row", alignItems: "center", padding: 11, overflow: "hidden", elevation: 1 },
  sensorAccent: { position: "absolute", left: 0, top: 0, bottom: 0, width: 4 },
  sensorIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", marginLeft: 4, marginRight: 11 },
  sensorInfo: { flex: 1, minWidth: 0 },
  sensorName: { fontSize: 13, fontWeight: "800" },
  sensorReading: { fontSize: 10, marginTop: 5 },
  sensorStatusWrap: { alignItems: "center", marginRight: 10, minWidth: 42 },
  statusIcon: { width: 25, height: 25, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  statusLabel: { fontSize: 9, fontWeight: "800", marginTop: 3 },
});
