// app/(main)/sensor/SensorDetailScreen.jsx

import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import LineChart from "../../../components/LineChart";
import LiveChartCard from "../../../components/LiveChartCard";
import ZoomableChart from "../../../components/ZoomableChart";
import { SENSORS, getSensorByKey } from "../../../src/config/sensorConfigs";
import { useHistoricalData } from "../../../src/context/HistoricalDataContext";
import { useMqtt } from "../../../src/context/MqttContext";
import { useScroll, useScrollReset } from "../../../src/context/ScrollContext";
import { useTheme } from "../../../src/context/ThemContext";
import useLiveMqttWindow from "../../../src/hooks/useLiveMqttWindow";
import {
  downsampleData
} from "../../../src/services/senmlService";

// ✅ Import device status parser
import { parseDeviceStatus } from "../../../src/utils/deviceStatusParser";

const { width, height: screenHeight } = Dimensions.get("window");
const PAGE_SIZE = 10;
const MAX_GRAPH_POINTS = 200;
const MAX_TABLE_ROWS = 100;
const RANGE_DAYS = { "1d": 1, "7d": 7, "30d": 30 };
const RANGE_LABELS = { "1d": "Last 24h", "7d": "Last 7d", "30d": "Last 30d" };
// The fullscreen chart is drawn wider than the screen; pinch to zoom in and
// swipe to pan across the whole time range.
const ZOOM_CHART_WIDTH = screenHeight - 100;
const ZOOM_CHART_HEIGHT = width - 60;

// The fullscreen chart is drawn wider than the screen; pinch to zoom in and
// swipe to pan across the whole time range.


// ✅ Helper: Get sensor status from device flags (same source as alerts)
const getSensorStatusFromFlags = (sensorKey, deviceStatus) => {
  if (!deviceStatus) {
    return { level: 'unknown', label: 'No Data', color: '#9E9E9E', icon: 'help-circle' };
  }

  // Parse device status if it's a number
  const flags = typeof deviceStatus === 'number' 
    ? parseDeviceStatus(deviceStatus) 
    : deviceStatus;

  // ── AMBIENT TEMPERATURE ──
  if (sensorKey === 'ambient-temperature' || sensorKey === 'ambientTemperature') {
    if (flags.airTempHigh) {
      return { level: 'high', label: 'High ⬆️', color: '#F44336', icon: 'alert-circle' };
    }
    if (flags.airTempLow) {
      return { level: 'low', label: 'Low ⬇️', color: '#2196F3', icon: 'alert-circle' };
    }
    return { level: 'normal', label: 'Normal ✅', color: '#4CAF50', icon: 'checkmark-circle' };
  }

  // ── WATER TEMPERATURE ──
  if (sensorKey === 'water-temperature' || sensorKey === 'waterTemperature') {
    if (flags.waterTempHigh) {
      return { level: 'high', label: 'High ⬆️', color: '#F44336', icon: 'alert-circle' };
    }
    if (flags.waterTempLow) {
      return { level: 'low', label: 'Low ⬇️', color: '#2196F3', icon: 'alert-circle' };
    }
    return { level: 'normal', label: 'Normal ✅', color: '#4CAF50', icon: 'checkmark-circle' };
  }

  // ── HUMIDITY ──
  if (sensorKey === 'ambient-humidity' || sensorKey === 'ambientHumidity') {
    if (flags.humidityHigh) {
      return { level: 'high', label: 'High ⬆️', color: '#F44336', icon: 'alert-circle' };
    }
    if (flags.humidityLow) {
      return { level: 'low', label: 'Low ⬇️', color: '#2196F3', icon: 'alert-circle' };
    }
    return { level: 'normal', label: 'Normal ✅', color: '#4CAF50', icon: 'checkmark-circle' };
  }

  // ── CO₂ ──
  if (sensorKey === 'co2' || sensorKey === 'co2Level') {
    if (flags.co2High) {
      return { level: 'high', label: 'High ⬆️', color: '#F44336', icon: 'alert-circle' };
    }
    if (flags.co2Low) {
      return { level: 'low', label: 'Low ⬇️', color: '#2196F3', icon: 'alert-circle' };
    }
    return { level: 'normal', label: 'Normal ✅', color: '#4CAF50', icon: 'checkmark-circle' };
  }

  // ── pH ──
  if (sensorKey === 'ph-level' || sensorKey === 'phValue') {
    if (flags.phHigh) {
      return { level: 'high', label: 'High ⬆️', color: '#F44336', icon: 'alert-circle' };
    }
    if (flags.phLow) {
      return { level: 'low', label: 'Low ⬇️', color: '#2196F3', icon: 'alert-circle' };
    }
    return { level: 'normal', label: 'Normal ✅', color: '#4CAF50', icon: 'checkmark-circle' };
  }

  // ── EC ──
  if (sensorKey === 'ec-value' || sensorKey === 'ecValue') {
    if (flags.ecHigh) {
      return { level: 'high', label: 'High ⬆️', color: '#F44336', icon: 'alert-circle' };
    }
    if (flags.ecLow) {
      return { level: 'low', label: 'Low ⬇️', color: '#2196F3', icon: 'alert-circle' };
    }
    return { level: 'normal', label: 'Normal ✅', color: '#4CAF50', icon: 'checkmark-circle' };
  }

  // ── WATER LEVEL ──
  if (sensorKey === 'water-level' || sensorKey === 'waterLevel') {
    if (flags.tankHigh) {
      return { level: 'high', label: 'High ⬆️', color: '#F44336', icon: 'alert-circle' };
    }
    if (flags.tankLow) {
      return { level: 'low', label: 'Low ⬇️', color: '#2196F3', icon: 'alert-circle' };
    }
    return { level: 'normal', label: 'Normal ✅', color: '#4CAF50', icon: 'checkmark-circle' };
  }

  // ── LIGHT LEVEL ──
  if (sensorKey === 'light-level' || sensorKey === 'lightLevel') {
    if (flags.luxHigh) {
      return { level: 'high', label: 'High ⬆️', color: '#F44336', icon: 'alert-circle' };
    }
    if (flags.luxLow) {
      return { level: 'low', label: 'Low ⬇️', color: '#2196F3', icon: 'alert-circle' };
    }
    return { level: 'normal', label: 'Normal ✅', color: '#4CAF50', icon: 'checkmark-circle' };
  }

  // Default
  return { level: 'normal', label: 'Normal ✅', color: '#4CAF50', icon: 'checkmark-circle' };
};

export default function SensorDetailScreen({
  sensorKey,
  config: configProp,
  showHeader = true,
  contentPaddingTop,
}) {
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useTheme();
  
  // ✅ ADDED: deviceStatusFlags and cropSettings
  const { 
    getSelectedDeviceSensorData, 
    getSelectedDeviceId, 
    getSelectedExternalKey, 
    availableDevices,
    deviceStatusFlags,
    getSelectedDeviceCropSettings,
    externalKey
  } = useMqtt();
  
  // ✅ Use HistoricalDataContext
  const { 
    fetchSensorHistorical, 
    isLoading: isHistoricalLoading,
    error: historicalError,
    lastUpdated 
  } = useHistoricalData();
  
  const sensorData = getSelectedDeviceSensorData();
  const { onScroll, headerHeight } = useScroll();
  const scrollRef = useRef(null);
  useScrollReset(scrollRef);

  const config = (sensorKey ? getSensorByKey(sensorKey) : null) || configProp || SENSORS[0];

  const [timeRange, setTimeRange] = useState("1d");
  const [activeTab, setActiveTab] = useState("table");
  const [allTableData, setAllTableData] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [isTableLoading, setIsTableLoading] = useState(false);
    const [graphData, setGraphData] = useState([]); // Keep track of graph data
  const [isGraphLoading, setIsGraphLoading] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);
  const [selectedPoint, setSelectedPoint] = useState(null);

  const liveValue = sensorData[config.dataKey];
  const selectedDevId = getSelectedDeviceId();
  const selectedExtKey = getSelectedExternalKey();

    const liveDeviceKey = selectedExtKey || externalKey || null;
  const livePoints = useLiveMqttWindow({
    deviceKey: liveDeviceKey,
    enabled: !!liveDeviceKey,
    extractPoint: (parsed) => {
      const v = parsed ? parsed[config.dataKey] : undefined;
      if (v === undefined || v === null || typeof v !== "number") return null;
      return { value: v };
    },
  });

  // ✅ Get status from device flags (same source as alerts)
  const status = useMemo(() => {
    return getSensorStatusFromFlags(config.key, deviceStatusFlags);
  }, [config.key, deviceStatusFlags]);

  const getDevicePublisherAndKey = useCallback(() => {
    if (selectedDevId && availableDevices) {
      const device = availableDevices.find((d) => d.id === selectedDevId);
      if (device) {
        return {
          publisherId: device.id,
          externalKey: device.external_key || selectedExtKey,
        };
      }
    }
    return { publisherId: selectedDevId, externalKey: selectedExtKey };
  }, [selectedDevId, selectedExtKey, availableDevices]);

  const sensorName = config.apiName || config.dataKey;

  const getTimeWindow = useCallback(() => {
    const days = RANGE_DAYS[timeRange] || 7;
    const toMs = Date.now();
    const fromMs = toMs - days * 24 * 60 * 60 * 1000;
    return { from: fromMs, to: toMs };
  }, [timeRange]);

  // ✅ Use HistoricalDataContext for fetching data
  const fetchAllTableData = useCallback(async () => {
    setIsTableLoading(true);
    try {
      const { from, to } = getTimeWindow();
      const { publisherId, externalKey } = getDevicePublisherAndKey();

      const result = await fetchSensorHistorical({
        sensorKey: sensorName,
        from,
        to,
        pageSize: 500,
        maxPages: 50,
        publisherId,
        externalKey,
      });

      if (result.success) {
        setAllTableData(downsampleData(result.data, MAX_TABLE_ROWS));
      } else {
        setAllTableData([]);
        console.error("Table fetch error:", result.error);
      }
    } catch (error) {
      console.error("Table fetch error:", error);
      setAllTableData([]);
    } finally {
      setIsTableLoading(false);
    }
  }, [getTimeWindow, getDevicePublisherAndKey, sensorName, fetchSensorHistorical]);

  const fetchGraphData = useCallback(async () => {
    setIsGraphLoading(true);
    try {
      const { from, to } = getTimeWindow();
      const { publisherId, externalKey } = getDevicePublisherAndKey();

      const result = await fetchSensorHistorical({
        sensorKey: sensorName,
        from,
        to,
        pageSize: 100,
        maxPages: 50,
        publisherId,
        externalKey,
      });

      if (result.success) {
        setGraphData(downsampleData(result.data, MAX_GRAPH_POINTS));
      } else {
        setGraphData([]);
        console.error("Graph fetch error:", result.error);
      }
    } catch (error) {
      console.error("Graph fetch error:", error);
      setGraphData([]);
    } finally {
      setIsGraphLoading(false);
    }
  }, [getTimeWindow, getDevicePublisherAndKey, sensorName, fetchSensorHistorical]);

  useEffect(() => {
    setCurrentPage(1);
    setSelectedPoint(null);
    fetchAllTableData();
    fetchGraphData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sensorName, timeRange, selectedDevId, selectedExtKey]);

  const formatValue = (value) => {
    if (value === null || value === undefined) return "--";
    if (typeof value === "number") {
      return Number.isInteger(value) ? String(value) : value.toFixed(1);
    }
    return String(value);
  };

  // Derive optimal target limits from crop settings or sensor config
  const sensorLimits = useMemo(() => {
    const crops = getSelectedDeviceCropSettings ? getSelectedDeviceCropSettings() : {};
    switch (config.key) {
      case "ambient-humidity":
      case "ambientHumidity":
        return {
          min: typeof crops?.humidityLow === "number" ? crops.humidityLow : 50,
          max: typeof crops?.humidityHigh === "number" ? crops.humidityHigh : 75,
          unit: "%",
        };
      case "ambient-temperature":
      case "ambientTemperature":
        return {
          min: typeof crops?.tempLow === "number" ? crops.tempLow : 18,
          max: typeof crops?.tempHigh === "number" ? crops.tempHigh : 28,
          unit: "°C",
        };
      case "water-temperature":
      case "waterTemperature":
        return {
          min: typeof crops?.waterTempLow === "number" ? crops.waterTempLow : 18,
          max: typeof crops?.waterTempHigh === "number" ? crops.waterTempHigh : 24,
          unit: "°C",
        };
      case "water-level":
      case "waterLevel":
        return {
          min: typeof crops?.waterLevelLow === "number" ? crops.waterLevelLow : 20,
          max: typeof crops?.waterLevelHigh === "number" ? crops.waterLevelHigh : 90,
          unit: "%",
        };
      case "ph-level":
      case "phValue":
        return {
          min: typeof crops?.phLow === "number" ? crops.phLow : 5.5,
          max: typeof crops?.phHigh === "number" ? crops.phHigh : 6.5,
          unit: "pH",
        };
      case "ec-value":
      case "ecValue":
        return {
          min: typeof crops?.ecLow === "number" ? crops.ecLow : 1.2,
          max: typeof crops?.ecHigh === "number" ? crops.ecHigh : 2.4,
          unit: "mS/cm",
        };
      case "co2":
      case "co2Level":
        return {
          min: typeof crops?.co2Low === "number" ? crops.co2Low : 400,
          max: typeof crops?.co2High === "number" ? crops.co2High : 1200,
          unit: "ppm",
        };
      case "light-level":
      case "lightLevel":
        return {
          min: typeof crops?.luxLow === "number" ? crops.luxLow : 5000,
          max: typeof crops?.luxHigh === "number" ? crops.luxHigh : 25000,
          unit: "lux",
        };
      default:
        return {
          min: config.min,
          max: config.max,
          unit: config.unit || "",
        };
    }
  }, [config.key, config.min, config.max, config.unit, getSelectedDeviceCropSettings]);

  // Evaluate reading status accurately against limits
  const evaluateValueStatus = useCallback((val) => {
    if (val === null || val === undefined || isNaN(val)) {
      return { level: "unknown", label: "No Data", color: "#9E9E9E", bg: "rgba(158,158,158,0.12)" };
    }
    const { min, max } = sensorLimits;
    if (typeof max === "number" && val > max) {
      return { level: "high", label: "High", color: "#EF5350", bg: "rgba(239,83,80,0.14)" };
    }
    if (typeof min === "number" && val < min) {
      return { level: "low", label: "Low", color: "#29B6F6", bg: "rgba(41,182,246,0.14)" };
    }
    return { level: "normal", label: "Normal", color: "#4CAF50", bg: "rgba(76,175,80,0.14)" };
  }, [sensorLimits]);

  // Live status takes hardware flags into account as well
  const liveStatus = useMemo(() => {
    const flagStatus = getSensorStatusFromFlags(config.key, deviceStatusFlags);
    if (flagStatus && flagStatus.level !== "normal" && flagStatus.level !== "unknown") {
      return {
        level: flagStatus.level,
        label: flagStatus.level === "high" ? "High Alert" : "Low Alert",
        color: flagStatus.color,
        bg: `${flagStatus.color}18`,
        icon: flagStatus.icon || "alert-circle",
      };
    }
    const evalStatus = evaluateValueStatus(liveValue);
    return {
      level: evalStatus.level,
      label: evalStatus.level === "normal" ? "Normal" : evalStatus.label,
      color: evalStatus.color,
      bg: evalStatus.bg,
      icon: evalStatus.level === "normal" ? "checkmark-circle" : "alert-circle",
    };
  }, [config.key, deviceStatusFlags, liveValue, evaluateValueStatus]);

  // Calculate summary metrics for the current dataset
  const datasetSummary = useMemo(() => {
    const data = graphData.length > 0 ? graphData : allTableData;
    if (!data || data.length === 0) return null;
    const values = data
      .map((d) => d.value)
      .filter((v) => typeof v === "number" && !isNaN(v));
    if (values.length === 0) return null;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const avg = values.reduce((s, v) => s + v, 0) / values.length;
    return { min, max, avg, count: values.length };
  }, [graphData, allTableData]);

  const formatTableTime = (ms) => {
    if (!ms) return "--";
    const d = new Date(ms);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const yesterday = new Date();
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = d.toDateString() === yesterday.toDateString();

    const timeStr = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (isToday) return `Today, ${timeStr}`;
    if (isYesterday) return `Yesterday, ${timeStr}`;
    const dateStr = d.toLocaleDateString([], { day: "2-digit", month: "short" });
    return `${dateStr}, ${timeStr}`;
  };

  // Client-side pagination over downsampled data
  const tableTotal = allTableData.length;
  const totalPages = Math.max(1, Math.ceil(tableTotal / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const tableData = allTableData.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const startIndex = tableTotal > 0 ? (safePage - 1) * PAGE_SIZE + 1 : 0;
  const endIndex = Math.min(safePage * PAGE_SIZE, tableTotal);

  // ✅ Check if data is loading
  const isLoading = isTableLoading || isGraphLoading || isHistoricalLoading;

  return (
    <>
    <ScrollView
      ref={scrollRef}
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={{
        paddingTop: contentPaddingTop ?? headerHeight,
        paddingBottom: 10,
      }}
      onScroll={onScroll}
      scrollEventThrottle={16}
      showsVerticalScrollIndicator={false}
    >
      {/* ─── HEADER ─── */}
      {showHeader && (
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={[styles.backButton, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={20} color={theme.colors.text} />
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Text style={[styles.headerTitle, { color: theme.colors.text }]} numberOfLines={1}>
              {config.name}
            </Text>
            <Text style={[styles.headerSubtitle, { color: theme.colors.textSecondary }]}>
              {config.location || "Greenhouse"} · Telemetry & Trends
            </Text>
          </View>
          <View style={[styles.liveSyncBadge, { backgroundColor: isDark ? "rgba(46,125,50,0.2)" : "rgba(46,125,50,0.1)" }]}>
            <View style={styles.livePulseDot} />
            <Text style={[styles.liveSyncText, { color: isDark ? "#81C784" : "#2E7D32" }]}>
              Live
            </Text>
          </View>
        </View>
      )}

      {/* ─── HERO LIVE METRIC CARD (Compact & Pretty) ─── */}
      <View
        style={[
          styles.heroCard,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
          },
        ]}
      >
        {/* Top meta row */}
        <View style={styles.heroTopRow}>
          <View style={styles.heroSensorTag}>
            <View
              style={[
                styles.sensorIconSquircle,
                { backgroundColor: `${config.color || theme.colors.primary}18` },
              ]}
            >
              <Ionicons
                name={config.icon || "speedometer-outline"}
                size={16}
                color={config.color || theme.colors.primary}
              />
            </View>
            <View>
              <Text style={[styles.heroSensorCategory, { color: theme.colors.textSecondary }]}>
                Real-Time Reading
              </Text>
              <Text style={[styles.heroSensorName, { color: theme.colors.text }]} numberOfLines={1}>
                {config.name}
              </Text>
            </View>
          </View>

          {/* Status Badge */}
          <View style={[styles.statusBadge, { backgroundColor: liveStatus.bg }]}>
            <Ionicons name={liveStatus.icon} size={12} color={liveStatus.color} />
            <Text style={[styles.statusText, { color: liveStatus.color }]}>
              {liveStatus.label}
            </Text>
          </View>
        </View>

        {/* Middle row: Big Value on Left, Target Badge on Right */}
        <View style={styles.heroMiddleRow}>
          <View style={styles.heroValueRow}>
            <Text style={[styles.heroValue, { color: theme.colors.text }]}>
              {formatValue(liveValue)}
            </Text>
            <Text style={[styles.heroUnit, { color: theme.colors.textSecondary }]}>
              {config.unit}
            </Text>
          </View>

          {Boolean(sensorLimits.min !== undefined || sensorLimits.max !== undefined) && (
            <View
              style={[
                styles.targetRangeBadge,
                {
                  backgroundColor: isDark
                    ? "rgba(255,255,255,0.04)"
                    : "rgba(46,125,50,0.06)",
                  borderColor: isDark
                    ? "rgba(255,255,255,0.08)"
                    : "rgba(46,125,50,0.15)",
                },
              ]}
            >
              <Ionicons
                name="shield-checkmark-outline"
                size={13}
                color={theme.colors.primary}
              />
              <View>
                <Text style={[styles.targetRangeLabel, { color: theme.colors.textSecondary }]}>
                  Optimal Range
                </Text>
                <Text style={[styles.targetRangeText, { color: theme.colors.text }]}>
                  {sensorLimits.min ?? "--"} — {sensorLimits.max ?? "--"} {config.unit}
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* Bottom row: Compact Stats Strip (Min · Avg · Max) */}
        {datasetSummary ? (
          <View
            style={[
              styles.summaryChipsRow,
              { borderTopColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)" },
            ]}
          >
            <View style={styles.statInlineItem}>
              <Text style={[styles.statInlineLabel, { color: theme.colors.textSecondary }]}>
                Min:
              </Text>
              <Text style={[styles.statInlineValue, { color: "#2196F3" }]}>
                {formatValue(datasetSummary.min)} {config.unit}
              </Text>
            </View>

            <View style={[styles.statDot, { backgroundColor: isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.15)" }]} />

            <View style={styles.statInlineItem}>
              <Text style={[styles.statInlineLabel, { color: theme.colors.textSecondary }]}>
                Avg:
              </Text>
              <Text style={[styles.statInlineValue, { color: theme.colors.text }]}>
                {formatValue(datasetSummary.avg)} {config.unit}
              </Text>
            </View>

            <View style={[styles.statDot, { backgroundColor: isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.15)" }]} />

            <View style={styles.statInlineItem}>
              <Text style={[styles.statInlineLabel, { color: theme.colors.textSecondary }]}>
                Max:
              </Text>
              <Text style={[styles.statInlineValue, { color: "#F44336" }]}>
                {formatValue(datasetSummary.max)} {config.unit}
              </Text>
            </View>
          </View>
        ) : null}
      </View>

      {/* ─── HISTORICAL DATA SECTION ─── */}
      <View style={styles.historicalSection}>
        <View style={styles.historicalHeader}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View
              style={[
                styles.sectionIconBadge,
                { backgroundColor: `${theme.colors.primary}18` },
              ]}
            >
              <Ionicons name="analytics" size={16} color={theme.colors.primary} />
            </View>
            <Text style={[styles.historicalTitle, { color: theme.colors.text }]}>
              Historical Trends
            </Text>
          </View>
          <View
            style={[
              styles.periodBadge,
              { backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)" },
            ]}
          >
            <Text style={[styles.periodBadgeText, { color: theme.colors.textSecondary }]}>
              {RANGE_LABELS[timeRange]}
            </Text>
          </View>
        </View>

        {/* Time Range Pills: 24h, 7d, 30d */}
        <View style={styles.timeRangeContainer}>
          {[
            { key: "1d", label: "24 Hours" },
            { key: "7d", label: "7 Days" },
            { key: "30d", label: "30 Days" },
          ].map((item) => {
            const isSelected = timeRange === item.key;
            return (
              <TouchableOpacity
                key={item.key}
                style={[
                  styles.timeRangeButton,
                  isSelected
                    ? [
                        styles.timeRangeButtonActive,
                        {
                          backgroundColor: theme.colors.primary,
                          borderColor: theme.colors.primary,
                        },
                      ]
                    : [
                        styles.timeRangeButtonInactive,
                        {
                          backgroundColor: isDark
                            ? "rgba(255,255,255,0.03)"
                            : theme.colors.surface,
                          borderColor: theme.colors.border,
                        },
                      ],
                ]}
                onPress={() => setTimeRange(item.key)}
                activeOpacity={0.75}
              >
                <Text
                  style={[
                    styles.timeRangeText,
                    {
                      color: isSelected ? "#FFFFFF" : theme.colors.textSecondary,
                      fontWeight: isSelected ? "700" : "500",
                    },
                  ]}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* View Switcher: Table vs Graph */}
        <View
          style={[
            styles.tabSwitcher,
            { backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "#EAEAEA" },
          ]}
        >
          <TouchableOpacity
            style={[
              styles.tabButton,
              activeTab === "table" && [
                styles.tabButtonActive,
                { backgroundColor: theme.colors.surface },
              ],
            ]}
            onPress={() => setActiveTab("table")}
            activeOpacity={0.8}
          >
            <Ionicons
              name="list"
              size={15}
              color={activeTab === "table" ? theme.colors.primary : theme.colors.textSecondary}
            />
            <Text
              style={[
                styles.tabButtonText,
                {
                  color: activeTab === "table" ? theme.colors.primary : theme.colors.textSecondary,
                  fontWeight: activeTab === "table" ? "700" : "500",
                },
              ]}
            >
              Table View
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.tabButton,
              activeTab === "graph" && [
                styles.tabButtonActive,
                { backgroundColor: theme.colors.surface },
              ],
            ]}
            onPress={() => setActiveTab("graph")}
            activeOpacity={0.8}
          >
            <Ionicons
              name="trending-up"
              size={15}
              color={activeTab === "graph" ? theme.colors.primary : theme.colors.textSecondary}
            />
            <Text
              style={[
                styles.tabButtonText,
                {
                  color: activeTab === "graph" ? theme.colors.primary : theme.colors.textSecondary,
                  fontWeight: activeTab === "graph" ? "700" : "500",
                },
              ]}
            >
              Trend Chart
            </Text>
          </TouchableOpacity>
        </View>

        {/* Content Card: Table or Graph */}
        <View
          style={[
            styles.contentCard,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
        >
          {historicalError ? (
            <View style={styles.placeholder}>
              <Ionicons name="alert-circle-outline" size={40} color="#F44336" />
              <Text style={[styles.placeholderText, { color: "#F44336" }]}>
                {historicalError}
              </Text>
            </View>
          ) : activeTab === "table" ? (
            isTableLoading ? (
              <View style={styles.placeholder}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
                <Text style={[styles.placeholderText, { color: theme.colors.textSecondary }]}>
                  Loading sensor logs…
                </Text>
              </View>
            ) : tableData.length > 0 ? (
              <>
                <View
                  style={[
                    styles.tableHeader,
                    {
                      backgroundColor: isDark
                        ? "rgba(255,255,255,0.03)"
                        : "rgba(0,0,0,0.02)",
                      borderBottomColor: theme.colors.border,
                    },
                  ]}
                >
                  <Text style={[styles.tableHeaderCell, { color: theme.colors.textSecondary }]}>
                    Date &amp; Time
                  </Text>
                  <Text
                    style={[
                      styles.tableHeaderCell,
                      styles.tableHeaderCellCenter,
                      { color: theme.colors.textSecondary },
                    ]}
                  >
                    Reading
                  </Text>
                  <Text
                    style={[
                      styles.tableHeaderCell,
                      styles.tableHeaderCellRight,
                      { color: theme.colors.textSecondary },
                    ]}
                  >
                    Status
                  </Text>
                </View>

                {tableData.map((point, idx) => {
                  const pointStatus = evaluateValueStatus(point.value);
                  return (
                    <View
                      key={`${point.time}-${idx}`}
                      style={[
                        styles.tableRow,
                        idx % 2 === 1 && [
                          styles.tableRowStriped,
                          {
                            backgroundColor: isDark
                              ? "rgba(255,255,255,0.015)"
                              : "rgba(76,175,80,0.025)",
                          },
                        ],
                        { borderBottomColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)" },
                      ]}
                    >
                      <Text style={[styles.tableCellDate, { color: theme.colors.text }]}>
                        {formatTableTime(point.time)}
                      </Text>

                      <View style={styles.tableValueCell}>
                        <Text style={[styles.tableValue, { color: pointStatus.color }]}>
                          {formatValue(point.value)}
                        </Text>
                        <Text style={[styles.tableUnit, { color: theme.colors.textSecondary }]}>
                          {point.unit || config.unit}
                        </Text>
                      </View>

                      <View style={styles.tableStatusCell}>
                        <View style={[styles.miniStatusBadge, { backgroundColor: pointStatus.bg }]}>
                          <Text style={[styles.miniStatusText, { color: pointStatus.color }]}>
                            {pointStatus.label}
                          </Text>
                        </View>
                      </View>
                    </View>
                  );
                })}

                {/* Pagination Footer */}
                <View
                  style={[
                    styles.paginationFooter,
                    { borderTopColor: theme.colors.border },
                  ]}
                >
                  <TouchableOpacity
                    style={[
                      styles.pageButton,
                      {
                        backgroundColor: isDark
                          ? "rgba(255,255,255,0.05)"
                          : "rgba(0,0,0,0.04)",
                      },
                      safePage <= 1 && { opacity: 0.35 },
                    ]}
                    disabled={safePage <= 1}
                    onPress={() => setCurrentPage(safePage - 1)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="chevron-back" size={16} color={theme.colors.primary} />
                    <Text style={[styles.pageButtonText, { color: theme.colors.primary }]}>
                      Prev
                    </Text>
                  </TouchableOpacity>

                  <View style={styles.pageInfo}>
                    <Text style={[styles.pageInfoText, { color: theme.colors.text }]}>
                      Page {safePage} of {totalPages}
                    </Text>
                    <Text style={[styles.pageInfoSub, { color: theme.colors.textSecondary }]}>
                      {tableTotal > 0 ? `${startIndex}-${endIndex} of ${tableTotal} records` : "No records"}
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={[
                      styles.pageButton,
                      {
                        backgroundColor: isDark
                          ? "rgba(255,255,255,0.05)"
                          : "rgba(0,0,0,0.04)",
                      },
                      safePage >= totalPages && { opacity: 0.35 },
                    ]}
                    disabled={safePage >= totalPages}
                    onPress={() => setCurrentPage(safePage + 1)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.pageButtonText, { color: theme.colors.primary }]}>
                      Next
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color={theme.colors.primary} />
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <View style={styles.placeholder}>
                <Ionicons name="analytics-outline" size={42} color={theme.colors.textSecondary} />
                <Text style={[styles.placeholderText, { color: theme.colors.textSecondary }]}>
                  No historical records found for this period
                </Text>
              </View>
            )
          ) : (
            /* ── GRAPH TAB ── */
            isGraphLoading ? (
              <View style={styles.placeholder}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
                <Text style={[styles.placeholderText, { color: theme.colors.textSecondary }]}>
                  Loading trend graph…
                </Text>
              </View>
            ) : graphData.length > 0 ? (
              <View style={styles.graphWrapper}>
                {/* Summary + Zoom button */}
                <View style={styles.graphSummaryRow}>
                  <View style={styles.graphSummaryLeft}>
                    <Text style={[styles.graphSummaryDetail, { color: theme.colors.text }]}>
                      {graphData.length} Data Points Analyzed
                    </Text>
                    <Text style={[styles.graphSummarySub, { color: theme.colors.textSecondary }]}>
                      Min {formatValue(Math.min(...graphData.map((d) => d.value)))} · Max {formatValue(Math.max(...graphData.map((d) => d.value)))} {config.unit}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setIsZoomed(true)}
                    style={[
                      styles.zoomButton,
                      {
                        backgroundColor: isDark
                          ? "rgba(46,125,50,0.2)"
                          : "rgba(46,125,50,0.1)",
                        borderColor: isDark ? "#2E7D32" : "#81C784",
                      },
                    ]}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="expand-outline" size={16} color={theme.colors.primary} />
                    <Text style={[styles.zoomButtonText, { color: theme.colors.primary }]}>
                      Fullscreen
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Chart Area */}
                <View style={styles.graphWithAxis}>
                  <View style={styles.chartAndXAxis}>
                    <View style={styles.chartArea}>
                      <LineChart
                        data={graphData}
                        color={config.color || theme.colors.primary}
                        unit={config.unit}
                        width={width - 34}
                        height={245}
                        labelColor={theme.colors.textSecondary}
                        xTitle="Time"
                        yTitle={config.unit ? `Value (${config.unit})` : "Value"}
                        showGradient={true}
                        showDots={graphData.length <= 50}
                        onPointPress={setSelectedPoint}
                        selectedPoint={selectedPoint}
                      />
                    </View>
                  </View>
                </View>
              </View>
            ) : (
              <View style={styles.placeholder}>
                <Ionicons name="analytics-outline" size={42} color={theme.colors.textSecondary} />
                <Text style={[styles.placeholderText, { color: theme.colors.textSecondary }]}>
                  No trend points available for this period
                </Text>
              </View>
            )
          )}
        </View>
      </View>

     

      {/* ─── LIVE · LAST 10 MIN ─── */}
      <View style={{ marginBottom: 4, marginTop: 12}}>
        <LiveChartCard
          title={`${config.name} · Live`}
          subtitle={`${config.name} — last 10 minutes of MQTT data`}
          color={config.color}
          unit={config.unit}
          points={livePoints}
          themeColors={theme.colors}
        />
      </View>
    </ScrollView>

      {/* ─── FULLSCREEN ZOOM MODAL ─── */}
      <Modal
        visible={isZoomed}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setIsZoomed(false)}
      >
        <StatusBar hidden />
        <View style={[styles.zoomContainer, { backgroundColor: theme.colors.background }]}>
          {/* Zoom Header */}
          <View style={styles.zoomHeader}>
            <View style={styles.zoomHeaderLeft}>
              <Text style={[styles.zoomTitle, { color: theme.colors.text }]}>
                {config.name}
              </Text>
              <Text style={[styles.zoomSubtitle, { color: theme.colors.textSecondary }]}>
                {RANGE_LABELS[timeRange]} · {graphData.length} points
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setIsZoomed(false)}
              style={[styles.zoomCloseButton, { backgroundColor: theme.colors.surface }]}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="contract-outline" size={22} color={theme.colors.primary} />
            </TouchableOpacity>
          </View>

          {/* Zoom Stats */}
          <View style={[styles.zoomStatsRow, { backgroundColor: theme.colors.surface }]}>
            <View style={styles.zoomStat}>
              <Text style={[styles.zoomStatLabel, { color: theme.colors.textSecondary }]}>Min</Text>
              <Text style={[styles.zoomStatValue, { color: "#F44336" }]}>
                {formatValue(Math.min(...graphData.map((d) => d.value)))} {config.unit}
              </Text>
            </View>
            <View style={[styles.zoomStatDivider, { backgroundColor: theme.colors.border }]} />
            <View style={styles.zoomStat}>
              <Text style={[styles.zoomStatLabel, { color: theme.colors.textSecondary }]}>Avg</Text>
              <Text style={[styles.zoomStatValue, { color: theme.colors.primary }]}>
                {formatValue(graphData.reduce((s, d) => s + d.value, 0) / graphData.length)} {config.unit}
              </Text>
            </View>
            <View style={[styles.zoomStatDivider, { backgroundColor: theme.colors.border }]} />
            <View style={styles.zoomStat}>
              <Text style={[styles.zoomStatLabel, { color: theme.colors.textSecondary }]}>Max</Text>
              <Text style={[styles.zoomStatValue, { color: "#4CAF50" }]}>
                {formatValue(Math.max(...graphData.map((d) => d.value)))} {config.unit}
              </Text>
            </View>
          </View>

          {/* Fullscreen Chart */}
          <View style={styles.zoomChartWrapper}>
            <Text style={[styles.zoomAxisTitle, { color: theme.colors.textSecondary }]}>↑ {config.unit || "Value"}</Text>
            <ZoomableChart
              chartWidth={ZOOM_CHART_WIDTH}
              chartHeight={ZOOM_CHART_HEIGHT}
              background={theme.colors.background}
            >
              <LineChart
                data={graphData}
                color={config.color}
                unit=""
                width={ZOOM_CHART_WIDTH}
                height={ZOOM_CHART_HEIGHT}
                labelColor={theme.colors.textSecondary}
                xTitle="Time"
                yTitle={config.unit ? `Value (${config.unit})` : "Value"}
                showGradient={true}
                showDots={graphData.length <= 80}
                onPointPress={setSelectedPoint}
                selectedPoint={selectedPoint}
              />
            </ZoomableChart>
            <Text style={[styles.zoomAxisTitle, { color: theme.colors.textSecondary }]}>Time →</Text>
          </View>

          {/* Zoom out button */}
          <TouchableOpacity
            onPress={() => setIsZoomed(false)}
            style={[styles.zoomOutButton, { backgroundColor: theme.colors.primary }]}
          >
            <Ionicons name="contract-outline" size={18} color="#FFF" />
            <Text style={styles.zoomOutButtonText}>Zoom Out</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </>
  );
}

// ─── STYLES ──────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    gap: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  headerTitleContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: 0.1,
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  liveSyncBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    gap: 6,
  },
  livePulseDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: "#4CAF50",
  },
  liveSyncText: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  // ── Hero Metric Card (Compact & Pretty) ──
  heroCard: {
    marginHorizontal: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 5,
    elevation: 2,
  },
  heroTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  heroSensorTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  sensorIconSquircle: {
    width: 28,
    height: 28,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  heroSensorCategory: {
    fontSize: 9,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    lineHeight: 11,
  },
  heroSensorName: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.1,
    marginTop: 1,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "700",
  },
  heroMiddleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginVertical: 4,
  },
  heroValueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
  },
  heroValue: {
    fontSize: 34,
    fontWeight: "800",
    letterSpacing: -0.5,
    lineHeight: 38,
  },
  heroUnit: {
    fontSize: 15,
    fontWeight: "600",
  },
  targetRangeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 9,
    borderWidth: 1,
  },
  targetRangeLabel: {
    fontSize: 9,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  targetRangeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  summaryChipsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    paddingTop: 8,
    marginTop: 6,
  },
  statInlineItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  statInlineLabel: {
    fontSize: 11,
    fontWeight: "500",
  },
  statInlineValue: {
    fontSize: 12,
    fontWeight: "700",
  },
  statDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
  },

  // ── Historical Data ──
  historicalSection: {
    marginHorizontal: 16,
    marginTop: 16,
  },
  historicalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionIconBadge: {
    width: 30,
    height: 30,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  historicalTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  periodBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  periodBadgeText: {
    fontSize: 11,
    fontWeight: "600",
  },

  timeRangeContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 12,
  },
  timeRangeButton: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
  },
  timeRangeButtonActive: {
    shadowColor: "#2E7D32",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 2,
  },
  timeRangeButtonInactive: {},
  timeRangeText: {
    fontSize: 12,
  },

  tabSwitcher: {
    flexDirection: "row",
    borderRadius: 12,
    padding: 4,
    marginBottom: 12,
  },
  tabButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    borderRadius: 10,
    gap: 6,
  },
  tabButtonActive: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  tabButtonText: {
    fontSize: 13,
  },

  contentCard: {
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    minHeight: 200,
  },

  // ── Table View ──
  tableHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
  },
  tableHeaderCell: {
    flex: 1.2,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  tableHeaderCellCenter: {
    flex: 1,
    textAlign: "center",
  },
  tableHeaderCellRight: {
    flex: 0.8,
    textAlign: "right",
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tableRowStriped: {},
  tableCellDate: {
    flex: 1.2,
    fontSize: 12,
    fontWeight: "500",
  },
  tableValueCell: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "baseline",
    gap: 3,
  },
  tableValue: {
    fontSize: 14,
    fontWeight: "700",
  },
  tableUnit: {
    fontSize: 11,
    fontWeight: "500",
  },
  tableStatusCell: {
    flex: 0.8,
    alignItems: "flex-end",
  },
  miniStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  miniStatusText: {
    fontSize: 10,
    fontWeight: "700",
  },

  paginationFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderTopWidth: 1,
  },
  pageButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  pageButtonText: {
    fontSize: 12,
    fontWeight: "700",
  },
  pageInfo: {
    alignItems: "center",
  },
  pageInfoText: {
    fontSize: 12,
    fontWeight: "700",
  },
  pageInfoSub: {
    fontSize: 10,
    marginTop: 2,
    opacity: 0.7,
  },

  // ── Graph View ──
  graphWrapper: {
    padding: 14,
    gap: 10,
  },
  graphSummaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  graphSummaryLeft: {
    gap: 2,
  },
  graphSummaryDetail: {
    fontSize: 13,
    fontWeight: "700",
  },
  graphSummarySub: {
    fontSize: 11,
    fontWeight: "500",
  },
  zoomButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
  },
  zoomButtonText: {
    fontSize: 11,
    fontWeight: "700",
  },

  graphWithAxis: {
    flexDirection: "row",
    alignItems: "stretch",
    marginTop: 4,
  },
  chartAndXAxis: {
    flex: 1,
    alignItems: "center",
  },
  chartArea: {
    width: "100%",
  },

  placeholder: {
    justifyContent: "center",
    alignItems: "center",
    minHeight: 180,
    padding: 16,
    gap: 8,
  },
  placeholderText: {
    fontSize: 13,
    fontWeight: "500",
    textAlign: "center",
  },

  // ── Zoom Modal ──
  zoomContainer: {
    flex: 1,
    paddingTop: 40,
  },
  zoomHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  zoomHeaderLeft: { flex: 1 },
  zoomTitle: { fontSize: 20, fontWeight: "700" },
  zoomSubtitle: { fontSize: 12, marginTop: 2 },
  zoomCloseButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  zoomStatsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    padding: 14,
    borderRadius: 14,
    marginBottom: 16,
  },
  zoomStat: { flex: 1, alignItems: "center", gap: 4 },
  zoomStatLabel: { fontSize: 11, fontWeight: "500" },
  zoomStatValue: { fontSize: 16, fontWeight: "700" },
  zoomStatDivider: { width: 1, height: 30, opacity: 0.3 },
  zoomChartWrapper: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  zoomAxisTitle: { fontSize: 11, fontWeight: "600", opacity: 0.6, marginVertical: 4 },
  zoomOutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 40,
    paddingVertical: 14,
    borderRadius: 12,
  },
  zoomOutButtonText: { color: "#FFF", fontSize: 15, fontWeight: "600" },
});