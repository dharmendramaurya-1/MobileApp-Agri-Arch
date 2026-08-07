// app/(main)/sensor/SensorDetailScreen.jsx
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Dimensions,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { useHistoricalData } from "../../../src/context/HistoricalDataContext";
import { useMqtt } from "../../../src/context/MqttContext";
import { useTheme } from "../../../src/context/ThemContext";
import { searchSenML } from "../../../src/services/senmlService";

const { width } = Dimensions.get("window");

export default function SensorDetailScreen({ config }) {
  const { theme } = useTheme();
  const { sensorData } = useMqtt();
  const { getSensorWeeklyData, isLoading } = useHistoricalData();
  const [timeRange, setTimeRange] = useState("7d");
  const [historicalData, setHistoricalData] = useState([]);
  const [isChartLoading, setIsChartLoading] = useState(false);

  const liveValue = sensorData[config.dataKey];

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

  // Fetch historical data when component mounts
  useEffect(() => {
    fetchHistoricalData();
    // Run debug on mount
    debugHistoricalData();
  }, [config.dataKey, timeRange]);

  const fetchHistoricalData = async () => {
    setIsChartLoading(true);
    try {
      // ✅ Use the apiName from config
      const sensorName = getSensorName();
      console.log(`📊 Fetching historical data for: ${sensorName}`);
      console.log(`   Config name: ${config.name}`);
      console.log(`   ApiName: ${config.apiName}`);
      
      const data = await getSensorWeeklyData(sensorName);
      console.log(`✅ Received ${data?.length || 0} data points`);
      setHistoricalData(data || []);
    } catch (error) {
      console.error("❌ Error fetching historical data:", error);
    } finally {
      setIsChartLoading(false);
    }
  };

  // Format data for display
  const formatValue = (value) => {
    if (value === null || value === undefined) return "--";
    if (typeof value === 'number') {
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

  const getStatusIcon = (value) => {
    if (value === null || value === undefined) return "help-circle-outline";
    if (config.min !== undefined && value < config.min) return "arrow-down-circle-outline";
    if (config.max !== undefined && value > config.max) return "arrow-up-circle-outline";
    return "checkmark-circle-outline";
  };

  return (
    <ScrollView 
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
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

        {config.min !== undefined && config.max !== undefined && (
          <View style={styles.rangeContainer}>
            <Text style={[styles.rangeText, { color: theme.colors.textSecondary }]}>
              Optimal Range: {config.min} - {config.max} {config.unit}
            </Text>
          </View>
        )}
      </View>

      {/* Historical Data Section - From HTTP */}
      <View style={styles.historicalSection}>
        <View style={styles.historicalHeader}>
          <Text style={[styles.historicalTitle, { color: theme.colors.text }]}>
            📊 Historical Data
          </Text>
          <Text style={[styles.historicalSubtitle, { color: theme.colors.textSecondary }]}>
            Last {timeRange === '7d' ? '7' : timeRange === '1d' ? '24' : '30'} days
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

        {/* Chart / Historical Data Display */}
        <View style={[styles.chartContainer, { backgroundColor: theme.colors.surface }]}>
          {isChartLoading ? (
            <View style={styles.chartPlaceholder}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
              <Text style={[styles.chartPlaceholderText, { color: theme.colors.textSecondary }]}>
                Loading historical data...
              </Text>
            </View>
          ) : historicalData && historicalData.length > 0 ? (
            <View style={styles.dataPointsContainer}>
              <Text style={[styles.dataPointsTitle, { color: theme.colors.text }]}>
                Data Points: {historicalData.length}
              </Text>
              {historicalData.slice(0, 10).map((point, index) => (
                <View key={index} style={styles.dataPoint}>
                  <Text style={[styles.dataPointTime, { color: theme.colors.textSecondary }]}>
                    {point.time ? new Date(point.time).toLocaleDateString() : 'N/A'}
                  </Text>
                  <Text style={[styles.dataPointValue, { color: config.color }]}>
                    {formatValue(point.value)} {point.unit || config.unit}
                  </Text>
                </View>
              ))}
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
          )}
        </View>
      </View>

      {/* Sensor Details */}
      <View style={[styles.detailsCard, { backgroundColor: theme.colors.surface }]}>
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
      </View>
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
  valueCard: {
    marginHorizontal: 16,
    padding: 20,
    borderRadius: 16,
    marginBottom: 16,
  },
  valueRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
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
  timeRangeContainer: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    marginBottom: 12,
    padding: 8,
    borderRadius: 12,
  },
  timeRangeButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  timeRangeText: { fontSize: 12, fontWeight: "600" },
  chartContainer: {
    padding: 16,
    borderRadius: 16,
    minHeight: 200,
  },
  chartPlaceholder: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    minHeight: 180,
    gap: 8,
  },
  chartPlaceholderText: { fontSize: 16, fontWeight: "500" },
  chartPlaceholderSubtext: { fontSize: 12, opacity: 0.7 },
  dataPointsContainer: {
    gap: 8,
  },
  dataPointsTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
  },
  dataPoint: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.05)",
  },
  dataPointTime: { fontSize: 12 },
  dataPointValue: { fontSize: 12, fontWeight: "600" },
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