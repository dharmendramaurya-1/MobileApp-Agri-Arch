import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../src/context/ThemContext";

export default function PumpHistory() {
  const { theme } = useTheme();
  const history = [
    {
      id: "1",
      action: "Pump ON",
      time: "10:30 AM",
      date: "May 19, 2025",
      duration: "30 min",
    },
    {
      id: "2",
      action: "Pump OFF",
      time: "10:00 AM",
      date: "May 19, 2025",
      duration: "-",
    },
  ];

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <Text style={[styles.title, { color: theme.colors.text }]}>
        Pump History
      </Text>
      {history.map((item) => (
        <View
          key={item.id}
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <Text
            style={[
              styles.action,
              { color: item.action === "Pump ON" ? "#4CAF50" : "#F44336" },
            ]}
          >
            {item.action}
          </Text>
          <Text style={[styles.time, { color: theme.colors.textSecondary }]}>
            {item.time}
          </Text>
          <Text style={[styles.date, { color: theme.colors.textSecondary }]}>
            {item.date}
          </Text>
          {item.duration !== "-" && (
            <Text style={styles.duration}>Duration: {item.duration}</Text>
          )}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 28, fontWeight: "700", marginBottom: 20 },
  card: { padding: 16, borderRadius: 12, borderWidth: 1, marginBottom: 12 },
  action: { fontSize: 18, fontWeight: "700", marginBottom: 4 },
  time: { fontSize: 14 },
  date: { fontSize: 12, marginTop: 2 },
  duration: { fontSize: 14, marginTop: 8, color: "#4CAF50" },
});
