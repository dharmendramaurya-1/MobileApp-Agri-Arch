// components/Buttons.jsx
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Text, TouchableOpacity } from "react-native";
import { useTheme } from "../../src/context/ThemContext";

export function AddDeviceButton() {
  const { theme } = useTheme();
  
  return (
    <TouchableOpacity
      onPress={() => router.push("/(main)/devices")}
      style={{
        marginRight: 16,
        backgroundColor: theme.colors.primary,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
      }}
    >
      <Ionicons name="add" size={18} color="#FFF" />
      <Text style={{ color: "#FFF", fontSize: 12, fontWeight: "600" }}>
        Add Device
      </Text>
    </TouchableOpacity>
  );
}

export function NotificationsButton() {
  const { theme } = useTheme();
  
  return (
    <TouchableOpacity
      onPress={() => router.push("/(main)/notifications")}
      style={{ marginLeft: 16 }}
    >
      <Ionicons name="notifications-outline" size={24} color={theme.colors.text} />
    </TouchableOpacity>
  );
}