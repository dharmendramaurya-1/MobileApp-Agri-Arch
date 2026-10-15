// components/GlobalBuzzerBanner.jsx
import React, { useEffect, useRef } from "react";
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useMqtt } from "../src/context/MqttContext";

export default function GlobalBuzzerBanner() {
  const { deviceStatusFlags, selectedExternalKey, externalKey, acknowledgeBuzzer } = useMqtt();
  const isBuzzerActive = deviceStatusFlags?.buzzer === true;
  const deviceKey = selectedExternalKey || externalKey;

  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!isBuzzerActive) return;
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.15,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ])
    );
    pulseLoop.start();
    return () => pulseLoop.stop();
  }, [isBuzzerActive]);

  if (!isBuzzerActive) return null;

  return (
    <View style={styles.bannerContainer}>
      <View style={styles.leftRow}>
        <Animated.View style={[styles.iconCircle, { transform: [{ scale: pulseAnim }] }]}>
          <Ionicons name="volume-high" size={18} color="#D32F2F" />
        </Animated.View>
        <View style={styles.textWrap}>
          <Text style={styles.titleText}>🚨 Buzzer Alarm Active!</Text>
          <Text style={styles.subText} numberOfLines={1}>Audible alarm triggered on hardware</Text>
        </View>
      </View>
      <TouchableOpacity
        style={styles.stopButton}
        onPress={() => {
          if (acknowledgeBuzzer && deviceKey) {
            acknowledgeBuzzer(deviceKey);
          }
        }}
        activeOpacity={0.8}
      >
        <Ionicons name="volume-mute" size={15} color="#FFF" style={{ marginRight: 4 }} />
        <Text style={styles.stopButtonText}>Stop Buzzer</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  bannerContainer: {
    backgroundColor: "#FFEBEE",
    borderTopWidth: 1.5,
    borderBottomWidth: 1.5,
    borderColor: "#EF9A9A",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    zIndex: 999,
    shadowColor: "#D32F2F",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 8,
  },
  leftRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 10,
  },
  iconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#FFCDD2",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  textWrap: {
    flex: 1,
  },
  titleText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#C62828",
  },
  subText: {
    fontSize: 10,
    color: "#E53935",
    marginTop: 1,
  },
  stopButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#D32F2F",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
  },
  stopButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
});
