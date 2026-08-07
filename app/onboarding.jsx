// app/index.jsx
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Image,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useTheme } from "../src/context/ThemContext";
import { getstarted } from "../src/services/Getstartedservices";

const { width, height } = Dimensions.get("window");

const GREEN = "#4CAF50";
const GREEN_DARK = "#2E7D32";

export default function OnboardingScreen() {
  const { theme } = useTheme();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    // Update time every second
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    // Animations
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 700,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 700,
        useNativeDriver: true,
      }),
    ]).start();

    return () => clearInterval(timer);
  }, []);

  const formatTime = () => {
    return currentTime.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  };

  const formatDate = () => {
    return currentTime.toLocaleDateString([], {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  };

  const handleGetStarted = async () => {
    await getstarted();
    try {
      await AsyncStorage.setItem("hasSeenOnboarding", "true");
      await AsyncStorage.setItem("userIntent", "signup");
    } catch (error) {
      console.error("Error saving:", error);
    }
    router.push("/(auth)/signup");
  };

  const handleSignIn = async () => {
    try {
      await AsyncStorage.setItem("hasSeenOnboarding", "true");
      await AsyncStorage.setItem("userIntent", "login");
    } catch (error) {
      console.error("Error saving:", error);
    }
    router.push("/(auth)/login");
  };

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle="light-content"
      />

      {/* Full-bleed hero image with better quality */}
      <View style={styles.heroWrapper}>
        <Image
          source={require("../assets/images/hero.jpg")}
          style={styles.image}
          resizeMode="cover"
          quality={100}
        />

        {/* Dark overlay for better text visibility */}
        <LinearGradient
          colors={["rgba(0,0,0,0.4)", "rgba(0,0,0,0.2)", "transparent"]}
          style={styles.imageOverlay}
        />

        {/* Time and Date Display - High z-index */}
        <View style={styles.timeContainer}>
          <Text style={styles.timeText}>{formatTime()}</Text>
          <Text style={styles.dateText}>{formatDate()}</Text>
        </View>

        {/* AgriAI Logo badge */}
        <View style={styles.logoBadge}>
          <LinearGradient
            colors={["rgba(0,0,0,0.6)", "rgba(0,0,0,0.4)"]}
            style={styles.logoGradient}
          >
            <Text style={styles.logoText}>
              Agri<Text style={styles.logoAI}>Arch</Text>
            </Text>
          </LinearGradient>
        </View>
      </View>

      {/* Bottom white card - adjusted height and position */}
      <View style={[styles.card, { backgroundColor: theme.colors.background }]}>
        <Text style={styles.headline}>
          Smart Recommendations{"\n"}for Higher Yields
        </Text>
        <Text style={styles.description}>
          Receive custom plans for irrigation, fertilization, and pest control
          to boost productivity and reduce unnecessary resource use.
        </Text>

        {/* Animated bottom controls - moved up */}
        <Animated.View
          style={[
            styles.bottomControls,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          {/* Get Started button */}
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: GREEN }]}
            onPress={handleGetStarted}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryButtonText}>Get Started</Text>
          </TouchableOpacity>

          {/* Sign In link */}
          <TouchableOpacity
            style={styles.signInLink}
            onPress={handleSignIn}
            activeOpacity={0.7}
          >
            <Text style={styles.signInText}>
              Already have an account?{" "}
              <Text style={[styles.signInBold, { color: GREEN_DARK }]}>
                Sign In
              </Text>
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </View>
  );
}

// Adjusted heights for better button positioning
const CARD_HEIGHT = height * 0.48;
const HERO_HEIGHT = height - CARD_HEIGHT + 30;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  heroWrapper: {
    width,
    height: HERO_HEIGHT,
    overflow: "hidden",
    position: "relative",
  },
  image: {
    width: "100%",
    height: "100%",
    position: "absolute",
    top: 0,
    left: 0,
  },
  imageOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 200,
  },
  timeContainer: {
    position: "absolute",
    top: Platform.OS === "ios" ? 60 : 50,
    left: 24,
    zIndex: 10,
  },
  timeText: {
    fontSize: 34,
    fontWeight: "700",
    color: "#fff",
    textShadowColor: "rgba(0,0,0,0.3)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  dateText: {
    fontSize: 16,
    fontWeight: "500",
    color: "rgba(255,255,255,0.9)",
    textShadowColor: "rgba(0,0,0,0.2)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
    marginTop: 4,
  },
  logoBadge: {
    position: "absolute",
    bottom: 30,
    alignSelf: "center",
    zIndex: 10,
  },
  logoGradient: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 20,
  },
  logoText: {
    fontSize: 32,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: 0.5,
    textShadowColor: "rgba(0,0,0,0.2)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  logoAI: {
    color: GREEN,
  },
  card: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: CARD_HEIGHT,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: 28,
    paddingTop: 32,
    paddingBottom: 30,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 10,
  },
  headline: {
    fontSize: 24,
    fontWeight: "800",
    color: "#1a1a1a",
    textAlign: "center",
    lineHeight: 33,
    marginBottom: 12,
  },
  description: {
    fontSize: 15,
    color: "#777",
    textAlign: "center",
    lineHeight: 22,
    paddingHorizontal: 8,
    marginBottom: 32,
  },
  bottomControls: {
    width: "100%",
    alignItems: "center",
    marginTop: 8,
  },
  primaryButton: {
    width: "100%",
    paddingVertical: 16,
    borderRadius: 50,
    marginBottom: 16,
    shadowColor: GREEN_DARK,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  primaryButtonText: {
    textAlign: "center",
    fontSize: 17,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: 0.3,
  },
  signInLink: {
    paddingVertical: 8,
  },
  signInText: {
    fontSize: 15,
    color: "#555",
    textAlign: "center",
  },
  signInBold: {
    fontWeight: "700",
  },
});