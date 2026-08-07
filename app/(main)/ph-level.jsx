import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import WeeklyTrendChart from "../../components/chat/Weeklytrendchart"; // adjust path to wherever you place it
import { useMqtt } from "../../src/context/MqttContext";
import { useTheme } from "../../src/context/ThemContext";

export default function PHLevel() {
  const { sensorData } = useMqtt();

  const { theme } = useTheme();
  const [currentValue, setcurrentValue] = useState();

  useEffect(() => {
    setcurrentValue(sensorData.phValue);
  }, [sensorData]);

  const unit = "pH";
  const weeklyData = [6.7, 6.8, 6.8, 6.9, 6.8, 6.7, 6.8];

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
          <Ionicons name="flask" size={50} color={theme.colors.primary} />
        </View>
        <Text style={[styles.title, { color: theme.colors.text }]}>
          pH Level
        </Text>
        <Text style={[styles.location, { color: theme.colors.textSecondary }]}>
          Soil Sensor - Field A
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
        <Text style={[styles.currentValue, { color: "#4CAF50" }]}>
          {currentValue}
          {unit}
        </Text>
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: "#4CAF50" }]} />
          <Text
            style={[styles.statusText, { color: theme.colors.textSecondary }]}
          >
            Optimal
          </Text>
          <Text
            style={[styles.rangeText, { color: theme.colors.textSecondary }]}
          >
            6.5 - 7.0 pH
          </Text>
        </View>
      </View>

      <View
        style={[styles.chartCard, { backgroundColor: theme.colors.surface }]}
      >
        <WeeklyTrendChart
          data={weeklyData}
          barColor="#4CAF50"
          labelColor={theme.colors.textSecondary}
          valueColor="#4CAF50"
          titleColor={theme.colors.text}
        />
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
            <Text style={[styles.statValue, { color: "#4CAF50" }]}>6.8 pH</Text>
          </View>
          <View style={styles.statItem}>
            <Text
              style={[styles.statLabel, { color: theme.colors.textSecondary }]}
            >
              High
            </Text>
            <Text style={[styles.statValue, { color: "#FF9800" }]}>6.9 pH</Text>
          </View>
          <View style={styles.statItem}>
            <Text
              style={[styles.statLabel, { color: theme.colors.textSecondary }]}
            >
              Low
            </Text>
            <Text style={[styles.statValue, { color: "#2196F3" }]}>6.7 pH</Text>
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
          pH levels are ideal for most crops
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
  chartCard: { margin: 16, padding: 16, borderRadius: 16 },
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