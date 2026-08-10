// components/ConnectionStatusBanner.jsx
// A prominent, theme-aware banner showing the device's DevStat online/offline
// status (Bit 17) plus the MQTT connection state. Used on the Dashboard and
// Device Selection screens.
import { Ionicons } from "@expo/vector-icons";
import {
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useTheme } from "../src/context/ThemContext";

/**
 * Resolve the visual config for the device status.
 * Binary by design: data present -> Online, otherwise -> Offline.
 * No "waiting" states.
 */
function getStatusConfig(isOnline, hasReceivedData, theme) {
  if (isOnline) {
    return {
      icon: "checkmark-circle",
      label: "Device Online",
      hint: "Device is live and reporting data normally.",
      color: theme.colors.success,
      bg: `${theme.colors.success}1A`,
    };
  }
  return {
    icon: "alert-circle",
    label: "Device Offline",
    hint: hasReceivedData
      ? "Device is reporting OFFLINE from its status (Bit 17)."
      : "No data received from the device yet.",
    color: theme.colors.error,
    bg: `${theme.colors.error}1A`,
  };
}

export const ConnectionStatusBanner = ({
  connectionState,
  hasReceivedData,
  deviceStatus,
  deviceStatusFlags,
  deviceName,
}) => {
  const { theme } = useTheme();

  // Online only when we actually have data and nothing says offline.
  const isOnline =
    hasReceivedData &&
    connectionState !== "offline" &&
    deviceStatusFlags?.online !== false;

  const config = getStatusConfig(isOnline, hasReceivedData, theme);

  // DevStat extra info — only meaningful once we actually have a value
  const rawStatus = deviceStatusFlags?.rawStatus || null;
  const onlineBit = deviceStatusFlags?.online;
  const showDevStat =
    deviceStatus !== null && deviceStatus !== undefined;

  return (
    <View
      style={[
        styles.banner,
        {
          backgroundColor: config.bg,
          borderColor: config.color,
        },
      ]}
      accessibilityRole="alert"
      accessibilityLabel={`${config.label}. ${config.hint}`}
    >
      <View
        style={[
          styles.iconWrap,
          {
            backgroundColor:
              theme.dark ? `${config.color}33` : `${config.color}22`,
          },
        ]}
      >
        <Ionicons name={config.icon} size={24} color={config.color} />
      </View>

      <View style={styles.textWrap}>
        {deviceName ? (
          <Text
            style={[styles.deviceName, { color: theme.colors.text }]}
            numberOfLines={1}
          >
            {deviceName}
          </Text>
        ) : null}
        <Text style={[styles.label, { color: config.color }]}>
          {config.label}
        </Text>
        <Text style={[styles.hint, { color: theme.colors.textSecondary }]}>
          {config.hint}
        </Text>

        {/* DevStat value + Bit 17 (online) */}
        {showDevStat && (
          <View style={styles.devStatRow}>
            <Text
              style={[
                styles.devStatChip,
                { backgroundColor: `${config.color}1A` },
              ]}
            >
              <Text style={[styles.devStatText, { color: config.color }]}>
                DevStat {rawStatus || deviceStatus}
              </Text>
            </Text>
            {onlineBit !== null && onlineBit !== undefined && (
              <Text
                style={[
                  styles.onlinePill,
                  {
                    color: onlineBit
                      ? theme.colors.success
                      : theme.colors.error,
                    backgroundColor: onlineBit
                      ? `${theme.colors.success}1A`
                      : `${theme.colors.error}1A`,
                  },
                ]}
              >
                ● Bit 17: {onlineBit ? "ONLINE" : "OFFLINE"}
              </Text>
            )}
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 16,
    padding: 14,
    gap: 12,
  },
  deviceName: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 2,
  },
  iconWrap: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
  },
  textWrap: {
    flex: 1,
  },
  label: {
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  hint: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  devStatRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  devStatChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    overflow: "hidden",
  },
  devStatText: {
    fontSize: 11,
    fontWeight: "700",
    fontFamily: "monospace",
  },
  onlinePill: {
    fontSize: 11,
    fontWeight: "700",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    overflow: "hidden",
  },
});

export default ConnectionStatusBanner;
