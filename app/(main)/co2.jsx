import { useMqtt } from "@/context/MqttContext";
import { useScroll, useScrollReset } from "../../src/context/ScrollContext";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { Dimensions, ScrollView, StyleSheet, Text, View } from "react-native";
import WeeklyTrendChart from "../../components/chat/Weeklytrendchart"; // adjust path to wherever you place it
import { useTheme } from "../../src/context/ThemContext";
const { height } = Dimensions.get("window");

export default function CO2Level() {
  const { sensorData } = useMqtt();
  const { theme } = useTheme();
  const { onScroll, headerHeight } = useScroll();
  const scrollRef = useRef(null);
  useScrollReset(scrollRef);

  const [currentValue, setcurrentValue] = useState();
  const unit = "ppm";
  const weeklyData = [410, 415, 420, 425, 422, 418, 415];
  useEffect(() => {
    setcurrentValue(sensorData.co2Level);
  }, [sensorData]);
  return (
    <ScrollView
      ref={scrollRef}
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[styles.scrollContent, { paddingTop: headerHeight }]}
      onScroll={onScroll}
      scrollEventThrottle={16}
    >
      <View style={styles.header}>
        <View
          style={[
            styles.iconContainer,
            { backgroundColor: `${theme.colors.primary}20` },
          ]}
        >
          <Ionicons name="leaf" size={50} color={theme.colors.primary} />
        </View>
        <Text style={[styles.title, { color: theme.colors.text }]}>
          CO₂ Level
        </Text>
        <Text style={[styles.location, { color: theme.colors.textSecondary }]}>
          Greenhouse Sensor
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
            Normal
          </Text>
          <Text
            style={[styles.rangeText, { color: theme.colors.textSecondary }]}
          >
            400-450 ppm
          </Text>
        </View>
      </View>

      <View
        style={[styles.chartCard, { backgroundColor: theme.colors.surface }]}
      >
        <WeeklyTrendChart
          data={weeklyData}
          barColor="#9C27B0"
          labelColor={theme.colors.textSecondary}
          valueColor="#9C27B0"
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
            <Text style={[styles.statValue, { color: "#9C27B0" }]}>
              418 ppm
            </Text>
          </View>
          <View style={styles.statItem}>
            <Text
              style={[styles.statLabel, { color: theme.colors.textSecondary }]}
            >
              Peak
            </Text>
            <Text style={[styles.statValue, { color: "#FF9800" }]}>
              425 ppm
            </Text>
          </View>
          <View style={styles.statItem}>
            <Text
              style={[styles.statLabel, { color: theme.colors.textSecondary }]}
            >
              Lowest
            </Text>
            <Text style={[styles.statValue, { color: "#2196F3" }]}>
              410 ppm
            </Text>
          </View>
        </View>
      </View>

      <View
        style={[
          styles.recommendCard,
          { backgroundColor: theme.colors.primaryLight },
        ]}
      >
        <Ionicons name="leaf" size={24} color="#FFF" />
        <Text style={styles.recommendText}>
          CO₂ levels are optimal for plant growth
        </Text>
      </View>

      {/* 5% bottom margin */}
      <View style={{ height: height * 0.05 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
  },
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