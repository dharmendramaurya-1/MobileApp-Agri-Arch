// src/context/ScrollContext.jsx
// Shared vertical-scroll offset across all (main) screens.
// The drawer header (hero section) collapses like a shutter when the
// current screen is scrolled down, and expands again when scrolled up.
//
// The header collapse runs on the NATIVE driver (transform + opacity only,
// no layout animation) for maximum smoothness on low-end devices. Because
// the header is a transparent overlay (headerTransparent), each screen must
// reserve the header's space via `headerHeight` (scroll content padding).
//
// IMPORTANT: we deliberately do NOT use Animated.event with
// useNativeDriver:true here. In this RN version that returns an
// AnimatedEvent OBJECT, which plain ScrollView/FlatList cannot call
// ("onScroll is not a function (it is Object)") — native-driven events only
// work when attached to Animated.ScrollView / Animated.FlatList. Instead we
// track the offset with a tiny JS handler and push it into the shared value
// via setValue(). The value is made native when the header's Animated.View
// mounts, so the translateY/opacity interpolations still run on the native
// compositor — the collapse stays silky — while any plain scrollable works.
import { useFocusEffect } from "expo-router";
import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { Animated, Dimensions, Platform } from "react-native";

const { height: windowHeight } = Dimensions.get("window");

// Rough first-paint estimate so screens aren't obscured before the real
// header height is measured (status bar + top row + hero).
const DEFAULT_HEADER_HEIGHT =
  (Platform.OS === "ios" ? 50 : 40) + 56 + Math.round(windowHeight * 0.22);

// Rough hero-section height estimate (used until the real one is measured).
const DEFAULT_HERO_HEIGHT = Math.round(windowHeight * 0.22);

const ScrollContext = createContext({
  scrollY: new Animated.Value(0),
  onScroll: () => {},
  resetScroll: () => {},
  headerHeight: DEFAULT_HEADER_HEIGHT,
  setHeaderHeight: () => {},
  heroHeight: DEFAULT_HERO_HEIGHT,
  setHeroHeight: () => {},
});

export function ScrollProvider({ children }) {
  const scrollY = useRef(new Animated.Value(0)).current;
  const [headerHeight, setHeaderHeightState] = useState(DEFAULT_HEADER_HEIGHT);
  const [heroHeight, setHeroHeightState] = useState(DEFAULT_HERO_HEIGHT);

  const setHeaderHeight = useCallback((h) => {
    setHeaderHeightState((prev) => (Math.abs(prev - h) > 1 ? h : prev));
  }, []);

  const setHeroHeight = useCallback((h) => {
    setHeroHeightState((prev) => (Math.abs(prev - h) > 1 ? h : prev));
  }, []);

  const value = useMemo(() => {
    // Track the current screen's vertical offset. Plain function — safe for
    // any ScrollView/FlatList's onScroll prop.
    const onScroll = (e) => {
      scrollY.setValue(e.nativeEvent.contentOffset.y);
    };

    // Re-expand the hero whenever a new screen is focused.
    const resetScroll = () => scrollY.setValue(0);

    return {
      scrollY,
      onScroll,
      resetScroll,
      headerHeight,
      setHeaderHeight,
      heroHeight,
      setHeroHeight,
    };
  }, [scrollY, headerHeight, setHeaderHeight, heroHeight, setHeroHeight]);

  return <ScrollContext.Provider value={value}>{children}</ScrollContext.Provider>;
}

export function useScroll() {
  return useContext(ScrollContext);
}

// Resets the hero to full and scrolls the given scrollable back to the top
// whenever the current screen gains focus (drawer tab switch / back nav).
// The shared scrollY lives in the ScrollProvider, but each screen keeps its
// own scroll offset — so on focus we both reset the hero (scrollY -> 0) AND
// scroll the screen's own ScrollView/FlatList back to y=0.
export function useScrollReset(ref) {
  const { resetScroll } = useScroll();

  useFocusEffect(
    useCallback(() => {
      resetScroll();
      // Restore the focused screen's scrollable to the top so the content
      // and the expanded hero are in sync again.
      const node = ref?.current;
      if (node) {
        if (typeof node.scrollToOffset === "function") {
          node.scrollToOffset({ offset: 0, animated: false });
        } else if (typeof node.scrollTo === "function") {
          node.scrollTo({ y: 0, animated: false });
        }
      }
    }, [resetScroll, ref])
  );
}
