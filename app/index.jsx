// app/index.jsx
// Branded splash screen shown on every cold launch.
//   • App icon + wordmark fade/spring in
//   • Soft pulsing ring around the icon
//   • Determinate progress bar fills over ~2.2 s
//   • Then routes: signup flow → add_device, authenticated → dashboard,
//     otherwise → onboarding
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Image,
  StyleSheet,
  Text,
  View,
} from "react-native";
import AppStatusBar from "../components/AppStatusBar";
import { useAuth } from "../src/context/AuthContext";

const SPLASH_MS = 2200;
const GREEN = "#4CAF50";
const GREEN_DARK = "#2E7D32";
const GREEN_DEEP = "#1B5E20";

export default function SplashScreen() {
  const { isLoading, isAuthenticated, isSignupFlow } = useAuth();

  const intro = useRef(new Animated.Value(0)).current; // 0 → 1
  const ring = useRef(new Animated.Value(0)).current; // infinite pulse
  const progress = useRef(new Animated.Value(0)).current; // 0 → 1
  const navigatedRef = useRef(false);
  const [minTimeUp, setMinTimeUp] = useState(false);
  const [pct, setPct] = useState(0);

  // Entrance + progress animations (run once, from mount)
  useEffect(() => {
    Animated.parallel([
      Animated.timing(intro, {
        toValue: 1,
        duration: 650,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.loop(
        Animated.timing(ring, {
          toValue: 1,
          duration: 1500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        })
      ),
      // Determinate progress bar
      Animated.timing(progress, {
        toValue: 1,
        duration: SPLASH_MS,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: false, // width interpolation
      }),
    ]).start();

    const t = setTimeout(() => setMinTimeUp(true), SPLASH_MS + 150);
    return () => clearTimeout(t);
  }, [intro, ring, progress]);

  // Keep the numeric % in sync with the bar
  useEffect(() => {
    const id = progress.addListener(({ value }) =>
      setPct(Math.round(value * 100))
    );
    return () => progress.removeListener(id);
  }, [progress]);

  // Navigate once: minimum splash time elapsed AND auth state resolved.
  useEffect(() => {
    if (!minTimeUp || isLoading || navigatedRef.current) return;
    navigatedRef.current = true;
    if (isSignupFlow) {
      router.replace("/(auth)/add_device");
    } else if (isAuthenticated) {
      router.replace("/(main)/dashboard");
    } else {
      router.replace("/onboarding");
    }
  }, [minTimeUp, isLoading, isAuthenticated, isSignupFlow]);

  const fadeIn = (v) => ({
    opacity: intro.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 1],
    }),
    transform: [
      {
        translateY: intro.interpolate({
          inputRange: [0, 1],
          outputRange: [18, 0],
        }),
      },
    ],
  });

  const ringStyle = {
    opacity: ring.interpolate({
      inputRange: [0, 1],
      outputRange: [0.45, 0],
    }),
    transform: [
      {
        scale: ring.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 1.45],
        }),
      },
    ],
  };

  return (
    <View style={styles.root}>
      <AppStatusBar style="light" />

      <LinearGradient
        colors={[GREEN_DARK, GREEN_DEEP]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Center: icon + wordmark */}
      <View style={styles.center}>
        <Animated.View style={styles.logoWrap}>
          {/* Pulsing halo */}
          <Animated.View style={[styles.halo, ringStyle]} />
          <Animated.View style={styles.logoTile}>
            <Image
              source={require("../assets/images/Logo.png")}
              style={styles.logo}
              resizeMode="contain"
            />
          </Animated.View>
        </Animated.View>

        <Animated.View style={[styles.brandWrap, fadeIn()]}>
          <Text style={styles.brand}>
            Agri<Text style={styles.brandAccent}>Arch</Text>
          </Text>
          <Text style={styles.tagline}>Smart Farm Management</Text>
        </Animated.View>
      </View>

      {/* Bottom: progress */}
      <Animated.View style={[styles.progressWrap, fadeIn()]}>
        <View style={styles.progressHeader}>
          <Text style={styles.progressText}>
            {isLoading ? "Loading your farm…" : "Preparing your dashboard…"}
          </Text>
          <Text style={styles.progressPct}>{pct}%</Text>
        </View>
        <View style={styles.track}>
          <Animated.View
            style={[
              styles.fill,
              {
                width: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: ["0%", "100%"],
                }),
              },
            ]}
          />
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  logoWrap: {
    width: 170,
    height: 170,
    alignItems: "center",
    justifyContent: "center",
  },
  halo: {
    position: "absolute",
    width: 170,
    height: 170,
    borderRadius: 85,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  logoTile: {
    width: 124,
    height: 124,
    borderRadius: 42,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 18,
    elevation: 12,
  },
  logo: { width: 84, height: 84 },
  brandWrap: { marginTop: 26, alignItems: "center" },
  brand: {
    fontSize: 40,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },
  brandAccent: { color: GREEN },
  tagline: {
    marginTop: 8,
    fontSize: 13,
    color: "rgba(255,255,255,0.75)",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  progressWrap: {
    paddingHorizontal: 40,
    paddingBottom: 70,
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  progressText: {
    fontSize: 12,
    color: "rgba(255,255,255,0.85)",
    fontWeight: "500",
  },
  progressPct: {
    fontSize: 12,
    color: "#FFFFFF",
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.25)",
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: 4,
    backgroundColor: GREEN,
  },
});
