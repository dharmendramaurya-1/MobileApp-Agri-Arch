// components/LiveChartCard.jsx
// ─────────────────────────────────────────────────────────────────────────────
// A self-contained "Live · last 10 min" card that renders a real-time MQTT
// series and lets the user open it fullscreen with pinch-to-zoom + drag.
//
// Data contract: `points` is an array of { time, value } that updates as MQTT
// messages arrive. When `points` is empty a "waiting for live data" state is
// shown instead of a chart. The fullscreen modal is identical in spirit to the
// existing zoom modals and reuses <ZoomableChart> for pinch/drag.
// ─────────────────────────────────────────────────────────────────────────────
import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import {
  Dimensions,
  Modal,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import LineChart from "./LineChart";
import ZoomableChart from "./ZoomableChart";

const { width, height } = Dimensions.get("window");

const PAD = 16; // card outer margin
const INNER_PAD = 14; // card inner padding
const INLINE_W = width - PAD * 2 - INNER_PAD * 2;

// Fullscreen modal draws the chart wider than the screen so pinch/drag has
// somewhere to go (same approach as the other zoom modals).
const ZOOM_CHART_WIDTH = height - 100;
const ZOOM_CHART_HEIGHT = width - 60;

function formatClock(ms) {
  if (!ms) return "--:--:--";
  const d = new Date(ms);
  return d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatStatValue(v) {
  if (v === null || v === undefined) return "--";
  if (typeof v === "number") {
    return Number.isInteger(v) ? String(v) : v.toFixed(1);
  }
  return String(v);
}

/**
 * @param {object} props
 * @param {string} props.title            e.g. "Ambient Temperature"
 * @param {string} props.subtitle         small line under the title
 * @param {string} props.color            chart accent color
 * @param {string} props.unit             sensor unit ("" for pump states)
 * @param {Array<{time:number,value:number}>} props.points live points
 * @param {object} props.themeColors      theme.colors (text, surface, primary…)
 * @param {number} [props.chartWidth]     inline chart width (default fits screen)
 * @param {number} [props.chartHeight]    inline chart height
 * @param {string} [props.emptyText]
 * @param {Array<{label:string,value:string,color?:string}>} [props.stats]
 *        rows for the fullscreen modal (defaults to Min / Avg / Max)
 * @param {number} [props.dotsLimit]      max points before dots are hidden
 */
export default function LiveChartCard({
  title,
  subtitle,
  color,
  unit,
  points = [],
  themeColors,
  chartWidth = INLINE_W,
  chartHeight = 210,
  emptyText = "Waiting for live MQTT data…",
  stats,
  dotsLimit = 80,
}) {
  const [isZoomed, setIsZoomed] = useState(false);

  const lastTime = points.length ? points[points.length - 1].time : null;

  const defaultStats = useMemo(() => {
    if (!points.length) return [];
    const values = points.map((p) => p.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const avg = values.reduce((s, v) => s + v, 0) / values.length;
    return [
      { label: "Min", value: `${formatStatValue(min)} ${unit}`.trim(), color: "#F44336" },
      { label: "Avg", value: `${formatStatValue(avg)} ${unit}`.trim(), color: themeColors.primary },
      { label: "Max", value: `${formatStatValue(max)} ${unit}`.trim(), color: "#4CAF50" },
    ];
  }, [points, unit, themeColors.primary]);

  const statRows = stats || defaultStats;
  const canZoom = points.length > 1;
  const showDots = points.length <= dotsLimit;

  const liveDotColor = points.length ? "#F44336" : "#9E9E9E";

  return (
    <>
      {/* ── Card ── */}
      <View
        style={[
          styles.card,
          {
            backgroundColor: themeColors.surface,
            borderColor: "rgba(0,0,0,0.06)",
          },
        ]}
      >
        {/* Header */}
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <View style={[styles.liveDot, { backgroundColor: liveDotColor }]} />
            <View style={{ flex: 1 }}>
              <Text
                style={[styles.cardTitle, { color: themeColors.text }]}
                numberOfLines={1}
              >
                {title}
              </Text>
              {/* <Text
                style={[
                  styles.cardSubtitle,
                  { color: themeColors.textSecondary },
                ]}
                numberOfLines={1}
              >
                {subtitle || "LIVE · last 10 min"}
              </Text> */}
            </View>
          </View>

          <View style={styles.cardHeaderRight}>
            <View style={styles.headerStats}>
              <Text style={[styles.pointCount, { color: themeColors.text }]}>
                {points.length}
              </Text>
              <Text
                style={[styles.pointCountLabel, { color: themeColors.textSecondary }]}
              >
                pts
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => canZoom && setIsZoomed(true)}
              disabled={!canZoom}
              style={[
                styles.zoomButton,
                { backgroundColor: `${color}15` },
                !canZoom && { opacity: 0.35 },
              ]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="expand-outline" size={16} color={color} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Timestamp line */}
        <View style={styles.timestampRow}>
          <Text style={[styles.timestamp, { color: themeColors.textSecondary }]}>
            Live window · updated {formatClock(lastTime)}
          </Text>
        </View>

        {/* Chart or waiting state */}
        {points.length > 1 ? (
          <LineChart
            data={points}
            color={color}
            unit=""
            width={chartWidth}
            height={chartHeight}
            labelColor={themeColors.textSecondary}
            xTitle="Time"
            yTitle={unit || "Value"}
            showGradient
            showDots={showDots}
          />
        ) : (
          <View style={[styles.empty, { height: chartHeight }]}>
            <View style={[styles.liveDot, { backgroundColor: "#F44336" }]} />
            <Text style={[styles.emptyText, { color: themeColors.textSecondary }]}>
              {points.length === 0
                ? emptyText
                : "Collecting data — need 2 points to draw…"}
            </Text>
          </View>
        )}
      </View>

      {/* ── Fullscreen zoom modal ── */}
      <Modal
        visible={isZoomed}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setIsZoomed(false)}
      >
        <StatusBar hidden />
        <View style={[styles.zoomContainer, { backgroundColor: themeColors.background }]}>
          {/* Zoom header */}
          <View style={styles.zoomHeader}>
            <View style={styles.zoomHeaderLeft}>
              <Text style={[styles.zoomTitle, { color: themeColors.text }]} numberOfLines={1}>
                {title}
              </Text>
              {/* <Text style={[styles.zoomSubtitle, { color: themeColors.textSecondary }]}>
                {subtitle || "LIVE"} · last 10 min · {points.length} points · updated{" "}
                {formatClock(lastTime)}
              </Text> */}
            </View>
            <TouchableOpacity
              onPress={() => setIsZoomed(false)}
              style={[styles.zoomCloseButton, { backgroundColor: themeColors.surface }]}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="close" size={22} color={themeColors.primary} />
            </TouchableOpacity>
          </View>

          {/* Stats */}
          {statRows.length > 0 && (
            <View style={[styles.zoomStatsRow, { backgroundColor: themeColors.surface }]}>
              {statRows.map((row, i) => (
                <View key={row.label} style={styles.zoomStatWrap}>
                  {i > 0 && (
                    <View
                      style={[styles.zoomStatDivider, { backgroundColor: themeColors.border }]}
                    />
                  )}
                  <View style={styles.zoomStat}>
                    <Text style={[styles.zoomStatLabel, { color: themeColors.textSecondary }]}>
                      {row.label}
                    </Text>
                    <Text style={[styles.zoomStatValue, { color: row.color || themeColors.text }]}>
                      {row.value}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Fullscreen chart with pinch + drag */}
          <View style={styles.zoomChartWrapper}>
            <Text style={[styles.zoomAxisTitle, { color: themeColors.textSecondary }]}>
              ↑ {unit || "Value"}
            </Text>
            <ZoomableChart
              chartWidth={ZOOM_CHART_WIDTH}
              chartHeight={ZOOM_CHART_HEIGHT}
              background={themeColors.background}
            >
              <LineChart
                data={points}
                color={color}
                unit=""
                width={ZOOM_CHART_WIDTH}
                height={ZOOM_CHART_HEIGHT}
                labelColor={themeColors.textSecondary}
                xTitle="Time"
                yTitle={unit || "Value"}
                showGradient
                showDots={points.length <= 80}
              />
            </ZoomableChart>
            <Text style={[styles.zoomAxisTitle, { color: themeColors.textSecondary }]}>
              Time →
            </Text>
          </View>

          {/* Zoom out */}
          <TouchableOpacity
            onPress={() => setIsZoomed(false)}
            style={[styles.zoomOutButton, { backgroundColor: themeColors.primary }]}
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
  card: {
    marginHorizontal: PAD,
    padding: INNER_PAD,
    borderRadius: 16,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  cardHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 8,
  },
  liveDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
  },
  cardTitle: { fontSize: 15, fontWeight: "700" },
  cardSubtitle: { fontSize: 11, fontWeight: "500", marginTop: 1 },
  cardHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerStats: { flexDirection: "row", alignItems: "baseline", gap: 3 },
  pointCount: { fontSize: 15, fontWeight: "800" },
  pointCountLabel: { fontSize: 10, fontWeight: "600" },
  zoomButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  timestampRow: { marginTop: 4, marginBottom: 8 },
  timestamp: { fontSize: 11, fontWeight: "500" },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 12,
  },
  emptyText: { fontSize: 13, fontWeight: "500", textAlign: "center" },

  // Zoom modal
  zoomContainer: { flex: 1, paddingTop: 40 },
  zoomHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  zoomHeaderLeft: { flex: 1, paddingRight: 8 },
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
    marginBottom: 12,
  },
  zoomStatWrap: { flex: 1, flexDirection: "row", alignItems: "center" },
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
