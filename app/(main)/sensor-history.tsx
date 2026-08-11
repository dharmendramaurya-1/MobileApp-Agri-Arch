import { Ionicons } from "@expo/vector-icons";
import { useRef, useState } from "react";
import {
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { useTheme } from "../../src/context/ThemContext";
import { useScroll, useScrollReset } from "../../src/context/ScrollContext";

// Historical data for all sensors
const sensorHistoryData = [
  {
    id: "1",
    sensorName: "Ambient Temperature",
    icon: "thermometer",
    readings: [
      { time: "10:30 AM", date: "2025-05-19", value: "28°C", status: "normal" },
      { time: "9:00 AM", date: "2025-05-19", value: "27°C", status: "normal" },
      { time: "8:00 AM", date: "2025-05-19", value: "26°C", status: "normal" },
      { time: "7:00 PM", date: "2025-05-18", value: "25°C", status: "normal" },
    ],
  },
  {
    id: "2",
    sensorName: "Ambient Humidity",
    icon: "water",
    readings: [
      { time: "10:30 AM", date: "2025-05-19", value: "65%", status: "normal" },
      { time: "9:00 AM", date: "2025-05-19", value: "64%", status: "normal" },
      { time: "8:00 AM", date: "2025-05-19", value: "63%", status: "normal" },
      { time: "7:00 PM", date: "2025-05-18", value: "62%", status: "normal" },
    ],
  },
  {
    id: "3",
    sensorName: "Light Level",
    icon: "sunny",
    readings: [
      {
        time: "10:30 AM",
        date: "2025-05-19",
        value: "850 lux",
        status: "good",
      },
      { time: "9:00 AM", date: "2025-05-19", value: "720 lux", status: "good" },
      {
        time: "8:00 AM",
        date: "2025-05-19",
        value: "650 lux",
        status: "normal",
      },
      { time: "7:00 PM", date: "2025-05-18", value: "180 lux", status: "low" },
    ],
  },
  {
    id: "4",
    sensorName: "CO₂ Level",
    icon: "leaf",
    readings: [
      {
        time: "10:30 AM",
        date: "2025-05-19",
        value: "420 ppm",
        status: "normal",
      },
      {
        time: "9:00 AM",
        date: "2025-05-19",
        value: "418 ppm",
        status: "normal",
      },
      {
        time: "8:00 AM",
        date: "2025-05-19",
        value: "415 ppm",
        status: "normal",
      },
      {
        time: "7:00 PM",
        date: "2025-05-18",
        value: "410 ppm",
        status: "normal",
      },
    ],
  },
  {
    id: "5",
    sensorName: "Water Temperature",
    icon: "thermometer",
    readings: [
      { time: "10:30 AM", date: "2025-05-19", value: "24°C", status: "normal" },
      { time: "9:00 AM", date: "2025-05-19", value: "23°C", status: "normal" },
      { time: "8:00 AM", date: "2025-05-19", value: "23°C", status: "normal" },
      { time: "7:00 PM", date: "2025-05-18", value: "22°C", status: "normal" },
    ],
  },
  {
    id: "6",
    sensorName: "Water Level",
    icon: "water",
    readings: [
      { time: "10:30 AM", date: "2025-05-19", value: "75%", status: "good" },
      { time: "9:00 AM", date: "2025-05-19", value: "74%", status: "good" },
      { time: "8:00 AM", date: "2025-05-19", value: "73%", status: "good" },
      { time: "7:00 PM", date: "2025-05-18", value: "72%", status: "good" },
    ],
  },
  {
    id: "7",
    sensorName: "EC Value",
    icon: "flash",
    readings: [
      {
        time: "10:30 AM",
        date: "2025-05-19",
        value: "1.8 mS/cm",
        status: "optimal",
      },
      {
        time: "9:00 AM",
        date: "2025-05-19",
        value: "1.7 mS/cm",
        status: "optimal",
      },
      {
        time: "8:00 AM",
        date: "2025-05-19",
        value: "1.7 mS/cm",
        status: "optimal",
      },
      {
        time: "7:00 PM",
        date: "2025-05-18",
        value: "1.6 mS/cm",
        status: "optimal",
      },
    ],
  },
  {
    id: "8",
    sensorName: "pH Level",
    icon: "flask",
    readings: [
      {
        time: "10:30 AM",
        date: "2025-05-19",
        value: "6.8 pH",
        status: "optimal",
      },
      {
        time: "9:00 AM",
        date: "2025-05-19",
        value: "6.8 pH",
        status: "optimal",
      },
      {
        time: "8:00 AM",
        date: "2025-05-19",
        value: "6.7 pH",
        status: "optimal",
      },
      {
        time: "7:00 PM",
        date: "2025-05-18",
        value: "6.7 pH",
        status: "optimal",
      },
    ],
  },
];

export default function SensorHistory() {
  const { theme } = useTheme();
  const { onScroll, headerHeight } = useScroll();
  const scrollRef = useRef(null);
  useScrollReset(scrollRef);
  const [expandedSensor, setExpandedSensor] = useState<string | null>(null);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "normal":
        return "#4CAF50";
      case "good":
        return "#2196F3";
      case "optimal":
        return "#4CAF50";
      case "low":
        return "#FF9800";
      case "high":
        return "#F44336";
      default:
        return "#4CAF50";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "normal":
        return "checkmark-circle";
      case "good":
        return "happy";
      case "optimal":
        return "checkmark-circle";
      case "low":
        return "warning";
      case "high":
        return "alert-circle";
      default:
        return "checkmark-circle";
    }
  };

  return (
    <ScrollView
      ref={scrollRef}
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={{ paddingTop: headerHeight }}
      onScroll={onScroll}
      scrollEventThrottle={16}
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.colors.text }]}>
          Sensor History
        </Text>
        <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
          Last 24 hours of sensor data
        </Text>
      </View>

      {sensorHistoryData.map((sensor) => (
        <View key={sensor.id}>
          <TouchableOpacity
            style={[
              styles.sensorHeader,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
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
                name={sensor.icon as any}
                size={24}
                color={theme.colors.primary}
              />
            </View>
            <Text style={[styles.sensorName, { color: theme.colors.text }]}>
              {sensor.sensorName}
            </Text>
            <Ionicons
              name={
                expandedSensor === sensor.id ? "chevron-up" : "chevron-down"
              }
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
              {sensor.readings.map((reading, index) => (
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
                        size={12}
                        color="#FFF"
                      />
                      <Text style={styles.statusText}>{reading.status}</Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      ))}

      {/* Summary Card */}
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
              8
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
              24/7
            </Text>
            <Text
              style={[
                styles.summaryLabel,
                { color: theme.colors.textSecondary },
              ]}
            >
              Monitoring
            </Text>
          </View>
          <View style={styles.summaryItem}>
            <Ionicons name="bar-chart" size={24} color="#FF9800" />
            <Text style={[styles.summaryValue, { color: theme.colors.text }]}>
              100%
            </Text>
            <Text
              style={[
                styles.summaryLabel,
                { color: theme.colors.textSecondary },
              ]}
            >
              Data Accuracy
            </Text>
          </View>
        </View>
      </View>
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
  sensorName: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
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
