// components/BottomTabBar.jsx
// Production-level custom bottom tab bar with animated indicators,
// gradient accent, haptic-like press feedback, and badge support.
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef } from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../src/context/ThemContext";

const TAB_DEFINITIONS = [
  {
    key: "dashboard",
    label: "Dashboard",
    icon: "grid-outline",
    iconActive: "grid",
  },
  {
    key: "system-control",
    label: "Control",
    icon: "options-outline",
    iconActive: "options",
  },
  {
    key: "add-crops",
    label: "Crops",
    icon: "leaf-outline",
    iconActive: "leaf",
  },
  {
    key: "devices",
    label: "Devices",
    icon: "hardware-chip-outline",
    iconActive: "hardware-chip",
  },
  {
    key: "settings",
    label: "Settings",
    icon: "settings-outline",
    iconActive: "settings",
  },
];

/**
 * Individual tab button with animated icon scale and background.
 */
function TabButton({ tab, isActive, onPress, colors }) {
  const scaleAnim = useRef(new Animated.Value(isActive ? 1 : 0)).current;
  const iconScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: isActive ? 1 : 0,
      friction: 8,
      tension: 50,
      useNativeDriver: true,
    }).start();
  }, [isActive, scaleAnim]);

  const handlePressIn = () => {
    Animated.spring(iconScale, {
      toValue: 0.88,
      friction: 3,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(iconScale, {
      toValue: 1,
      friction: 3,
      useNativeDriver: true,
    }).start();
  };

  const activeColor = colors.primary;
  const inactiveColor = colors.textSecondary || "#999";

  // Background pill that appears behind active tab
  const bgOpacity = scaleAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.12],
  });

  // Label opacity
  const labelOpacity = scaleAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.5, 1],
  });

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={styles.tabItem}
      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
    >
      {/* Active background pill */}
      <Animated.View
        style={[
          styles.activeBackground,
          {
            opacity: bgOpacity,
            backgroundColor: activeColor,
          },
        ]}
      />

      {/* Icon with scale animation */}
      <Animated.View style={{ transform: [{ scale: iconScale }] }}>
        <View
          style={[
            styles.iconContainer,
            // isActive && {
            //   backgroundColor: `${activeColor}18`,
            // },
          ]}
        >
          <Ionicons
            name={isActive ? tab.iconActive : tab.icon}
            size={22}
            color={isActive ? activeColor : inactiveColor}
          />
        </View>
      </Animated.View>

      {/* Label */}
      <Animated.Text
        style={[
          styles.tabLabel,
          {
            color: isActive ? activeColor : inactiveColor,
            opacity: labelOpacity,
            fontWeight: isActive ? "700" : "500",
          },
        ]}
        numberOfLines={1}
      >
        {tab.label}
      </Animated.Text>

      {/* Active dot indicator */}
      <Animated.View
        style={[
          styles.activeIndicator,
          {
            backgroundColor: activeColor,
            transform: [
              {
                scale: scaleAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 1],
                }),
              },
            ],
          },
        ]}
      />
    </Pressable>
  );
}

/**
 * Custom bottom tab bar for the AgriArch app.
 *
 * Features:
 * - Animated icon scale on press
 * - Gradient top border accent
 * - Active tab indicator dot
 * - Safe area support (iOS notch / Android nav bar)
 * - Theme-aware (light / dark)
 * - Optional badge support (pass via route params)
 */
export default function BottomTabBar({ state, descriptors, navigation }) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const isDark = theme.dark;

  const tabBarBg = isDark ? "#1A1A1A" : "#FFFFFF";
  const shadowColor = isDark ? "#000" : "#2E7D32";
  const borderTopColor = isDark ? "#2E7D3220" : "#C8E6C950";

  return (
    <View style={styles.wrapper}>
      {/* Gradient accent line at the top */}
      <LinearGradient
        colors={
          isDark
            ? ["#1B5E2000", "#2E7D32", "#1B5E2000"]
            : ["#4CAF5000", "#4CAF50", "#4CAF5000"]
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.gradientBorder}
      />

      {/* Main tab bar container */}
      <View
        style={[
          styles.tabBar,
          {
            backgroundColor: tabBarBg,
            paddingBottom: insets.bottom > 0 ? insets.bottom : 8,
            borderTopColor: borderTopColor,
          },
        ]}
      >
        {state.routes.map((route, index) => {
          const tabDef = TAB_DEFINITIONS.find((t) => t.key === route.name);
          if (!tabDef) return null;

          const isActive = state.index === index;
          const { options } = descriptors[route.key];

          return (
            <TabButton
              key={route.key}
              tab={tabDef}
              isActive={isActive}
              onPress={() => {
                if (!isActive) {
                  navigation.navigate(route.name, route.params);
                }
              }}
              colors={{
                primary: theme.colors.primary,
                textSecondary: theme.colors.textSecondary,
              }}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: "transparent",
  },
  gradientBorder: {
    height: 2,
    width: "100%",
  },
  tabBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingTop: 6,
    borderTopWidth: 0,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 15,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
    position: "relative",
  },
  activeBackground: {
    position: "absolute",
    width: 48,
    height: 48,
    borderRadius: 14,
    top: 0,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom:3,
  },
  tabLabel: {
    fontSize: 10,
    marginTop: 3,
    letterSpacing: 0.2,
  },
  activeIndicator: {
    width: 5,
    height: 5,
    borderRadius: 3,
    marginTop: 4,
  },
});
