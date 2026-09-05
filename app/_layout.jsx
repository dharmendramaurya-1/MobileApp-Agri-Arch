// app/_layout.tsx
import { Stack, router, useSegments } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import AppStatusBar from "../components/AppStatusBar";
import { AlertProvider } from "../src/context/AlertContext"; // ✅ UNCOMMENT YEH
import { AuthProvider, useAuth } from "../src/context/AuthContext";
import { HistoricalDataProvider } from "../src/context/HistoricalDataContext";
import { MqttProvider } from "../src/context/MqttContext";
import { NetworkProvider } from "../src/context/NetworkContext"; // ✅ Import
import { SystemModeProvider } from "../src/context/SystemModeContext";
import { ThemeProvider } from "../src/context/ThemContext";

function RootNav() {
  const { isLoading, isAuthenticated, isSignupFlow, token, isTokenExpired: checkExpired } = useAuth();
  const segments = useSegments();
  const hasRedirected = useRef(false);
  const appStateRef = useRef(AppState.currentState);
  const backgroundedAtRef = useRef(null);

  // Cold start: the index route is the branded splash. Keep it on screen
  // while auth is restored so the animation plays immediately. If the app
  // was deep-linked straight into a protected (main) screen, hold the UI
  // until auth is known so nothing flashes unauthenticated.
  const isSplashRoute = !segments[0] || segments[0] === "index";

  // `isLoading` is ALSO set to true while an explicit login/signup request is
  // in flight. The loading gate below must only fire on the initial cold-start
  // restore — never during login — otherwise the whole <Stack> unmounts and
  // remounts at its initial route (the splash), replaying the splash after
  // the user signs in.
  const [authRestoreDone, setAuthRestoreDone] = useState(false);
  useEffect(() => {
    if (!isLoading) setAuthRestoreDone(true);
  }, [isLoading]);

  // ── Reopen behavior: if the user closes the app (backgrounds it for more ──
  // ── than a few seconds) while signed in on a device/chart screen, reopen ──
  // ── on the dashboard instead of the stale chart. Quick app switches are ──
  // ── untouched, so the user keeps their place. ──
  const REOPEN_RESET_MS = 3000;
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      const prev = appStateRef.current;
      appStateRef.current = next;

      if (next === "background" || next === "inactive") {
        backgroundedAtRef.current = Date.now();
        return;
      }
      if (next !== "active") return;

      // First 'active' event on cold start (never saw a background) — let
      // the splash/redirect logic handle the initial route normally.
      if (backgroundedAtRef.current == null) return;
      // Quick return (notification shade etc.) — keep current screen.
      if (prev === "active") return;
      const goneMs = Date.now() - backgroundedAtRef.current;
      if (goneMs < REOPEN_RESET_MS) return;

      if (isLoading || !isAuthenticated || isSignupFlow) return;
      if (segments[0] !== "(main)") return;
      const path = segments.join("/");
      const isDeviceOrChartScreen =
        path.includes("/pump-history") || path.includes("sensor");
      if (!isDeviceOrChartScreen) return;

      console.log("🔄 App reopened on a device screen → going to dashboard");
      router.replace("/(main)/dashboard");
    });
    return () => sub.remove();
  }, [isLoading, isAuthenticated, isSignupFlow, segments]);

  useEffect(() => {
    if (isLoading) {
      console.log("⏳ Auth loading...");
      return;
    }

    const inMainGroup = segments[0] === "(main)";
    const inAuthGroup = segments[0] === "(auth)";
    const isOnboarding = segments[0] === "onboarding";
    const isIndex = !segments[0] || segments[0] === "index";

    // ── Check token expiry on every navigation ──
    if (isAuthenticated && token && checkExpired(token)) {
      console.log("⏰ Token expired during navigation → redirecting to login");
      hasRedirected.current = true;
      router.replace("/(auth)/login");
      return;
    }

    // The index route is the branded splash screen — it decides where to go
    // (dashboard when authenticated) after its progress bar finishes, so
    // never redirect away from it here.
    if (isIndex) {
      hasRedirected.current = false;
      return;
    }

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

  }, [isAuthenticated, isLoading, segments, isSignupFlow, token]);

  //      useEffect(() => {
  //   const getAllAsyncStorageData = async () => {
  //     try {
  //       const keys = await AsyncStorage.getAllKeys();

  //       console.log("AsyncStorage Keys:", keys);

  //       const data = await AsyncStorage.multiGet(keys);

  //       console.log("AsyncStorage Data:");

  //       data.forEach(([key, value]) => {
  //         console.log(`${key}:`, value);
  //       });
  //     } catch (error) {
  //       console.error("Error reading AsyncStorage:", error);
  //     }
  //   };

  //   getAllAsyncStorageData();
  // }, []);

  // Cold start: the index route is the branded splash. Keep it on screen
  // while auth is restored so the animation plays immediately. If the app
  // was deep-linked straight into a protected (main) screen, hold the UI
  // until auth is known so nothing flashes unauthenticated. This only
  // applies while auth is being restored for the first time — an explicit
  // login/signup must never unmount the navigator (that would reset it back
  // to the splash route).
  if (isLoading && !authRestoreDone && !isSplashRoute) {
    return (
      <View
        style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
      >
        <ActivityIndicator size="large" color="#2E7D32" />
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
                      <NetworkProvider>  {/* ✅ Wrap at the highest level */}

          <AuthProvider>
            <MqttProvider>
              <SystemModeProvider>
                
                <AlertProvider>
                  <HistoricalDataProvider>
                    <RootNav />
                  </HistoricalDataProvider>
                </AlertProvider>

              </SystemModeProvider>
            </MqttProvider>
          </AuthProvider>
                      </NetworkProvider>

        </ThemeProvider>
      </SafeAreaProvider>

    </GestureHandlerRootView>
  );
}