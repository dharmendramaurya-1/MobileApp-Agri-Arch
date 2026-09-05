// src/hooks/useLiveMqttWindow.js
// ─────────────────────────────────────────────────────────────────────────────
// Rolling "last N minutes" window of REAL MQTT data for a single device.
//
// Every MQTT message that MqttContext processes for `deviceKey` is pushed
// through `extractPoint`. If it returns a point ({ value, ... }) the point is
// appended to an in-memory window. Points older than `windowMs` are pruned on
// every new sample AND on a slow interval tick, so the window keeps sliding
// even when no new data arrives (oldest point falls off the right edge).
//
// The buffer lives only in memory:
//   • opening the app / screen starts empty
//   • new MQTT messages append fresh data
//   • nothing is ever restored from cache, so reopening the app always shows
//     only the data that arrives over MQTT after the reopen.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import { useMqtt } from "../context/MqttContext";

export const LIVE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_SAMPLES = 2000;
const PRUNE_TICK_MS = 3000;

/**
 * @param {object} options
 * @param {string|null} options.deviceKey external key of the device to watch
 * @param {(parsed: object, meta: object) => (object|null)} options.extractPoint
 *        return the point to append (e.g. { value: parsed.ambientTemperature })
 *        or null/undefined to skip this message
 * @param {number} [options.windowMs] how long points stay in the window
 * @param {boolean} [options.enabled] set false to pause
 */
export default function useLiveMqttWindow({
  deviceKey,
  extractPoint,
  windowMs = LIVE_WINDOW_MS,
  enabled = true,
}) {
  const { subscribeToLiveData } = useMqtt();
  const [points, setPoints] = useState([]);

  const pointsRef = useRef([]);
  const extractRef = useRef(extractPoint);
  const deviceKeyRef = useRef(deviceKey);

  // Keep latest callbacks/filters without re-subscribing on every render
  extractRef.current = extractPoint;
  deviceKeyRef.current = deviceKey;

  const prune = useCallback(
    (list, now) => {
      if (list.length === 0) return list;
      const cutoff = now - windowMs;
      let firstAlive = 0;
      while (firstAlive < list.length && list[firstAlive].time < cutoff) {
        firstAlive++;
      }
      if (firstAlive === 0 && list.length <= MAX_SAMPLES) return list;
      const pruned = firstAlive > 0 ? list.slice(firstAlive) : list;
      return pruned.length > MAX_SAMPLES ? pruned.slice(-MAX_SAMPLES) : pruned;
    },
    [windowMs]
  );

  const reset = useCallback(() => {
    pointsRef.current = [];
    setPoints([]);
  }, []);

  // Reset the buffer whenever the watched device (or screen) changes —
  // this is what makes the chart start fresh with newly-arriving MQTT data.
  useEffect(() => {
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceKey]);

  // Treat closing/backgrounding the app like a fresh open: when the app comes
  // back to the foreground, drop everything that was received before so only
  // data arriving AFTER the reopen is shown (same rule MqttContext uses).
  useEffect(() => {
    let wasInactive = false;
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "background" || next === "inactive") {
        wasInactive = true;
      } else if (next === "active" && wasInactive) {
        wasInactive = false;
        reset();
      }
    });
    return () => subscription.remove();
  }, [reset]);

  // Subscribe to every processed MQTT message for this device.
  useEffect(() => {
    if (!enabled || !deviceKey || typeof subscribeToLiveData !== "function") {
      return undefined;
    }

    const unsubscribe = subscribeToLiveData((event) => {
      const { deviceKey: eventDevice, parsed, receivedAt } = event;
      if (eventDevice !== deviceKeyRef.current) return;
      if (!parsed || typeof parsed !== "object") return;

      const point = extractRef.current(parsed, event);
      if (!point) return;

      const t = receivedAt || Date.now();
      pointsRef.current = prune([...pointsRef.current, { time: t, ...point }], t);
      setPoints(pointsRef.current);
    });

    return unsubscribe;
  }, [enabled, deviceKey, subscribeToLiveData, prune]);

  // Slide the window even while no new messages arrive.
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      const next = prune(pointsRef.current, now);
      if (next !== pointsRef.current) {
        pointsRef.current = next;
        setPoints(next);
      }
    }, PRUNE_TICK_MS);
    return () => clearInterval(id);
  }, [prune]);

  return points;
}
