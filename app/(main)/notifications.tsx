import { Ionicons } from "@expo/vector-icons";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../src/context/ThemContext";

export default function Notifications() {
  const { theme } = useTheme();
  const notifications = [
    {
      id: "1",
      title: "Water Pump Started",
      message: "Main water pump turned on",
      time: "10:30 AM",
      read: false,
    },
    {
      id: "2",
      title: "Soil Moisture Low",
      message: "Field A needs irrigation",
      time: "Yesterday",
      read: true,
    },
  ];

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <Text style={[styles.title, { color: theme.colors.text }]}>
        Notifications
      </Text>
      {notifications.map((item) => (
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
          <Ionicons
            name="notifications-outline"
            size={24}
            color={theme.colors.primary}
          />
          <View style={styles.content}>
            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>
              {item.title}
            </Text>
            <Text
              style={[
                styles.cardMessage,
                { color: theme.colors.textSecondary },
              ]}
            >
              {item.message}
            </Text>
            <Text style={styles.time}>{item.time}</Text>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 28, fontWeight: "700", marginBottom: 20 },
  card: {
    flexDirection: "row",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
    gap: 12,
  },
  content: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: "600", marginBottom: 4 },
  cardMessage: { fontSize: 14, marginBottom: 4 },
  time: { fontSize: 12, color: "#999" },
});
