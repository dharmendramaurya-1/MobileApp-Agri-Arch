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
import { useScroll, useScrollReset } from "../../src/context/ScrollContext";
import { useTheme } from "../../src/context/ThemContext";
import { useMqtt } from "../../src/context/MqttContext";
import {
  fetchAllSensorHistorical,
  downsampleData,
} from "../../src/services/senmlService";
import { parseDeviceStatus } from "../../src/utils/deviceStatusParser";
import LineChart from "../../components/LineChart";

const { width } = Dimensions.get("window");
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

interface PumpEvent {
  id: string;
  time: number;
  waterPump: boolean;
  nutrientPump: boolean;
  rawStatus: number;
}

export default function PumpHistory() {
  const { theme } = useTheme();
  const { onScroll, headerHeight } = useScroll();
  const scrollRef = useRef(null);
  useScrollReset(scrollRef);
  const {
    getSelectedDeviceId,
    getSelectedExternalKey,
    availableDevices,
  } = useMqtt();

  const [timeRange, setTimeRange] = useState("7d");
  const [activeTab, setActiveTab] = useState<"table" | "graph">("table");
  const [allTableData, setAllTableData] = useState<PumpEvent[]>([]);
  const [graphData, setGraphData] = useState<any[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [isTableLoading, setIsTableLoading] = useState(false);
  const [isGraphLoading, setIsGraphLoading] = useState(false);
  const [selectedPump, setSelectedPump] = useState<"water" | "nutrient" | "both">("both");
  const [isZoomed, setIsZoomed] = useState(false);

  const getDevicePublisherAndKey = useCallback(() => {
    const selectedDevId = getSelectedDeviceId();
    const selectedExtKey = getSelectedExternalKey();
    if (selectedDevId && availableDevices) {
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
            const parsed = parseDeviceStatus(d.value);
            return {
              id: `${d.time}-${idx}`,
              time: d.time,
              waterPump: parsed.waterPump,
              nutrientPump: parsed.nutrientPump,
              rawStatus: d.value,
            };
          });

        setAllTableData(downsampleData(events, MAX_TABLE_ROWS));

        // Build graph data: water pump = 1/0, nutrient pump = 1/0
        const graphPoints = events.map((e) => ({
          time: e.time,
          value:
            selectedPump === "water"
              ? e.waterPump ? 1 : 0
              : selectedPump === "nutrient"
              ? e.nutrientPump ? 1 : 0
              : (e.waterPump ? 1 : 0) + (e.nutrientPump ? 2 : 0),
        }));
        setGraphData(downsampleData(graphPoints, MAX_GRAPH_POINTS));
      } else {
        setAllTableData([]);
        setGraphData([]);
      }
    } catch (error) {
      console.error("Pump history fetch error:", error);
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
    safePage * PAGE_SIZE
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

  // Graph axis labels
  const { xLabels, yLabels } = useMemo(() => {
    if (graphData.length < 2) return { xLabels: [], yLabels: [] };
    const yLabs =
      selectedPump === "both"
        ? ["OFF", "Water", "Nutrient", "Both"]
        : ["OFF", "ON"];
    const indices = [
      0,
      Math.floor(graphData.length / 2),
      graphData.length - 1,
    ];
    const xLabs = indices.map((i) => {
      const d = new Date(graphData[i].time);
      return timeRange === "1h"
        ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : d.toLocaleDateString();
    });
    return { xLabels: xLabs, yLabels: yLabs };
  }, [graphData, selectedPump, timeRange]);

  return (
    <>
    <ScrollView
      ref={scrollRef}
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={{ paddingTop: headerHeight }}
      onScroll={onScroll}
      scrollEventThrottle={16}
    >
      {/* ── HEADER ── */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.colors.text }]}>
          Pump History
        </Text>
        <Text
          style={[styles.subtitle, { color: theme.colors.textSecondary }]}
        >
          {RANGE_LABELS[timeRange]}
        </Text>
      </View>

      {/* ── TIME RANGE FILTERS ── */}
      <View style={styles.timeRangeContainer}>
        {["1h", "1d", "7d", "30d"].map((range) => (
          <TouchableOpacity
            key={range}
            style={[
              styles.timeRangeButton,
              timeRange === range && {
                backgroundColor: theme.colors.primary,
                borderColor: theme.colors.primary,
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
                      : theme.colors.textSecondary,
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

      {/* ── PUMP SELECTOR ── */}
      <View style={styles.pumpSelector}>
        {(["water", "nutrient", "both"] as const).map((pump) => (
          <TouchableOpacity
            key={pump}
            style={[
              styles.pumpSelectorButton,
              selectedPump === pump && {
                backgroundColor:
                  pump === "water"
                    ? "#2196F320"
                    : pump === "nutrient"
                    ? "#4CAF5020"
                    : theme.colors.primary + "20",
                borderColor:
                  pump === "water"
                    ? "#2196F3"
                    : pump === "nutrient"
                    ? "#4CAF50"
                    : theme.colors.primary,
              },
            ]}
            onPress={() => setSelectedPump(pump)}
          >
            <Ionicons
              name={
                pump === "water"
                  ? "water"
                  : pump === "nutrient"
                  ? "leaf"
                  : "layers"
              }
              size={14}
              color={
                selectedPump === pump
                  ? pump === "water"
                    ? "#2196F3"
                    : pump === "nutrient"
                    ? "#4CAF50"
                    : theme.colors.primary
                  : theme.colors.textSecondary
              }
            />
            <Text
              style={[
                styles.pumpSelectorText,
                {
                  color:
                    selectedPump === pump
                      ? theme.colors.text
                      : theme.colors.textSecondary,
                },
              ]}
            >
              {pump === "water"
                ? "Water"
                : pump === "nutrient"
                ? "Nutrient"
                : "Both"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── TAB SWITCHER ── */}
      <View style={styles.tabSwitcherContainer}>
        <View
          style={[
            styles.tabSwitcher,
            { backgroundColor: theme.colors.surfaceVariant },
          ]}
        >
          <TouchableOpacity
            style={[
              styles.tabButton,
              activeTab === "table" && { backgroundColor: theme.colors.surface },
            ]}
            onPress={() => setActiveTab("table")}
          >
            <Ionicons
              name="list-outline"
              size={16}
              color={
                activeTab === "table"
                  ? theme.colors.primary
                  : theme.colors.textSecondary
              }
            />
            <Text
              style={[
                styles.tabButtonText,
                {
                  color:
                    activeTab === "table"
                      ? theme.colors.primary
                      : theme.colors.textSecondary,
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
              activeTab === "graph" && { backgroundColor: theme.colors.surface },
            ]}
            onPress={() => setActiveTab("graph")}
          >
            <Ionicons
              name="trending-up-outline"
              size={16}
              color={
                activeTab === "graph"
                  ? theme.colors.primary
                  : theme.colors.textSecondary
              }
            />
            <Text
              style={[
                styles.tabButtonText,
                {
                  color:
                    activeTab === "graph"
                      ? theme.colors.primary
                      : theme.colors.textSecondary,
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
              <ActivityIndicator size="large" color={theme.colors.primary} />
              <Text
                style={[
                  styles.placeholderText,
                  { color: theme.colors.textSecondary },
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
                    { color: theme.colors.textSecondary },
                  ]}
                >
                  Date &amp; Time
                </Text>
                {selectedPump === "water" || selectedPump === "both" ? (
                  <Text
                    style={[
                      styles.tableHeaderCell,
                      styles.tableHeaderCellRight,
                      { color: theme.colors.textSecondary },
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
                      { color: theme.colors.textSecondary },
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
                    style={[styles.tableCell, { color: theme.colors.text }]}
                    numberOfLines={1}
                  >
                    {formatTime(event.time)}
                  </Text>
                  {selectedPump === "water" || selectedPump === "both" ? (
                    <View style={styles.tableValueCell}>
                      <View
                        style={[
                          styles.statusDot,
                          { backgroundColor: getStatusColor(event.waterPump) },
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
                              event.nutrientPump
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
                    color={theme.colors.primary}
                  />
                  <Text
                    style={[
                      styles.pageButtonText,
                      { color: theme.colors.primary },
                    ]}
                  >
                    Prev
                  </Text>
                </TouchableOpacity>
                <View style={styles.pageInfo}>
                  <Text
                    style={[
                      styles.pageInfoText,
                      { color: theme.colors.text },
                    ]}
                  >
                    Page {safePage} of {totalPages}
                  </Text>
                  <Text
                    style={[
                      styles.pageInfoSub,
                      { color: theme.colors.textSecondary },
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
                      { color: theme.colors.primary },
                    ]}
                  >
                    Next
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={16}
                    color={theme.colors.primary}
                  />
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <View style={styles.placeholder}>
              <Ionicons
                name="water-outline"
                size={48}
                color={theme.colors.textSecondary}
              />
              <Text
                style={[
                  styles.placeholderText,
                  { color: theme.colors.textSecondary },
                ]}
              >
                No pump history data
              </Text>
            </View>
          )
        ) : (
          // ── GRAPH TAB ──
          isGraphLoading ? (
            <View style={styles.placeholder}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
              <Text
                style={[
                  styles.placeholderText,
                  { color: theme.colors.textSecondary },
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
                      { color: theme.colors.textSecondary },
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
                  style={[styles.zoomButton, { backgroundColor: theme.colors.primary + "15" }]}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="expand-outline" size={18} color={theme.colors.primary} />
                  <Text style={[styles.zoomButtonText, { color: theme.colors.primary }]}>Full</Text>
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
                        { color: theme.colors.textSecondary },
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
                        { color: theme.colors.textSecondary },
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
                        { color: theme.colors.textSecondary },
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
                          : theme.colors.primary
                      }
                      unit=""
                      width={width - 100}
                      height={200}
                      labelColor={theme.colors.textSecondary}
                    />
                  </View>
                  <View style={styles.xAxisContainer}>
                    {xLabels.map((label, i) => (
                      <Text
                        key={i}
                        style={[
                          styles.axisLabel,
                          { color: theme.colors.textSecondary },
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
                color={theme.colors.textSecondary}
              />
              <Text
                style={[
                  styles.placeholderText,
                  { color: theme.colors.textSecondary },
                ]}
              >
                No pump data for graph
              </Text>
            </View>
          )
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
        <View style={[styles.zoomContainer, { backgroundColor: theme.colors.background }]}>
          {/* Zoom Header */}
          <View style={styles.zoomHeader}>
            <View style={styles.zoomHeaderLeft}>
              <Text style={[styles.zoomTitle, { color: theme.colors.text }]}>
                Pump History
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
              <Text style={[styles.zoomStatLabel, { color: theme.colors.textSecondary }]}>Pump</Text>
              <Text style={[styles.zoomStatValue, { color: theme.colors.text }]}>
                {selectedPump === "water" ? "Water" : selectedPump === "nutrient" ? "Nutrient" : "Both"}
              </Text>
            </View>
            <View style={[styles.zoomStatDivider, { backgroundColor: theme.colors.border }]} />
            <View style={styles.zoomStat}>
              <Text style={[styles.zoomStatLabel, { color: theme.colors.textSecondary }]}>Points</Text>
              <Text style={[styles.zoomStatValue, { color: theme.colors.primary }]}>
                {graphData.length}
              </Text>
            </View>
            <View style={[styles.zoomStatDivider, { backgroundColor: theme.colors.border }]} />
            <View style={styles.zoomStat}>
              <Text style={[styles.zoomStatLabel, { color: theme.colors.textSecondary }]}>Range</Text>
              <Text style={[styles.zoomStatValue, { color: theme.colors.text }]}>
                {RANGE_LABELS[timeRange]}
              </Text>
            </View>
          </View>

          {/* Fullscreen Chart */}
          <View style={styles.zoomChartWrapper}>
            <View style={styles.zoomChartInner}>
              <LineChart
                data={graphData}
                color={selectedPump === "water" ? "#2196F3" : selectedPump === "nutrient" ? "#4CAF50" : theme.colors.primary}
                unit=""
                width={height - 80}
                height={width - 60}
                labelColor={theme.colors.textSecondary}
                xTitle="Time"
                yTitle="State"
                showGradient={true}
                showDots={graphData.length <= 80}
              />
            </View>
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


const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { padding: 20, paddingBottom: 8 },
  title: { fontSize: 28, fontWeight: "700", marginBottom: 4 },
  subtitle: { fontSize: 14 },

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

  pumpSelector: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  pumpSelectorButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "rgba(0,0,0,0.08)",
  },
  pumpSelectorText: { fontSize: 12, fontWeight: "600" },

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
  zoomChartInner: { alignItems: "center", justifyContent: "center" },
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
