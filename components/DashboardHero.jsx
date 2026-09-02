// components/DashboardHero.jsx
// The hero section for the Dashboard, showing device name, crop info,
// and time. Scrolls naturally with the Dashboard's ScrollView.
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

export default function DashboardHero({
  selectedDeviceName,
  isDeviceOnline,
  externalKey,
  cropInfo,
}) {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = () =>
    currentTime.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

  const formatDate = () =>
    currentTime.toLocaleDateString([], {
      weekday: "long",
      month: "long",
      day: "numeric",
    });

  const deviceId = externalKey || "No Device Selected";

  return (
    <View style={styles.heroSection}>
      <View style={[styles.heroImage, { backgroundColor: "#2E7D32" }]} />
      <View style={styles.heroContent}>
        {/* Device Name + Active Badge + Time */}
        <View style={styles.weatherTimeRow}>
          <View style={styles.weatherInfo}>
            <View>
              <Text style={styles.weatherIcon}>🌱</Text>
            </View>
            <View>
              <View style={styles.deviceNameRow}>
                <View>
                  <Text style={styles.weatherTemp} numberOfLines={1}>
                    {selectedDeviceName || "No Device"}
                  </Text>
                </View>
                {isDeviceOnline && (
                  <View style={styles.activeBadge}>
                    <Text style={styles.activeBadgeText}>Active</Text>
                  </View>
                )}
              </View>
              <View>
                <Text style={styles.macIdText}>
                  MAC:{" "}
                  {deviceId === "No Device Selected"
                    ? "—"
                    : "•••••" + deviceId.slice(-5)}
                </Text>
              </View>
            </View>
          </View>
          <View style={styles.timeInfo}>
            <Text style={styles.timeText}>{formatTime()}</Text>
            <Text style={styles.dateText}>{formatDate()}</Text>
          </View>
        </View>

        {/* Crop Info Row */}
        <View style={styles.cropInfoRowCard}>
          <View style={styles.cropInfoItem}>
            <Ionicons name="leaf-outline" size={14} color="#FFF" />
            <View>
              <Text style={styles.cropInfoLabel}>Crop</Text>
              <Text style={styles.cropInfoValue}>
                {cropInfo?.crop_name || "N/A"}
              </Text>
            </View>
          </View>
          <View style={styles.cropInfoSep} />
          <View style={styles.cropInfoItem}>
            <Ionicons name="bar-chart-outline" size={14} color="#FFF" />
            <View>
              <Text style={styles.cropInfoLabel}>Stage</Text>
              <Text style={styles.cropInfoValue}>
                {cropInfo?.stage_id || "N/A"}
              </Text>
            </View>
          </View>
          <View style={styles.cropInfoSep} />
          <View style={styles.cropInfoItem}>
            <Ionicons name="radio-outline" size={14} color="#FFF" />
            <View>
              <Text style={styles.cropInfoLabel}>Status</Text>
              <Text style={[styles.cropInfoValue, { color: "#FFF" }]}>
                {isDeviceOnline ? "Online" : "Offline"}
              </Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  heroSection: {
    width: "100%",
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
    shadowColor: "#1B5E20",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 10,
    overflow: "hidden",
    marginBottom: 12,
  },
  heroImage: {
    width: "100%",
    height: "100%",
    position: "absolute",
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
  },
  heroContent: { padding: 12, paddingTop: 8, paddingBottom: 12 },
  weatherTimeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  weatherInfo: { flexDirection: "row", alignItems: "center", gap: 8 },
  weatherIcon: { fontSize: 28 },
  weatherTemp: { fontSize: 18, fontWeight: "700", color: "#FFF" },
  deviceNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  activeBadge: {
    backgroundColor: "rgba(76,175,80,0.9)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  activeBadgeText: {
    color: "#FFF",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  macIdText: {
    fontSize: 11,
    color: "rgba(255,255,255,0.7)",
    marginTop: 2,
    fontWeight: "500",
  },
  timeInfo: { alignItems: "flex-end" },
  timeText: { fontSize: 20, fontWeight: "700", color: "#FFF" },
  dateText: { fontSize: 11, color: "rgba(255,255,255,0.9)", marginTop: 2 },
  cropInfoRowCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 6,
    marginTop: 4,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  cropInfoItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  cropInfoSep: {
    width: 1,
    height: "80%",
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  cropInfoLabel: {
    fontSize: 9,
    color: "rgba(255,255,255,0.6)",
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  cropInfoValue: {
    fontSize: 11,
    color: "#FFF",
    fontWeight: "700",
    marginTop: 1,
  },
});
