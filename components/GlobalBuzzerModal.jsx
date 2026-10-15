// components/GlobalBuzzerModal.jsx
// Global animated popup for hardware Buzzer alarm with audio playback and BUZ_ACK publishing
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useMqtt } from "../src/context/MqttContext";
import { useTheme } from "../src/context/ThemContext";
import soundManager, { SOUND_PRESETS } from "../src/services/soundService";
import { getActiveAlerts } from "../src/utils/deviceStatusParser";

const { width } = Dimensions.get("window");

export default function GlobalBuzzerModal() {
  const { theme } = useTheme();
  const {
    deviceStatusFlags,
    selectedExternalKey,
    externalKey,
    getSelectedDeviceName,
    acknowledgeBuzzer,
  } = useMqtt();

  const [visible, setVisible] = useState(false);
  const [selectedSoundName, setSelectedSoundName] = useState("Industrial Alarm");
  const [isAcknowledging, setIsAcknowledging] = useState(false);

  const deviceKey = selectedExternalKey || externalKey;
  const deviceName = getSelectedDeviceName() || deviceKey || "Smart Farm Device";

  const isBuzzerActive = deviceStatusFlags?.buzzer === true;
  const isDismissedRef = useRef(false);

  // Animations
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.7)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const barAnim1 = useRef(new Animated.Value(0.3)).current;
  const barAnim2 = useRef(new Animated.Value(0.7)).current;
  const barAnim3 = useRef(new Animated.Value(0.5)).current;
  const barAnim4 = useRef(new Animated.Value(0.9)).current;

  // Sync selected sound name
  useEffect(() => {
    soundManager.getSelectedSoundId().then((id) => {
      const preset = SOUND_PRESETS.find((s) => s.id === id);
      if (preset) setSelectedSoundName(preset.name);
    });
  }, [visible]);

  // Handle buzzer state changes
  useEffect(() => {
    if (isBuzzerActive) {
      if (!isDismissedRef.current && !visible) {
        setVisible(true);
        soundManager.startAlarm();
      }
    } else {
      // When buzzer turns off on hardware, reset dismissed flag so it triggers next time
      isDismissedRef.current = false;
      if (visible) {
        setVisible(false);
        soundManager.stopAlarm();
      }
    }
  }, [isBuzzerActive, visible]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      soundManager.stopAlarm();
    };
  }, []);

  // Pulsing ring animation
  useEffect(() => {
    if (!visible) return;

    // Glowing ring expansion loop
    const pulseLoop = Animated.loop(
      Animated.parallel([
        Animated.timing(pulseAnim, {
          toValue: 1.5,
          duration: 1200,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseOpacity, {
          toValue: 0,
          duration: 1200,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    pulseLoop.start();

    // Bell wobble loop
    const shakeLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(shakeAnim, { toValue: -15, duration: 80, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 15, duration: 80, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -10, duration: 80, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 10, duration: 80, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 0, duration: 80, useNativeDriver: true }),
        Animated.delay(600),
      ])
    );
    shakeLoop.start();

    // Sound wave equalizer bars animation
    const createBarLoop = (anim, duration) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(anim, { toValue: 1, duration, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0.2, duration, useNativeDriver: true }),
        ])
      );

    const b1 = createBarLoop(barAnim1, 350);
    const b2 = createBarLoop(barAnim2, 280);
    const b3 = createBarLoop(barAnim3, 420);
    const b4 = createBarLoop(barAnim4, 310);

    b1.start();
    b2.start();
    b3.start();
    b4.start();

    return () => {
      pulseLoop.stop();
      shakeLoop.stop();
      b1.stop();
      b2.stop();
      b3.stop();
      b4.stop();
      pulseAnim.setValue(1);
      pulseOpacity.setValue(0.7);
      shakeAnim.setValue(0);
    };
  }, [visible, pulseAnim, pulseOpacity, shakeAnim, barAnim1, barAnim2, barAnim3, barAnim4]);

  // Close and acknowledge buzzer
  const handleAcknowledgeAndClose = async () => {
    setIsAcknowledging(true);
    isDismissedRef.current = true;

    // Immediately stop sound and vibration
    await soundManager.stopAlarm();
    setVisible(false);

    try {
      if (acknowledgeBuzzer && deviceKey) {
        console.log("🔔 User dismissed popup → Publishing BUZ_ACK: true");
        await acknowledgeBuzzer(deviceKey);
      }
    } catch (err) {
      console.error("Error publishing buzzer acknowledgment:", err);
    } finally {
      setIsAcknowledging(false);
    }
  };

  if (!visible) return null;

  const activeAlerts = getActiveAlerts(deviceStatusFlags);
  const shakeInterpolate = shakeAnim.interpolate({
    inputRange: [-15, 15],
    outputRange: ["-15deg", "15deg"],
  });

  if (!visible) return null;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={handleAcknowledgeAndClose}
    >
      <View style={styles.overlay}>
        <View
          style={[
            styles.modalCard,
            {
              backgroundColor: theme.dark ? "#1E1E1E" : "#FFFFFF",
              borderColor: "#FF5252",
            },
          ]}
        >
          {/* Top header with close icon */}
          <View style={styles.headerRow}>
            <View style={styles.badgeRow}>
              <View style={styles.livePulseDot} />
              <Text style={styles.badgeText}>BUZZER ALARM ACTIVE</Text>
            </View>

            {/* Close button with BUZ_ACK trigger */}
            <TouchableOpacity
              style={styles.closeIconButton}
              onPress={handleAcknowledgeAndClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={20} color={theme.colors.textSecondary || "#666"} />
            </TouchableOpacity>
          </View>

          {/* Animated Center Icon with pulsing rings */}
          <View style={styles.iconContainer}>
            <Animated.View
              style={[
                styles.pulseRing,
                {
                  transform: [{ scale: pulseAnim }],
                  opacity: pulseOpacity,
                },
              ]}
            />
            <View style={styles.innerIconCircle}>
              <Animated.View style={{ transform: [{ rotate: shakeInterpolate }] }}>
                <Ionicons name="volume-high" size={44} color="#FFF" />
              </Animated.View>
            </View>
          </View>

          {/* Sound Wave Equalizer animation */}
          <View style={styles.equalizerRow}>
            <Animated.View style={[styles.eqBar, { transform: [{ scaleY: barAnim1 }] }]} />
            <Animated.View style={[styles.eqBar, { transform: [{ scaleY: barAnim2 }] }]} />
            <Animated.View style={[styles.eqBar, { transform: [{ scaleY: barAnim3 }] }]} />
            <Animated.View style={[styles.eqBar, { transform: [{ scaleY: barAnim4 }] }]} />
            <Text style={[styles.soundNameText, { color: theme.colors.textSecondary }]}>
              Playing: {selectedSoundName}
            </Text>
          </View>

          {/* Device & Alert info */}
          <View style={styles.infoSection}>
            <Text style={[styles.deviceName, { color: theme.colors.text }]}>
              {deviceName}
            </Text>
            <Text style={[styles.alertNotice, { color: "#D32F2F" }]}>
              Hardware buzzer alarm is actively sounding!
            </Text>

            {/* Active alerts pills */}
            {activeAlerts.length > 0 && (
              <View style={styles.alertsPillsWrap}>
                {activeAlerts.map((alert, idx) => (
                  <View key={idx} style={styles.alertPill}>
                    <Ionicons name="warning-outline" size={12} color="#D32F2F" />
                    <Text style={styles.alertPillText}>{alert}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Action Button: Stop Buzzer (BUZ_ACK) */}
          <TouchableOpacity
            style={styles.acknowledgeButton}
            onPress={handleAcknowledgeAndClose}
            activeOpacity={0.8}
            disabled={isAcknowledging}
          >
            <Ionicons name="volume-mute" size={20} color="#FFF" />
            <Text style={styles.acknowledgeButtonText}>
              {isAcknowledging ? "Stopping Buzzer..." : "Stop Buzzer & Acknowledge"}
            </Text>
          </TouchableOpacity>

          <Text style={[styles.footerHint, { color: theme.colors.textSecondary }]}>
            Closing acknowledges and sends BUZ_ACK to hardware
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    zIndex: 9999,
  },
  modalCard: {
    width: Math.min(width - 32, 380),
    borderRadius: 24,
    borderWidth: 2,
    padding: 20,
    alignItems: "center",
    shadowColor: "#FF5252",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 20,
  },
  headerRow: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(229,57,53,0.12)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    gap: 6,
  },
  livePulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#E53935",
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#E53935",
    letterSpacing: 0.8,
  },
  closeIconButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.06)",
    justifyContent: "center",
    alignItems: "center",
  },
  iconContainer: {
    width: 100,
    height: 100,
    justifyContent: "center",
    alignItems: "center",
    marginVertical: 10,
    position: "relative",
  },
  pulseRing: {
    position: "absolute",
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: "rgba(244,67,54,0.35)",
  },
  innerIconCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: "#E53935",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#E53935",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  equalizerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 6,
    marginBottom: 14,
  },
  eqBar: {
    width: 4,
    height: 16,
    backgroundColor: "#E53935",
    borderRadius: 2,
  },
  soundNameText: {
    fontSize: 11,
    fontWeight: "600",
    marginLeft: 6,
  },
  infoSection: {
    width: "100%",
    alignItems: "center",
    marginBottom: 18,
  },
  deviceName: {
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center",
  },
  alertNotice: {
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 4,
  },
  alertsPillsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 6,
    marginTop: 10,
  },
  alertPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(229,57,53,0.08)",
    borderColor: "rgba(229,57,53,0.25)",
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  alertPillText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#D32F2F",
  },
  acknowledgeButton: {
    width: "100%",
    backgroundColor: "#D32F2F",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 14,
    gap: 8,
    shadowColor: "#D32F2F",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  acknowledgeButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  footerHint: {
    fontSize: 10,
    textAlign: "center",
    marginTop: 10,
    opacity: 0.7,
  },
});
