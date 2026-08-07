import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useMqtt } from "../../src/context/MqttContext";
import { useTheme } from "../../src/context/ThemContext";
export default function WaterLevel() {
  const { sensorData } = useMqtt();
  const { theme } = useTheme();
  // const currentValue = 75;
  const [currentValue, setcurrentValue] = useState<any>();

  useEffect(() => {
    setcurrentValue(sensorData.waterLevel);
  }, [sensorData]);

  const unit = "%";
  const weeklyData = [68, 72, 75, 74, 73, 72, 70];
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const maxValue = 100;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <View style={styles.header}>
        <View
          style={[
            styles.iconContainer,
            { backgroundColor: `${theme.colors.primary}20` },
          ]}
        >
          <Ionicons name="water" size={50} color={theme.colors.primary} />
        </View>
        <Text style={[styles.title, { color: theme.colors.text }]}>
          Water Level
        </Text>
        <Text style={[styles.location, { color: theme.colors.textSecondary }]}>
          Water Tank Sensor
        </Text>
      </View>

      <View
        style={[styles.currentCard, { backgroundColor: theme.colors.surface }]}
      >
        <Text
          style={[styles.currentLabel, { color: theme.colors.textSecondary }]}
        >
          Current Reading
        </Text>
        <Text style={[styles.currentValue, { color: theme.colors.primary }]}>
          {currentValue}
          {unit}
        </Text>
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: "#4CAF50" }]} />
          <Text
            style={[styles.statusText, { color: theme.colors.textSecondary }]}
          >
            Good Level
          </Text>
          <Text
            style={[styles.rangeText, { color: theme.colors.textSecondary }]}
          >
            50%
          </Text>
        </View>
      </View>

      <View
        style={[styles.progressCard, { backgroundColor: theme.colors.surface }]}
      >
        <Text style={[styles.progressTitle, { color: theme.colors.text }]}>
          Tank Capacity
        </Text>
        <View style={styles.progressBarContainer}>
          <View
            style={[
              styles.progressBar,
              {
                width: `${currentValue}%`,
                backgroundColor: theme.colors.primary,
              },
            ]}
          />
        </View>
        <Text
          style={[styles.progressText, { color: theme.colors.textSecondary }]}
        >
          {currentValue}% of 5,000 L used
        </Text>
      </View>

      <View
        style={[styles.chartCard, { backgroundColor: theme.colors.surface }]}
      >
        <Text style={[styles.chartTitle, { color: theme.colors.text }]}>
          7-Day Trend
        </Text>
        <View style={styles.chartContainer}>
          {weeklyData.map((value, index) => (
            <View key={index} style={styles.barContainer}>
              <View
                style={[
                  styles.bar,
                  { height: value, backgroundColor: theme.colors.primary },
                ]}
              />
              <Text
                style={[styles.barLabel, { color: theme.colors.textSecondary }]}
              >
                {days[index]}
              </Text>
              <Text style={[styles.barValue, { color: theme.colors.primary }]}>
                {value}%
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View
        style={[styles.statsCard, { backgroundColor: theme.colors.surface }]}
      >
        <Text style={[styles.statsTitle, { color: theme.colors.text }]}>
          Statistics
        </Text>
        <View style={styles.statsGrid}>
          <View style={styles.statItem}>
            <Text
              style={[styles.statLabel, { color: theme.colors.textSecondary }]}
            >
              Average
            </Text>
            <Text style={[styles.statValue, { color: theme.colors.primary }]}>
              72%
            </Text>
          </View>
          <View style={styles.statItem}>
            <Text
              style={[styles.statLabel, { color: theme.colors.textSecondary }]}
            >
              Peak
            </Text>
            <Text style={[styles.statValue, { color: "#FF9800" }]}>75%</Text>
          </View>
          <View style={styles.statItem}>
            <Text
              style={[styles.statLabel, { color: theme.colors.textSecondary }]}
            >
              Lowest
            </Text>
            <Text style={[styles.statValue, { color: "#2196F3" }]}>68%</Text>
          </View>
        </View>
      </View>

      <View
        style={[
          styles.recommendCard,
          { backgroundColor: theme.colors.primaryLight },
        ]}
      >
        <Ionicons name="checkmark-circle" size={24} color="#FFF" />
        <Text style={styles.recommendText}>
          Water level is sufficient for next 3 days
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { alignItems: "center", paddingTop: 20, paddingBottom: 16 },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  title: { fontSize: 24, fontWeight: "700", marginBottom: 4 },
  location: { fontSize: 14 },
  currentCard: {
    margin: 16,
    padding: 20,
    borderRadius: 16,
    alignItems: "center",
  },
  currentLabel: { fontSize: 14, marginBottom: 8 },
  currentValue: { fontSize: 64, fontWeight: "700", marginBottom: 12 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { fontSize: 14 },
  rangeText: { fontSize: 14, marginLeft: 12 },
  progressCard: { margin: 16, padding: 16, borderRadius: 16 },
  progressTitle: { fontSize: 16, fontWeight: "600", marginBottom: 12 },
  progressBarContainer: {
    height: 12,
    backgroundColor: "#E0E0E0",
    borderRadius: 6,
    overflow: "hidden",
    marginBottom: 8,
  },
  progressBar: { height: "100%", borderRadius: 6 },
  progressText: { fontSize: 12 },
  chartCard: { margin: 16, padding: 16, borderRadius: 16 },
  chartTitle: { fontSize: 16, fontWeight: "600", marginBottom: 16 },
  chartContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "flex-end",
    height: 150,
  },
  barContainer: { alignItems: "center", width: 40 },
  bar: { width: 30, borderRadius: 6, marginBottom: 8 },
  barLabel: { fontSize: 10, marginBottom: 4 },
  barValue: { fontSize: 10, fontWeight: "600" },
  statsCard: { margin: 16, padding: 16, borderRadius: 16 },
  statsTitle: { fontSize: 16, fontWeight: "600", marginBottom: 12 },
  statsGrid: { flexDirection: "row", justifyContent: "space-around" },
  statItem: { alignItems: "center" },
  statLabel: { fontSize: 12, marginBottom: 4 },
  statValue: { fontSize: 20, fontWeight: "700" },
  recommendCard: {
    margin: 16,
    padding: 16,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  recommendText: { color: "#FFF", fontSize: 14, flex: 1 },
});
