import { router } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useTheme } from "../src/context/ThemContext";

export default function Index() {
  const { theme } = useTheme();

  useEffect(() => {
    // Small delay to show splash
    const timer = setTimeout(() => {
      router.push("/onboarding");
    }, 500);

    return () => clearTimeout(timer);
  }, []);

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <ActivityIndicator size="large" color={theme.colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center" },
});
