// app/(main)/_layout.jsx
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import MaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";
import { router, useNavigation } from "expo-router";
import { Drawer } from "expo-router/drawer";
import { useEffect, useRef, useState } from "react";
import { BackHandler, Modal } from "react-native";

import {
  Alert,
  Animated,
  Dimensions,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaView } from "react-native-safe-area-context";
import { AlertBadge } from "../../components/AlertBadge";
import { AlertList } from "../../components/AlertList";
import Logo from "../../components/Logo";
import { useAuth } from "../../src/context/AuthContext";
import { useMqtt } from "../../src/context/MqttContext";
import { useTheme } from "../../src/context/ThemContext";
import { user_profile } from "../../src/services/profile/profile";
import { ScrollProvider, useScroll } from "../../src/context/ScrollContext";

const { width, height } = Dimensions.get("window");

function CustomHeader({ navigation, theme }) {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [user_name, setUsername] = useState("");
  const [currentvalue, setcurrentvalue] = useState({});
  const [showAlerts, setShowAlerts] = useState(false);
  const { sensorData } = useMqtt();

  // ── Hero collapse (shutter) driven by the current screen's scroll ──────
  const { scrollY, setHeaderHeight, heroHeight, setHeroHeight } = useScroll();
  const heroMeasuredRef = useRef(false);

  // Native-driver collapse: the hero slides up (translateY) and fades in
  // lockstep with the scroll offset — zero layout animation, so it stays
  // silky-smooth even on low-end devices. Because translateY is exactly
  // -scrollY, the scrolled content fills the space the hero vacates
  // (screens reserve it via ScrollContext.headerHeight padding).
  const heroTranslateY = scrollY.interpolate({
    inputRange: [0, heroHeight],
    outputRange: [0, -heroHeight],
    extrapolate: "clamp",
  });

  const heroOpacity = scrollY.interpolate({
    inputRange: [0, heroHeight * 0.5, heroHeight],
    outputRange: [1, 0.7, 0],
    extrapolate: "clamp",
  });

  useEffect(() => {
    const profile = async () => {
      try {
        const response = await user_profile();
        await AsyncStorage.setItem("Username", response);
        setUsername(response);
      } catch (e) {
        console.log(e);
      }
    };
    profile();
  }, []);

  useEffect(() => {
    setcurrentvalue({
      WaterLevel: sensorData.waterLevel,
      temperature: sensorData.ambientTemperature,
      Humidity: sensorData.ambientHumidity,
    });
  }, [sensorData]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = () => {
    return currentTime.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDate = () => {
    return currentTime.toLocaleDateString([], {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
  };

  const openWhatsApp = () => {
    const phoneNumber = "9340389016";
    const url = `whatsapp://send?phone=${phoneNumber}`;

    Linking.canOpenURL(url)
      .then((supported) => {
        if (supported) {
          return Linking.openURL(url);
        } else {
          const webUrl = `https://wa.me/${phoneNumber}`;
          Linking.openURL(webUrl);
        }
      })
      .catch((err) => {
        console.error("Error opening WhatsApp:", err);
        Alert.alert(
          "WhatsApp Not Available",
          "Please install WhatsApp to chat with support."
        );
      });
  };

  return (
    <View
      style={styles.headerContainer}
      onLayout={(e) => {
        const h = e.nativeEvent.layout.height;
        if (h > 0) setHeaderHeight(h);
      }}
    >
      <View
        style={[
          styles.headerTopRow,
          { paddingTop: Platform.OS === "ios" ? 50 : 40 },
        ]}
      >
        <TouchableOpacity
          onPress={() => navigation.openDrawer()}
          style={styles.headerIconButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="menu" size={24} color="#FFF" />
        </TouchableOpacity>

        <View style={styles.logoContainer} pointerEvents="none">
          <Logo showText={true} size={30} />
        </View>

        <View style={styles.headerRightIcons}>
          {/* ✅ Alert Badge - Click to show alerts */}
          <TouchableOpacity
            onPress={() => setShowAlerts(true)}
            style={styles.headerIconButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <AlertBadge onPress={() => setShowAlerts(true)} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={openWhatsApp}
            style={styles.headerIconButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="logo-whatsapp" size={22} color="#25D366" />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Hero section — slides up behind the top bar on scroll ─────────── */}
      <Animated.View
        style={[
          styles.heroSection,
          {
            transform: [{ translateY: heroTranslateY }],
            opacity: heroOpacity,
          },
        ]}
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          if (h > 0 && !heroMeasuredRef.current) {
            heroMeasuredRef.current = true;
            setHeroHeight(h);
          }
        }}
      >
        <View style={[styles.heroImage, { backgroundColor: "#2E7D32" }]} />
        <View style={styles.heroContent}>
          <View style={styles.weatherTimeRow}>
            <View style={styles.weatherInfo}>
              <Text style={styles.weatherIcon}>☀️</Text>
              <View>
                <Text style={styles.weatherTemp}>
                  {currentvalue.temperature?.toFixed(1) || '--'}°C
                </Text>
                <Text style={styles.weatherCondition}>Sunny</Text>
              </View>
            </View>
            <View style={styles.timeInfo}>
              <Text style={styles.timeText}>{formatTime()}</Text>
              <Text style={styles.dateText}>{formatDate()}</Text>
            </View>
          </View>

          <View style={styles.greetingContainer}>
            <Text style={styles.greetingText}>
              Good Morning, {user_name}! 👋
            </Text>
            <Text style={styles.greetingSubtext}>
              Your farm is healthy today
            </Text>
          </View>

          <View style={styles.quickStats}>
            <View style={styles.statItem}>
              <Ionicons name="water" size={14} color="#4CAF50" />
              <Text style={styles.statValue}>{currentvalue.WaterLevel?.toFixed(0) || '--'}%</Text>
              <Text style={styles.statLabel}>Water</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Ionicons name="thermometer" size={14} color="#FF9800" />
              <Text style={styles.statValue}>{currentvalue.temperature?.toFixed(1) || '--'}</Text>
              <Text style={styles.statLabel}>Temp</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Ionicons name="leaf" size={14} color="#8BC34A" />
              <Text style={styles.statValue}>{currentvalue.Humidity?.toFixed(0) || '--'}</Text>
              <Text style={styles.statLabel}>Humidity</Text>
            </View>
          </View>
        </View>
      </Animated.View>

      {/* ✅ Alert Modal */}
      <Modal
        visible={showAlerts}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setShowAlerts(false)}
      >
        <AlertList onClose={() => setShowAlerts(false)} />
      </Modal>
    </View>
  );
}

function CustomDrawerContent({ navigation }) {
  const { theme } = useTheme();
  const { logout } = useAuth();

  const handleLogout = async () => {
    Alert.alert("Logout", "Are you sure you want to logout?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Logout",
        style: "destructive",
        onPress: () => {
          navigation.closeDrawer();
          setTimeout(() => {
            logout().catch(console.error);
            setTimeout(() => {
              router.push("/onboarding");
            }, 100);
          }, 200);
        },
      },
    ]);
  };

  const navigateTo = (route) => {
    navigation.closeDrawer();
    router.push(route);
  };

  // ✅ Updated menu items with correct routes
  const menuItems = [
    {
      section: "MAIN",
      items: [
        { name: "Dashboard", icon: "grid-outline", route: "/(main)/dashboard" },
        { name: "Devices", icon: "hardware-chip-outline", route: "/(main)/devices" },
        { name: "System Control", icon: "options-outline", route: "/(main)/system-control" },
        { name: "Add Crops", icon: "leaf-outline", route: "/(main)/add_crops" },
        { name: "Profile", icon: "person-outline", route: "/(main)/profile" },
      ],
    },
    {
      section: "SENSORS",
      items: [
        { name: "Environmental Sensors", icon: "leaf-outline", route: "/(main)/sensor-tabs" },
      ],
    },
    {
      section: "HISTORY",
      items: [
        { name: "Pump History", icon: "time-outline", route: "/(main)/pump-history" },
        { name: "Sensor History", icon: "analytics-outline", route: "/(main)/sensor-history" },
      ],
    },
  ];

  return (
    <SafeAreaView
      style={[
        styles.drawerContainer,
        { backgroundColor: theme.colors.background },
      ]}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View
          style={[
            styles.drawerHeader,
            { borderBottomColor: theme.colors.border },
          ]}
        >
          <View style={styles.drawerLogoContainer}>
            <View
              style={[
                styles.drawerLogoCircle,
                { backgroundColor: `${theme.colors.primary}90` },
              ]}
            >
              <Logo showText={false} size={60} />
            </View>

            <MaskedView
              maskElement={<Text style={styles.drawerBrandText}>AgriArch</Text>}
            >
              <LinearGradient
                colors={["#8BC34A", "#1B5E20"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Text style={[styles.drawerBrandText, { opacity: 0 }]}>
                  AgriArch
                </Text>
              </LinearGradient>
            </MaskedView>
          </View>
        </View>

        <View style={styles.drawerMenu}>
          {menuItems.map((section, idx) => (
            <View key={idx}>
              <Text
                style={[
                  styles.drawerSectionTitle,
                  { color: theme.colors.textSecondary },
                ]}
              >
                {section.section}
              </Text>
              {section.items.map((item, itemIdx) => (
                <TouchableOpacity
                  key={itemIdx}
                  style={styles.drawerItem}
                  onPress={() => navigateTo(item.route)}
                  activeOpacity={0.7}
                >
                  <View
                    style={[
                      styles.drawerIconWrapper,
                      { backgroundColor: `${theme.colors.primary}15` },
                    ]}
                  >
                    <Ionicons
                      name={item.icon}
                      size={16}
                      color={theme.colors.primary}
                    />
                  </View>
                  <Text
                    style={[
                      styles.drawerItemText,
                      { color: theme.colors.text },
                    ]}
                  >
                    {item.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </View>

        <View style={styles.footerSection}>
          <View
            style={[
              styles.footerDivider,
              { backgroundColor: theme.colors.border },
            ]}
          />
          <TouchableOpacity
            style={styles.drawerItem}
            onPress={() => navigateTo("/(main)/settings")}
            activeOpacity={0.7}
          >
            <View
              style={[
                styles.drawerIconWrapper,
                { backgroundColor: `${theme.colors.primary}15` },
              ]}
            >
              <Ionicons
                name="settings-outline"
                size={16}
                color={theme.colors.primary}
              />
            </View>
            <Text style={[styles.drawerItemText, { color: theme.colors.text }]}>
              Settings
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.logoutButton}
            onPress={handleLogout}
            activeOpacity={0.7}
          >
            <View
              style={[
                styles.drawerIconWrapper,
                { backgroundColor: "#F4433615" },
              ]}
            >
              <Ionicons name="log-out-outline" size={20} color="#F44336" />
            </View>
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: height * 0.06 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

export default function MainLayout() {
  const { theme } = useTheme();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ScrollProvider>
        <MainDrawer theme={theme} />
      </ScrollProvider>
    </GestureHandlerRootView>
  );
}

function MainDrawer({ theme }) {
  const navigation = useNavigation();

  // NOTE: hero/scroll reset on route change is handled per-screen via
  // useScrollReset (ScrollContext) + useFocusEffect — it fires reliably on
  // every drawer tab switch, unlike a listener on the parent navigator here.

  // Handle Android back button
  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (navigation.canGoBack()) {
        navigation.goBack();
        return true;
      }
      
      Alert.alert(
        "Exit App",
        "Are you sure you want to exit?",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Exit", onPress: () => BackHandler.exitApp() }
        ]
      );
      return true;
    });

    return () => backHandler.remove();
  }, [navigation]);

  return (
    <Drawer
        screenOptions={{
          drawerPosition: "left",
          drawerStyle: {
            width: width * 0.7,
            maxWidth: 280,
            backgroundColor: theme.colors.background,
          },
          headerShown: true,
          headerTransparent: true,
          header: ({ navigation }) => (
            <CustomHeader
              navigation={navigation}
              theme={theme}
            />
          ),
        }}
        drawerContent={(props) => <CustomDrawerContent {...props} />}
      >
        {/* ── MAIN SCREENS ── */}
        <Drawer.Screen name="dashboard" options={{ title: "Dashboard" }} />
        <Drawer.Screen name="devices" options={{ title: "Devices" }} />
        <Drawer.Screen name="system-control" options={{ title: "System Control" }} />
        <Drawer.Screen name="add_crops" options={{ title: "Add Crops" }} />
        <Drawer.Screen name="profile" options={{ title: "Profile" }} />
        
        {/* ── SETTINGS ── */}
        <Drawer.Screen name="settings" options={{ title: "Settings" }} />
        
        {/* ── HISTORY ── */}
        <Drawer.Screen name="pump-history" options={{ title: "Pump History" }} />
        <Drawer.Screen name="sensor-history" options={{ title: "Sensor History" }} />
        
        {/* ── SENSOR TABS (all sensors overview) ── */}
        <Drawer.Screen name="sensor-tabs" options={{ title: "Environmental Sensors" }} />
        
        {/* ── ENVIRONMENT SENSORS ── */}
        <Drawer.Screen name="ambient-temperature" options={{ title: "Ambient Temperature" }} />
        <Drawer.Screen name="ambient-humidity" options={{ title: "Ambient Humidity" }} />
        <Drawer.Screen name="light-level" options={{ title: "Light Level" }} />
        <Drawer.Screen name="co2" options={{ title: "CO₂ Level" }} />
        
        {/* ── WATER & SOIL SENSORS ── */}
        <Drawer.Screen name="water-temperature" options={{ title: "Water Temperature" }} />
        <Drawer.Screen name="water-level" options={{ title: "Water Level" }} />
        <Drawer.Screen name="ec-value" options={{ title: "EC Value" }} />
        <Drawer.Screen name="ph-level" options={{ title: "pH Level" }} />
        
        {/* ── INDIVIDUAL SENSOR DETAILS ── */}
        <Drawer.Screen name="sensor/[id]" options={{ title: "Sensor Details" }} />
        <Drawer.Screen name="sensor/ambient-temperature" options={{ title: "Temperature Details" }} />
        <Drawer.Screen name="sensor/ambient-humidity" options={{ title: "Humidity Details" }} />
        <Drawer.Screen name="sensor/ph-level" options={{ title: "pH Details" }} />
        <Drawer.Screen name="sensor/ec-value" options={{ title: "EC Details" }} />
      </Drawer>
  );
}

const styles = StyleSheet.create({
  // Transparent overlay — the drawer renders it above the screen content
  // (headerTransparent). The green top bar stays pinned; the hero slides
  // up behind it on scroll. Screens reserve its height as scroll padding.
  headerContainer: {
    zIndex: 10,
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 8,
    backgroundColor: "#2E7D32",
    zIndex: 2,
    // Android: elevation, not zIndex, decides sibling draw order. Keep the
    // hero (elevation 10) sliding BEHIND this opaque bar, never over it.
    elevation: 12,
  },
  headerIconButton: { padding: 6, position: "relative" },
  headerRightIcons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  logoContainer: {
    backgroundColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  heroSection: {
    position: "relative",
    width: "100%",
    zIndex: 1,
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
    shadowColor: "#1B5E20",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 10,
  },
  heroImage: {
    width: "100%",
    height: "100%",
    position: "absolute",
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
  },
  heroContent: { padding: 12, paddingTop: 8, paddingBottom: 12 },
  weatherTimeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  weatherInfo: { flexDirection: "row", alignItems: "center", gap: 8 },
  weatherIcon: { fontSize: 28 },
  weatherTemp: { fontSize: 18, fontWeight: "700", color: "#FFF" },
  weatherCondition: { fontSize: 11, color: "rgba(255,255,255,0.9)" },
  timeInfo: { alignItems: "flex-end" },
  timeText: { fontSize: 20, fontWeight: "700", color: "#FFF" },
  dateText: { fontSize: 11, color: "rgba(255,255,255,0.9)", marginTop: 2 },
  greetingContainer: { alignItems: "center", marginBottom: 8 },
  greetingText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFF",
    marginBottom: 2,
  },
  greetingSubtext: { fontSize: 11, color: "rgba(255,255,255,0.9)" },
  quickStats: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 12,
    padding: 8,
    justifyContent: "space-around",
  },
  statItem: { alignItems: "center", gap: 2 },
  statValue: { fontSize: 14, fontWeight: "700", color: "#FFF" },
  statLabel: { fontSize: 9, color: "rgba(255,255,255,0.9)" },
  statDivider: { width: 1, backgroundColor: "rgba(255,255,255,0.2)" },
  drawerContainer: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  drawerHeader: {
    paddingTop: 32,
    paddingBottom: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    marginBottom: 4,
  },
  drawerLogoContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 8,
    gap: 18,
    flexWrap: "nowrap",
  },
  drawerLogoCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  drawerBrandText: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  drawerMenu: { paddingHorizontal: 12, paddingBottom: 16 },
  drawerSectionTitle: {
    fontSize: 10,
    fontWeight: "600",
    marginTop: 12,
    marginBottom: 6,
    marginLeft: 8,
    letterSpacing: 0.5,
  },
  drawerItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 8,
    gap: 10,
  },
  drawerIconWrapper: {
    width: 30,
    height: 30,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  drawerItemText: { fontSize: 13, fontWeight: "500" },
  footerSection: { marginTop: 20, paddingHorizontal: 12 },
  footerDivider: { height: 1, marginVertical: 12 },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 8,
    gap: 10,
    marginBottom: 8,
  },
  logoutText: { fontSize: 13, fontWeight: "600", color: "#F44336" },
});