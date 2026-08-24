// app/(main)/profile.tsx
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useAuth } from "../../src/context/AuthContext";
import { useMqtt } from "../../src/context/MqttContext";
import { useTheme } from "../../src/context/ThemContext";
import { useScroll, useScrollReset } from "../../src/context/ScrollContext";

interface MenuItemProps {
  icon: string;
  label: string;
  onPress: () => void;
  color?: string;
}

function MenuItem({ icon, label, onPress, color }: MenuItemProps) {
  const { theme } = useTheme();
  return (
    <TouchableOpacity
      style={[styles.menuItem, { borderBottomColor: theme.colors.border }]}
      onPress={onPress}
      activeOpacity={0.6}
    >
      <View style={styles.menuLeft}>
        <View
          style={[
            styles.iconBox,
            {
              backgroundColor: theme.colors.surfaceVariant || theme.colors.card,
            },
          ]}
        >
          <Ionicons
            name={icon as any}
            size={22}
            color={color || theme.colors.primary}
          />
        </View>
        <Text style={[styles.menuLabel, { color: theme.colors.text }]}>
          {label}
        </Text>
      </View>
      <Ionicons
        name="chevron-forward"
        size={20}
        color={theme.colors.textSecondary}
      />
    </TouchableOpacity>
  );
}

export default function ProfileScreen() {
  const { theme, isDark, toggleTheme } = useTheme();
  const { logout } = useAuth();
  const { publishReboot, selectedExternalKey, isConnected, getSelectedDeviceOnlineStatus, getSelectedDeviceName } = useMqtt();
  const { onScroll, headerHeight } = useScroll();
  const [rebootPending, setRebootPending] = useState(false);
  const scrollRef = useRef(null);
  useScrollReset(scrollRef);

  // ✅ State for username
  const [username, setUsername] = useState<string>("User");
  const [isLoading, setIsLoading] = useState(true);
  const [profileData, setProfileData] = useState<any>(null);

  // ✅ useEffect INSIDE the component
  useEffect(() => {
    loadUserData();
  }, []);

  // ✅ Async function to load user data
  const loadUserData = async () => {
    try {
      setIsLoading(true);

      // Get username from AsyncStorage
      const storedUsername = await AsyncStorage.getItem("Username");

      if (storedUsername) {
        setUsername(storedUsername);
      } else {
        // Fallback: Try to get from user_profile API
        try {
          const { user_profile } =
            await import("../../src/services/profile/profile");
          const profileName = await user_profile();
          if (profileName) {
            setUsername(profileName);
            await AsyncStorage.setItem("Username", profileName);
          }
        } catch (apiError) {
          console.log("Could not fetch profile:", apiError);
          // Keep default "User"
        }
      }

      // You can also load other profile data here
      setProfileData({
        name: username,
        email: "user@example.com",
        // ... other data
      });
    } catch (error) {
      console.error("Error loading user data:", error);
      setUsername("User");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    Alert.alert("Logout", "Are you sure you want to logout?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Logout",
        style: "destructive",
        onPress: () => logout(),
      },
    ]);
  };

  const handleReboot = () => {
    if (rebootPending) {
      // Second click — execute reboot
      setRebootPending(false);
      doReboot();
    } else {
      // First click — show warning
      setRebootPending(true);
      Alert.alert(
        "⚠️ Reboot Device",
        "Are you sure you want to reboot?\n\nThe device will restart and lose connection temporarily.",
        [
          { text: "Cancel", style: "cancel", onPress: () => setRebootPending(false) },
          {
            text: "Yes, Reboot",
            style: "destructive",
            onPress: () => doReboot(),
          },
        ]
      );
      // Auto-reset pending state after 5 seconds
      setTimeout(() => setRebootPending(false), 5000);
    }
  };

  const doReboot = async () => {
    if (!selectedExternalKey) {
      Alert.alert("Error", "No device selected");
      return;
    }
    try {
      const success = await publishReboot(selectedExternalKey);
      if (success) {
        Alert.alert("✅ Reboot Sent", "Reboot command has been sent to the device. It will restart shortly.");
      } else {
        Alert.alert("❌ Failed", "Could not send reboot command.");
      }
    } catch (err) {
      Alert.alert("Error", "Failed to send reboot command.");
    }
  };

  const menuItems = [
    {
      icon: "person-circle-outline",
      label: "Account Settings",
      onPress: () =>
        Alert.alert("Coming Soon", "Account settings will be available soon."),
    },
    {
      icon: "shield-checkmark-outline",
      label: "Privacy Policy",
      onPress: () =>
        Alert.alert("Privacy Policy", "Our privacy policy protects your data."),
    },
    {
      icon: "help-circle-outline",
      label: "Help & Support",
      onPress: () =>
        Alert.alert("Help", "Contact us at support@organiciot.com"),
    },
    {
      icon: "chatbubble-ellipses-outline",
      label: "Feedback",
      onPress: () => Alert.alert("Feedback", "We appreciate your feedback!"),
    },
  ];

  // ✅ Loading state
  if (isLoading) {
    return (
      <View
        style={[
          styles.container,
          {
            backgroundColor: theme.colors.background,
            justifyContent: "center",
            alignItems: "center",
          },
        ]}
      >
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={{ color: theme.colors.text, marginTop: 10 }}>
          Loading profile...
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      ref={scrollRef}
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={[styles.content, { paddingTop: headerHeight }]}
      onScroll={onScroll}
      scrollEventThrottle={16}
    >
      {/* Profile Header */}
      <View
        style={[styles.profileCard, { backgroundColor: theme.colors.surface }]}
      >
        <View style={styles.avatarContainer}>
          <Image
            source={{ uri: "https://i.pravatar.cc/150?img=68" }}
            style={styles.avatar}
          />
          <View
            style={[
              styles.onlineDot,
              { backgroundColor: theme.colors.success || "#4CAF50" },
            ]}
          />
        </View>

        {/* ✅ Display username from state */}
        <Text style={[styles.name, { color: theme.colors.text }]}>
          {username || "User"}
        </Text>

        <Text style={[styles.email, { color: theme.colors.textSecondary }]}>
          {profileData?.email || "user@example.com"}
        </Text>
      </View>

      {/* Menu Items */}
      <View
        style={[styles.menuCard, { backgroundColor: theme.colors.surface }]}
      >
        {menuItems.map((item, index) => (
          <MenuItem
            key={index}
            icon={item.icon}
            label={item.label}
            onPress={item.onPress}
          />
        ))}
      </View>

      {/* Device Control Section */}
      {selectedExternalKey && (
        <View
          style={[styles.menuCard, { backgroundColor: theme.colors.surface }]}
        >
          <View style={[styles.deviceHeader, { borderBottomColor: theme.colors.border }]}>
            <Ionicons name="hardware-chip-outline" size={18} color={theme.colors.primary} />
            <Text style={[styles.deviceHeaderText, { color: theme.colors.textSecondary }]}>Device Control</Text>
          </View>

          {/* Device Info */}
          <View style={styles.deviceInfoRow}>
            <View style={styles.deviceInfoItem}>
              <Text style={[styles.deviceInfoLabel, { color: theme.colors.textSecondary }]}>Device</Text>
              <Text style={[styles.deviceInfoValue, { color: theme.colors.text }]} numberOfLines={1}>
                {getSelectedDeviceName() || "No Device"}
              </Text>
            </View>
            <View style={styles.deviceInfoItem}>
              <Text style={[styles.deviceInfoLabel, { color: theme.colors.textSecondary }]}>Status</Text>
              <View style={styles.deviceStatusRow}>
                <View style={[styles.statusDot, { backgroundColor: getSelectedDeviceOnlineStatus() ? '#4CAF50' : '#F44336' }]} />
                <Text style={[styles.deviceInfoValue, { color: getSelectedDeviceOnlineStatus() ? '#4CAF50' : '#F44336' }]}>
                  {getSelectedDeviceOnlineStatus() ? 'Online' : 'Offline'}
                </Text>
              </View>
            </View>
          </View>

          {/* Reboot Button */}
          <TouchableOpacity
            style={[styles.rebootButton, {
              backgroundColor: rebootPending ? '#F44336' : '#FF980010',
              borderColor: rebootPending ? '#F44336' : '#FF980040',
            }]}
            onPress={handleReboot}
            activeOpacity={0.7}
          >
            <Ionicons
              name="refresh"
              size={20}
              color={rebootPending ? '#FFF' : '#FF9800'}
            />
            <View style={styles.rebootTextWrap}>
              <Text style={[styles.rebootLabel, {
                color: rebootPending ? '#FFF' : '#FF9800',
                fontWeight: '700',
              }]}>
                {rebootPending ? 'Tap Again to Confirm' : 'Reboot Device'}
              </Text>
              <Text style={[styles.rebootHint, {
                color: rebootPending ? 'rgba(255,255,255,0.8)' : '#9E9E9E',
              }]}>
                {rebootPending
                  ? '⚠️ Device will restart immediately'
                  : 'Device will restart and reconnect'
                }
              </Text>
            </View>
            <Ionicons
              name={rebootPending ? 'alert-circle' : 'chevron-forward'}
              size={18}
              color={rebootPending ? '#FFF' : '#9E9E9E'}
            />
          </TouchableOpacity>
        </View>
      )}

      {/* Theme Toggle */}
      <View
        style={[styles.menuCard, { backgroundColor: theme.colors.surface }]}
      >
        <TouchableOpacity
          style={[styles.menuItem, { borderBottomWidth: 0 }]}
          onPress={toggleTheme}
          activeOpacity={0.6}
        >
          <View style={styles.menuLeft}>
            <View
              style={[
                styles.iconBox,
                {
                  backgroundColor:
                    theme.colors.surfaceVariant || theme.colors.card,
                },
              ]}
            >
              <Ionicons
                name={isDark ? "moon" : "sunny"}
                size={22}
                color={theme.colors.primary}
              />
            </View>
            <Text style={[styles.menuLabel, { color: theme.colors.text }]}>
              {isDark ? "Dark Mode" : "Light Mode"}
            </Text>
          </View>
          <View
            style={[
              styles.toggleTrack,
              {
                backgroundColor: isDark
                  ? theme.colors.primaryLight
                  : theme.colors.border,
              },
            ]}
          >
            <View
              style={[
                styles.toggleThumb,
                {
                  backgroundColor: isDark ? theme.colors.primary : "#FFFFFF",
                  alignSelf: isDark ? "flex-end" : "flex-start",
                },
              ]}
            />
          </View>
        </TouchableOpacity>
      </View>

      {/* Logout Button */}
      <TouchableOpacity
        style={[
          styles.logoutBtn,
          { backgroundColor: theme.colors.error + "15" },
        ]}
        onPress={handleLogout}
        activeOpacity={0.7}
      >
        <Ionicons name="log-out-outline" size={22} color={theme.colors.error} />
        <Text style={[styles.logoutText, { color: theme.colors.error }]}>
          Log Out
        </Text>
      </TouchableOpacity>

      {/* App Version */}
      <Text style={[styles.version, { color: theme.colors.textSecondary }]}>
        Organic IoT v1.0.0
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },

  // Profile Card
  profileCard: {
    alignItems: "center",
    padding: 24,
    borderRadius: 16,
    marginBottom: 16,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
  },
  avatarContainer: { position: "relative", marginBottom: 12 },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: "#FFFFFF",
  },
  onlineDot: {
    position: "absolute",
    bottom: 4,
    right: 4,
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  name: { fontSize: 20, fontWeight: "700", marginBottom: 4 },
  email: { fontSize: 14 },

  // Menu Card
  menuCard: {
    borderRadius: 16,
    marginBottom: 16,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    overflow: "hidden",
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  menuLeft: { flexDirection: "row", alignItems: "center" },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  menuLabel: { fontSize: 15, fontWeight: "500" },

  // Toggle
  toggleTrack: {
    width: 44,
    height: 26,
    borderRadius: 13,
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },

  // Device Control / Reboot
  deviceHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  deviceHeaderText: { fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
  deviceInfoRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 20,
  },
  deviceInfoItem: { flex: 1 },
  deviceInfoLabel: { fontSize: 10, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 2 },
  deviceInfoValue: { fontSize: 13, fontWeight: "600" },
  deviceStatusRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  rebootButton: {
    flexDirection: "row",
    alignItems: "center",
    margin: 12,
    marginTop: 4,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
  },
  rebootTextWrap: { flex: 1 },
  rebootLabel: { fontSize: 14, fontWeight: "600" },
  rebootHint: { fontSize: 11, marginTop: 2 },

  // Logout
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 14,
    marginBottom: 16,
  },
  logoutText: { fontSize: 16, fontWeight: "600", marginLeft: 8 },

  // Version
  version: { textAlign: "center", fontSize: 12 },
});
