// components/LineChart.jsx
import { StyleSheet, Text, View } from "react-native";

const PAD = { top: 16, right: 12, bottom: 26, left: 44 };
const LINE_WIDTH = 2;

/**
 * Dependency-free line chart built from plain Views.
 *
 * data: array of { time (ms), value (number) }  — should already be
 *       sorted oldest → newest.
 */
export default function LineChart({
  data,
  color = "#4CAF50",
  unit = "",
  width = 320,
  height = 200,
  labelColor = "#999",
}) {
  if (!data || data.length === 0) return null;

  const plotW = width - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;

  // Numeric bounds
  const values = data.map((d) => d.value);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const span = max - min;

  // Time bounds
  const tMin = data[0].time;
  const tMax = data[data.length - 1].time;
  const tSpan = tMax - tMin || 1;

  const x = (t) => PAD.left + ((t - tMin) / tSpan) * plotW;
  const y = (v) => PAD.top + (1 - (v - min) / span) * plotH;

  const points = data.map((d) => ({ ...d, px: x(d.time), py: y(d.value) }));

  // Line segments between consecutive points
  const segments = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const dx = b.px - a.px;
    const dy = b.py - a.py;
    const len = Math.sqrt(dx * dx + dy * dy);
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    segments.push({
      key: `seg-${i}`,
      len,
      angle,
      midX: a.px + dx / 2,
      midY: a.py + dy / 2,
    });
  }

  const fmt = (v) =>
    Math.abs(v) >= 100 ? String(Math.round(v)) : String(Number(v.toFixed(1)));

  // Y-axis labels (min / mid / max)
  const yTicks = [
    { v: max, y: y(max), key: "y-max" },
    { v: min + span / 2, y: y(min + span / 2), key: "y-mid" },
    { v: min, y: y(min), key: "y-min" },
  ];

  // X-axis labels (first / middle / last)
  const midIdx = Math.floor((points.length - 1) / 2);
  const xTicks = [0, midIdx, points.length - 1].map((idx) => {
    const t = points[idx].time;
    const d = new Date(t);
    const label =
      tSpan > 2 * 24 * 3600 * 1000
        ? d.toLocaleDateString([], { day: "numeric", month: "short" })
        : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return { key: `x-${idx}`, label, px: points[idx].px };
  });

  return (
    <View style={{ width, height }}>
      {/* Grid + Y axis labels */}
      {yTicks.map((tick) => (
        <View
          key={tick.key}
          style={[styles.gridRow, { top: tick.y - 6, width: plotW, left: PAD.left }]}
        >
          <Text style={[styles.axisLabel, { color: labelColor }]} numberOfLines={1}>
            {fmt(tick.v)}
          </Text>
          <View style={styles.gridLine} />
        </View>
      ))}

      {/* Line segments */}
      {segments.map((seg) => (
        <View
          key={seg.key}
          style={[
            styles.segment,
            {
              left: seg.midX - seg.len / 2,
              top: seg.midY - LINE_WIDTH / 2,
              width: seg.len,
              backgroundColor: color,
              transform: [{ rotate: `${seg.angle}deg` }],
            },
          ]}
        />
      ))}

      {/* Data point dots */}
      {points.map((p, i) => (
        <View
          key={`dot-${i}`}
          style={[
            styles.dot,
            { left: p.px - 3, top: p.py - 3, backgroundColor: color },
          ]}
        />
      ))}

      {/* X axis labels */}
      {xTicks.map((tick) => (
        <Text
          key={tick.key}
          style={[
            styles.xLabel,
            { color: labelColor, top: height - PAD.bottom + 6 },
            { left: Math.max(0, Math.min(tick.px - 20, width - PAD.right - 44)) },
          ]}
          numberOfLines={1}
        >
          {tick.label}
        </Text>
      ))}

      {/* Unit legend */}
      {unit ? (
        <Text style={[styles.unitLabel, { color: labelColor }]} numberOfLines={1}>
          {unit}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  gridRow: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  axisLabel: { width: PAD.left - 10, fontSize: 9, textAlign: "right" },
  gridLine: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(128,128,128,0.18)",
  },
  segment: { position: "absolute", height: LINE_WIDTH, borderRadius: 1 },
  dot: {
    position: "absolute",
    width: 6,
    height: 6,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: "#FFF",
  },
  xLabel: {
    position: "absolute",
    width: 44,
    fontSize: 9,
    textAlign: "center",
  },
  unitLabel: {
    position: "absolute",
    top: 0,
    right: 0,
    fontSize: 9,
    opacity: 0.8,
  },
});
