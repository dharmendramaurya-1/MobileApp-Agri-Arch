// app/(main)/sensor-history.jsx

import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SENSORS } from "../../src/config/sensorConfigs";
import { useHistoricalData } from "../../src/context/HistoricalDataContext";
import { useMqtt } from "../../src/context/MqttContext";
import { useScroll, useScrollReset } from "../../src/context/ScrollContext";
import { useTheme } from "../../src/context/ThemContext";

const SENSOR_THRESHOLDS = {
  "ambient-temperature": { min: 18, max: 28 },
  "ambient-humidity": { min: 40, max: 80 },
  co2: { min: 350, max: 1500 },
  "light-level": { min: 10, max: 80000 },
  "ph-level": { min: 5.5, max: 7.5 },
  "ec-value": { min: 1.0, max: 3.5 },
  "water-temperature": { min: 18, max: 26 },
  "water-level": { min: 25, max: 90 },
};

export default function SensorHistory() {
  const { theme } = useTheme();
  const safeTheme = theme || {
    colors: {
      background: "#fff",
      surface: "#fff",
      text: "#000",
      textSecondary: "#666",
      primary: "#007AFF",
      border: "#ddd",
    },
  };
  const { onScroll, headerHeight } = useScroll();
  const scrollRef = useRef(null);
  useScrollReset(scrollRef);
  const [expandedSensor, setExpandedSensor] = useState(null);

  // ✅ Get real MQTT data & device identity
  const {
    getSelectedDeviceId,
    getSelectedExternalKey,
    selectedExternalKey,
    externalKey,
    availableDevices,
    getSelectedDeviceSensorData,
    getSelectedDeviceActuatorStatus,
    deviceStatusFlags,
  } = useMqtt();
  const { fetchAllSensorData, isLoading, allData } = useHistoricalData();

  // ✅ Get real sensor data
  const liveSensorData = getSelectedDeviceSensorData();
  const deviceFlags = deviceStatusFlags || {};

  // ✅ Filter sensors (remove device-status and soil-moisture)
  const availableSensors = SENSORS.filter(
    (s) => s.key !== "device-status" && s.key !== "soil-moisture"
  );

  const getDevicePublisherAndKey = useCallback(() => {
    const selectedDevId = getSelectedDeviceId?.();
    const selectedExtKey = getSelectedExternalKey?.();
    if (selectedDevId && availableDevices && Array.isArray(availableDevices)) {
      const device = availableDevices.find((d) => d.id === selectedDevId);
      if (device) {
        return {
          publisherId: device.id,
          externalKey: device.external_key || selectedExtKey,
        };
      }
    }
    return { publisherId: selectedDevId, externalKey: selectedExtKey };
  }, [getSelectedDeviceId, getSelectedExternalKey, availableDevices]);

  // Fetch actual historical sensor data
  const fetchHistory = useCallback(async () => {
    try {
      const { publisherId } = getDevicePublisherAndKey();
      const toMs = Date.now() + 60 * 60 * 1000;
      const fromMs = Date.now() - 7 * 24 * 60 * 60 * 1000; // last 7 days
      await fetchAllSensorData(fromMs, toMs, 1000, publisherId);
    } catch (err) {
      console.error("Error fetching sensor history:", err);
    }
  }, [getDevicePublisherAndKey, fetchAllSensorData]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // ✅ Format timestamp without double-offsetting
  const formatReadingTime = (ms) => {
    if (!ms) return "--";
    const d = new Date(ms);
    let hours = d.getUTCHours();
    const minutes = String(d.getUTCMinutes()).padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12;
    hours = hours ? hours : 12;
    return `${String(hours).padStart(2, "0")}:${minutes} ${ampm}`;
  };

  const formatReadingDate = (ms) => {
    if (!ms) return "--";
    const d = new Date(ms);
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const day = String(d.getUTCDate()).padStart(2, "0");
    const month = months[d.getUTCMonth()];
    const year = d.getUTCFullYear();
    return `${day} ${month} ${year}`;
  };

  // ✅ Get status for each of the 8 sensors from deviceFlags
  const getSensorStatus = (sensorKey, numVal = null) => {
    switch (sensorKey) {
      case "ambient-temperature":
        return {
          value: numVal !== null ? numVal : liveSensorData?.ambientTemperature,
          flag: deviceFlags.airTempHigh
            ? "High"
            : deviceFlags.airTempLow
              ? "Low"
              : "Normal",
        };
      case "ambient-humidity":
        return {
          value: numVal !== null ? numVal : liveSensorData?.ambientHumidity,
          flag: deviceFlags.humidityHigh
            ? "High"
            : deviceFlags.humidityLow
              ? "Low"
              : "Normal",
        };
      case "co2":
        return {
          value: numVal !== null ? numVal : liveSensorData?.co2Level,
          flag: deviceFlags.co2High
            ? "High"
            : deviceFlags.co2Low
              ? "Low"
              : "Normal",
        };
      case "light-level":
        return {
          value: numVal !== null ? numVal : liveSensorData?.lightLevel,
          flag: deviceFlags.luxHigh
            ? "High"
            : deviceFlags.luxLow
              ? "Low"
              : "Normal",
        };
      case "ph-level":
        return {
          value: numVal !== null ? numVal : liveSensorData?.phValue,
          flag: deviceFlags.phHigh
            ? "High"
            : deviceFlags.phLow
              ? "Low"
              : "Normal",
        };
      case "ec-value":
        return {
          value: numVal !== null ? numVal : liveSensorData?.ecValue,
          flag: deviceFlags.ecHigh
            ? "High"
            : deviceFlags.ecLow
              ? "Low"
              : "Normal",
        };
      case "water-temperature":
        return {
          value: numVal !== null ? numVal : liveSensorData?.waterTemperature,
          flag: deviceFlags.waterTempHigh
            ? "High"
            : deviceFlags.waterTempLow
              ? "Low"
              : "Normal",
        };
      case "water-level":
        return {
          value: numVal !== null ? numVal : liveSensorData?.waterLevel,
          flag: deviceFlags.tankHigh
            ? "High"
            : deviceFlags.tankLow
              ? "Low"
              : "Normal",
        };
      default:
        return { value: null, flag: "Normal" };
    }
  };

  const getReadingStatus = (sensorKey, value) => {
    if (value === null || value === undefined || isNaN(Number(value)))
      return "Normal";
    const num = Number(value);
    const th = SENSOR_THRESHOLDS[sensorKey];
    if (th) {
      if (num > th.max) return "High";
      if (num < th.min) return "Low";
    }
    return "Normal";
  };

  // ✅ Get status color based on server flag
  const getStatusColor = (status) => {
    if (!status || status === "Normal") return "#4CAF50";
    if (status === "High") return "#F44336";
    if (status === "Low") return "#FF9800";
    return "#4CAF50";
  };

  // ✅ Get status icon based on server flag
  const getStatusIcon = (status) => {
    if (!status || status === "Normal") return "checkmark-circle";
    if (status === "High") return "alert-circle";
    if (status === "Low") return "warning";
    return "checkmark-circle";
  };

  // ✅ Format value with unit
  const formatValue = (value, unit) => {
    if (value === null || value === undefined) return "--";
    if (typeof value === "number") {
      return Number.isInteger(value) ? `${value}` : `${value.toFixed(1)}`;
    }
    return `${value}`;
  };

  // ✅ Get recent REAL readings from historical data or live data (no dummy rows)
  const getSensorReadings = (sensorKey) => {
    const sensor = SENSORS.find((s) => s.key === sensorKey);
    if (!sensor) return [];

    // Lookup real historical data from allData
    const rawList =
      allData?.[sensor._apiName] ||
      allData?.[sensor.dataKey] ||
      allData?.[sensor.key] ||
      [];
    const historyData = Array.isArray(rawList)
      ? rawList
      : Array.isArray(rawList?.data)
        ? rawList.data
        : [];

    const mappedHistory = historyData
      .filter((item) => item && item.value !== undefined && item.value !== null)
      .map((item) => ({
        timeMs: item.time,
        time: formatReadingTime(item.time),
        date: formatReadingDate(item.time),
        value:
          formatValue(item.value, sensor.unit) +
          (sensor.unit ? ` ${sensor.unit}` : ""),
        status: getReadingStatus(sensorKey, item.value),
        isLive: false,
      }));

    // Sort newest readings first (descending)
    mappedHistory.sort((a, b) => (b.timeMs || 0) - (a.timeMs || 0));

    // Prepend live reading if available
    const liveValue = liveSensorData?.[sensor.dataKey];
    if (liveValue !== undefined && liveValue !== null) {
      const liveStatus = getSensorStatus(sensorKey, liveValue).flag || "Normal";
      const newestHistTime = mappedHistory[0]?.timeMs || 0;
      if (mappedHistory.length === 0 || Date.now() - newestHistTime > 30000) {
        mappedHistory.unshift({
          timeMs: Date.now(),
          time: formatReadingTime(Date.now()),
          date: `${formatReadingDate(Date.now())} (Live)`,
          value:
            formatValue(liveValue, sensor.unit) +
            (sensor.unit ? ` ${sensor.unit}` : ""),
          status: liveStatus,
          isLive: true,
        });
      }
    }

    return mappedHistory.slice(0, 10);
  };

  // ✅ Build sensor data with real values
  const sensorHistoryData = availableSensors.map((sensor) => {
    const statusInfo = getSensorStatus(sensor.key);
    const readings = getSensorReadings(sensor.key);

    return {
      id: sensor.key,
      sensorName: sensor.name,
      icon: sensor.icon,
      readings,
      currentValue: statusInfo.value,
      currentStatus: statusInfo.flag || "Normal",
    };
  });

  return (
    <ScrollView
      ref={scrollRef}
      style={[styles.container, { backgroundColor: safeTheme.colors.background }]}
      contentContainerStyle={{ paddingTop: headerHeight, paddingBottom: 30 }}
      onScroll={onScroll}
      scrollEventThrottle={16}
      refreshControl={
        <RefreshControl
          refreshing={isLoading}
          onRefresh={fetchHistory}
          tintColor={safeTheme.colors.primary}
          colors={[safeTheme.colors.primary]}
        />
      }
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: safeTheme.colors.text }]}>
          Sensor History
        </Text>
        <Text style={[styles.subtitle, { color: safeTheme.colors.textSecondary }]}>
          Real-time sensor data & status
        </Text>
        {deviceFlags && Object.keys(deviceFlags).length > 0 && (
          <Text style={[styles.subtitle, { color: safeTheme.colors.textSecondary, marginTop: 4 }]}>
            Last updated: {new Date().toLocaleTimeString()}
          </Text>
        )}
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={safeTheme.colors.primary} />
          <Text style={[styles.loadingText, { color: safeTheme.colors.textSecondary }]}>
            Loading sensor data...
          </Text>
        </View>
      ) : (
        <>
          {sensorHistoryData.map((sensor) => (
            <View key={sensor.id}>
              <TouchableOpacity
                style={[
                  styles.sensorHeader,
                  {
                    backgroundColor: safeTheme.colors.surface,
                    borderColor: safeTheme.colors.border,
                    borderLeftWidth: 4,
                    borderLeftColor: getStatusColor(sensor.currentStatus),
                  },
                ]}
                onPress={() =>
                  setExpandedSensor(expandedSensor === sensor.id ? null : sensor.id)
                }
                activeOpacity={0.7}
              >
                <View
                  style={[
                    styles.iconContainer,
                    { backgroundColor: `${safeTheme.colors.primary}20` },
                  ]}
                >
                  <Ionicons
                    name={sensor.icon}
                    size={24}
                    color={safeTheme.colors.primary}
                  />
                </View>
                <View style={styles.sensorInfo}>
                  <Text style={[styles.sensorName, { color: safeTheme.colors.text }]}>
                    {sensor.sensorName}
                  </Text>
                  <View style={styles.sensorStatusRow}>
                    <Text style={[styles.sensorValue, { color: safeTheme.colors.textSecondary }]}>
                      {sensor.currentValue !== null && sensor.currentValue !== undefined 
                        ? formatValue(sensor.currentValue, '') 
                        : '--'}
                    </Text>
                    <View
                      style={[
                        styles.statusBadge,
                        { backgroundColor: getStatusColor(sensor.currentStatus) },
                      ]}
                    >
                      <Ionicons
                        name={getStatusIcon(sensor.currentStatus)}
                        size={10}
                        color="#FFF"
                      />
                      <Text style={styles.statusText}>
                        {sensor.currentStatus}
                      </Text>
                    </View>
                  </View>
                </View>
                <Ionicons
                  name={expandedSensor === sensor.id ? "chevron-up" : "chevron-down"}
                  size={20}
                  color={safeTheme.colors.textSecondary}
                />
              </TouchableOpacity>

              {expandedSensor === sensor.id && (
                <View
                  style={[
                    styles.readingsContainer,
                    { backgroundColor: safeTheme.colors.surface },
                  ]}
                >
                  {sensor.readings.length > 0 ? (
                    sensor.readings.map((reading, index) => (
                      <View
                        key={index}
                        style={[
                          styles.readingItem,
                          index !== sensor.readings.length - 1 && {
                            borderBottomColor: safeTheme.colors.border,
                            borderBottomWidth: 1,
                          },
                        ]}
                      >
                        <View style={styles.timeContainer}>
                          <Text
                            style={[styles.timeText, { color: safeTheme.colors.text }]}
                          >
                            {reading.time}
                          </Text>
                          <Text
                            style={[
                              styles.dateText,
                              { color: safeTheme.colors.textSecondary },
                            ]}
                          >
                            {reading.date}
                          </Text>
                        </View>
                        <View style={styles.valueContainer}>
                          <Text
                            style={[
                              styles.valueText,
                              { color: safeTheme.colors.primary },
                            ]}
                          >
                            {reading.value}
                          </Text>
                          <View
                            style={[
                              styles.statusBadge,
                              { backgroundColor: getStatusColor(reading.status) },
                            ]}
                          >
                            <Ionicons
                              name={getStatusIcon(reading.status)}
                              size={10}
                              color="#FFF"
                            />
                            <Text style={styles.statusText}>{reading.status}</Text>
                          </View>
                        </View>
                      </View>
                    ))
                  ) : (
                    <View style={styles.noDataContainer}>
                      <Text style={[styles.noDataText, { color: safeTheme.colors.textSecondary }]}>
                        No historical data available
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </View>
          ))}

          {/* Summary Card with Real Data */}
          <View
            style={[
              styles.summaryCard,
              {
                backgroundColor: safeTheme.colors.surface,
                borderColor: safeTheme.colors.border,
              },
            ]}
          >
            <Text style={[styles.summaryTitle, { color: safeTheme.colors.text }]}>
              Summary
            </Text>
            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />
                <Text style={[styles.summaryValue, { color: safeTheme.colors.text }]}>
                  {availableSensors.length}
                </Text>
                <Text
                  style={[
                    styles.summaryLabel,
                    { color: safeTheme.colors.textSecondary },
                  ]}
                >
                  Active Sensors
                </Text>
              </View>
              <View style={styles.summaryItem}>
                <Ionicons name="time" size={24} color={safeTheme.colors.primary} />
                <Text style={[styles.summaryValue, { color: safeTheme.colors.text }]}>
                  {deviceFlags?.online ? 'Online' : 'Offline'}
                </Text>
                <Text
                  style={[
                    styles.summaryLabel,
                    { color: safeTheme.colors.textSecondary },
                  ]}
                >
                  Device Status
                </Text>
              </View>
              <View style={styles.summaryItem}>
                <Ionicons 
                  name={deviceFlags?.online ? "wifi" : "wifi-outline"} 
                  size={24} 
                  color={deviceFlags?.online ? "#4CAF50" : "#F44336"} 
                />
                <Text style={[styles.summaryValue, { color: safeTheme.colors.text }]}>
                  {deviceFlags?.online ? 'Connected' : 'Disconnected'}
                </Text>
                <Text
                  style={[
                    styles.summaryLabel,
                    { color: safeTheme.colors.textSecondary },
                  ]}
                >
                  Connection
                </Text>
              </View>
            </View>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 20,
    paddingBottom: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 60,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },
  sensorHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginVertical: 6,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  sensorInfo: {
    flex: 1,
  },
  sensorName: {
    fontSize: 16,
    fontWeight: "600",
  },
  sensorStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  sensorValue: {
    fontSize: 13,
  },
  readingsContainer: {
    marginHorizontal: 16,
    marginTop: -6,
    marginBottom: 12,
    borderRadius: 12,
    overflow: "hidden",
  },
  readingItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
  },
  timeContainer: {
    flex: 1,
  },
  timeText: {
    fontSize: 14,
    fontWeight: "500",
  },
  dateText: {
    fontSize: 11,
    marginTop: 2,
  },
  valueContainer: {
    alignItems: "flex-end",
    gap: 4,
  },
  valueText: {
    fontSize: 16,
    fontWeight: "700",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  statusText: {
    color: "#FFF",
    fontSize: 10,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  noDataContainer: {
    padding: 20,
    alignItems: 'center',
  },
  noDataText: {
    fontSize: 14,
  },
  summaryCard: {
    margin: 16,
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 30,
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 16,
    textAlign: "center",
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  summaryItem: {
    alignItems: "center",
    gap: 8,
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: "700",
  },
  summaryLabel: {
    fontSize: 11,
  },
});