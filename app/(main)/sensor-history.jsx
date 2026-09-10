// app/(main)/sensor-history.jsx

import { Ionicons } from "@expo/vector-icons";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
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

export default function SensorHistory() {
  const { theme } = useTheme();
  const { onScroll, headerHeight } = useScroll();
  const scrollRef = useRef(null);
  useScrollReset(scrollRef);
  const [expandedSensor, setExpandedSensor] = useState(null);

  // ✅ Get real MQTT data
  const { getSelectedDeviceSensorData, getSelectedDeviceActuatorStatus, deviceStatusFlags } = useMqtt();
  const { fetchAllSensorData, isLoading, allData } = useHistoricalData();

  // ✅ Get real sensor data
  const liveSensorData = getSelectedDeviceSensorData();
  const actuatorStatus = getSelectedDeviceActuatorStatus();
  const deviceFlags = deviceStatusFlags || {};

  // ✅ Filter sensors (remove device-status and soil-moisture)
  const availableSensors = SENSORS.filter(
    s => s.key !== 'device-status' && s.key !== 'soil-moisture'
  );

  // ✅ Get status from device flags
  const getSensorStatus = (sensorKey) => {
    const statusMap = {
      'ambient-temperature': { 
        value: liveSensorData?.ambientTemperature,
        flag: null // No specific flag for temp
      },
      'ambient-humidity': { 
        value: liveSensorData?.ambientHumidity,
        flag: null
      },
      'co2': { 
        value: liveSensorData?.co2Level,
        flag: deviceFlags.co2High ? 'High' : deviceFlags.co2Low ? 'Low' : 'Normal'
      },
      'light-level': { 
        value: liveSensorData?.lightLevel,
        flag: deviceFlags.luxHigh ? 'High' : deviceFlags.luxLow ? 'Low' : 'Normal'
      },
      'ph-level': { 
        value: liveSensorData?.phValue,
        flag: deviceFlags.phHigh ? 'High' : deviceFlags.phLow ? 'Low' : 'Normal'
      },
      'ec-value': { 
        value: liveSensorData?.ecValue,
        flag: deviceFlags.ecHigh ? 'High' : deviceFlags.ecLow ? 'Low' : 'Normal'
      },
      'water-temperature': { 
        value: liveSensorData?.waterTemperature,
        flag: null
      },
      'water-level': { 
        value: liveSensorData?.waterLevel,
        flag: deviceFlags.tankHigh ? 'High' : deviceFlags.tankLow ? 'Low' : 'Normal'
      },
    };
    return statusMap[sensorKey] || { value: null, flag: null };
  };

  // ✅ Get status color based on server flag
  const getStatusColor = (status) => {
    if (!status || status === 'Normal') return '#4CAF50';
    if (status === 'High') return '#F44336';
    if (status === 'Low') return '#FF9800';
    return '#4CAF50';
  };

  // ✅ Get status icon based on server flag
  const getStatusIcon = (status) => {
    if (!status || status === 'Normal') return 'checkmark-circle';
    if (status === 'High') return 'alert-circle';
    if (status === 'Low') return 'warning';
    return 'checkmark-circle';
  };

  // ✅ Format value with unit
  const formatValue = (value, unit) => {
    if (value === null || value === undefined) return '--';
    if (typeof value === 'number') {
      return Number.isInteger(value) ? `${value}` : `${value.toFixed(1)}`;
    }
    return `${value}`;
  };

  // ✅ Get recent readings from historical data or live data
  const getSensorReadings = (sensorKey) => {
    const sensor = SENSORS.find(s => s.key === sensorKey);
    if (!sensor) return [];

    // Try to get from historical data first
    const historyData = allData?.[sensor.dataKey]?.data || [];
    
    // If we have historical data, use it (last 4 readings)
    if (historyData.length > 0) {
      return historyData.slice(-4).reverse().map(item => ({
        time: item.time ? new Date(item.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--',
        date: item.time ? new Date(item.time).toLocaleDateString() : '----/--/--',
        value: formatValue(item.value, sensor.unit) + (sensor.unit ? ` ${sensor.unit}` : ''),
        status: 'Normal' // Use actual status from flags
      }));
    }

    // Fallback: use live data
    const liveValue = liveSensorData?.[sensor.dataKey];
    if (liveValue !== undefined && liveValue !== null) {
      const status = getSensorStatus(sensorKey).flag || 'Normal';
      return [{
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        date: new Date().toLocaleDateString(),
        value: formatValue(liveValue, sensor.unit) + (sensor.unit ? ` ${sensor.unit}` : ''),
        status: status
      }];
    }

    return [];
  };

  // ✅ Build sensor data with real values
  const sensorHistoryData = availableSensors.map((sensor) => {
    const statusInfo = getSensorStatus(sensor.key);
    const readings = getSensorReadings(sensor.key);
    
    return {
      id: sensor.key,
      sensorName: sensor.name,
      icon: sensor.icon,
      readings: readings.length > 0 ? readings : [
        {
          time: '--:--',
          date: '----/--/--',
          value: '--',
          status: 'Normal'
        }
      ],
      currentValue: statusInfo.value,
      currentStatus: statusInfo.flag || 'Normal'
    };
  });

  return (
    <ScrollView
      ref={scrollRef}
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={{ paddingTop: headerHeight, paddingBottom: 30 }}
      onScroll={onScroll}
      scrollEventThrottle={16}
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.colors.text }]}>
          Sensor History
        </Text>
        <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
          Real-time sensor data & status
        </Text>
        {deviceFlags && Object.keys(deviceFlags).length > 0 && (
          <Text style={[styles.subtitle, { color: theme.colors.textSecondary, marginTop: 4 }]}>
            Last updated: {new Date().toLocaleTimeString()}
          </Text>
        )}
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={[styles.loadingText, { color: theme.colors.textSecondary }]}>
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
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.border,
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
                    { backgroundColor: `${theme.colors.primary}20` },
                  ]}
                >
                  <Ionicons
                    name={sensor.icon}
                    size={24}
                    color={theme.colors.primary}
                  />
                </View>
                <View style={styles.sensorInfo}>
                  <Text style={[styles.sensorName, { color: theme.colors.text }]}>
                    {sensor.sensorName}
                  </Text>
                  <View style={styles.sensorStatusRow}>
                    <Text style={[styles.sensorValue, { color: theme.colors.textSecondary }]}>
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
                  color={theme.colors.textSecondary}
                />
              </TouchableOpacity>

              {expandedSensor === sensor.id && (
                <View
                  style={[
                    styles.readingsContainer,
                    { backgroundColor: theme.colors.surface },
                  ]}
                >
                  {sensor.readings.length > 0 ? (
                    sensor.readings.map((reading, index) => (
                      <View
                        key={index}
                        style={[
                          styles.readingItem,
                          index !== sensor.readings.length - 1 && {
                            borderBottomColor: theme.colors.border,
                            borderBottomWidth: 1,
                          },
                        ]}
                      >
                        <View style={styles.timeContainer}>
                          <Text
                            style={[styles.timeText, { color: theme.colors.text }]}
                          >
                            {reading.time}
                          </Text>
                          <Text
                            style={[
                              styles.dateText,
                              { color: theme.colors.textSecondary },
                            ]}
                          >
                            {reading.date}
                          </Text>
                        </View>
                        <View style={styles.valueContainer}>
                          <Text
                            style={[
                              styles.valueText,
                              { color: theme.colors.primary },
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
                      <Text style={[styles.noDataText, { color: theme.colors.textSecondary }]}>
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
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <Text style={[styles.summaryTitle, { color: theme.colors.text }]}>
              Summary
            </Text>
            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />
                <Text style={[styles.summaryValue, { color: theme.colors.text }]}>
                  {availableSensors.length}
                </Text>
                <Text
                  style={[
                    styles.summaryLabel,
                    { color: theme.colors.textSecondary },
                  ]}
                >
                  Active Sensors
                </Text>
              </View>
              <View style={styles.summaryItem}>
                <Ionicons name="time" size={24} color={theme.colors.primary} />
                <Text style={[styles.summaryValue, { color: theme.colors.text }]}>
                  {deviceFlags?.online ? 'Online' : 'Offline'}
                </Text>
                <Text
                  style={[
                    styles.summaryLabel,
                    { color: theme.colors.textSecondary },
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
                <Text style={[styles.summaryValue, { color: theme.colors.text }]}>
                  {deviceFlags?.online ? 'Connected' : 'Disconnected'}
                </Text>
                <Text
                  style={[
                    styles.summaryLabel,
                    { color: theme.colors.textSecondary },
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