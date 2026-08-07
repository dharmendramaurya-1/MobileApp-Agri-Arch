import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useTheme } from "../../../src/context/ThemContext";

export default function Pumps() {
  const { theme } = useTheme();
  const [pumps, setPumps] = useState([
    {
      id: "1",
      name: "Main Water Pump",
      location: "Tube Well 1",
      status: "OFF",
    },
    { id: "2", name: "Secondary Pump", location: "Tube Well 2", status: "OFF" },
  ]);

  const togglePump = (id: string) => {
    setPumps(
      pumps.map((pump) =>
        pump.id === id
          ? { ...pump, status: pump.status === "ON" ? "OFF" : "ON" }
          : pump,
      ),
    );
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <Text style={[styles.title, { color: theme.colors.text }]}>
        Pump Control
      </Text>
      {pumps.map((pump) => (
        <View
          key={pump.id}
          style={[
            styles.pumpCard,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <Ionicons name="water" size={32} color={theme.colors.primary} />
          <View style={styles.pumpInfo}>
            <Text style={[styles.pumpName, { color: theme.colors.text }]}>
              {pump.name}
            </Text>
            <Text
              style={[
                styles.pumpLocation,
                { color: theme.colors.textSecondary },
              ]}
            >
              {pump.location}
            </Text>
          </View>
          <TouchableOpacity
            style={[
              styles.pumpButton,
              { backgroundColor: pump.status === "ON" ? "#F44336" : "#4CAF50" },
            ]}
            onPress={() => togglePump(pump.id)}
          >
            <Text style={styles.pumpButtonText}>
              {pump.status === "ON" ? "ON" : "OFF"}
            </Text>
          </TouchableOpacity>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 28, fontWeight: "700", marginBottom: 20 },
  pumpCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
    gap: 16,
  },
  pumpInfo: { flex: 1 },
  pumpName: { fontSize: 16, fontWeight: "600" },
  pumpLocation: { fontSize: 12, marginTop: 2 },
  pumpButton: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 25 },
  pumpButtonText: { color: "#FFF", fontWeight: "700", fontSize: 14 },
});
