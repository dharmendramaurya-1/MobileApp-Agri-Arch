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
  const { theme } = useTheme();
  
  // ✅ ADDED: deviceStatusFlags
  const { 
    getSelectedDeviceSensorData, 
    getSelectedDeviceId, 
    getSelectedExternalKey, 
    availableDevices,
    deviceStatusFlags,
     externalKey     // ✅ NEW - Device status flags
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

    const getStatusColor = (value) => {
    if (value === null || value === undefined) return "#666";
    if (config.min !== undefined && value < config.min) return "#FF9800";
    if (config.max !== undefined && value > config.max) return "#F44336";
    return config.color;
  };

  const getStatusText = (value) => {
    if (value === null || value === undefined) return "No data";
    if (config.min !== undefined && value < config.min) return "Low";
    if (config.max !== undefined && value > config.max) return "High";
    return "Normal";
  };

  const formatTime = (ms) => {
    if (!ms) return "--";
    const d = new Date(ms);
    const date = d.toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" });
    const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return `${date}, ${time}`;
  };

  // ❌ REMOVED: getStatusColor (broken - uses config.min/max)
  // ❌ REMOVED: getStatusText (broken - uses config.min/max)

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
        <View
          style={[
            styles.header,
            {
              paddingHorizontal: 16,
              paddingTop:  12,
            },
          ]}
        >
          <TouchableOpacity
            onPress={() => router.back()}
            style={[styles.backButton, { backgroundColor: theme.colors.surface }]}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.colors.text }]} numberOfLines={1}>
            {config.name}
          </Text>
          <View style={{ width: 40 }} />
        </View>
      )}

      {/* ─── LIVE VALUE ─── ✅ FIXED: Uses device status flags ─── */}
      <View style={[styles.valueCard, { backgroundColor: theme.colors.surface }]}>
        <View style={styles.valueRow}>
          <Text style={[styles.valueLabel, { color: theme.colors.textSecondary }]}>Live</Text>
          {/* ✅ Use status from device flags */}
           <View style={[styles.statusBadge, { backgroundColor: getStatusColor(liveValue) + "20" }]}>
            <Ionicons name="checkmark-circle-outline" size={16} color={getStatusColor(liveValue)} />
            <Text style={[styles.statusText, { color: getStatusColor(liveValue) }]}>
              {getStatusText(liveValue)}
            </Text>
          </View>
        </View>
        <View style={styles.mainValueContainer}>
          {/* ✅ Use status color for the value */}
          <Text style={[styles.mainValue, { color: theme.colors.text }]}>
            {formatValue(liveValue)}
          </Text>
          <Text style={[styles.mainUnit, { color: theme.colors.textSecondary }]}>
            {config.unit}
          </Text>
        </View>
        {lastUpdated && (
          <Text style={[styles.lastUpdated, { color: theme.colors.textSecondary }]}>
            Last updated: {lastUpdated.toLocaleString()}
          </Text>
        )}
      </View>
      {/* ─── HISTORICAL ─── */}
      <View style={styles.historicalSection}>
        <View style={styles.historicalHeader}>
          <Text style={[styles.historicalTitle, { color: theme.colors.text }]}>
            📊 Historical Data
          </Text>
          <Text style={[styles.historicalSubtitle, { color: theme.colors.textSecondary }]}>
            {RANGE_LABELS[timeRange]}
          </Text>
        </View>

        <View style={styles.timeRangeContainer}>
          {["1d", "7d", "30d"].map((range) => (
            <TouchableOpacity
              key={range}
              style={[
                styles.timeRangeButton,
                timeRange === range && { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
              ]}
              onPress={() => setTimeRange(range)}
            >
              <Text
                style={[
                  styles.timeRangeText,
                  { color: timeRange === range ? "#FFF" : theme.colors.textSecondary },
                ]}
              >
                {range === "1d" ? "24h" : range}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={[styles.tabSwitcher, { backgroundColor: theme.colors.surfaceVariant }]}>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === "table" && { backgroundColor: theme.colors.surface }]}
            onPress={() => setActiveTab("table")}
          >
            <Ionicons
              name="list-outline"
              size={16}
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
              Table
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === "graph" && { backgroundColor: theme.colors.surface }]}
            onPress={() => setActiveTab("graph")}
          >
            <Ionicons
              name="trending-up-outline"
              size={16}
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
              Graph
            </Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.contentCard, { backgroundColor: theme.colors.surface }]}>
          {historicalError ? (
            <View style={styles.placeholder}>
              <Ionicons name="alert-circle-outline" size={48} color="#F44336" />
              <Text style={[styles.placeholderText, { color: "#F44336" }]}>
                {historicalError}
              </Text>
            </View>
          ) : activeTab === "table" ? (
            isTableLoading ? (
              <View style={styles.placeholder}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
                <Text style={[styles.placeholderText, { color: theme.colors.textSecondary }]}>
                  Loading table…
                </Text>
              </View>
            ) : tableData.length > 0 ? (
              <>
                <View style={styles.tableHeader}>
                  <Text style={[styles.tableHeaderCell, { color: theme.colors.textSecondary }]}>
                    Date &amp; Time
                  </Text>
                  <Text
                    style={[
                      styles.tableHeaderCell,
                      styles.tableHeaderCellRight,
                      { color: theme.colors.textSecondary },
                    ]}
                  >
                    Value
                  </Text>
                  {/* ✅ NEW: Status column */}
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
                  // ✅ Get status for each historical point using device flags
                  // Note: Historical data uses the same device status flags
                  const pointStatus = getSensorStatusFromFlags(config.key, deviceStatusFlags);
                  return (
                    <View
                      key={`${point.time}-${idx}`}
                      style={[styles.tableRow, idx % 2 === 1 && styles.tableRowStriped]}
                    >
                      <Text style={[styles.tableCell, { color: theme.colors.text }]}>
                        {formatTime(point.time)}
                      </Text>
                      <View style={styles.tableValueCell}>
                        <Text style={[styles.tableValue, { color: pointStatus.color }]}>
                          {formatValue(point.value)}
                        </Text>
                        <Text style={[styles.tableUnit, { color: theme.colors.textSecondary }]}>
                          {point.unit || config.unit}
                        </Text>
                      </View>
                      {/* ✅ NEW: Status column */}
                      <View style={[styles.tableStatusCell, { justifyContent: 'flex-end' }]}>
                        <View style={[styles.miniStatusBadge, { backgroundColor: pointStatus.color + '20' }]}>
                          <Text style={[styles.miniStatusText, { color: pointStatus.color }]}>
                            {pointStatus.level === 'high' ? 'High' : 
                             pointStatus.level === 'low' ? 'Low' : 'Normal'}
                          </Text>
                        </View>
                      </View>
                    </View>
                  );
                })}
                <View style={styles.paginationFooter}>
                  <TouchableOpacity
                    style={[styles.pageButton, safePage <= 1 && { opacity: 0.4 }]}
                    disabled={safePage <= 1}
                    onPress={() => setCurrentPage(safePage - 1)}
                  >
                    <Ionicons name="chevron-back" size={16} color={theme.colors.primary} />
                    <Text style={[styles.pageButtonText, { color: theme.colors.primary }]}>Prev</Text>
                  </TouchableOpacity>
                  <View style={styles.pageInfo}>
                    <Text style={[styles.pageInfoText, { color: theme.colors.text }]}>
                      Page {safePage} of {totalPages}
                    </Text>
                    <Text style={[styles.pageInfoSub, { color: theme.colors.textSecondary }]}>
                      {tableTotal > 0 ? `${startIndex}-${endIndex} of ${tableTotal}` : "No records"}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.pageButton, safePage >= totalPages && { opacity: 0.4 }]}
                    disabled={safePage >= totalPages}
                    onPress={() => setCurrentPage(safePage + 1)}
                  >
                    <Text style={[styles.pageButtonText, { color: theme.colors.primary }]}>Next</Text>
                    <Ionicons name="chevron-forward" size={16} color={theme.colors.primary} />
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <View style={styles.placeholder}>
                <Ionicons name="analytics-outline" size={48} color={theme.colors.textSecondary} />
                <Text style={[styles.placeholderText, { color: theme.colors.textSecondary }]}>
                  No historical data
                </Text>
              </View>
            )
          ) : (
            // ── GRAPH TAB ──
            isGraphLoading ? (
              <View style={styles.placeholder}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
                <Text style={[styles.placeholderText, { color: theme.colors.textSecondary }]}>
                  Loading graph…
                </Text>
              </View>
            ) : graphData.length > 0 ? (
              <View style={styles.graphWrapper}>
                {/* ── Summary + Zoom button ── */}
                <View style={styles.graphSummaryRow}>
                  <View style={styles.graphSummaryLeft}>
                    <Text style={[styles.graphSummary, { color: theme.colors.textSecondary }]}>
                      {graphData.length} points
                    </Text>
                    <Text style={[styles.graphSummaryDetail, { color: theme.colors.textSecondary }]}>
                      Min {formatValue(Math.min(...graphData.map((d) => d.value)))} · Max {formatValue(Math.max(...graphData.map((d) => d.value)))} {config.unit}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setIsZoomed(true)}
                    style={[styles.zoomButton, { backgroundColor: theme.colors.primary + "15" }]}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="expand-outline" size={18} color={theme.colors.primary} />
                    <Text style={[styles.zoomButtonText, { color: theme.colors.primary }]}>Full</Text>
                  </TouchableOpacity>
                </View>

                {/* ── Chart ── */}
                <View style={styles.graphWithAxis}>
                  <View style={styles.chartAndXAxis}>
                      <View style={styles.chartArea}>
                        <LineChart
                          data={graphData}
                          color={config.color}
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
                <Ionicons name="analytics-outline" size={48} color={theme.colors.textSecondary} />
                <Text style={[styles.placeholderText, { color: theme.colors.textSecondary }]}>
                  No historical data
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
    paddingBottom: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  headerTitle: { fontSize: 20, fontWeight: "700", flex: 1, textAlign: "center" },

  valueCard: {
    marginHorizontal: 16,
    padding: 16,
    borderRadius: 16,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  valueRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  valueLabel: { fontSize: 14, fontWeight: "500" },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 6,
  },
  statusText: { fontSize: 12, fontWeight: "600" },
  mainValueContainer: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
  },
  mainValue: { fontSize: 42, fontWeight: "700" },
  mainUnit: { fontSize: 18, fontWeight: "500" },
  lastUpdated: {
    fontSize: 11,
    marginTop: 4,
    opacity: 0.7,
  },

  historicalSection: {
    marginHorizontal: 16,
    marginTop: 12,
  },
  historicalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  historicalTitle: { fontSize: 18, fontWeight: "700" },
  historicalSubtitle: { fontSize: 12 },

  timeRangeContainer: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    marginBottom: 12,
  },
  timeRangeButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "rgba(0,0,0,0.08)",
  },
  timeRangeText: { fontSize: 13, fontWeight: "600" },

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
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  tabButtonText: { fontSize: 14, fontWeight: "500" },

  contentCard: {
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    minHeight: 200,
  },

  tableHeader: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.04)",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.08)",
  },
  tableHeaderCell: {
    flex: 1,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  tableHeaderCellRight: { textAlign: "right", flex: 1, },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0,0,0,0.06)",
  },
  tableRowStriped: { backgroundColor: "rgba(76,175,80,0.04)" },
  tableCell: { flex: 1, fontSize: 13 },
  tableValueCell: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "baseline",
    gap: 4,
  },
  tableValue: { fontSize: 15, fontWeight: "700" },
  tableUnit: { fontSize: 11, fontWeight: "500" },
  // ✅ NEW: Status column styles
  tableStatusCell: {
    flex: 0.6,
    alignItems: "flex-end",
  },
  miniStatusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  miniStatusText: {
    fontSize: 9,
    fontWeight: "600",
  },

  paginationFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.06)",
  },
  pageButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  pageButtonText: { fontSize: 13, fontWeight: "600" },
  pageInfo: { alignItems: "center" },
  pageInfoText: { fontSize: 13, fontWeight: "600" },
  pageInfoSub: { fontSize: 11, marginTop: 2, opacity: 0.7 },

  graphWrapper: { padding: 14, gap: 10 },
  graphSummary: { fontSize: 12, fontWeight: "500", textAlign: "center" },

  graphWithAxis: {
    flexDirection: "row",
    alignItems: "stretch",
    marginTop: 4,
  },
  yAxisContainer: {
    justifyContent: "space-between",
    paddingRight: 8,
    paddingVertical: 12,
    width: 40,
  },
  chartAndXAxis: {
    flex: 1,
    alignItems: "center",
  },
  chartArea: {
    width: "100%",
  },
  xAxisContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    paddingHorizontal: 4,
    marginTop: 4,
  },
  axisLabel: {
    fontSize: 10,
    fontWeight: "500",
  },

  placeholder: {
    justifyContent: "center",
    alignItems: "center",
    minHeight: 180,
    padding: 16,
    gap: 8,
  },
  placeholderText: { fontSize: 15, fontWeight: "500" },

  // Graph enhancements
  graphSummaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  graphSummaryLeft: { gap: 2 },
  graphSummaryDetail: { fontSize: 11, fontWeight: "500" },
  zoomButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  zoomButtonText: { fontSize: 12, fontWeight: "600" },
  axisTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 4,
    marginBottom: 4,
  },
  axisTitleText: { fontSize: 10, fontWeight: "600", opacity: 0.7 },

  // Zoom modal
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