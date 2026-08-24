// app/(main)/sensor/SensorDetailScreen.jsx
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import LineChart from "../../../components/LineChart";
import { SENSORS, getSensorByKey } from "../../../src/config/sensorConfigs";
import { useMqtt } from "../../../src/context/MqttContext";
import { useScroll, useScrollReset } from "../../../src/context/ScrollContext";
import { useTheme } from "../../../src/context/ThemContext";
import {
  fetchAllSensorHistorical,
  fetchSensorHistorical,
  getSenMLByPublisher,
  searchSenML,
} from "../../../src/services/senmlService";

const { width } = Dimensions.get("window");

const PAGE_SIZE = 10;

// Number of days for each time range option
const RANGE_DAYS = { "1d": 1, "7d": 7, "30d": 30 };
const RANGE_LABELS = { "1d": "Last 24 hours", "7d": "Last 7 days", "30d": "Last 30 days" };

export default function SensorDetailScreen({
  sensorKey,
  config: configProp,
  showHeader = true,
  contentPaddingTop,
}) {
  const { theme } = useTheme();
  const { getSelectedDeviceSensorData, getSelectedDeviceId, getSelectedExternalKey, availableDevices } = useMqtt();
  const sensorData = getSelectedDeviceSensorData();

  // ✅ Dynamic config lookup — prefer sensorKey, fallback to config prop, then first sensor
  const config = (sensorKey ? getSensorByKey(sensorKey) : null) || configProp || SENSORS[0];
  const { onScroll, headerHeight } = useScroll();
  const scrollRef = useRef(null);
  useScrollReset(scrollRef);
  const [timeRange, setTimeRange] = useState("7d");
  const [activeTab, setActiveTab] = useState("table"); // "table" | "graph"

  // Table (paginated) state
  const [tableData, setTableData] = useState([]);
  const [tableTotal, setTableTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [isTableLoading, setIsTableLoading] = useState(false);

  // Graph state
  const [graphData, setGraphData] = useState([]);
  const [isGraphLoading, setIsGraphLoading] = useState(false);

  const liveValue = sensorData[config.dataKey];

  // ✅ Get the selected device's publisher ID (thing ID) and external key
  const selectedDevId = getSelectedDeviceId();
  const selectedExtKey = getSelectedExternalKey();

  const getDevicePublisherAndKey = useCallback(() => {
    // If we have a selected device, find its thing ID from availableDevices
    if (selectedDevId && availableDevices) {
      const device = availableDevices.find(d => d.id === selectedDevId);
      if (device) {
        return {
          publisherId: device.id,
          externalKey: device.external_key || selectedExtKey,
        };
      }
    }

    // Fallback: try to get from context
    return {
      publisherId: selectedDevId,
      externalKey: selectedExtKey,
    };
  }, [selectedDevId, selectedExtKey, availableDevices]);

  // ✅ Get the sensor name for the API - use apiName from config
  const getSensorName = () => {
    // Use the apiName from the config directly
    return config.apiName || config.dataKey;
  };

  // ✅ Debug function
  const debugHistoricalData = async () => {
    console.log("🔍 Debugging Historical Data...");
    console.log("   Config:", config.name);
    console.log("   DataKey:", config.dataKey);
    console.log("   ApiName:", config.apiName);
    
    const timestampNs = 1785627775000000000;
    const timestampMs = timestampNs / 1000000;
    
    console.log("   Timestamp (ms):", timestampMs);
    console.log("   Date:", new Date(timestampMs).toLocaleString());
    
    try {
      const result = await searchSenML({
        from: timestampMs,
        to: timestampMs + 1000,
        limit: 20,
        offset: 0,
      });
      
      console.log("   Result success:", result.success);
      console.log("   Total records:", result.total);
      console.log("   Messages count:", result.messages?.length || 0);
      
      if (result.success && result.messages && result.messages.length > 0) {
        const data = {};
        result.messages.forEach(msg => {
          const name = msg.name ? msg.name.split(':').pop() : 'unknown';
          data[name] = {
            value: msg.value !== undefined ? msg.value : msg.bool_value,
            unit: msg.unit || '',
          };
        });
        console.log("   Available sensors:", Object.keys(data));
        console.log("   Looking for:", config.apiName);
        console.log("   Found:", data[config.apiName] ? "✅ Yes" : "❌ No");
      }
    } catch (error) {
      console.error("   Debug error:", error);
    }
  };

  const getSensorData = async () => {
    const result = await getSenMLByPublisher();
    console.log("🔍 Debugging getSenMLByPublisher...");
    console.log("data", result.data);

    if (result.success) {
      console.log("SenML data:", result.data);
    } else {
      console.error("Error:", result.error);
    }
  };

  // Compute the from/to window for the selected time range
  const getTimeWindow = useCallback(() => {
  const days = RANGE_DAYS[timeRange] || 7;

  const toMs = Date.now();
  const fromMs = toMs - days * 24 * 60 * 60 * 1000;

  // Return milliseconds — fetchSensorHistorical handles ns conversion
  return { from: fromMs, to: toMs };
}, [timeRange]);

  // Fetch one page of the historical table
  const fetchTablePage = useCallback(
    async (page) => {
      setIsTableLoading(true);
      try {
        const { from, to } = getTimeWindow();
        const { publisherId, externalKey } = getDevicePublisherAndKey();
        
        console.log(`📡 fetchTablePage: page=${page}, sensor=${getSensorName()}, publisher=${publisherId}, extKey=${externalKey}`);
        console.log(`   Time range: ${new Date(from).toLocaleString()} → ${new Date(to).toLocaleString()}`);
        
        const result = await fetchSensorHistorical({
          sensorKey: getSensorName(),
          from,
          to,
          limit: PAGE_SIZE,
          offset: (page - 1) * PAGE_SIZE,
          publisherId,
          externalKey,
        });

        console.log(`📊 Result: ${result.data.length} rows, total=${result.total}, page=${page}, sensor=${getSensorName()}, success=${result.success}`);
        if (result.success) {
          setTableData(result.data);
          setTableTotal(result.total);
          setCurrentPage(page);
        } else {
          console.error("❌ Error fetching historical table:", result.error);
          setTableData([]);
          setTableTotal(0);
        }
      } catch (error) {
        console.error("❌ Error fetching historical table:", error);
        setTableData([]);
        setTableTotal(0);
      } finally {
        setIsTableLoading(false);
      }
    },
    [getTimeWindow, getDevicePublisherAndKey]
  );

  // Fetch ALL data points in the range for the graph
  const fetchGraphData = useCallback(async () => {
    setIsGraphLoading(true);
    try {
      const { from, to } = getTimeWindow();
      const { publisherId, externalKey } = getDevicePublisherAndKey();
      const result = await fetchAllSensorHistorical({
        sensorKey: getSensorName(),
        from,
        to,
        pageSize: 100,
        publisherId,
        externalKey,
      });

      if (result.success) {
        setGraphData(result.data);
      } else {
        console.error("❌ Error fetching historical graph:", result.error);
        setGraphData([]);
      }
    } catch (error) {
      console.error("❌ Error fetching historical graph:", error);
      setGraphData([]);
    } finally {
      setIsGraphLoading(false);
    }
  }, [getTimeWindow, getDevicePublisherAndKey]);

  // Fetch data when the sensor, time range, or selected device changes
  useEffect(() => {
    fetchTablePage(1);
    fetchGraphData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.dataKey, timeRange, selectedDevId, selectedExtKey]);

  // Format data for display
  const formatValue = (value) => {
    if (value === null || value === undefined) return "--";
    if (typeof value === 'number') {
      return Number.isInteger(value) ? String(value) : value.toFixed(1);
    }
    return String(value);
  };

  const formatTime = (ms) => {
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

  const getStatusIcon = (value) => {
    if (value === null || value === undefined) return "help-circle-outline";
    if (config.min !== undefined && value < config.min) return "arrow-down-circle-outline";
    if (config.max !== undefined && value > config.max) return "arrow-up-circle-outline";
    return "checkmark-circle-outline";
  };

  const totalPages = Math.max(1, Math.ceil(tableTotal / PAGE_SIZE));
  const startIndex = tableTotal > 0 ? (currentPage - 1) * PAGE_SIZE + 1 : 0;
  const endIndex = Math.min(currentPage * PAGE_SIZE, tableTotal);

  return (
    <ScrollView 
      ref={scrollRef}
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingTop: contentPaddingTop ?? headerHeight }}
      onScroll={onScroll}
      scrollEventThrottle={16}
    >
      {/* Header (hidden when embedded in the sensor-tabs screen) */}
      {showHeader && (
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
            {config.name}
          </Text>
          <View style={{ width: 40 }} />
        </View>
      )}

      {/* Main Value Display - Real-time from MQTT */}
      <View style={[styles.valueCard, { backgroundColor: theme.colors.surface }]}>
        <View style={styles.valueRow}>
          <Text style={[styles.valueLabel, { color: theme.colors.textSecondary }]}>
            {config.location} (Live)
          </Text>
          <View style={[styles.statusBadge, { 
            backgroundColor: getStatusColor(liveValue) + '20' 
          }]}>
            <Ionicons 
              name={getStatusIcon(liveValue)} 
              size={16} 
              color={getStatusColor(liveValue)} 
            />
            <Text style={[styles.statusText, { color: getStatusColor(liveValue) }]}>
              {getStatusText(liveValue)}
            </Text>
          </View>
        </View>

        <View style={styles.mainValueContainer}>
          <Text style={[styles.mainValue, { color: theme.colors.text }]}>
            {formatValue(liveValue)}
          </Text>
          <Text style={[styles.mainUnit, { color: theme.colors.textSecondary }]}>
            {config.unit}
          </Text>
        </View>

        {/* {config.min !== undefined && config.max !== undefined && (
          <View style={styles.rangeContainer}>
            <Text style={[styles.rangeText, { color: theme.colors.textSecondary }]}>
              Optimal Range: {config.min} - {config.max} {config.unit}
            </Text>
          </View>
        )} */}
      </View>

      {/* Historical Data Section - From HTTP */}
      <View style={styles.historicalSection}>
        <View style={styles.historicalHeader}>
          <Text style={[styles.historicalTitle, { color: theme.colors.text }]}>
            📊 Historical Data
          </Text>
          <Text style={[styles.historicalSubtitle, { color: theme.colors.textSecondary }]}>
            {RANGE_LABELS[timeRange]}
          </Text>
        </View>

        {/* Time Range Selector */}
        <View style={styles.timeRangeContainer}>
          {["1d", "7d", "30d"].map((range) => (
            <TouchableOpacity
              key={range}
              style={[
                styles.timeRangeButton,
                timeRange === range && { backgroundColor: theme.colors.primary },
              ]}
              onPress={() => setTimeRange(range)}
            >
              <Text
                style={[
                  styles.timeRangeText,
                  { color: timeRange === range ? "#FFF" : theme.colors.textSecondary },
                ]}
              >
                {range === '1d' ? '24h' : range === '7d' ? '7d' : '30d'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Tab Switcher: Table | Graph */}
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
            activeOpacity={0.7}
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
            activeOpacity={0.7}
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

        {/* Tab Content */}
        <View style={[styles.chartContainer, { backgroundColor: theme.colors.surface }]}>
          {activeTab === "table" ? (
            /* ── Table Tab (paginated) ─────────────────────────────── */
            isTableLoading ? (
              <View style={styles.chartPlaceholder}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
                <Text style={[styles.chartPlaceholderText, { color: theme.colors.textSecondary }]}>
                  Loading table data...
                </Text>
              </View>
            ) : tableData.length > 0 ? (
              <>
                {/* Table header */}
                <View style={styles.tableHeaderRow}>
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
                </View>

                {/* Table rows */}
                {tableData.map((point, index) => (
                  <View
                    key={`${point.time}-${index}`}
                    style={[
                      styles.tableRow,
                      index % 2 === 1 && styles.tableRowStriped,
                    ]}
                  >
                    <Text style={[styles.tableCell, { color: theme.colors.text }]}>
                      {formatTime(point.time)}
                    </Text>
                    <View style={styles.tableValueCell}>
                      <Text style={[styles.tableValue, { color: getStatusColor(point.value) }]}>
                        {formatValue(point.value)}
                      </Text>
                      <Text style={[styles.tableUnit, { color: theme.colors.textSecondary }]}>
                        {point.unit || config.unit}
                      </Text>
                    </View>
                  </View>
                ))}

                {/* Pagination footer */}
                <View style={styles.paginationFooter}>
                  <TouchableOpacity
                    style={[
                      styles.pageButton,
                      currentPage <= 1 && { opacity: 0.4 },
                    ]}
                    disabled={currentPage <= 1}
                    onPress={() => fetchTablePage(currentPage - 1)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="chevron-back" size={16} color={theme.colors.primary} />
                    <Text style={[styles.pageButtonText, { color: theme.colors.primary }]}>
                      Prev
                    </Text>
                  </TouchableOpacity>

                  <View style={styles.pageInfo}>
                    <Text style={[styles.pageInfoText, { color: theme.colors.text }]}>
                      Page {currentPage} of {totalPages}
                    </Text>
                    <Text style={[styles.pageInfoSub, { color: theme.colors.textSecondary }]}>
                      {tableTotal > 0
                        ? `Showing ${startIndex}-${endIndex} of ${tableTotal}`
                        : "No records"}
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={[
                      styles.pageButton,
                      currentPage >= totalPages && { opacity: 0.4 },
                    ]}
                    disabled={currentPage >= totalPages}
                    onPress={() => fetchTablePage(currentPage + 1)}
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
              <View style={styles.chartPlaceholder}>
                <Ionicons name="analytics-outline" size={48} color={theme.colors.textSecondary} />
                <Text style={[styles.chartPlaceholderText, { color: theme.colors.textSecondary }]}>
                  No historical data available
                </Text>
                <Text style={[styles.chartPlaceholderSubtext, { color: theme.colors.textSecondary }]}>
                  Data will appear here once available
                </Text>
              </View>
            )
          ) : (
            /* ── Graph Tab (all data) ──────────────────────────────── */
            isGraphLoading ? (
              <View style={styles.chartPlaceholder}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
                <Text style={[styles.chartPlaceholderText, { color: theme.colors.textSecondary }]}>
                  Loading graph data...
                </Text>
              </View>
            ) : graphData.length > 0 ? (
              <View style={styles.graphWrapper}>
                <Text style={[styles.graphSummary, { color: theme.colors.textSecondary }]}>
                  {graphData.length} data points ·{" "}
                  {formatValue(Math.min(...graphData.map((d) => d.value)))} -{" "}
                  {formatValue(Math.max(...graphData.map((d) => d.value)))} {config.unit}
                </Text>
                <LineChart
                  data={graphData}
                  color={config.color}
                  unit={config.unit}
                  width={width - 60}
                  height={240}
                  labelColor={theme.colors.textSecondary}
                />
              </View>
            ) : (
              <View style={styles.chartPlaceholder}>
                <Ionicons name="analytics-outline" size={48} color={theme.colors.textSecondary} />
                <Text style={[styles.chartPlaceholderText, { color: theme.colors.textSecondary }]}>
                  No historical data available
                </Text>
                <Text style={[styles.chartPlaceholderSubtext, { color: theme.colors.textSecondary }]}>
                  Data will appear here once available
                </Text>
              </View>
            )
          )}
        </View>
      </View>

      {/* Sensor Details */}
      {/* <View style={[styles.detailsCard, { backgroundColor: theme.colors.surface }]}>
        <Text style={[styles.detailsTitle, { color: theme.colors.text }]}>
          Sensor Details
        </Text>
        
        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, { color: theme.colors.textSecondary }]}>Name</Text>
          <Text style={[styles.detailValue, { color: theme.colors.text }]}>{config.name}</Text>
        </View>
        
        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, { color: theme.colors.textSecondary }]}>Location</Text>
          <Text style={[styles.detailValue, { color: theme.colors.text }]}>{config.location}</Text>
        </View>
        
        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, { color: theme.colors.textSecondary }]}>Unit</Text>
          <Text style={[styles.detailValue, { color: theme.colors.text }]}>{config.unit}</Text>
        </View>
        
        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, { color: theme.colors.textSecondary }]}>API Name</Text>
          <Text style={[styles.detailValue, { color: theme.colors.text }]}>{config.apiName || 'N/A'}</Text>
        </View>
        
        {config.min !== undefined && config.max !== undefined && (
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: theme.colors.textSecondary }]}>Optimal Range</Text>
            <Text style={[styles.detailValue, { color: theme.colors.text }]}>
              {config.min} - {config.max} {config.unit}
            </Text>
          </View>
        )}
        
        {config.description && (
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: theme.colors.textSecondary }]}>Description</Text>
            <Text style={[styles.detailValue, { color: theme.colors.text }]}>
              {config.description}
            </Text>
          </View>
        )}
      </View> */}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 20,
  },
  backButton: { padding: 8 },
  headerTitle: { fontSize: 20, fontWeight: "700" },

  /* ── Live value card ───────────────────────────────────────────── */
  valueCard: {
    marginHorizontal: 0,
    padding: 10,
    // borderRadius: 16,
    marginBottom: 4,
  },
  valueRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 0,
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
  mainValue: { fontSize: 48, fontWeight: "700" },
  mainUnit: { fontSize: 18, fontWeight: "500" },
  rangeContainer: { marginTop: 12 },
  rangeText: { fontSize: 14 },

  /* ── Historical section ────────────────────────────────────────── */
  historicalSection: {
    marginHorizontal: 16,
    marginBottom: 16,
  },
  historicalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  historicalTitle: { fontSize: 18, fontWeight: "700" },
  historicalSubtitle: { fontSize: 12 },

  /* ── Time range pills ──────────────────────────────────────────── */
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

  /* ── Table / Graph tab switcher ────────────────────────────────── */
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

  /* ── Content card (shared by table & graph) ────────────────────── */
  chartContainer: {
    padding: 0,
    borderRadius: 16,
    overflow: "hidden",
    minHeight: 220,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  chartPlaceholder: {
    justifyContent: "center",
    alignItems: "center",
    minHeight: 180,
    padding: 16,
    gap: 8,
  },
  chartPlaceholderText: { fontSize: 15, fontWeight: "500" },
  chartPlaceholderSubtext: { fontSize: 12, opacity: 0.6 },

  /* ── Table styles ──────────────────────────────────────────────── */
  tableHeaderRow: {
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
  tableHeaderCellRight: {
    flex: 1,
    textAlign: "right",
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0,0,0,0.06)",
  },
  tableRowStriped: {
    backgroundColor: "rgba(76,175,80,0.04)",
  },
  tableCell: {
    flex: 2,
    fontSize: 13,
    lineHeight: 18,
  },
  tableValueCell: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "baseline",
    gap: 4,
  },
  tableValue: { fontSize: 15, fontWeight: "700" },
  tableUnit: { fontSize: 11, fontWeight: "500" },

  /* ── Pagination ────────────────────────────────────────────────── */
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

  /* ── Graph wrapper ─────────────────────────────────────────────── */
  graphWrapper: {
    alignItems: "stretch",
    padding: 14,
    gap: 10,
  },
  graphSummary: {
    fontSize: 12,
    fontWeight: "500",
    marginBottom: 4,
  },

  /* ── Sensor details card ───────────────────────────────────────── */
  detailsCard: {
    marginHorizontal: 16,
    padding: 16,
    borderRadius: 16,
    marginBottom: 20,
  },
  detailsTitle: { fontSize: 16, fontWeight: "700", marginBottom: 12 },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.05)",
  },
  detailLabel: { fontSize: 14 },
  detailValue: { fontSize: 14, fontWeight: "600" },
});