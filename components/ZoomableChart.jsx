// components/ZoomableChart.jsx
// Fullscreen chart strip that supports:
//   • one-finger drag to pan across the chart
//   • two-finger pinch to zoom in/out (1x – 6x), anchored at the fingers
//   • double-tap to reset zoom and position
// The content (LineChart) is transformed natively, so gestures stay smooth.
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";

const MIN_SCALE = 1;
const MAX_SCALE = 6;
const EDGE_FADE_W = 26;

const clampNum = (v, min, max) => {
  "worklet";
  return Math.min(Math.max(v, min), max);
};

export default function ZoomableChart({
  children,
  chartWidth,
  chartHeight,
  background = "#fff",
}) {
  const [edge, setEdge] = useState({ canGoLeft: false, canGoRight: false });
  const [hintVisible, setHintVisible] = useState(true);

  // Screen-space position of the content's top-left corner inside the viewport
  const scaleV = useSharedValue(1);
  const leftV = useSharedValue(0);
  const topV = useSharedValue(0);
  // Measured viewport size
  const viewW = useSharedValue(chartWidth);
  const viewH = useSharedValue(chartHeight);
  // Values frozen at the start of the current gesture
  const savedScale = useSharedValue(1);
  const savedLeft = useSharedValue(0);
  const savedTop = useSharedValue(0);

  const updateEdgeState = useCallback(() => {
    const vw = viewW.value;
    const s = scaleV.value;
    const l = leftV.value;
    const scaledW = chartWidth * s;
    const canGoLeft = scaledW > vw + 2 && l < -2;
    const canGoRight = scaledW > vw + 2 && l + scaledW > vw + 2;
    setEdge((prev) =>
      prev.canGoLeft === canGoLeft && prev.canGoRight === canGoRight
        ? prev
        : { canGoLeft, canGoRight }
    );
  }, [chartWidth, scaleV, leftV, viewW]);

  const hideHint = useCallback(() => setHintVisible(false), []);

  const onViewportLayout = useCallback(
    (e) => {
      const { width: vw, height: vh } = e.nativeEvent.layout;
      if (vw === viewW.value && vh === viewH.value) return;
      viewW.value = vw;
      viewH.value = vh;
      const s = scaleV.value;
      const scaledW = chartWidth * s;
      const scaledH = chartHeight * s;
      leftV.value =
        scaledW <= vw ? (vw - scaledW) / 2 : clampNum(leftV.value, vw - scaledW, 0);
      topV.value =
        scaledH <= vh ? (vh - scaledH) / 2 : clampNum(topV.value, vh - scaledH, 0);
      updateEdgeState();
    },
    [chartWidth, chartHeight, scaleV, leftV, topV, viewW, viewH, updateEdgeState]
  );

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .minPointers(1)
        .maxPointers(1)
        .onStart(() => {
          runOnJS(hideHint)();
          savedLeft.value = leftV.value;
          savedTop.value = topV.value;
        })
        .onUpdate((e) => {
          const vw = viewW.value;
          const vh = viewH.value;
          const scaledW = chartWidth * scaleV.value;
          const scaledH = chartHeight * scaleV.value;
          leftV.value =
            scaledW <= vw
              ? (vw - scaledW) / 2
              : clampNum(savedLeft.value + e.translationX, vw - scaledW, 0);
          topV.value =
            scaledH <= vh
              ? (vh - scaledH) / 2
              : clampNum(savedTop.value + e.translationY, vh - scaledH, 0);
        })
        .onFinalize(() => {
          runOnJS(updateEdgeState)();
        }),
    [
      chartWidth,
      chartHeight,
      scaleV,
      leftV,
      topV,
      viewW,
      viewH,
      savedLeft,
      savedTop,
      hideHint,
      updateEdgeState,
    ]
  );

  const pinch = useMemo(
    () =>
      Gesture.Pinch()
        .onStart(() => {
          runOnJS(hideHint)();
          savedScale.value = scaleV.value;
          savedLeft.value = leftV.value;
          savedTop.value = topV.value;
        })
        .onUpdate((e) => {
          const vw = viewW.value;
          const vh = viewH.value;
          const newScale = clampNum(savedScale.value * e.scale, MIN_SCALE, MAX_SCALE);
          // Keep the chart point under the pinch fingers stationary
          const contentX = (e.focalX - savedLeft.value) / savedScale.value;
          const contentY = (e.focalY - savedTop.value) / savedScale.value;
          const scaledW = chartWidth * newScale;
          const scaledH = chartHeight * newScale;
          scaleV.value = newScale;
          leftV.value =
            scaledW <= vw
              ? (vw - scaledW) / 2
              : clampNum(e.focalX - contentX * newScale, vw - scaledW, 0);
          topV.value =
            scaledH <= vh
              ? (vh - scaledH) / 2
              : clampNum(e.focalY - contentY * newScale, vh - scaledH, 0);
        })
        .onFinalize(() => {
          runOnJS(updateEdgeState)();
        }),
    [
      chartWidth,
      chartHeight,
      scaleV,
      leftV,
      topV,
      viewW,
      viewH,
      savedScale,
      savedLeft,
      savedTop,
      hideHint,
      updateEdgeState,
    ]
  );

  const doubleTap = useMemo(
    () =>
      Gesture.Tap()
        .numberOfTaps(2)
        .maxDelay(280)
        .onStart(() => {
          runOnJS(hideHint)();
        })
        .onEnd(() => {
          scaleV.value = 1;
          leftV.value = 0;
          topV.value = 0;
          runOnJS(updateEdgeState)();
        }),
    [scaleV, leftV, topV, hideHint, updateEdgeState]
  );

  const composed = useMemo(
    () => Gesture.Race(Gesture.Simultaneous(pan, pinch), doubleTap),
    [pan, pinch, doubleTap]
  );

  const animatedStyle = useAnimatedStyle(() => {
    const s = scaleV.value;
    // RN scales around the content's center; compensate so `leftV`/`topV`
    // describe the content's top-left corner on screen.
    const tx = leftV.value - (chartWidth * (1 - s)) / 2;
    const ty = topV.value - (chartHeight * (1 - s)) / 2;
    return {
      transform: [{ translateX: tx }, { translateY: ty }, { scale: s }],
    };
  }, [chartWidth, chartHeight]);

  const hintActive = hintVisible && (edge.canGoLeft || edge.canGoRight);

  return (
    <GestureHandlerRootView style={styles.root}>
      <GestureDetector gesture={composed}>
        <View
          style={[styles.viewport, { height: chartHeight }]}
          onLayout={onViewportLayout}
        >
          <Animated.View
            style={[
              {
                width: chartWidth,
                height: chartHeight,
                backgroundColor: background,
              },
              animatedStyle,
            ]}
          >
            {children}
          </Animated.View>

          {/* Edge fades: hint there is more of the chart off-screen */}
          {edge.canGoLeft && (
            <LinearGradient
              colors={[background, "transparent"]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.fadeLeft}
              pointerEvents="none"
            />
          )}
          {edge.canGoRight && (
            <LinearGradient
              colors={["transparent", background]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.fadeRight}
              pointerEvents="none"
            />
          )}

          {/* One-time hint that the chart can be pinched/swiped */}
          {hintActive && (
            <View style={styles.hintLayer} pointerEvents="none">
              <View style={styles.hint}>
                <Animated.Text style={styles.hintText}>
                  Pinch to zoom · drag to move
                </Animated.Text>
              </View>
            </View>
          )}
        </View>
      </GestureDetector>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { width: "100%" },
  viewport: {
    width: "100%",
    position: "relative",
    overflow: "hidden",
  },
  fadeLeft: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: EDGE_FADE_W,
  },
  fadeRight: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: EDGE_FADE_W,
  },
  hintLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  hint: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  hintText: { color: "#FFF", fontSize: 12, fontWeight: "600" },
});
