// components/SettingsSlider.jsx
// Dual-thumb range slider / single-thumb slider built on React Native's core
// PanResponder — zero extra dependencies, works on iOS, Android and web.
//
// Range mode: <SliderControl min max minValue maxValue onChange={(low, high) => ...} />
// Single mode: <SliderControl single min max minValue={value} onChange={(v) => ...} />
//
// Dragging is smooth and deterministic:
//  - The WHOLE track claims the touch on touch-down, so the parent ScrollView
//    can never steal the drag and the grabbed thumb follows the finger.
//  - Touching the LEFT half of the track always drags MIN; the RIGHT half
//    always drags MAX (the boundary is the midpoint between the thumbs), so
//    dragging one thumb NEVER moves the other.
//  - min may be dragged up to equal max (and vice versa), but never past it.
import React, { useRef, useState } from "react";
import { PanResponder, StyleSheet, Text, View } from "react-native";

const THUMB_SIZE = 26;
const TRACK_HEIGHT = 6;
const HIT_AREA = 46;
const BUBBLE_WIDTH = 84; // live value bubble above the dragged thumb
const BUBBLE_GAP = 4;    // gap between the thumb and the bubble arrow

// Snap a value to the nearest step (decimal-safe, e.g. 0.1 steps for pH).
const snapValue = (value, min, step) =>
  parseFloat((Math.round((value - min) / step) * step + min).toFixed(4));

export default function SliderControl({
  single = false,
  min = 0,
  max = 100,
  minValue = 0,
  maxValue = 100,
  step = 1,
  onChange,
  tintColor = "#2D6A4F",
  thumbColor = "#FFFFFF",
  trackColor = "#E4E7EC",
  disabled = false,
  formatValue = (v) => String(v),
}) {
  const [trackWidth, setTrackWidth] = useState(0);

  // Live value bubble state: which thumb is being dragged and its value.
  const [drag, setDrag] = useState(null);

  // Which thumb is being dragged ("low" | "high" | "single" | null).
  const activeRef = useRef(null);
  const lastEmitRef = useRef({ low: null, high: null });

  const range = Math.max(max - min, 1);

  // Normalise so low <= high even if the parent passes inverted values.
  const rawLow = snapValue(Math.min(Math.max(minValue, min), max), min, step);
  const rawHigh = single
    ? rawLow
    : snapValue(Math.min(Math.max(maxValue, min), max), min, step);
  const low = Math.min(rawLow, rawHigh);
  const high = Math.max(rawLow, rawHigh);

  const inner = Math.max(trackWidth - THUMB_SIZE, 1);
  const xFromValue = (v) => ((v - min) / range) * inner;

  // Latest props mirrored into a ref so the stable PanResponder never goes
  // stale (and a re-render mid-drag can't drop the gesture).
  const stateRef = useRef({});
  stateRef.current = {
    single,
    min,
    max,
    step,
    onChange,
    disabled,
    trackWidth,
    low,
    high,
    xFromValue,
  };

  const applyLocation = (locationX) => {
    const s = stateRef.current;
    const { trackWidth: width, onChange: cb, single: isSingle } = s;
    if (!width || !cb || s.disabled) return;

    const innerWidth = Math.max(width - THUMB_SIZE, 1);
    const x = Math.min(Math.max(locationX - THUMB_SIZE / 2, 0), innerWidth);
    const raw = snapValue(s.min + (x / innerWidth) * (s.max - s.min), s.min, s.step);

    const which = activeRef.current;
    let nextLow = s.low;
    let nextHigh = s.high;
    if (isSingle) {
      nextLow = raw;
    } else if (which === "low") {
      // Strict clamp: min may reach max but never push it.
      nextLow = Math.min(raw, s.high);
    } else if (which === "high") {
      // Strict clamp: max may reach min but never push it.
      nextHigh = Math.max(raw, s.low);
    } else {
      return;
    }

    // Keep the live value bubble in sync with the dragged thumb.
    const dragValue = isSingle ? nextLow : which === "low" ? nextLow : nextHigh;
    setDrag((prev) =>
      prev && prev.which === which && prev.value === dragValue ? prev : { which, value: dragValue }
    );

    const prev = lastEmitRef.current;
    if (prev.low !== nextLow || prev.high !== nextHigh) {
      lastEmitRef.current = { low: nextLow, high: nextHigh };
      if (isSingle) cb(nextLow);
      else cb(nextLow, nextHigh);
    }
  };

  // Accessibility: nudge the active value(s) by one step (VoiceOver / TalkBack).
  const stepValue = (delta) => {
    const s = stateRef.current;
    if (!s.onChange || s.disabled) return;
    if (s.single) {
      const next = snapValue(s.low + delta * s.step, s.min, s.step);
      s.onChange(Math.min(Math.max(next, s.min), s.max));
    } else {
      const nextLow = Math.min(
        snapValue(s.low + delta * s.step, s.min, s.step),
        s.high
      );
      const nextHigh = Math.max(
        snapValue(s.high + delta * s.step, s.min, s.step),
        s.low
      );
      s.onChange(nextLow, nextHigh);
    }
  };

  // ── Track responder ───────────────────────────────────────────────────────
  // The WHOLE track claims the touch IMMEDIATELY on touch-down
  // (onStartShouldSetPanResponder: true). Once a JS responder is set at touch
  // start, React Native tells the native ScrollView to back off, so dragging
  // anywhere on the line — not just the thumb circles — slides smoothly.
  // Which thumb moves is decided once at grant from the touch position
  // (left of the midpoint → MIN, right → MAX) and then follows the finger.
  const trackResponderRef = useRef(null);
  if (!trackResponderRef.current) {
    trackResponderRef.current = PanResponder.create({
      onStartShouldSetPanResponder: () => !stateRef.current.disabled,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const s = stateRef.current;
        const x = evt.nativeEvent.locationX;
        if (s.single) {
          activeRef.current = "single";
        } else {
          // Boundary between the two thumbs, in track coordinates.
          const midX = (s.xFromValue(s.low) + s.xFromValue(s.high)) / 2;
          activeRef.current = x - THUMB_SIZE / 2 < midX ? "low" : "high";
        }
        applyLocation(x);
      },
      onPanResponderMove: (evt) => applyLocation(evt.nativeEvent.locationX),
      onPanResponderRelease: () => {
        activeRef.current = null;
        setDrag(null);
      },
      onPanResponderTerminate: () => {
        activeRef.current = null;
        setDrag(null);
      },
      onPanResponderTerminationRequest: () => false,
    });
  }
  const trackResponder = trackResponderRef.current;

  return (
    <View
      style={[styles.container, disabled && styles.disabled]}
      onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
      {...trackResponder.panHandlers}
      accessibilityRole="adjustable"
      accessibilityLabel={single ? "Slider" : "Range slider"}
      accessibilityValue={{ min, max, now: single ? low : `${low}–${high}` }}
      accessibilityActions={[
        { name: "increment", label: "Increase" },
        { name: "decrement", label: "Decrease" },
      ]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === "increment") stepValue(1);
        else if (event.nativeEvent.actionName === "decrement") stepValue(-1);
      }}
    >
      {/* Track + active segment (decorative only) */}
      <View style={styles.trackLayer} pointerEvents="none">
        <View style={[styles.track, { backgroundColor: trackColor }]} />
        <View
          style={[
            styles.trackActive,
            {
              left: single ? 0 : xFromValue(low),
              width: single
                ? xFromValue(low)
                : Math.max(xFromValue(high) - xFromValue(low), 0),
              backgroundColor: tintColor,
            },
          ]}
        />
      </View>

      {/* Visual thumbs — decorative; the track owns all touch handling. */}
      <View
        pointerEvents="none"
        style={[
          styles.thumb,
          { left: xFromValue(low), backgroundColor: thumbColor, borderColor: tintColor },
        ]}
      />
      {!single && (
        <View
          pointerEvents="none"
          style={[
            styles.thumb,
            { left: xFromValue(high), backgroundColor: thumbColor, borderColor: tintColor },
          ]}
        />
      )}

      {/* Live value bubble shown above the dragged thumb */}
      {drag && (
        <View
          pointerEvents="none"
          style={[
            styles.bubbleWrap,
            {
              left: Math.min(
                Math.max(xFromValue(drag.value) + THUMB_SIZE / 2 - BUBBLE_WIDTH / 2, 2),
                Math.max(trackWidth - BUBBLE_WIDTH - 2, 2)
              ),
            },
          ]}
        >
          <View style={[styles.bubble, { backgroundColor: tintColor }]}>
            <Text style={styles.bubbleText} numberOfLines={1}>
              {formatValue(drag.value)}
            </Text>
          </View>
          <View style={[styles.bubbleArrow, { borderTopColor: tintColor }]} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: HIT_AREA,
    justifyContent: "center",
    paddingHorizontal: THUMB_SIZE / 2,
  },
  disabled: { opacity: 0.45 },
  trackLayer: {
    position: "absolute",
    left: THUMB_SIZE / 2,
    right: THUMB_SIZE / 2,
    top: 0,
    bottom: 0,
  },
  track: {
    position: "absolute",
    left: 0,
    right: 0,
    top: (HIT_AREA - TRACK_HEIGHT) / 2,
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
  },
  trackActive: {
    position: "absolute",
    top: (HIT_AREA - TRACK_HEIGHT) / 2,
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
  },
  thumb: {
    position: "absolute",
    top: (HIT_AREA - THUMB_SIZE) / 2,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    borderWidth: 2.5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 3,
    elevation: 3,
  },
  // Live value bubble above the dragged thumb.
  bubbleWrap: {
    position: "absolute",
    bottom: HIT_AREA - (HIT_AREA - THUMB_SIZE) / 2 - BUBBLE_GAP,
    width: BUBBLE_WIDTH,
    alignItems: "center",
    zIndex: 10,
  },
  bubble: {
    minWidth: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 7,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 4,
  },
  bubbleText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },
  bubbleArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 5,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    marginTop: -1,
  },
});
