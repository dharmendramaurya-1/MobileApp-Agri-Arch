import { StyleSheet, Text, View } from "react-native";

/**
 * Returns date labels for the last 7 days (today included, oldest first),
 * e.g. ["28 Jul", "29 Jul", ... "3 Aug"]
 */
function getLast7DateLabels(locale = "en-US") {
  const labels = [];
  const today = new Date();

  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    labels.push(
      d.toLocaleDateString(locale, { day: "numeric", month: "short" })
    );
  }

  return labels;
}

export default function WeeklyTrendChart({
  data,
  barColor,
  labelColor,
  valueColor,
  titleColor,
  title = "7-Day Trend",
  locale = "en-US",
}) {
  const dateLabels = getLast7DateLabels(locale);
  const maxValue = Math.max(...data, 1); // avoid divide-by-zero

  return (
    <View>
      {title ? (
        <Text style={[styles.chartTitle, { color: titleColor ?? labelColor }]}>
          {title}
        </Text>
      ) : null}
      <View style={styles.chartContainer}>
        {data.map((value, index) => (
          <View key={index} style={styles.barContainer}>
            <View
              style={[
                styles.bar,
                {
                  height: (value / maxValue) * 100,
                  backgroundColor: barColor,
                },
              ]}
            />
            <Text style={[styles.barLabel, { color: labelColor }]}>
              {dateLabels[index]}
            </Text>
            <Text style={[styles.barValue, { color: valueColor ?? barColor }]}>
              {value}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chartTitle: { fontSize: 16, fontWeight: "600", marginBottom: 16 },
  chartContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "flex-end",
    height: 150,
  },
  barContainer: { alignItems: "center", width: 40 },
  bar: { width: 30, borderRadius: 6, marginBottom: 8 },
  barLabel: { fontSize: 10, marginBottom: 4, textAlign: "center" },
  barValue: { fontSize: 10, fontWeight: "600" },
});