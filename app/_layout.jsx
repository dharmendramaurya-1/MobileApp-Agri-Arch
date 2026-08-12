// app/_layout.tsx
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Stack, router, useSegments } from "expo-router";
import { useEffect, useRef } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import AppStatusBar from "../components/AppStatusBar";
import { AlertProvider } from "../src/context/AlertContext"; // ✅ UNCOMMENT YEH
import { AuthProvider, useAuth } from "../src/context/AuthContext";
import { HistoricalDataProvider } from "../src/context/HistoricalDataContext";
import { MqttProvider } from "../src/context/MqttContext";
import { SystemModeProvider } from "../src/context/SystemModeContext";
import { ThemeProvider, useTheme } from "../src/context/ThemContext";

function RootNav() {
  const { theme } = useTheme();
  const { isLoading, isAuthenticated, isSignupFlow } = useAuth();
  const segments = useSegments();
  const hasRedirected = useRef(false);

  useEffect(() => {
    if (isLoading) {
      console.log("⏳ Auth loading...");
      return;
    }




    const inMainGroup = segments[0] === "(main)";
    const inAuthGroup = segments[0] === "(auth)";
    const isOnboarding = segments[0] === "onboarding";
    const isIndex = !segments[0] || segments[0] === "index";

    console.log("🔐 Navigation check:", {
      isAuthenticated,
      isLoading,
      isSignupFlow,
      inMainGroup,
      inAuthGroup,
      isOnboarding,
      isIndex,
      segments,
      hasRedirected: hasRedirected.current,
    });

    if (isSignupFlow) {
      console.log("⏳ Signup flow active - allowing auth screens");

      if (inMainGroup) {
        const currentPath = segments.join('/');
        if (currentPath !== '(main)/add_crops') {
          console.log("🔄 Signup flow: Redirecting to auth/add_device");
          hasRedirected.current = true;
          router.replace("/(auth)/add_device");
          return;
        }
      }

      if (isIndex || isOnboarding) {
        console.log("🔄 Signup flow: Redirecting to auth/add_device");
        hasRedirected.current = true;
        router.replace("/(auth)/add_device");
        return;
      }

      hasRedirected.current = false;
      return;
    }

    if (isAuthenticated && inMainGroup) {
      console.log("✅ Already in main section");
      hasRedirected.current = false;
      return;
    }

    if (!isAuthenticated && (inAuthGroup || isOnboarding || isIndex)) {
      console.log("✅ Already in public section");
      hasRedirected.current = false;
      return;
    }

    if (hasRedirected.current) {
      console.log("⏭️ Skipping redirect - already redirected");
      return;
    }

    if (isAuthenticated && !inMainGroup && !inAuthGroup) {
      console.log("✅ Authenticated → Redirecting to dashboard");
      hasRedirected.current = true;
      router.replace("/(main)/dashboard");
      return;
    }

    if (!isAuthenticated && inMainGroup) {
      console.log("❌ Not authenticated → Redirecting to onboarding");
      hasRedirected.current = true;
      router.replace("/onboarding");
      return;
    }

    hasRedirected.current = false;
    console.log("⏭️ No redirect needed");

  }, [isAuthenticated, isLoading, segments, isSignupFlow]);

       useEffect(() => {
    const getAllAsyncStorageData = async () => {
      try {
        const keys = await AsyncStorage.getAllKeys();

        console.log("AsyncStorage Keys:", keys);

        const data = await AsyncStorage.multiGet(keys);

        console.log("AsyncStorage Data:");

        data.forEach(([key, value]) => {
          console.log(`${key}:`, value);
        });
      } catch (error) {
        console.error("Error reading AsyncStorage:", error);
      }
    };

    getAllAsyncStorageData();
  }, []);

  if (isLoading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: theme.colors.background,
        }}
      >
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={{ marginTop: 10, color: theme.colors.text }}>
          Loading...
        </Text>
      </View>
    );
  }

  return (
    <>
      {/* ✅ Single centralized status bar applied to every screen */}
      <AppStatusBar />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(main)" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AuthProvider>
            <MqttProvider>
              <SystemModeProvider>
                
                {/* ✅ AlertProvider KO UNCOMMENT KARO */}
                <AlertProvider>
                  <HistoricalDataProvider>
                    <RootNav />
                  </HistoricalDataProvider>
                </AlertProvider>

              </SystemModeProvider>
            </MqttProvider>
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}