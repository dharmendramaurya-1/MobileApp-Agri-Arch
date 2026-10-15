// src/services/soundService.js
// Offline sound generator and playback manager for Alert & Buzzer alarms
// Wrapped with safe fallback so missing native modules in existing builds never crash the UI
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform, Vibration } from "react-native";

// Safely attempt to load expo-av without crashing if the native module isn't compiled into the current binary
let Audio = null;
try {
  const expoAv = require("expo-av");
  Audio = expoAv?.Audio || null;
} catch (err) {
  // ExponentAV native module is not compiled into the current APK build yet
  console.log("ℹ️ Native ExponentAV module not present in current binary. Safe haptic fallback active.");
}

const STORAGE_KEY_SOUND = "@agri_buzzer_sound_id";
const STORAGE_KEY_VIBRATION = "@agri_buzzer_vibration_enabled";

/**
 * Procedural WAV PCM Generator (8-bit mono, 8000Hz)
 * Generates offline, zero-dependency data URIs
 */
function createWavDataUri(sampleRate, durationSec, sampleFn) {
  const numSamples = Math.floor(sampleRate * durationSec);
  const dataSize = numSamples;
  const header = new Uint8Array(44 + dataSize);

  const writeString = (offset, str) => {
    for (let i = 0; i < str.length; i++) {
      header[offset + i] = str.charCodeAt(i);
    }
  };

  const writeUint32 = (offset, val) => {
    header[offset] = val & 0xff;
    header[offset + 1] = (val >> 8) & 0xff;
    header[offset + 2] = (val >> 16) & 0xff;
    header[offset + 3] = (val >> 24) & 0xff;
  };

  const writeUint16 = (offset, val) => {
    header[offset] = val & 0xff;
    header[offset + 1] = (val >> 8) & 0xff;
  };

  writeString(0, "RIFF");
  writeUint32(4, 36 + dataSize);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  writeUint32(16, 16);
  writeUint16(20, 1);  // PCM
  writeUint16(22, 1);  // Mono
  writeUint32(24, sampleRate);
  writeUint32(28, sampleRate);
  writeUint16(32, 1);
  writeUint16(34, 8);  // 8-bit
  writeString(36, "data");
  writeUint32(40, dataSize);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const v = sampleFn(t, i);
    const clamped = Math.max(-1, Math.min(1, v));
    header[44 + i] = Math.floor(128 + 127 * clamped);
  }

  let binary = "";
  const len = header.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(header[i]);
  }

  let base64 = "";
  if (typeof btoa === "function") {
    base64 = btoa(binary);
  } else if (typeof Buffer !== "undefined") {
    base64 = Buffer.from(header).toString("base64");
  } else {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
    for (let i = 0; i < binary.length; i += 3) {
      const a = binary.charCodeAt(i);
      const b = binary.charCodeAt(i + 1);
      const c = binary.charCodeAt(i + 2);
      base64 += chars[a >> 2];
      base64 += chars[((a & 3) << 4) | (b >> 4)];
      base64 += isNaN(b) ? "=" : chars[((b & 15) << 2) | (c >> 6)];
      base64 += isNaN(b) || isNaN(c) ? "=" : chars[c & 63];
    }
  }

  return "data:audio/wav;base64," + base64;
}

// Built-in procedural sound presets
export const SOUND_PRESETS = [
  {
    id: "industrial_alarm",
    name: "Industrial Alarm",
    desc: "Urgent high-pitch pulsing siren",
    icon: "alert-circle",
    color: "#E53935",
    getUri: () =>
      createWavDataUri(8000, 0.9, (t) => {
        const pulse = Math.sin(2 * Math.PI * 5 * t) > 0 ? 1 : 0;
        return pulse * Math.sin(2 * Math.PI * 960 * t);
      }),
  },
  {
    id: "classic_buzzer",
    name: "Classic Buzzer",
    desc: "Resonant electromechanical buzz",
    icon: "volume-high",
    color: "#FF9800",
    getUri: () =>
      createWavDataUri(8000, 0.9, (t) => {
        const pulse = Math.sin(2 * Math.PI * 3.5 * t) > 0 ? 1 : 0;
        const square = Math.sin(2 * Math.PI * 220 * t) > 0 ? 0.75 : -0.75;
        return pulse * square;
      }),
  },
  {
    id: "siren_warning",
    name: "Emergency Siren",
    desc: "Dynamic alternating emergency siren",
    icon: "notifications",
    color: "#D32F2F",
    getUri: () =>
      createWavDataUri(8000, 1.1, (t) => {
        const freq = 650 + 450 * (Math.sin(2 * Math.PI * 2.5 * t) * 0.5 + 0.5);
        return Math.sin(2 * Math.PI * freq * t);
      }),
  },
  {
    id: "digital_beep",
    name: "Digital Beep",
    desc: "Crisp rapid electronic warning beeps",
    icon: "radio",
    color: "#2196F3",
    getUri: () =>
      createWavDataUri(8000, 0.8, (t) => {
        const cycle = t % 0.4;
        const active = cycle < 0.15;
        return active ? Math.sin(2 * Math.PI * 1350 * t) : 0;
      }),
  },
  {
    id: "gentle_chime",
    name: "Harmonic Chime",
    desc: "Soft melodic dual-tone alert",
    icon: "musical-notes",
    color: "#4CAF50",
    getUri: () =>
      createWavDataUri(8000, 1.0, (t) => {
        const decay = Math.exp(-3 * (t % 0.5));
        const freq = t < 0.5 ? 523 : 659;
        return decay * Math.sin(2 * Math.PI * freq * t);
      }),
  },
];

class SoundService {
  constructor() {
    this.currentSoundObj = null;
    this.previewSoundObj = null;
    this.previewWebAudio = null;
    this.alarmWebAudio = null;
    this.selectedSoundId = "industrial_alarm";
    this.vibrationEnabled = true;
    this.isAlarmLooping = false;
    this.alarmTimer = null;
    this.cachedUris = {};
    this.audioModeConfigured = false;
    this.init();
  }

  async init() {
    try {
      const storedId = await AsyncStorage.getItem(STORAGE_KEY_SOUND);
      if (storedId && SOUND_PRESETS.some((s) => s.id === storedId)) {
        this.selectedSoundId = storedId;
      }
      const storedVib = await AsyncStorage.getItem(STORAGE_KEY_VIBRATION);
      if (storedVib !== null) {
        this.vibrationEnabled = storedVib === "true";
      }
    } catch (err) {
      console.warn("Error loading sound preferences:", err);
    }
  }

  async ensureAudioMode() {
    if (!Audio || this.audioModeConfigured) return;
    try {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });
      this.audioModeConfigured = true;
    } catch (_) {}
  }

  getSoundUri(soundId) {
    const preset = SOUND_PRESETS.find((s) => s.id === soundId) || SOUND_PRESETS[0];
    if (!this.cachedUris[preset.id]) {
      this.cachedUris[preset.id] = preset.getUri();
    }
    return this.cachedUris[preset.id];
  }

  async getSelectedSoundId() {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY_SOUND);
      if (stored) {
        this.selectedSoundId = stored;
      }
    } catch (_) {}
    return this.selectedSoundId;
  }

  async setSelectedSoundId(soundId) {
    this.selectedSoundId = soundId;
    try {
      await AsyncStorage.setItem(STORAGE_KEY_SOUND, soundId);
    } catch (err) {
      console.warn("Error saving sound preference:", err);
    }
  }

  async setVibrationEnabled(enabled) {
    this.vibrationEnabled = enabled;
    try {
      await AsyncStorage.setItem(STORAGE_KEY_VIBRATION, String(enabled));
    } catch (err) {
      console.warn("Error saving vibration preference:", err);
    }
  }

  isVibrationEnabled() {
    return this.vibrationEnabled;
  }

  /**
   * Preview a sound effect (play once)
   */
  async previewSound(soundId) {
    try {
      await this.stopPreview();

      // Web HTML5 Audio fallback
      if (Platform.OS === "web" && typeof window !== "undefined" && window.Audio) {
        const uri = this.getSoundUri(soundId);
        const webAudio = new window.Audio(uri);
        this.previewWebAudio = webAudio;
        await webAudio.play().catch(() => {});
        return;
      }

      // Haptic preview on mobile
      if (this.vibrationEnabled && Platform.OS !== "web") {
        Vibration.vibrate(300);
      }

      if (!Audio) {
        console.log("ℹ️ Haptic preview active (audio requires native rebuild with expo-av)");
        return;
      }

      await this.ensureAudioMode();
      const uri = this.getSoundUri(soundId);
      const { sound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true, isLooping: false, volume: 1.0 }
      );
      this.previewSoundObj = sound;

      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.didJustFinish) {
          sound.unloadAsync().catch(() => {});
          if (this.previewSoundObj === sound) {
            this.previewSoundObj = null;
          }
        }
      });
    } catch (err) {
      console.warn("Preview sound notice:", err?.message);
    }
  }

  async stopPreview() {
    if (this.previewWebAudio) {
      try {
        this.previewWebAudio.pause();
        this.previewWebAudio.currentTime = 0;
      } catch (_) {}
      this.previewWebAudio = null;
    }

    if (this.previewSoundObj) {
      try {
        await this.previewSoundObj.stopAsync();
        await this.previewSoundObj.unloadAsync();
      } catch (_) {}
      this.previewSoundObj = null;
    }
  }

  /**
   * Start looping the active alarm sound + vibration for the buzzer
   */
  async startAlarm(soundId = null) {
    if (this.isAlarmLooping) return;
    this.isAlarmLooping = true;

    const targetId = soundId || this.selectedSoundId || "industrial_alarm";

    // 1. Physical vibration pattern on mobile devices (always works, 100% native!)
    if (this.vibrationEnabled && Platform.OS !== "web") {
      Vibration.vibrate([0, 500, 300, 500, 300], true);
    }

    // 2. Web audio fallback
    if (Platform.OS === "web" && typeof window !== "undefined" && window.Audio) {
      try {
        const uri = this.getSoundUri(targetId);
        const webAudio = new window.Audio(uri);
        webAudio.loop = true;
        this.alarmWebAudio = webAudio;
        await webAudio.play().catch(() => {});
      } catch (_) {}
      return;
    }

    // 3. Native Expo Audio (when compiled in APK)
    if (!Audio) {
      console.log("ℹ️ Buzzer alarm active: phone vibrating (audio requires native rebuild)");
      return;
    }

    try {
      await this.stopAlarmSoundOnly();
      await this.ensureAudioMode();

      const uri = this.getSoundUri(targetId);
      const { sound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true, isLooping: true, volume: 1.0 }
      );
      this.currentSoundObj = sound;
    } catch (err) {
      console.warn("Alarm sound notice:", err?.message);
    }
  }

  async stopAlarmSoundOnly() {
    if (this.alarmWebAudio) {
      try {
        this.alarmWebAudio.pause();
        this.alarmWebAudio.currentTime = 0;
      } catch (_) {}
      this.alarmWebAudio = null;
    }

    if (this.currentSoundObj) {
      try {
        await this.currentSoundObj.stopAsync();
        await this.currentSoundObj.unloadAsync();
      } catch (_) {}
      this.currentSoundObj = null;
    }
  }

  /**
   * Stop buzzer alarm completely (both sound and vibration)
   */
  async stopAlarm() {
    this.isAlarmLooping = false;
    if (this.alarmTimer) {
      clearTimeout(this.alarmTimer);
      this.alarmTimer = null;
    }

    // Cancel vibration
    if (Platform.OS !== "web") {
      try {
        Vibration.cancel();
      } catch (_) {}
    }

    // Stop and unload sound
    await this.stopAlarmSoundOnly();
    await this.stopPreview();
  }
}

export const soundManager = new SoundService();
export default soundManager;
