// src/services/lastDataCache.js
// ─────────────────────────────────────────────────────────────────────────────
// Persists the last known MQTT data snapshot to AsyncStorage so that when the
// app is killed/crashes and reopened, screens can show the last received data
// immediately while the app reconnects and new MQTT data arrives.
// ─────────────────────────────────────────────────────────────────────────────
import AsyncStorage from "@react-native-async-storage/async-storage";

export const LAST_DATA_CACHE_KEY = "last_mqtt_data_snapshot";

// ── Save a full snapshot of the last known MQTT state ────────────────────────
export const saveLastData = async (snapshot) => {
  try {
    await AsyncStorage.setItem(LAST_DATA_CACHE_KEY, JSON.stringify(snapshot));
    console.log("🗂️ Last MQTT data snapshot saved to AsyncStorage");
  } catch (error) {
    console.error("❌ Error saving last MQTT data snapshot:", error);
  }
};

// ── Load the persisted snapshot ──────────────────────────────────────────────
export const loadLastData = async () => {
  try {
    const raw = await AsyncStorage.getItem(LAST_DATA_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (error) {
    console.error("❌ Error loading last MQTT data snapshot:", error);
    return null;
  }
};

// ── Clear the persisted snapshot (used on logout) ────────────────────────────
export const clearLastData = async () => {
  try {
    await AsyncStorage.removeItem(LAST_DATA_CACHE_KEY);
    console.log("🗂️ Last MQTT data snapshot cleared");
  } catch (error) {
    console.error("❌ Error clearing last MQTT data snapshot:", error);
  }
};
