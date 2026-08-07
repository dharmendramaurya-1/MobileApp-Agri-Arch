import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { useTheme } from "../../src/context/ThemContext";

const scenes = [
  {
    id: "1",
    name: "Morning Routine",
    desc: "Turn on lights at 7 AM",
    icon: "sunny-outline",
    active: true,
  },
  {
    id: "2",
    name: "Away Mode",
    desc: "All devices off when leaving",
    icon: "walk-outline",
    active: false,
  },
  {
    id: "3",
    name: "Night Mode",
    desc: "Dim lights at 10 PM",
    icon: "moon-outline",
    active: true,
  },
  {
    id: "4",
    name: "Watering",
    desc: "Water plants at 6 AM",
    icon: "water-outline",
    active: false,
  },
];

export default function AutomationScreen() {
  const { theme } = useTheme();
  const [sceneList, setSceneList] = useState(scenes);

  const toggleScene = (id: string) => {
    setSceneList((prev) =>
      prev.map((s) => (s.id === id ? { ...s, active: !s.active } : s)),
    );
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={styles.content}
    >
      <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
        Smart Scenes
      </Text>
      <Text style={[styles.sectionSub, { color: theme.colors.textSecondary }]}>
        Automate your devices based on time and conditions
      </Text>

      {sceneList.map((scene) => (
        <View
          key={scene.id}
          style={[styles.card, { backgroundColor: theme.colors.surface }]}
        >
          <View style={styles.cardLeft}>
            <View
              style={[
                styles.iconBox,
                { backgroundColor: theme.colors.surfaceVariant },
              ]}
            >
              <Ionicons
                name={scene.icon as any}
                size={24}
                color={
                  scene.active
                    ? theme.colors.primary
                    : theme.colors.textSecondary
                }
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: theme.colors.text }]}>
                {scene.name}
              </Text>
              <Text
                style={[styles.cardDesc, { color: theme.colors.textSecondary }]}
              >
                {scene.desc}
              </Text>
            </View>
          </View>
          <Switch
            value={scene.active}
            onValueChange={() => toggleScene(scene.id)}
            trackColor={{
              false: theme.colors.border,
              true: theme.colors.primaryLight,
            }}
            thumbColor={scene.active ? theme.colors.primary : "#f4f3f4"}
          />
        </View>
      ))}

      <TouchableOpacity
        style={[styles.addBtn, { backgroundColor: theme.colors.primary }]}
        activeOpacity={0.8}
      >
        <Ionicons name="add" size={24} color="#FFFFFF" />
        <Text style={styles.addBtnText}>Create New Scene</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  sectionTitle: { fontSize: 22, fontWeight: "700", marginBottom: 4 },
  sectionSub: { fontSize: 14, marginBottom: 20 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderRadius: 14,
    marginBottom: 10,
    elevation: 2,
    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
  },
  cardLeft: { flexDirection: "row", alignItems: "center", flex: 1 },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  cardTitle: { fontSize: 15, fontWeight: "600" },
  cardDesc: { fontSize: 13, marginTop: 2 },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 8,
    elevation: 3,
    boxShadow: "0 2px 4px rgba(0,0,0,0.15)",
  },
  addBtnText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 8,
  },
});
