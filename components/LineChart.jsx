// components/LineChart.jsx
import { StyleSheet, Text, View } from "react-native";

const PAD = { top: 20, right: 14, bottom: 32, left: 48 };
const LINE_WIDTH = 2.5;

/**
 * Enhanced line chart with gradient fill, axis titles, and better labels.
 *
 * data: array of { time (ms), value (number) } — sorted oldest → newest.
 */
export default function LineChart({
  data,
  color = "#4CAF50",
  unit = "",
  width = 320,
  height = 220,
  labelColor = "#999",
  xTitle = "Time",
  yTitle = "",
  showGradient = true,
  showDots = true,
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
  // Add 10% padding to y range
  const padding = (max - min) * 0.1;
  min = min - padding;
  max = max + padding;
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

  // Y-axis: 5 grid lines (min, 25%, 50%, 75%, max)
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
    const v = min + span * pct;
    return { v, y: y(v), key: `y-${i}` };
  });

  // X-axis: show up to 5 labels (first, 25%, 50%, 75%, last)
  const xTickPcts = data.length <= 5
    ? data.map((_, i) => i / Math.max(data.length - 1, 1))
    : [0, 0.25, 0.5, 0.75, 1];
  const xTicks = xTickPcts.map((pct, i) => {
    const idx = Math.round(pct * (points.length - 1));
    const t = points[idx].time;
    const d = new Date(t);
    const label =
      tSpan > 2 * 24 * 3600 * 1000
        ? d.toLocaleDateString([], { day: "numeric", month: "short" })
        : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return { key: `x-${i}`, label, px: points[idx].px };
  });

  // Gradient fill: build SVG-like fill using horizontal bars
  const GRADIENT_BARS = 40;
  const gradientBars = [];
  if (showGradient && points.length >= 2) {
    const barWidth = plotW / GRADIENT_BARS;
    const baselineY = y(min);
    for (let i = 0; i < GRADIENT_BARS; i++) {
      const tStart = tMin + (i / GRADIENT_BARS) * tSpan;
      const tEnd = tMin + ((i + 1) / GRADIENT_BARS) * tSpan;
      // Interpolate value at midpoint
      const tMid = (tStart + tEnd) / 2;
      let val = points[0].value;
      for (let j = 1; j < points.length; j++) {
        if (points[j].time >= tMid) {
          const ratio = (tMid - points[j - 1].time) / (points[j].time - points[j - 1].time || 1);
          val = points[j - 1].value + ratio * (points[j].value - points[j - 1].value);
          break;
        }
      }
      const barTop = y(val);
      const barHeight = Math.max(0, baselineY - barTop);
      if (barHeight > 0) {
        gradientBars.push({
          key: `grad-${i}`,
          left: PAD.left + i * barWidth,
          width: barWidth + 1, // slight overlap to avoid gaps
          top: barTop,
          height: barHeight,
          opacity: 0.08 + (i / GRADIENT_BARS) * 0.07,
        });
      }
    }
  }

  // Min/max markers
  let minIdx = 0, maxIdx = 0;
  let minVal = values[0], maxVal = values[0];
  values.forEach((v, i) => {
    if (v < minVal) { minVal = v; minIdx = i; }
    if (v > maxVal) { maxVal = v; maxIdx = i; }
  });

  return (
    <View style={{ width, height }}>
      {/* ── Grid lines ── */}
      {yTicks.map((tick) => (
        <View
          key={tick.key}
          style={[
            styles.gridRow,
            { top: tick.y - 6, width: plotW, left: PAD.left },
          ]}
        >
          <Text
            style={[styles.axisLabel, { color: labelColor }]}
            numberOfLines={1}
          >
            {fmt(tick.v)}
          </Text>
          <View style={styles.gridLine} />
        </View>
      ))}

      {/* ── Gradient fill ── */}
      {gradientBars.map((bar) => (
        <View
          key={bar.key}
          style={[
            styles.gradientBar,
            {
              left: bar.left,
              top: bar.top,
              width: bar.width,
              height: bar.height,
              backgroundColor: color,
              opacity: bar.opacity,
            },
          ]}
        />
      ))}

      {/* ── Line segments ── */}
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

      {/* ── Data point dots ── */}
      {showDots &&
        points.map((p, i) => (
          <View
            key={`dot-${i}`}
            style={[
              styles.dot,
              { left: p.px - 3.5, top: p.py - 3.5, backgroundColor: color },
            ]}
          />
        ))}

      {/* ── Min marker ── */}
      {points[minIdx] && (
        <View
          style={[
            styles.marker,
            {
              left: points[minIdx].px - 14,
              top: points[minIdx].py - 22,
              backgroundColor: "#F44336",
            },
          ]}
        >
          <Text style={styles.markerText}>▼{fmt(minVal)}</Text>
        </View>
      )}

      {/* ── Max marker ── */}
      {points[maxIdx] && (
        <View
          style={[
            styles.marker,
            {
              left: points[maxIdx].px - 14,
              top: points[maxIdx].py - 22,
              backgroundColor: "#4CAF50",
            },
          ]}
        >
          <Text style={styles.markerText}>▲{fmt(maxVal)}</Text>
        </View>
      )}

      {/* ── X-axis labels ── */}
      {xTicks.map((tick) => (
        <Text
          key={tick.key}
          style={[
            styles.xLabel,
            { color: labelColor, top: height - PAD.bottom + 8 },
            {
              left: Math.max(
                0,
                Math.min(tick.px - 24, width - PAD.right - 48)
              ),
            },
          ]}
          numberOfLines={1}
        >
          {tick.label}
        </Text>
      ))}

      {/* ── X-axis title ── */}
      {xTitle ? (
        <Text
          style={[
            styles.axisTitle,
            { color: labelColor, top: height - 6, left: PAD.left + plotW / 2 - 15 },
          ]}
        >
          {xTitle}
        </Text>
      ) : null}

      {/* ── Y-axis title ── */}
      {yTitle ? (
        <Text
          style={[
            styles.axisTitle,
            {
              color: labelColor,
              top: PAD.top + plotH / 2,
              left: 0,
              transform: [{ rotate: "-90deg" }, { translateX: -10 }, { translateY: -20 }],
            },
          ]}
        >
          {yTitle}
        </Text>
      ) : null}

      {/* ── Unit badge ── */}
      {unit ? (
        <View style={[styles.unitBadge, { backgroundColor: color + "18" }]}>
          <Text style={[styles.unitText, { color }]} numberOfLines={1}>
            {unit}
          </Text>
        </View>
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
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(128,128,128,0.2)",
  },
  segment: { position: "absolute", height: LINE_WIDTH, borderRadius: 1.5 },
  dot: {
    position: "absolute",
    width: 7,
    height: 7,
    borderRadius: 3.5,
    borderWidth: 1.5,
    borderColor: "#FFF",
  },
  xLabel: {
    position: "absolute",
    width: 48,
    fontSize: 9,
    textAlign: "center",
  },
  axisTitle: {
    position: "absolute",
    fontSize: 9,
    fontWeight: "600",
    opacity: 0.6,
  },
  gradientBar: {
    position: "absolute",
    borderRadius: 2,
  },
  marker: {
    position: "absolute",
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  markerText: {
    color: "#FFF",
    fontSize: 8,
    fontWeight: "700",
  },
  unitBadge: {
    position: "absolute",
    top: 2,
    right: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  unitText: {
    fontSize: 9,
    fontWeight: "700",
  },
});
