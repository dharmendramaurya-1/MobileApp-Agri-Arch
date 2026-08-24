// app/(main)/sensor-tabs.jsx
// Tabbed view of every environmental / water / soil sensor.
// The drawer hero (shutter header) collapses on scroll; the tab bar slides
// up in lockstep with it and pins right below the green top row. Each tab
// reuses the already-built SensorDetailScreen component.
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SENSORS } from "../../src/config/sensorConfigs";
import { useMqtt } from "../../src/context/MqttContext";
import { useScroll } from "../../src/context/ScrollContext";
import { useTheme } from "../../src/context/ThemContext";
import SensorDetailScreen from "./sensor/SensorDetailScreen";

const TAB_BAR_HEIGHT = 58;

// Short labels so all 10 tabs fit on screen
const SHORT_NAMES = {
  "ambient-temperature": "Temp",
  "ambient-humidity": "Humidity",
  "co2": "CO₂",
  "light-level": "Light",
  "ph-level": "pH",
  "ec-value": "EC",
  "water-temperature": "W Temp",
  "water-level": "W Level",
  "soil-moisture": "Soil",
  "device-status": "Device",
};

function fmt(value) {
  if (value === null || value === undefined) return "--";
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }
  return String(value);
}

export default function SensorTabs() {
  const { type } = useLocalSearchParams();
  const { theme } = useTheme();
  const { getSelectedDeviceSensorData } = useMqtt();
  const sensorData = getSelectedDeviceSensorData();
  const { scrollY, headerHeight, heroHeight, resetScroll } = useScroll();
  const tabBarScrollRef = useRef(null);

  // Open the sensor passed via ?type= (from the dashboard card tap);
  // fall back to the first sensor if the param is missing/invalid.
  const requestedType = Array.isArray(type) ? type[0] : type;
  const initialKey = SENSORS.some((s) => s.key === requestedType)
    ? requestedType
    : SENSORS[0].key;
  const [activeKey, setActiveKey] = useState(initialKey);

  // Slide the tab bar up exactly with the hero, pinning below the top row.
  const tabTranslateY = scrollY.interpolate({
    inputRange: [0, heroHeight],
    outputRange: [0, -heroHeight],
    extrapolate: "clamp",
  });

  // If the user taps another dashboard card while this screen is already
  // mounted, switch to that sensor's tab too.
  useEffect(() => {
    if (requestedType && requestedType !== activeKey && SENSORS.some((s) => s.key === requestedType)) {
      setActiveKey(requestedType);
      resetScroll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedType]);

  // Keep the active pill in view when it's deep in the horizontal strip.
  useEffect(() => {
    const idx = SENSORS.findIndex((s) => s.key === activeKey);
    if (idx > 2 && tabBarScrollRef.current) {
      tabBarScrollRef.current.scrollTo({ x: idx * 110, animated: true });
    } else if (tabBarScrollRef.current) {
      tabBarScrollRef.current.scrollTo({ x: 0, animated: true });
    }
  }, [activeKey]);

  const selectTab = (key) => {
    if (key === activeKey) return;
    setActiveKey(key);
    resetScroll(); // re-expand the hero on tab switch
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Reuse the existing sensor detail screen — one per tab */}
      <SensorDetailScreen
        key={activeKey}
        sensorKey={activeKey}
        showHeader={false}
        contentPaddingTop={headerHeight + TAB_BAR_HEIGHT}
      />

      {/* ── Pinned tab bar ───────────────────────────────────────────────── */}
      <Animated.View
        style={[
          styles.tabBar,
          {
            backgroundColor: theme.colors.background,
            borderBottomColor: theme.colors.border,
            top: headerHeight,
            transform: [{ translateY: tabTranslateY }],
          },
        ]}
      >
        <ScrollView
          ref={tabBarScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabBarContent}
        >
          {SENSORS.map((sensor) => {
            const active = sensor.key === activeKey;
            const liveValue = sensorData[sensor.dataKey];
            const hasValue = liveValue !== null && liveValue !== undefined;
            const tint = active ? sensor.color : theme.colors.textSecondary;

            return (
              <TouchableOpacity
                key={sensor.key}
                style={[
                  styles.tabPill,
                  { borderColor: active ? sensor.color : theme.colors.border },
                  active && { backgroundColor: `${sensor.color}18` },
                ]}
                onPress={() => selectTab(sensor.key)}
                activeOpacity={0.7}
              >
                <Ionicons name={sensor.icon} size={14} color={tint} />
                <Text
                  style={[
                    styles.tabName,
                    { color: active ? sensor.color : theme.colors.text },
                  ]}
                  numberOfLines={1}
                >
                  {SHORT_NAMES[sensor.key] || sensor.name}
                </Text>
                <Text
                  style={[
                    styles.tabValue,
                    { color: active ? sensor.color : theme.colors.textSecondary },
                  ]}
                  numberOfLines={1}
                >
                  {hasValue ? `${fmt(liveValue)}${sensor.unit}` : "--"}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabBar: {
    position: "absolute",
    left: 0,
    right: 0,
    height: TAB_BAR_HEIGHT,
    zIndex: 20,
    elevation: 5,
    borderBottomWidth: 1,
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  tabBarContent: {
    paddingHorizontal: 12,
    gap: 8,
    alignItems: "center",
  },
  tabPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
  },
  tabName: { fontSize: 12, fontWeight: "600", maxWidth: 72 },
  tabValue: { fontSize: 12, fontWeight: "800", maxWidth: 64 },
});
