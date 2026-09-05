// app/(main)/pump-history.tsx
import { Ionicons } from "@expo/vector-icons";
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
import LineChart from "../../components/LineChart";
import LiveChartCard from "../../components/LiveChartCard";
import ZoomableChart from "../../components/ZoomableChart";
import useLiveMqttWindow from "../../src/hooks/useLiveMqttWindow";
import { useMqtt } from "../../src/context/MqttContext";
import { useScroll, useScrollReset } from "../../src/context/ScrollContext";
import { useTheme } from "../../src/context/ThemContext";
import {
  downsampleData,
  fetchAllSensorHistorical,
} from "../../src/services/senmlService";
import { parseDeviceStatus } from "../../src/utils/deviceStatusParser";

const { width, height } = Dimensions.get("window"); // ✅ Added height
const PAGE_SIZE = 10;
const MAX_GRAPH_POINTS = 200;
const MAX_TABLE_ROWS = 100;
const RANGE_DAYS: Record<string, number> = {
  "1h": 1 / 24,
  "1d": 1,
  "7d": 7,
  "30d": 30,
};
const RANGE_LABELS: Record<string, string> = {
  "1h": "Last 1h",
  "1d": "Last 24h",
  "7d": "Last 7d",
  "30d": "Last 30d",
};

// The fullscreen chart is drawn wider than the screen; pinch to zoom in and
// swipe to pan across the whole time range.
const ZOOM_CHART_WIDTH = height - 80;
const ZOOM_CHART_HEIGHT = width - 60;

interface PumpEvent {
  id: string;
  time: number;
  waterPump: boolean;
  nutrientPump: boolean;
  rawStatus: number;
}

export default function PumpHistory() {
  const { theme } = useTheme();
  // ✅ Safe theme fallback
  const safeTheme = theme || {
    colors: {
      background: "#fff",
      text: "#000",
      textSecondary: "#666",
      primary: "#007AFF",
      surface: "#fff",
      surfaceVariant: "#f5f5f5",
      border: "#ddd",
    },
  };

  const { onScroll, headerHeight } = useScroll();
  const scrollRef = useRef(null);
  useScrollReset(scrollRef);
  const {
    getSelectedDeviceId,
    getSelectedExternalKey,
    selectedExternalKey,
    externalKey,
    availableDevices,
  } = useMqtt();

  const [timeRange, setTimeRange] = useState("7d");
  const [activeTab, setActiveTab] = useState<"table" | "graph">("table");
  const [allTableData, setAllTableData] = useState<PumpEvent[]>([]);
  const [graphData, setGraphData] = useState<any[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [isTableLoading, setIsTableLoading] = useState(false);
  const [isGraphLoading, setIsGraphLoading] = useState(false);
  const [selectedPump, setSelectedPump] = useState<
    "water" | "nutrient" | "both"
  >("both");
  const [isPumpDropdownOpen, setIsPumpDropdownOpen] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);
  const [error, setError] = useState<string | null>(null); // ✅ Added error state

  // ── Real-time rolling 10-min window of pump states from live MQTT ──
  const liveDeviceKey = (selectedExternalKey || externalKey) as string | null;
  const livePumpRaw: any[] = useLiveMqttWindow({
    deviceKey: liveDeviceKey,
    enabled: !!liveDeviceKey,
    extractPoint: (parsed: any) => {
      let waterPump: boolean | null = null;
      let nutrientPump: boolean | null = null;

      if (typeof parsed?.water_pump === "boolean") waterPump = parsed.water_pump;
      if (typeof parsed?.nutrient_pump === "boolean") nutrientPump = parsed.nutrient_pump;

      // DevStat bitmask also carries pump flags (e.g. status responses)
      const flags = parsed?.deviceStatusFlags;
      if (flags) {
        if (typeof flags.waterPump === "boolean") waterPump = flags.waterPump;
        if (typeof flags.nutrientPump === "boolean") nutrientPump = flags.nutrientPump;
      }

      if (waterPump === null && nutrientPump === null) return null;
      return { waterPump: !!waterPump, nutrientPump: !!nutrientPump };
    },
  });

  // Encode raw water/nutrient flags into the same 0/1…3 series as the graph
  const livePumpPoints: any[] = useMemo(() => {
    return livePumpRaw.map((s: any) => {
      let value = 0;
      if (selectedPump === "water") {
        value = s.waterPump ? 1 : 0;
      } else if (selectedPump === "nutrient") {
        value = s.nutrientPump ? 1 : 0;
      } else {
        value = (s.waterPump ? 1 : 0) + (s.nutrientPump ? 2 : 0);
      }
      return { time: s.time, value };
    });
  }, [livePumpRaw, selectedPump]);

  // Current pump state label + stats for the live card (meaningful for ON/OFF)
  const livePumpStats: { label: string; value: string; color?: string }[] =
    useMemo(() => {
      const last = livePumpRaw[livePumpRaw.length - 1];
      if (!last) return [];
      const colors =
        selectedPump === "water"
          ? "#2196F3"
          : selectedPump === "nutrient"
            ? "#4CAF50"
            : safeTheme.colors.primary;
      let state = "OFF";
      if (selectedPump === "water") {
        state = last.waterPump ? "ON" : "OFF";
      } else if (selectedPump === "nutrient") {
        state = last.nutrientPump ? "ON" : "OFF";
      } else {
        if (last.waterPump && last.nutrientPump) state = "Both";
        else if (last.waterPump) state = "Water";
        else if (last.nutrientPump) state = "Nutrient";
      }
      const stateColor = state === "OFF" ? "#F44336" : colors;
      return [
        { label: "State", value: state, color: stateColor },
        { label: "Points", value: String(livePumpRaw.length), color: safeTheme.colors.text },
      ];
    }, [livePumpRaw, selectedPump, safeTheme.colors.primary, safeTheme.colors.text]);

  const getDevicePublisherAndKey = useCallback(() => {
    const selectedDevId = getSelectedDeviceId?.();
    const selectedExtKey = getSelectedExternalKey?.();
    if (selectedDevId && availableDevices && Array.isArray(availableDevices)) {
      const device = availableDevices.find((d: any) => d.id === selectedDevId);
      if (device) {
        return {
          publisherId: device.id,
          externalKey: device.external_key || selectedExtKey,
        };
      }
    }
    return { publisherId: selectedDevId, externalKey: selectedExtKey };
  }, [getSelectedDeviceId, getSelectedExternalKey, availableDevices]);

  const fetchAllData = useCallback(async () => {
    setIsTableLoading(true);
    setIsGraphLoading(true);
    setError(null); // ✅ Clear previous errors
    try {
      const days = RANGE_DAYS[timeRange] || 7;
      const toMs = Date.now();
      const fromMs = toMs - days * 24 * 60 * 60 * 1000;
      const { publisherId, externalKey } = getDevicePublisherAndKey();

      const result = await fetchAllSensorHistorical({
        sensorKey: "deviceStatus",
        from: fromMs,
        to: toMs,
        pageSize: 500,
        publisherId,
        externalKey,
      });

      if (result.success && result.data.length > 0) {
        const events: PumpEvent[] = result.data
          .filter((d: any) => d.value != null)
          .map((d: any, idx: number) => {
            const parsed = parseDeviceStatus(d.value) as {
              waterPump: boolean;
              nutrientPump: boolean;
            };
            return {
              id: `${d.time}-${idx}`,
              time: d.time,
              waterPump: parsed.waterPump,
              nutrientPump: parsed.nutrientPump,
              rawStatus: d.value,
            };
          });

        setAllTableData(downsampleData(events, MAX_TABLE_ROWS));

        // Build graph data
        const graphPoints = events.map((e) => ({
          time: e.time,
          value:
            selectedPump === "water"
              ? e.waterPump
                ? 1
                : 0
              : selectedPump === "nutrient"
                ? e.nutrientPump
                  ? 1
                  : 0
                : (e.waterPump ? 1 : 0) + (e.nutrientPump ? 2 : 0),
        }));
        setGraphData(downsampleData(graphPoints, MAX_GRAPH_POINTS));
      } else {
        setAllTableData([]);
        setGraphData([]);
        if (!result.success) {
          setError("Failed to fetch data"); // ✅ Set error
        }
      }
    } catch (error) {
      console.error("Pump history fetch error:", error);
      setError("Failed to load pump history data"); // ✅ Set error
      setAllTableData([]);
      setGraphData([]);
    } finally {
      setIsTableLoading(false);
      setIsGraphLoading(false);
    }
  }, [timeRange, selectedPump, getDevicePublisherAndKey]);

  useEffect(() => {
    setCurrentPage(1);
    fetchAllData();
  }, [fetchAllData]);

  // Client-side pagination
  const tableTotal = allTableData.length;
  const totalPages = Math.max(1, Math.ceil(tableTotal / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pageData = allTableData.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );
  const startIndex = tableTotal > 0 ? (safePage - 1) * PAGE_SIZE + 1 : 0;
  const endIndex = Math.min(safePage * PAGE_SIZE, tableTotal);

  const formatTime = (ms: number) => {
    if (!ms) return "--";
    const d = new Date(ms);
    const date = d.toLocaleDateString([], {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
    const time = d.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    return `${date}, ${time}`;
  };

  const getStatusColor = (on: boolean) => (on ? "#4CAF50" : "#F44336");
  const getStatusLabel = (on: boolean) => (on ? "ON" : "OFF");

  // ✅ Fixed xLabels with safety checks
  const { xLabels, yLabels } = useMemo(() => {
    if (graphData.length < 2) return { xLabels: [], yLabels: [] };
    const yLabs =
      selectedPump === "both"
        ? ["OFF", "Water", "Nutrient", "Both"]
        : ["OFF", "ON"];
    const indices = [0, Math.floor(graphData.length / 2), graphData.length - 1];
    const xLabs = indices.map((i) => {
      const point = graphData[i];
      if (!point) return "";
      const d = new Date(point.time);
      return timeRange === "1h"
        ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : d.toLocaleDateString();
    });
    return { xLabels: xLabs, yLabels: yLabs };
  }, [graphData, selectedPump, timeRange]);

  // ✅ Fixed icon names
  const getPumpIcon = (pump: string) => {
    switch (pump) {
      case "water":
        return "water-outline";
      case "nutrient":
        return "leaf-outline";
      default:
        return "layers-outline";
    }
  };

  return (
    <>
      <ScrollView
        ref={scrollRef}
        style={[
          styles.container,
          { backgroundColor: safeTheme.colors.background },
        ]}
        contentContainerStyle={{ paddingTop: headerHeight }}
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        {/* ── HEADER ── */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: safeTheme.colors.text }]}>
            Pump History
          </Text>
          <Text
            style={[styles.subtitle, { color: safeTheme.colors.textSecondary }]}
          >
            {RANGE_LABELS[timeRange]}
          </Text>
        </View>

        {/* ── LIVE PUMP · LAST 10 MIN ── */}
        <LiveChartCard
          title="Pump · Live"
          subtitle={`${selectedPump === "water" ? "Water" : selectedPump === "nutrient" ? "Nutrient" : "Both"} pump — last 10 min of MQTT data`}
          color={
            selectedPump === "water"
              ? "#2196F3"
              : selectedPump === "nutrient"
                ? "#4CAF50"
                : safeTheme.colors.primary
          }
          unit=""
          points={livePumpPoints}
          stats={livePumpStats}
          themeColors={safeTheme.colors}
        />

        {/* ── ERROR DISPLAY ── */}
        {error && (
          <View style={styles.errorContainer}>
            <Text style={[styles.errorText, { color: "#F44336" }]}>
              {error}
            </Text>
            <TouchableOpacity onPress={fetchAllData} style={styles.retryButton}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── TIME RANGE FILTERS ── */}
        <View style={styles.timeRangeContainer}>
          {["1h", "1d", "7d", "30d"].map((range) => (
            <TouchableOpacity
              key={range}
              style={[
                styles.timeRangeButton,
                timeRange === range && {
                  backgroundColor: safeTheme.colors.primary,
                  borderColor: safeTheme.colors.primary,
                },
              ]}
              onPress={() => setTimeRange(range)}
            >
              <Text
                style={[
                  styles.timeRangeText,
                  {
                    color:
                      timeRange === range
                        ? "#FFF"
                        : safeTheme.colors.textSecondary,
                  },
                ]}
              >
                {range === "1h"
                  ? "1h"
                  : range === "1d"
                    ? "24h"
                    : range === "7d"
                      ? "7d"
                      : "30d"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── PUMP SELECTOR DROPDOWN ── */}
        <View style={styles.pumpDropdownContainer}>
          <TouchableOpacity
            style={[
              styles.pumpDropdownButton,
              {
                backgroundColor: safeTheme.colors.surfaceVariant,
                borderColor: "rgba(0,0,0,0.08)",
              },
            ]}
            onPress={() => setIsPumpDropdownOpen(!isPumpDropdownOpen)}
          >
            <Ionicons
              name={getPumpIcon(selectedPump)}
              size={16}
              color={
                selectedPump === "water"
                  ? "#2196F3"
                  : selectedPump === "nutrient"
                    ? "#4CAF50"
                    : safeTheme.colors.primary
              }
            />
            <Text
              style={[
                styles.pumpDropdownText,
                { color: safeTheme.colors.text },
              ]}
            >
              {selectedPump === "water"
                ? "Water"
                : selectedPump === "nutrient"
                  ? "Nutrient"
                  : "Both"}
            </Text>
            <Ionicons
              name={isPumpDropdownOpen ? "chevron-up" : "chevron-down"}
              size={16}
              color={safeTheme.colors.textSecondary}
            />
          </TouchableOpacity>

          {isPumpDropdownOpen && (
            <View
              style={[
                styles.pumpDropdownMenu,
                {
                  backgroundColor:
                    safeTheme.colors.surface || safeTheme.colors.background,
                  borderColor: "rgba(0,0,0,0.1)",
                },
              ]}
            >
              {(["water", "nutrient", "both"] as const).map((pump) => (
                <TouchableOpacity
                  key={pump}
                  style={[
                    styles.pumpDropdownItem,
                    selectedPump === pump && {
                      backgroundColor:
                        pump === "water"
                          ? "#2196F310"
                          : pump === "nutrient"
                            ? "#4CAF5010"
                            : safeTheme.colors.primary + "10",
                    },
                  ]}
                  onPress={() => {
                    setSelectedPump(pump);
                    setIsPumpDropdownOpen(false);
                  }}
                >
                  <Ionicons
                    name={getPumpIcon(pump)}
                    size={16}
                    color={
                      pump === "water"
                        ? "#2196F3"
                        : pump === "nutrient"
                          ? "#4CAF50"
                          : safeTheme.colors.primary
                    }
                  />
                  <Text
                    style={[
                      styles.pumpDropdownItemText,
                      { color: safeTheme.colors.text },
                    ]}
                  >
                    {pump === "water"
                      ? "Water"
                      : pump === "nutrient"
                        ? "Nutrient"
                        : "Both"}
                  </Text>
                  {selectedPump === pump && (
                    <Ionicons
                      name="checkmark-circle"
                      size={18}
                      color={
                        pump === "water"
                          ? "#2196F3"
                          : pump === "nutrient"
                            ? "#4CAF50"
                            : safeTheme.colors.primary
                      }
                    />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* ── TAB SWITCHER ── */}
        <View style={styles.tabSwitcherContainer}>
          <View
            style={[
              styles.tabSwitcher,
              { backgroundColor: safeTheme.colors.surfaceVariant },
            ]}
          >
            <TouchableOpacity
              style={[
                styles.tabButton,
                activeTab === "table" && {
                  backgroundColor: safeTheme.colors.surface,
                },
              ]}
              onPress={() => setActiveTab("table")}
            >
              <Ionicons
                name="list-outline"
                size={16}
                color={
                  activeTab === "table"
                    ? safeTheme.colors.primary
                    : safeTheme.colors.textSecondary
                }
              />
              <Text
                style={[
                  styles.tabButtonText,
                  {
                    color:
                      activeTab === "table"
                        ? safeTheme.colors.primary
                        : safeTheme.colors.textSecondary,
                    fontWeight: activeTab === "table" ? "700" : "500",
                  },
                ]}
              >
                Table
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.tabButton,
                activeTab === "graph" && {
                  backgroundColor: safeTheme.colors.surface,
                },
              ]}
              onPress={() => setActiveTab("graph")}
            >
              <Ionicons
                name="trending-up-outline"
                size={16}
                color={
                  activeTab === "graph"
                    ? safeTheme.colors.primary
                    : safeTheme.colors.textSecondary
                }
              />
              <Text
                style={[
                  styles.tabButtonText,
                  {
                    color:
                      activeTab === "graph"
                        ? safeTheme.colors.primary
                        : safeTheme.colors.textSecondary,
                    fontWeight: activeTab === "graph" ? "700" : "500",
                  },
                ]}
              >
                Graph
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── CONTENT ── */}
        <View style={styles.contentCard}>
          {activeTab === "table" ? (
            isTableLoading ? (
              <View style={styles.placeholder}>
                <ActivityIndicator
                  size="large"
                  color={safeTheme.colors.primary}
                />
                <Text
                  style={[
                    styles.placeholderText,
                    { color: safeTheme.colors.textSecondary },
                  ]}
                >
                  Loading table…
                </Text>
              </View>
            ) : pageData.length > 0 ? (
              <>
                <View style={styles.tableHeader}>
                  <Text
                    style={[
                      styles.tableHeaderCell,
                      { color: safeTheme.colors.textSecondary },
                    ]}
                  >
                    Date &amp; Time
                  </Text>
                  {selectedPump === "water" || selectedPump === "both" ? (
                    <Text
                      style={[
                        styles.tableHeaderCell,
                        styles.tableHeaderCellRight,
                        { color: safeTheme.colors.textSecondary },
                      ]}
                    >
                      Water Pump
                    </Text>
                  ) : null}
                  {selectedPump === "nutrient" || selectedPump === "both" ? (
                    <Text
                      style={[
                        styles.tableHeaderCell,
                        styles.tableHeaderCellRight,
                        { color: safeTheme.colors.textSecondary },
                      ]}
                    >
                      Nutrient Pump
                    </Text>
                  ) : null}
                </View>
                {pageData.map((event, idx) => (
                  <View
                    key={event.id}
                    style={[
                      styles.tableRow,
                      idx % 2 === 1 && styles.tableRowStriped,
                    ]}
                  >
                    <Text
                      style={[
                        styles.tableCell,
                        { color: safeTheme.colors.text },
                      ]}
                      numberOfLines={1}
                    >
                      {formatTime(event.time)}
                    </Text>
                    {selectedPump === "water" || selectedPump === "both" ? (
                      <View style={styles.tableValueCell}>
                        <View
                          style={[
                            styles.statusDot,
                            {
                              backgroundColor: getStatusColor(event.waterPump),
                            },
                          ]}
                        />
                        <Text
                          style={{
                            color: getStatusColor(event.waterPump),
                            fontSize: 13,
                            fontWeight: "600",
                          }}
                        >
                          {getStatusLabel(event.waterPump)}
                        </Text>
                      </View>
                    ) : null}
                    {selectedPump === "nutrient" || selectedPump === "both" ? (
                      <View style={styles.tableValueCell}>
                        <View
                          style={[
                            styles.statusDot,
                            {
                              backgroundColor: getStatusColor(
                                event.nutrientPump,
                              ),
                            },
                          ]}
                        />
                        <Text
                          style={{
                            color: getStatusColor(event.nutrientPump),
                            fontSize: 13,
                            fontWeight: "600",
                          }}
                        >
                          {getStatusLabel(event.nutrientPump)}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                ))}
                {/* ── PAGINATION ── */}
                <View style={styles.paginationFooter}>
                  <TouchableOpacity
                    style={[
                      styles.pageButton,
                      safePage <= 1 && { opacity: 0.4 },
                    ]}
                    disabled={safePage <= 1}
                    onPress={() => setCurrentPage(safePage - 1)}
                  >
                    <Ionicons
                      name="chevron-back"
                      size={16}
                      color={safeTheme.colors.primary}
                    />
                    <Text
                      style={[
                        styles.pageButtonText,
                        { color: safeTheme.colors.primary },
                      ]}
                    >
                      Prev
                    </Text>
                  </TouchableOpacity>
                  <View style={styles.pageInfo}>
                    <Text
                      style={[
                        styles.pageInfoText,
                        { color: safeTheme.colors.text },
                      ]}
                    >
                      Page {safePage} of {totalPages}
                    </Text>
                    <Text
                      style={[
                        styles.pageInfoSub,
                        { color: safeTheme.colors.textSecondary },
                      ]}
                    >
                      {tableTotal > 0
                        ? `${startIndex}-${endIndex} of ${tableTotal}`
                        : "No records"}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.pageButton,
                      safePage >= totalPages && { opacity: 0.4 },
                    ]}
                    disabled={safePage >= totalPages}
                    onPress={() => setCurrentPage(safePage + 1)}
                  >
                    <Text
                      style={[
                        styles.pageButtonText,
                        { color: safeTheme.colors.primary },
                      ]}
                    >
                      Next
                    </Text>
                    <Ionicons
                      name="chevron-forward"
                      size={16}
                      color={safeTheme.colors.primary}
                    />
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <View style={styles.placeholder}>
                <Ionicons
                  name="water-outline"
                  size={48}
                  color={safeTheme.colors.textSecondary}
                />
                <Text
                  style={[
                    styles.placeholderText,
                    { color: safeTheme.colors.textSecondary },
                  ]}
                >
                  No pump history data
                </Text>
              </View>
            )
          ) : // ── GRAPH TAB ──
          isGraphLoading ? (
            <View style={styles.placeholder}>
              <ActivityIndicator
                size="large"
                color={safeTheme.colors.primary}
              />
              <Text
                style={[
                  styles.placeholderText,
                  { color: safeTheme.colors.textSecondary },
                ]}
              >
                Loading graph…
              </Text>
            </View>
          ) : graphData.length > 0 ? (
            <View style={styles.graphWrapper}>
              <View style={styles.graphSummaryRow}>
                <View style={styles.graphSummaryLeft}>
                  <Text
                    style={[
                      styles.graphSummary,
                      { color: safeTheme.colors.textSecondary },
                    ]}
                  >
                    {graphData.length} points ·{" "}
                    {selectedPump === "both"
                      ? "Water + Nutrient"
                      : selectedPump === "water"
                        ? "Water Pump"
                        : "Nutrient Pump"}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setIsZoomed(true)}
                  style={[
                    styles.zoomButton,
                    { backgroundColor: safeTheme.colors.primary + "15" },
                  ]}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons
                    name="expand-outline"
                    size={18}
                    color={safeTheme.colors.primary}
                  />
                  <Text
                    style={[
                      styles.zoomButtonText,
                      { color: safeTheme.colors.primary },
                    ]}
                  >
                    Full
                  </Text>
                </TouchableOpacity>
              </View>

              {/* ── Legend ── */}
              <View style={styles.legendContainer}>
                {selectedPump === "water" || selectedPump === "both" ? (
                  <View style={styles.legendItem}>
                    <View
                      style={[styles.legendDot, { backgroundColor: "#2196F3" }]}
                    />
                    <Text
                      style={[
                        styles.legendText,
                        { color: safeTheme.colors.textSecondary },
                      ]}
                    >
                      Water
                    </Text>
                  </View>
                ) : null}
                {selectedPump === "nutrient" || selectedPump === "both" ? (
                  <View style={styles.legendItem}>
                    <View
                      style={[styles.legendDot, { backgroundColor: "#4CAF50" }]}
                    />
                    <Text
                      style={[
                        styles.legendText,
                        { color: safeTheme.colors.textSecondary },
                      ]}
                    >
                      Nutrient
                    </Text>
                  </View>
                ) : null}
              </View>

              <View style={styles.graphWithAxis}>
                <View style={styles.yAxisContainer}>
                  {yLabels.map((label, i) => (
                    <Text
                      key={i}
                      style={[
                        styles.axisLabel,
                        { color: safeTheme.colors.textSecondary },
                      ]}
                    >
                      {label}
                    </Text>
                  ))}
                </View>
                <View style={styles.chartAndXAxis}>
                  <View style={styles.chartArea}>
                    <LineChart
                      data={graphData}
                      color={
                        selectedPump === "water"
                          ? "#2196F3"
                          : selectedPump === "nutrient"
                            ? "#4CAF50"
                            : safeTheme.colors.primary
                      }
                      unit=""
                      width={width - 100}
                      height={200}
                      labelColor={safeTheme.colors.textSecondary}
                    />
                  </View>
                  <View style={styles.xAxisContainer}>
                    {xLabels.map((label, i) => (
                      <Text
                        key={i}
                        style={[
                          styles.axisLabel,
                          { color: safeTheme.colors.textSecondary },
                        ]}
                      >
                        {label}
                      </Text>
                    ))}
                  </View>
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.placeholder}>
              <Ionicons
                name="analytics-outline"
                size={48}
                color={safeTheme.colors.textSecondary}
              />
              <Text
                style={[
                  styles.placeholderText,
                  { color: safeTheme.colors.textSecondary },
                ]}
              >
                No pump data for graph
              </Text>
            </View>
          )}
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
        <View
          style={[
            styles.zoomContainer,
            { backgroundColor: safeTheme.colors.background },
          ]}
        >
          {/* Zoom Header */}
          <View style={styles.zoomHeader}>
            <View style={styles.zoomHeaderLeft}>
              <Text
                style={[styles.zoomTitle, { color: safeTheme.colors.text }]}
              >
                Pump History
              </Text>
              <Text
                style={[
                  styles.zoomSubtitle,
                  { color: safeTheme.colors.textSecondary },
                ]}
              >
                {RANGE_LABELS[timeRange]} · {graphData.length} points
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setIsZoomed(false)}
              style={[
                styles.zoomCloseButton,
                { backgroundColor: safeTheme.colors.surface },
              ]}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons
                name="contract-outline"
                size={22}
                color={safeTheme.colors.primary}
              />
            </TouchableOpacity>
          </View>

          {/* Zoom Stats */}
          <View
            style={[
              styles.zoomStatsRow,
              { backgroundColor: safeTheme.colors.surface },
            ]}
          >
            <View style={styles.zoomStat}>
              <Text
                style={[
                  styles.zoomStatLabel,
                  { color: safeTheme.colors.textSecondary },
                ]}
              >
                Pump
              </Text>
              <Text
                style={[styles.zoomStatValue, { color: safeTheme.colors.text }]}
              >
                {selectedPump === "water"
                  ? "Water"
                  : selectedPump === "nutrient"
                    ? "Nutrient"
                    : "Both"}
              </Text>
            </View>
            <View
              style={[
                styles.zoomStatDivider,
                { backgroundColor: safeTheme.colors.border },
              ]}
            />
            <View style={styles.zoomStat}>
              <Text
                style={[
                  styles.zoomStatLabel,
                  { color: safeTheme.colors.textSecondary },
                ]}
              >
                Points
              </Text>
              <Text
                style={[
                  styles.zoomStatValue,
                  { color: safeTheme.colors.primary },
                ]}
              >
                {graphData.length}
              </Text>
            </View>
            <View
              style={[
                styles.zoomStatDivider,
                { backgroundColor: safeTheme.colors.border },
              ]}
            />
            <View style={styles.zoomStat}>
              <Text
                style={[
                  styles.zoomStatLabel,
                  { color: safeTheme.colors.textSecondary },
                ]}
              >
                Range
              </Text>
              <Text
                style={[styles.zoomStatValue, { color: safeTheme.colors.text }]}
              >
                {RANGE_LABELS[timeRange]}
              </Text>
            </View>
          </View>

          {/* Fullscreen Chart */}
          <View style={styles.zoomChartWrapper}>
            <ZoomableChart
              chartWidth={ZOOM_CHART_WIDTH}
              chartHeight={ZOOM_CHART_HEIGHT}
              background={safeTheme.colors.background}
            >
              <LineChart
                data={graphData}
                color={
                  selectedPump === "water"
                    ? "#2196F3"
                    : selectedPump === "nutrient"
                      ? "#4CAF50"
                      : safeTheme.colors.primary
                }
                unit=""
                width={ZOOM_CHART_WIDTH}
                height={ZOOM_CHART_HEIGHT}
                labelColor={safeTheme.colors.textSecondary}
                xTitle="Time"
                yTitle="State"
                showGradient={true}
                showDots={graphData.length <= 80}
              />
            </ZoomableChart>
          </View>

          {/* Zoom out button */}
          <TouchableOpacity
            onPress={() => setIsZoomed(false)}
            style={[
              styles.zoomOutButton,
              { backgroundColor: safeTheme.colors.primary },
            ]}
          >
            <Ionicons name="contract-outline" size={18} color="#FFF" />
            <Text style={styles.zoomOutButtonText}>Zoom Out</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { padding: 20, paddingBottom: 8 },
  title: { fontSize: 28, fontWeight: "700", marginBottom: 4 },
  subtitle: { fontSize: 14 },

  // ✅ Added error styles
  errorContainer: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 12,
    backgroundColor: "#FFEBEE",
    borderRadius: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  errorText: { fontSize: 14, flex: 1 },
  retryButton: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: "#F44336",
    borderRadius: 4,
  },
  retryText: { color: "#FFF", fontWeight: "600" },

  timeRangeContainer: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 16,
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

  pumpDropdownContainer: {
    paddingHorizontal: 16,
    marginBottom: 12,
    zIndex: 100,
  },
  pumpDropdownButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  pumpDropdownText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
  },
  pumpDropdownMenu: {
    marginTop: 4,
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  pumpDropdownItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0,0,0,0.06)",
  },
  pumpDropdownItemText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
  },

  tabSwitcherContainer: { paddingHorizontal: 16, marginBottom: 12 },
  tabSwitcher: {
    flexDirection: "row",
    borderRadius: 12,
    padding: 4,
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
    marginHorizontal: 16,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    minHeight: 200,
  },

  // Table
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
    flex: 2,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  tableHeaderCellRight: { flex: 1, textAlign: "right" },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0,0,0,0.06)",
  },
  tableRowStriped: { backgroundColor: "rgba(76,175,80,0.04)" },
  tableCell: { flex: 2, fontSize: 13 },
  tableValueCell: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
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

  // Graph
  graphWrapper: { padding: 14, gap: 10 },
  graphSummary: { fontSize: 12, fontWeight: "500", textAlign: "center" },
  legendContainer: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 16,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 11, fontWeight: "600" },

  graphWithAxis: {
    flexDirection: "row",
    alignItems: "stretch",
    marginTop: 4,
  },
  yAxisContainer: {
    justifyContent: "space-between",
    paddingRight: 8,
    paddingVertical: 12,
    width: 50,
  },
  chartAndXAxis: { flex: 1, alignItems: "center" },
  chartArea: { width: "100%" },
  xAxisContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    paddingHorizontal: 8,
    marginTop: 4,
  },
  axisLabel: { fontSize: 10, fontWeight: "500" },

  placeholder: {
    justifyContent: "center",
    alignItems: "center",
    minHeight: 200,
    padding: 16,
    gap: 8,
  },
  placeholderText: { fontSize: 15, fontWeight: "500" },

  graphSummaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  graphSummaryLeft: { flex: 1 },
  zoomButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  zoomButtonText: { fontSize: 12, fontWeight: "600" },

  zoomContainer: { flex: 1, paddingTop: 40 },
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
