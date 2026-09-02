// app/(main)/_layout.jsx
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import MaskedView from "@react-native-masked-view/masked-view";
import { getDrawerStatusFromState } from "@react-navigation/drawer";
import { LinearGradient } from "expo-linear-gradient";
import { router, useNavigation, usePathname } from "expo-router";
import { Drawer } from "expo-router/drawer";
import { Component, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  BackHandler,
  Dimensions,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";


import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AlertBadge } from "../../components/AlertBadge";
import { AlertList } from "../../components/AlertList";
import Logo from "../../components/Logo";
import { useAuth } from "../../src/context/AuthContext";
import { useMqtt } from "../../src/context/MqttContext";
import { ScrollProvider, useScroll } from "../../src/context/ScrollContext";
import { useTheme } from "../../src/context/ThemContext";
import { getParameterById } from "../../src/services/add_crops/add_crops";
import { user_profile } from "../../src/services/profile/profile";

const { width, height } = Dimensions.get("window");

class ErrorBoundary extends Component {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error) { console.warn('⚠️ Render error caught:', error.message); }
  render() { return this.state.hasError ? null : this.props.children; }
}

function CustomHeader({ navigation, theme }) {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [user_name, setUsername] = useState("");
  const [showAlerts, setShowAlerts] = useState(false);
  
  const [cropInfo, setCropInfo] = useState(null);

  // ✅ Get MQTT context - DIRECT ACCESS
  const { 
    getSelectedDeviceName,
    selectedExternalKey,
    externalKey,
    sensorData,
    connectionState,
    isConnected,
    // ✅ Directly access context values
    deviceOnlineStatus,
    deviceInitialLoadComplete,
  } = useMqtt();

  const selectedDeviceName = getSelectedDeviceName();
  
  // ✅ Get device key
  const deviceKey = selectedExternalKey || externalKey;

  // ✅ Directly read from context - SAME as dashboard
  const isDeviceOnline = useMemo(() => {
    if (!deviceKey) return false;
    return deviceOnlineStatus[deviceKey] === true;
  }, [deviceKey, deviceOnlineStatus]);

  // ✅ Get status display - only Online or Offline
  const getStatusDisplay = () => {
    if (isDeviceOnline) {
      return { text: 'Online', color: '#f7f8f7' };
    }
    return { text: 'Offline', color: '#cfcece' };
  };

  const statusDisplay = getStatusDisplay();

  // ✅ Fetch crop data when CropId changes
  const cropId = sensorData?.cropId;
  useEffect(() => {
    if (cropId === null || cropId === undefined || cropId === 0) {
      setCropInfo(null);
      return;
    }
    let cancelled = false;
    const fetchCrop = async () => {
      try {
        const result = await getParameterById(cropId);
        if (!cancelled && result.success && result.data) {
          setCropInfo(result.data);
        } else if (!cancelled) {
          setCropInfo(null);
        }
      } catch (e) {
        if (!cancelled) setCropInfo(null);
      }
    };
    fetchCrop();
    return () => { cancelled = true; };
  }, [cropId]);

  // ── Hero collapse (shutter) driven by the current screen's scroll ──────
  const { scrollY, setHeaderHeight, heroHeight, setHeroHeight } = useScroll();
  const heroMeasuredRef = useRef(false);

  // Native-driver collapse: the hero slides up (translateY) and fades in
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

  // When hero is collapsed, disable its touch area so dashboard buttons stay tappable
  const [heroCollapsed, setHeroCollapsed] = useState(false);
  useEffect(() => {
    const id = scrollY.addListener(({ value }) => {
      setHeroCollapsed(value > heroHeight * 0.5);
    });
    return () => scrollY.removeListener(id);
  }, [scrollY, heroHeight]);

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

  // ✅ Get device ID (external key) for display
  const deviceId = externalKey || 'No Device Selected';

  return (
    <View
      style={styles.headerContainer}
      pointerEvents="box-none"
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
          pointerEvents={heroCollapsed ? "none" : "auto"}
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
          <View style={[styles.heroImage, { backgroundColor: "#2E7D32", }]} />
          <View style={styles.heroContent}>
            {/* ── Device Name + Time ── */}
            <View style={styles.weatherTimeRow}>
              <View style={styles.weatherInfo}>
                <View>
                  <Text style={styles.weatherIcon}>🌱</Text>
                </View>
                <View>
                  <View style={styles.deviceNameRow}>
                    <Text style={styles.weatherTemp} numberOfLines={1}>
                      {selectedDeviceName || 'No Device'}
                    </Text>
                  </View>
                  <View>
                    <Text style={styles.macIdText}>
                      MAC: {deviceId === 'No Device Selected' ? '—' : '•••••' + deviceId.slice(-5)}
                    </Text>
                  </View>
                </View>
              </View>
              <View style={styles.timeInfo}>
                <Text style={styles.timeText}>{formatTime()}</Text>
                <Text style={styles.dateText}>{formatDate()}</Text>
              </View>
            </View>

            {/* ── Crop Info Row (horizontal) ── */}
            <View style={styles.cropInfoRowCard}>
              <View style={styles.cropInfoItem}>
                <Ionicons name="leaf-outline" size={14} color="#FFF" />
                <View>
                  <Text style={styles.cropInfoLabel}>Crop</Text>
                  <Text style={styles.cropInfoValue}>{cropInfo?.crop_name || 'N/A'}</Text>
                </View>
              </View>
              <View style={styles.cropInfoSep} />
              <View style={styles.cropInfoItem}>
                <Ionicons name="bar-chart-outline" size={14} color="#FFF" />
                <View>
                  <Text style={styles.cropInfoLabel}>Stage</Text>
                  <Text style={styles.cropInfoValue}>{cropInfo?.stage_id || 'N/A'}</Text>
                </View>
              </View>
              <View style={styles.cropInfoSep} />
              <View style={styles.cropInfoItem}>
                <Ionicons name="radio-outline" size={14} color="#FFF" />
                <View>
                  <Text style={styles.cropInfoLabel}>Status</Text>
                  {/* ✅ Show Online / Offline / Connecting */}
                  <Text style={[styles.cropInfoValue, { color: statusDisplay.color }]}>
                    {statusDisplay.text}
                  </Text>
                </View>
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
  const { 
    getSelectedDeviceName, 
    getSelectedDeviceId,
    selectedExternalKey,
    externalKey,
    // ✅ Directly access context values
    deviceOnlineStatus,
    deviceInitialLoadComplete,
    connectionState,
    isConnected,
  } = useMqtt();

  const selectedDeviceName = getSelectedDeviceName();
  const selectedDeviceId = getSelectedDeviceId();
  
  // ✅ Get device key
  const deviceKey = selectedExternalKey || externalKey;

  // ✅ Directly read from context - SAME as dashboard
  const isDeviceOnline = useMemo(() => {
    if (!deviceKey) return false;
    return deviceOnlineStatus[deviceKey] === true;
  }, [deviceKey, deviceOnlineStatus]);

  // ✅ Get status display for drawer - only Online or Offline
  const getDrawerStatusDisplay = () => {
    if (isDeviceOnline) {
      return { text: 'Active', color: '#4CAF50', dotColor: '#4CAF50' };
    }
    return { text: 'Offline', color: '#F44336', dotColor: '#F44336' };
  };

  const drawerStatus = getDrawerStatusDisplay();

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
              if (router.canDismiss?.()) router.dismissAll();
              router.replace("/onboarding");
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
        // { name: "Sensor History", icon: "analytics-outline", route: "/(main)/sensor-history" },
      ],
    },
  ];

  const insets = useSafeAreaInsets();
  const currentPath = usePathname();

  return (
    <View
      style={[
        styles.drawerContainer,
        { backgroundColor: theme.colors.background },
      ]}
    >
      {/* Top: Safe area + Logo + Close Button row */}
      <View style={{ paddingTop: insets.top }} />

      <View style={styles.drawerCloseBar}>
        <View style={styles.drawerLogoContainer}>
          <View
            style={[
              styles.drawerLogoCircle,
              { backgroundColor: `${theme.colors.primary}18` },
            ]}
          >
            <Logo showText={false} size={44} />
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

        <TouchableOpacity
          style={[styles.drawerCloseButton, { backgroundColor: `${theme.colors.textSecondary}18` }]}
          onPress={() => navigation.closeDrawer()}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="close" size={18} color={theme.colors.textSecondary || '#666'} />
        </TouchableOpacity>
      </View>

      <View style={[styles.drawerHeaderDivider, { backgroundColor: `${theme.colors.textSecondary}20` }]} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Selected device info */}
        {selectedDeviceName && (
          <View style={[styles.drawerDeviceInfo, { backgroundColor: `${theme.colors.textSecondary}0A`, marginHorizontal: 4 }]}>
            <View style={styles.drawerDeviceStatus}>
              <View style={[styles.drawerStatusDot, { backgroundColor: drawerStatus.dotColor }]} />
              <Text style={[styles.drawerDeviceName, { color: theme.colors.text }]}>
                {selectedDeviceName}
              </Text>
            </View>
            <Text style={[styles.drawerDeviceStatusText, { color: drawerStatus.color }]}>
              {drawerStatus.text}
            </Text>
          </View>
        )}

        <View style={styles.drawerMenu}>
          {menuItems.map((section, idx) => (
            <View key={idx} style={{ marginTop: idx > 0 ? 8 : 0 }}>
              <Text
                style={[
                  styles.drawerSectionTitle,
                  { color: theme.colors.textSecondary || '#999' },
                ]}
              >
                {section.section}
              </Text>
              {section.items.map((item, itemIdx) => {
                const isActive = currentPath?.includes(item.route.replace('/(main)/', ''));
                return (
                  <TouchableOpacity
                    key={itemIdx}
                    style={[styles.drawerItem, isActive && { backgroundColor: `${theme.colors.primary}12` }]}
                    onPress={() => navigateTo(item.route)}
                    activeOpacity={0.65}
                  >
                    <View
                      style={[
                        styles.drawerIconWrapper,
                        {
                          backgroundColor: isActive
                            ? `${theme.colors.primary}20`
                            : `${theme.colors.textSecondary || '#999'}0D`,
                        },
                      ]}
                    >
                      <Ionicons
                        name={item.icon}
                        size={16}
                        color={isActive ? theme.colors.primary : (theme.colors.textSecondary || '#999')}
                      />
                    </View>
                    <Text
                      style={[
                        styles.drawerItemText,
                        {
                          color: isActive ? theme.colors.primary : theme.colors.text,
                          fontWeight: isActive ? '600' : '500',
                        },
                      ]}
                    >
                      {item.name}
                    </Text>
                    {isActive && (
                      <View style={[styles.drawerActiveIndicator, { backgroundColor: theme.colors.primary }]} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>

        <View style={styles.footerSection}>
          <View
            style={[
              styles.footerDivider,
              { backgroundColor: `${theme.colors.textSecondary || '#999'}15` },
            ]}
          />
          <TouchableOpacity
            style={styles.drawerItem}
            onPress={() => navigateTo("/(main)/settings")}
            activeOpacity={0.65}
          >
            <View
              style={[
                styles.drawerIconWrapper,
                { backgroundColor: `${theme.colors.textSecondary || '#999'}0D` },
              ]}
            >
              <Ionicons
                name="settings-outline"
                size={16}
                color={theme.colors.textSecondary || '#999'}
              />
            </View>
            <Text style={[styles.drawerItemText, { color: theme.colors.text }]}>Settings</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.drawerItem, { marginTop: 4 }]}
            onPress={handleLogout}
            activeOpacity={0.65}
          >
            <View
              style={[styles.drawerIconWrapper, { backgroundColor: '#F4433612' }]}
            >
              <Ionicons name="log-out-outline" size={16} color="#F44336" />
            </View>
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 20 }} />
      </ScrollView>
    </View>
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

/* ── BOTTOM TAB BAR (for Drawer layout) ── */
function DrawerBottomBar({ theme }) {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  // Extract the screen name from pathname, e.g. "/(main)/settings" -> "settings"
  const currentRoute = pathname?.split("/").filter(Boolean).pop() || "dashboard";

  const tabs = [
    { key: "dashboard", label: "Dashboard", icon: "grid-outline", iconActive: "grid" },
    { key: "system-control", label: "Control", icon: "options-outline", iconActive: "options" },
    { key: "add_crops", label: "Crops", icon: "leaf-outline", iconActive: "leaf" },
    { key: "devices", label: "Devices", icon: "hardware-chip-outline", iconActive: "hardware-chip" },
    { key: "settings", label: "Settings", icon: "settings-outline", iconActive: "settings" },
  ];

  const activeColor = theme.colors.primary;
  const inactiveColor = theme.colors.textSecondary || "#999";
  const tabBarBg = theme.dark ? "#1A1A1A" : "#FFFFFF";

  return (
    <View style={styles.bottomBarWrapper}>
      <LinearGradient
        colors={theme.dark
          ? ["#1B5E2000", "#2E7D32", "#1B5E2000"]
          : ["#4CAF5000", "#4CAF50", "#4CAF5000"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.bottomBarGradient}
      />
      <View
        style={[
          styles.bottomBar,
          {
            backgroundColor: tabBarBg,
            paddingBottom: insets.bottom > 0 ? insets.bottom : 8,
          },
        ]}
      >
        {tabs.map((tab) => {
          const isActive = currentRoute === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={styles.bottomTabItem}
              onPress={() => {
                if (currentRoute !== tab.key) {
                  router.push(`/(main)/${tab.key}`);
                }
              }}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            >
              <View style={styles.bottomTabIconContainer}>
                <Ionicons
                  name={isActive ? tab.iconActive : tab.icon}
                  size={22}
                  color={isActive ? activeColor : inactiveColor}
                />
              </View>
              <Text
                style={[
                  styles.bottomTabLabel,
                  {
                    color: isActive ? activeColor : inactiveColor,
                    fontWeight: isActive ? "700" : "500",
                  },
                ]}
                numberOfLines={1}
              >
                {tab.label}
              </Text>
              <View
                style={[
                  styles.bottomTabIndicator,
                  { backgroundColor: isActive ? activeColor : "transparent" },
                ]}
              />
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function MainDrawer({ theme }) {
  const navigation = useNavigation();

  // Handle Android back button
  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      const state = navigation.getState();

      if (state?.type !== 'drawer') return false;

      try {
        if (getDrawerStatusFromState(state) === 'open') {
          navigation.closeDrawer();
          return true;
        }
      } catch {
        // state not ready yet — fall through
      }

      const currentRoute = state?.routes?.[state?.index ?? 0]?.name;
      if (currentRoute && currentRoute !== 'dashboard') {
        navigation.navigate('dashboard');
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
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1, zIndex: 1 }}>
        <Drawer
          screenOptions={{
            drawerPosition: "left",
            drawerStyle: {
              width: width * 0.72,
              maxWidth: 290,
              backgroundColor: theme.colors.background,
              borderTopRightRadius: 20,
              borderBottomRightRadius: 20,
              shadowColor: '#000',
              shadowOffset: { width: 2, height: 0 },
              shadowOpacity: 0.25,
              shadowRadius: 12,
              elevation: 30,
            },
            overlayColor: 'rgba(0,0,0,0.5)',
            headerShown: true,
            headerTransparent: true,
            header: ({ navigation }) => (
              <ErrorBoundary>
                <CustomHeader
                  navigation={navigation}
                  theme={theme}
                />
              </ErrorBoundary>
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
      </View>
      <DrawerBottomBar theme={theme} />
    </View>
  );
}

const styles = StyleSheet.create({
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
    borderBottomLeftRadius: 27,
    borderBottomRightRadius: 27,
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
    borderBottomLeftRadius: 27,
    borderBottomRightRadius: 27,
    // paddingBottom: 30,
  },
  heroContent: { padding: 12, paddingTop: 8, paddingBottom: 12, },
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
  deviceNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  activeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  activeBadgeText: {
    color: "#FFF",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  macIdText: {
    fontSize: 11,
    color: "rgba(255,255,255,0.7)",
    marginTop: 2,
    fontWeight: "500",
  },
  timeInfo: { alignItems: "flex-end" },
  timeText: { fontSize: 20, fontWeight: "700", color: "#FFF" },
  dateText: { fontSize: 11, color: "rgba(255,255,255,0.9)", marginTop: 2 },
  greetingContainer: { alignItems: "center", marginBottom: 4, marginTop: 10 },
  greetingText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFF",
    marginBottom: 2,
  },
  greetingSubtext: { fontSize: 11, color: "rgba(255,255,255,0.9)" },
  
  // ── Crop Info Row (horizontal) ──
  cropInfoRowCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 6,
    marginTop: 4,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  cropInfoItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  cropInfoSep: {
    width: 1,
    height: "80%",
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  cropInfoLabel: {
    fontSize: 9,
    color: "rgba(255,255,255,0.6)",
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  cropInfoValue: {
    fontSize: 11,
    color: "#FFF",
    fontWeight: "700",
    marginTop: 1,
  },

  // ── Drawer styles ──
  drawerContainer: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: 12, paddingBottom: 20 },
  drawerCloseBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  drawerCloseButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawerHeaderDivider: {
    height: 1,
    marginHorizontal: 16,
  },
  drawerHeader: {
    paddingTop: 8,
    paddingBottom: 12,
    paddingHorizontal: 4,
    marginBottom: 4,
  },
  drawerLogoContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flexWrap: "nowrap",
  },
  drawerLogoCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  drawerBrandText: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  drawerDeviceInfo: {
    marginTop: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 12,
  },
  drawerDeviceStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  drawerStatusDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  drawerDeviceName: {
    fontSize: 14,
    fontWeight: "600",
  },
  drawerDeviceStatusText: {
    fontSize: 12,
    marginTop: 3,
    marginLeft: 17,
  },
  drawerMenu: { paddingHorizontal: 12, paddingBottom: 12 },
  drawerSectionTitle: {
    fontSize: 10,
    fontWeight: "700",
    marginTop: 16,
    marginBottom: 8,
    marginLeft: 8,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  drawerItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    gap: 12,
    marginBottom: 2,
  },
  drawerIconWrapper: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  drawerItemText: { fontSize: 13, fontWeight: "500", flex: 1 },
  drawerActiveIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginLeft: 'auto',
  },
  footerSection: { marginTop: 12, paddingHorizontal: 12 },
  footerDivider: { height: 1, marginVertical: 8 },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    gap: 12,
  },
  logoutText: { fontSize: 13, fontWeight: "600", color: "#F44336" },
  // ── Bottom Tab Bar ──
  bottomBarWrapper: {
    backgroundColor: "transparent",
  },
  bottomBarGradient: {
    height: 2,
    width: "100%",
  },
  bottomBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingTop: 6,
    borderTopWidth: 0,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 5,
    zIndex: 1,
  },
  bottomTabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
    position: "relative",
  },
  bottomTabIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 3,
  },
  bottomTabLabel: {
    fontSize: 10,
    marginTop: 3,
    letterSpacing: 0.2,
  },
  bottomTabIndicator: {
    width: 5,
    height: 5,
    borderRadius: 3,
    marginTop: 4,
  },
});