// app/(main)/timings.jsx — High-Aesthetic Interactive System Timings
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Dimensions,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../src/context/ThemContext';
import { useMqtt, DEFAULT_TIMINGS } from '../../src/context/MqttContext';
import { useScroll, useScrollReset } from '../../src/context/ScrollContext';

const { width } = Dimensions.get('window');

// ── Smart Time Formatter (Friendly & Readable) ──
function fmtSec(sec) {
  if (sec === null || sec === undefined) return '--';
  const val = Math.max(0, Number(sec) || 0);
  if (val >= 3600) {
    const hours = Math.floor(val / 3600);
    const minutes = Math.floor((val % 3600) / 60);
    const seconds = val % 60;
    if (minutes === 0 && seconds === 0) return `${hours}h`;
    if (seconds === 0) return `${hours}h ${minutes}m`;
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  if (val < 60) return `${val}s`;
  const min = Math.floor(val / 60);
  const rem = val % 60;
  return rem === 0 ? `${min}m` : `${min}m ${rem}s`;
}

function fmtSecLong(sec) {
  if (sec === null || sec === undefined) return '--';
  const val = Math.max(0, Number(sec) || 0);
  if (val >= 3600) {
    const hours = Math.floor(val / 3600);
    const minutes = Math.floor((val % 3600) / 60);
    const seconds = val % 60;
    const parts = [];
    if (hours > 0) parts.push(`${hours} hr${hours > 1 ? 's' : ''}`);
    if (minutes > 0) parts.push(`${minutes} min`);
    if (seconds > 0) parts.push(`${seconds} sec`);
    return parts.join(' ');
  }
  if (val < 60) return `${val} seconds`;
  const min = Math.floor(val / 60);
  const rem = val % 60;
  return rem === 0 ? `${min} minute${min > 1 ? 's' : ''}` : `${min}m ${rem}s`;
}

// ── Custom Attractive Publish / Feedback Modal ──
function CustomFeedbackModal({ visible, type = 'success', title, message, onClose, theme }) {
  if (!visible) return null;
  const isSuccess = type === 'success';
  const isWarning = type === 'warning';
  const iconName = isSuccess
    ? 'checkmark-circle'
    : isWarning
    ? 'alert-circle'
    : 'close-circle';

  const accentColor = isSuccess ? '#2E7D32' : isWarning ? '#F57C00' : '#D32F2F';
  const bgLight = isSuccess
    ? 'rgba(46, 125, 50, 0.12)'
    : isWarning
    ? 'rgba(245, 124, 0, 0.12)'
    : 'rgba(211, 47, 47, 0.12)';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View
          style={[
            styles.feedbackCard,
            {
              backgroundColor: theme.colors.surface || '#FFFFFF',
              borderColor: `${accentColor}35`,
            },
          ]}
        >
          {/* Glowing Icon Header */}
          <View style={styles.feedbackIconOuter}>
            <LinearGradient
              colors={
                isSuccess
                  ? ['#4CAF5030', '#2E7D3210']
                  : isWarning
                  ? ['#FFA72630', '#F57C0010']
                  : ['#EF535030', '#D32F2F10']
              }
              style={[styles.feedbackIconGlow, { borderColor: `${accentColor}40` }]}
            >
              <View style={[styles.feedbackIconCircle, { backgroundColor: bgLight }]}>
                <Ionicons name={iconName} size={48} color={accentColor} />
              </View>
            </LinearGradient>
          </View>

          {/* Title */}
          <Text style={[styles.feedbackTitle, { color: theme.colors.text }]}>
            {title || (isSuccess ? 'Published' : isWarning ? 'Notice' : 'Failed')}
          </Text>

          {/* Exact clean text */}
          <Text style={[styles.feedbackMessage, { color: theme.colors.textSecondary }]}>
            {message}
          </Text>

          {/* Action button */}
          <TouchableOpacity
            style={styles.feedbackBtn}
            onPress={onClose}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={
                isSuccess
                  ? ['#2E7D32', '#1B5E20']
                  : isWarning
                  ? ['#F57C00', '#E65100']
                  : ['#D32F2F', '#B71C1C']
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.feedbackBtnGradient}
            >
              <Ionicons name="checkmark-sharp" size={18} color="#FFFFFF" />
              <Text style={styles.feedbackBtnText}>OK</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ── Custom Confirmation Modal (for Reset) ──
function CustomConfirmModal({ visible, title, message, onConfirm, onCancel, theme }) {
  if (!visible) return null;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.modalBackdrop}>
        <View
          style={[
            styles.feedbackCard,
            {
              backgroundColor: theme.colors.surface || '#FFFFFF',
              borderColor: 'rgba(244, 67, 54, 0.3)',
            },
          ]}
        >
          <View style={[styles.feedbackIconCircle, { backgroundColor: 'rgba(244, 67, 54, 0.12)', marginBottom: 14 }]}>
            <Ionicons name="refresh-circle" size={44} color="#F44336" />
          </View>

          <Text style={[styles.feedbackTitle, { color: theme.colors.text }]}>{title}</Text>
          <Text style={[styles.feedbackMessage, { color: theme.colors.textSecondary }]}>{message}</Text>

          <View style={styles.confirmBtnRow}>
            <TouchableOpacity
              style={[styles.confirmCancelBtn, { borderColor: theme.colors.border || '#E0E0E0' }]}
              onPress={onCancel}
              activeOpacity={0.7}
            >
              <Text style={[styles.confirmCancelText, { color: theme.colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.confirmActionBtn}
              onPress={onConfirm}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={['#D32F2F', '#B71C1C']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.confirmActionGradient}
              >
                <Text style={styles.confirmActionText}>Reset All</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Centered, Interactive Time Picker Modal ──
function CenteredTimePickerModal({ visible, value, field, onClose, onSelect, theme }) {
  const safeValue = Math.max(0, Math.min(Number(value) || 0, 86400));
  const initialHours = Math.floor(safeValue / 3600);
  const initialMinutes = Math.floor((safeValue % 3600) / 60);
  const initialSeconds = safeValue % 60;

  const [hours, setHours] = useState(initialHours);
  const [minutes, setMinutes] = useState(initialMinutes);
  const [seconds, setSeconds] = useState(initialSeconds);

  useEffect(() => {
    if (visible) {
      setHours(initialHours);
      setMinutes(initialMinutes);
      setSeconds(initialSeconds);
    }
  }, [visible, initialHours, initialMinutes, initialSeconds]);

  const totalSec = hours * 3600 + minutes * 60 + seconds;

  const adjustValue = (unit, delta) => {
    if (unit === 'h') {
      setHours((prev) => Math.max(0, Math.min(24, prev + delta)));
    } else if (unit === 'm') {
      setMinutes((prev) => {
        const next = prev + delta;
        if (next >= 60) {
          setHours((h) => Math.min(24, h + 1));
          return 0;
        }
        if (next < 0) {
          if (hours > 0) {
            setHours((h) => Math.max(0, h - 1));
            return 59;
          }
          return 0;
        }
        return next;
      });
    } else if (unit === 's') {
      setSeconds((prev) => {
        const next = prev + delta;
        if (next >= 60) {
          setMinutes((m) => Math.min(59, m + 1));
          return 0;
        }
        if (next < 0) {
          if (minutes > 0 || hours > 0) {
            setMinutes((m) => Math.max(0, m - 1));
            return 59;
          }
          return 0;
        }
        return next;
      });
    }
  };

  const applyPreset = (presetSec) => {
    const h = Math.floor(presetSec / 3600);
    const m = Math.floor((presetSec % 3600) / 60);
    const s = presetSec % 60;
    setHours(h);
    setMinutes(m);
    setSeconds(s);
  };

  const cardBg = theme.colors.surface || '#FFFFFF';
  const borderC = theme.colors.border || '#E0E0E0';
  const color = field?.color || '#2E7D32';

  const isLight = field?.key === 'LPP_OT' || field?.key === 'LLP_DI' || field?.key === 'LPP_DI';
  const isPulse = field?.key?.includes('OT') && !isLight;
  const presets = isLight
    ? [3600, 7200, 14400, 21600, 28800, 36000, 43200, 50400, 57600, 64800]
    : isPulse
    ? [5, 10, 20, 30, 60, 120]
    : [300, 600, 900, 1800, 3600, 7200];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.centeredModalCard, { backgroundColor: cardBg, borderColor: borderC }]}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <View style={styles.modalHeaderLeft}>
              <View style={[styles.modalIconCircle, { backgroundColor: `${color}18` }]}>
                <Ionicons name={field?.icon || 'timer-outline'} size={20} color={color} />
              </View>
              <View style={{ flex: 1, paddingRight: 6 }}>
                <Text style={[styles.modalTitle, { color: theme.colors.text }]} numberOfLines={1}>
                  {field?.label || 'Set Duration'}
                </Text>
                <View style={styles.modalCodeRow}>
                  <View style={[styles.modalCodeBadge, { backgroundColor: `${color}18` }]}>
                    <Text style={[styles.modalCodeText, { color }]}>{field?.shortLabel}</Text>
                  </View>
                  <Text style={[styles.modalSubtitle, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                    {field?.groupTitle}
                  </Text>
                </View>
              </View>
            </View>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={styles.closeIconBtn}
            >
              <Ionicons name="close" size={20} color={theme.colors.textSecondary || '#757575'} />
            </TouchableOpacity>
          </View>

          {/* Digital Timer Display Card */}
          <LinearGradient
            colors={theme.dark ? ['#1B5E2025', '#1B5E2010'] : ['#E8F5E9', '#F1F8E9']}
            style={[styles.digitalDisplayCard, { borderColor: `${color}35` }]}
          >
            <Text style={[styles.digitalTimeText, { color }]}>
              {String(hours).padStart(2, '0')} : {String(minutes).padStart(2, '0')} : {String(seconds).padStart(2, '0')}
            </Text>
            <Text style={[styles.digitalSubText, { color: theme.colors.textSecondary }]}>
              {fmtSecLong(totalSec)} ({totalSec}s)
            </Text>
          </LinearGradient>

          {/* Centered Stepper Controls Row */}
          <View style={styles.steppersContainer}>
            {/* Hours */}
            <View style={styles.stepperCol}>
              <Text style={[styles.stepperColLabel, { color: theme.colors.textSecondary }]}>HOURS</Text>
              <TouchableOpacity
                style={[styles.stepperBtn, { backgroundColor: `${color}14`, borderColor: `${color}30` }]}
                onPress={() => adjustValue('h', 1)}
                activeOpacity={0.6}
              >
                <Ionicons name="chevron-up" size={18} color={color} />
              </TouchableOpacity>
              <View style={[styles.stepperValueBox, { borderColor: borderC }]}>
                <Text style={[styles.stepperValueText, { color: theme.colors.text }]}>
                  {String(hours).padStart(2, '0')}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.stepperBtn, { backgroundColor: `${color}14`, borderColor: `${color}30` }]}
                onPress={() => adjustValue('h', -1)}
                activeOpacity={0.6}
              >
                <Ionicons name="chevron-down" size={18} color={color} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.stepperDivider, { color: theme.colors.textSecondary }]}>:</Text>

            {/* Minutes */}
            <View style={styles.stepperCol}>
              <Text style={[styles.stepperColLabel, { color: theme.colors.textSecondary }]}>MINUTES</Text>
              <TouchableOpacity
                style={[styles.stepperBtn, { backgroundColor: `${color}14`, borderColor: `${color}30` }]}
                onPress={() => adjustValue('m', 1)}
                activeOpacity={0.6}
              >
                <Ionicons name="chevron-up" size={18} color={color} />
              </TouchableOpacity>
              <View style={[styles.stepperValueBox, { borderColor: borderC }]}>
                <Text style={[styles.stepperValueText, { color: theme.colors.text }]}>
                  {String(minutes).padStart(2, '0')}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.stepperBtn, { backgroundColor: `${color}14`, borderColor: `${color}30` }]}
                onPress={() => adjustValue('m', -1)}
                activeOpacity={0.6}
              >
                <Ionicons name="chevron-down" size={18} color={color} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.stepperDivider, { color: theme.colors.textSecondary }]}>:</Text>

            {/* Seconds */}
            <View style={styles.stepperCol}>
              <Text style={[styles.stepperColLabel, { color: theme.colors.textSecondary }]}>SECONDS</Text>
              <TouchableOpacity
                style={[styles.stepperBtn, { backgroundColor: `${color}14`, borderColor: `${color}30` }]}
                onPress={() => adjustValue('s', 5)}
                activeOpacity={0.6}
              >
                <Ionicons name="chevron-up" size={18} color={color} />
              </TouchableOpacity>
              <View style={[styles.stepperValueBox, { borderColor: borderC }]}>
                <Text style={[styles.stepperValueText, { color: theme.colors.text }]}>
                  {String(seconds).padStart(2, '0')}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.stepperBtn, { backgroundColor: `${color}14`, borderColor: `${color}30` }]}
                onPress={() => adjustValue('s', -5)}
                activeOpacity={0.6}
              >
                <Ionicons name="chevron-down" size={18} color={color} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Quick Preset Chips */}
          <Text style={[styles.presetSectionLabel, { color: theme.colors.textSecondary }]}>Quick Presets</Text>
          <View style={styles.presetsRow}>
            {presets.map((p) => (
              <TouchableOpacity
                key={p}
                style={[
                  styles.presetChip,
                  totalSec === p && { backgroundColor: color, borderColor: color },
                  { borderColor: borderC },
                ]}
                onPress={() => applyPreset(p)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.presetChipText,
                    totalSec === p ? { color: '#FFFFFF', fontWeight: '800' } : { color: theme.colors.text },
                  ]}
                >
                  {fmtSec(p)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Action Buttons */}
          <View style={styles.modalActionsRow}>
            <TouchableOpacity
              style={[styles.modalCancelBtn, { borderColor: borderC }]}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <Text style={[styles.modalCancelText, { color: theme.colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modalApplyBtn, { backgroundColor: color }]}
              onPress={() => {
                onSelect(totalSec);
                onClose();
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="checkmark" size={18} color="#FFFFFF" />
              <Text style={styles.modalApplyText}>Apply Duration</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Timing Categories Configuration ──
const TIMING_GROUPS = [
  {
    id: 'water',
    title: 'Water Circulation',
    filterLabel: 'Water',
    shortDesc: 'Main circulation pump & rest cycles',
    icon: 'water',
    color: '#0288D1',
    items: [
      { key: 'WPONT', label: 'Water Pump ON Time', shortLabel: 'WPONT', def: 120, unit: 's', desc: 'Active water circulation duration' },
      { key: 'WPINT', label: 'Water Pump Interval', shortLabel: 'WPINT', def: 900, unit: 's', desc: 'Rest duration between cycles' },
    ],
  },
  {
    id: 'nutrient',
    title: 'Nutrient Feeding',
    filterLabel: 'Nutrient',
    shortDesc: 'Nutrient dosing pump cycle',
    icon: 'leaf',
    color: '#2E7D32',
    items: [
      { key: 'NP_OT', label: 'Nutrient Pump ON Time', shortLabel: 'NP_OT', def: 10, unit: 's', desc: 'Active nutrient dosing burst' },
      { key: 'NP_DI', label: 'Nutrient Pump Interval', shortLabel: 'NP_DI', def: 3600, unit: 's', desc: 'Interval between feedings' },
    ],
  },
  {
    id: 'light',
    title: 'Grow Light Photoperiod',
    filterLabel: 'Light',
    shortDesc: '24-hour photoperiod & dark rest',
    icon: 'sunny',
    color: '#F57C00',
    items: [
      { key: 'LPP_OT', label: 'Light ON Time (Day)', shortLabel: 'LPP_OT', def: 43200, unit: 's', desc: 'Daily lighting duration' },
      { key: 'LLP_DI', label: 'Dark Period (Night)', shortLabel: 'LLP_DI', def: 43200, unit: 's', desc: 'Daily dark rest duration' },
    ],
  },
  {
    id: 'ec',
    title: 'EC Fertigation (A & B)',
    filterLabel: 'EC Dosing',
    shortDesc: 'Precision A & B concentrate dosing',
    icon: 'flask',
    color: '#00897B',
    items: [
      { key: 'ECAP_OT', label: 'EC-A Pump ON Time', shortLabel: 'ECAP_OT', def: 10, unit: 's', desc: 'Part-A concentrate micro burst' },
      { key: 'ECA_DI', label: 'EC-A Dosing Interval', shortLabel: 'ECA_DI', def: 3600, unit: 's', desc: 'Interval between Part-A doses' },
      { key: 'ECBP_OT', label: 'EC-B Pump ON Time', shortLabel: 'ECBP_OT', def: 10, unit: 's', desc: 'Part-B concentrate micro burst' },
      { key: 'ECB_DI', label: 'EC-B Dosing Interval', shortLabel: 'ECB_DI', def: 3600, unit: 's', desc: 'Interval between Part-B doses' },
    ],
  },
  {
    id: 'ph',
    title: 'pH Balancing',
    filterLabel: 'pH Balance',
    shortDesc: 'pH Up & Down correction pulses',
    icon: 'speedometer',
    color: '#8E24AA',
    items: [
      { key: 'pHPU_ONT', label: 'pH Up Pump ON Time', shortLabel: 'pHPU_ONT', def: 5, unit: 's', desc: 'pH Up micro-dose burst' },
      { key: 'pHPD_ONT', label: 'pH Down Pump ON Time', shortLabel: 'pHPD_ONT', def: 5, unit: 's', desc: 'pH Down micro-dose burst' },
    ],
  },
];

export default function TimingsScreen() {
  const { theme } = useTheme();
  const { headerHeight } = useScroll();
  const scrollRef = useRef(null);
  useScrollReset(scrollRef);

  const {
    selectedExternalKey,
    externalKey,
    getSelectedDeviceName,
    getSelectedDeviceTimings,
    publishTimings,
    isConnected,
    deviceOnlineStatus,
    deviceInitialLoadComplete,
  } = useMqtt();

  const deviceKey = selectedExternalKey || externalKey;
  const selectedDeviceName = getSelectedDeviceName();
  const currentDeviceTimings = getSelectedDeviceTimings();

  const isDeviceOnline = useMemo(() => {
    if (!deviceKey) return false;
    return deviceOnlineStatus[deviceKey] === true;
  }, [deviceKey, deviceOnlineStatus]);

  const isInitialLoadComplete = useMemo(() => {
    if (!deviceKey) return false;
    return deviceInitialLoadComplete[deviceKey] === true;
  }, [deviceKey, deviceInitialLoadComplete]);

  const canPublish = isConnected && isDeviceOnline;

  const [timings, setTimings] = useState(() => ({
    ...DEFAULT_TIMINGS,
    ...currentDeviceTimings,
  }));

  const [selectedFilter, setSelectedFilter] = useState('all');
  const [activePickerField, setActivePickerField] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Custom feedback modal state
  const [feedbackModal, setFeedbackModal] = useState({
    visible: false,
    type: 'success',
    title: '',
    message: '',
  });

  // Custom reset confirm modal state
  const [confirmResetVisible, setConfirmResetVisible] = useState(false);

  useEffect(() => {
    if (currentDeviceTimings && Object.keys(currentDeviceTimings).length > 0) {
      console.log("⏱️ [Timings Screen] Device response arrived, updating UI timings state:", currentDeviceTimings);
      setTimings((prev) => ({
        ...prev,
        ...currentDeviceTimings,
      }));
      setHasChanges(false);
    }
  }, [currentDeviceTimings]);

  const handleTimingChange = useCallback((key, value) => {
    setTimings((prev) => {
      const next = { ...prev, [key]: Number(value) };
      setHasChanges(true);
      return next;
    });
  }, []);

  const totalParameters = useMemo(() => {
    return TIMING_GROUPS.reduce((acc, g) => acc + g.items.length, 0);
  }, []);

  // Quick inline stepper directly on the card
  const handleQuickStep = (key, delta) => {
    setTimings((prev) => {
      const isLight = key === 'LPP_OT' || key === 'LLP_DI' || key === 'LPP_DI';
      const defaultVal = DEFAULT_TIMINGS[key] ?? (isLight ? 43200 : 10);
      const current = prev[key] ?? defaultVal;
      const next = Math.max(isLight ? 300 : 1, current + delta);
      setHasChanges(true);
      return { ...prev, [key]: next };
    });
  };

  const handleSaveAndPublish = async () => {
    if (!deviceKey) {
      setFeedbackModal({
        visible: true,
        type: 'warning',
        title: 'No Device Selected',
        message: 'Please select a device before publishing timings.',
      });
      return;
    }

    if (!canPublish) {
      setFeedbackModal({
        visible: true,
        type: 'warning',
        title: 'Device Offline',
        message: 'Device is offline. Your changes are saved locally and will publish when the device reconnects.',
      });
      return;
    }

    setIsSaving(true);
    try {
      const success = await publishTimings(deviceKey, timings);
      if (success) {
        setHasChanges(false);
        // Custom attractive popup with exact requested message:
        setFeedbackModal({
          visible: true,
          type: 'success',
          title: 'Success!',
          message: 'Your data saved and published successfully',
        });
      } else {
        setFeedbackModal({
          visible: true,
          type: 'error',
          title: 'Publish Failed',
          message: 'Failed to publish timings to device. Please verify connection and try again.',
        });
      }
    } catch (err) {
      console.error('Error saving timings:', err);
      setFeedbackModal({
        visible: true,
        type: 'error',
        title: 'Error',
        message: 'An unexpected error occurred while publishing timings.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const filteredGroups = useMemo(() => {
    if (selectedFilter === 'all') return TIMING_GROUPS;
    return TIMING_GROUPS.filter((g) => g.id === selectedFilter);
  }, [selectedFilter]);

  const cardBg = theme.colors.card || theme.colors.surface || '#FFFFFF';
  const borderC = theme.colors.border || '#E8E8E8';

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: headerHeight + 8, paddingBottom: 110 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Interactive Card */}
        <LinearGradient
          colors={theme.dark ? ['#1B5E20', '#0A2E0F'] : ['#2E7D32', '#1B5E20']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroCard}
        >
          <View style={styles.heroTopRow}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              {/* Status Chip */}
              <View style={styles.heroStatusChip}>
                <View
                  style={[
                    styles.heroStatusDot,
                    { backgroundColor: canPublish ? '#69F0AE' : '#FF5252' },
                  ]}
                />
                <Text style={styles.heroStatusText}>
                  {canPublish ? 'CONNECTED • FIRMWARE ACTIVE' : 'OFFLINE • EDITING LOCALLY'}
                </Text>
              </View>

              <Text style={styles.heroTitle}>System Duty Cycles</Text>
              <Text style={styles.heroSub} numberOfLines={1}>
                {selectedDeviceName || 'AgriArch Controller'} • {totalParameters} Active Timers
              </Text>
            </View>

            <TouchableOpacity
              style={styles.heroResetBtn}
              onPress={() => setConfirmResetVisible(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="refresh-outline" size={14} color="#FFFFFF" />
              <Text style={styles.heroResetText}>Reset</Text>
            </TouchableOpacity>
          </View>

          {/* Quick Metrics Bar inside Hero */}
          <View style={styles.heroMetricsBar}>
            <View style={styles.heroMetricItem}>
              <Ionicons name="water-outline" size={13} color="#90CAF9" style={{ marginBottom: 2 }} />
              <Text style={styles.heroMetricVal}>{fmtSec(timings.WPONT)}</Text>
              <Text style={styles.heroMetricLabel}>Pump ON</Text>
            </View>
            <View style={styles.heroMetricDivider} />
            <View style={styles.heroMetricItem}>
              <Ionicons name="pause-circle-outline" size={13} color="#A5D6A7" style={{ marginBottom: 2 }} />
              <Text style={styles.heroMetricVal}>{fmtSec(timings.WPINT)}</Text>
              <Text style={styles.heroMetricLabel}>Rest</Text>
            </View>
            <View style={styles.heroMetricDivider} />
            <View style={styles.heroMetricItem}>
              <Ionicons name="leaf-outline" size={13} color="#80CBC4" style={{ marginBottom: 2 }} />
              <Text style={styles.heroMetricVal}>{fmtSec(timings.NP_OT)}</Text>
              <Text style={styles.heroMetricLabel}>Nutrient</Text>
            </View>
            <View style={styles.heroMetricDivider} />
            <View style={styles.heroMetricItem}>
              <Ionicons name="sunny-outline" size={13} color="#FFE082" style={{ marginBottom: 2 }} />
              <Text style={styles.heroMetricVal}>{fmtSec(timings.LPP_OT ?? 43200)}</Text>
              <Text style={styles.heroMetricLabel}>Light ON</Text>
            </View>
          </View>
        </LinearGradient>

        {/* Category Filter Pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
        >
          <TouchableOpacity
            style={[
              styles.filterPill,
              selectedFilter === 'all' && styles.filterPillActive,
              { borderColor: borderC },
            ]}
            onPress={() => setSelectedFilter('all')}
            activeOpacity={0.7}
          >
            <Ionicons
              name="layers-outline"
              size={13}
              color={selectedFilter === 'all' ? '#FFFFFF' : '#757575'}
              style={{ marginRight: 5 }}
            />
            <Text style={[styles.filterPillText, selectedFilter === 'all' && styles.filterPillTextActive]}>
              All ({totalParameters})
            </Text>
          </TouchableOpacity>

          {TIMING_GROUPS.map((g) => {
            const isActive = selectedFilter === g.id;
            return (
              <TouchableOpacity
                key={g.id}
                style={[
                  styles.filterPill,
                  isActive && { backgroundColor: g.color, borderColor: g.color },
                  { borderColor: borderC },
                ]}
                onPress={() => setSelectedFilter(g.id)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={g.icon}
                  size={13}
                  color={isActive ? '#FFFFFF' : g.color}
                  style={{ marginRight: 5 }}
                />
                <Text style={[styles.filterPillText, isActive && { color: '#FFFFFF', fontWeight: '700' }]}>
                  {g.filterLabel}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Grouped Timing Cards */}
        {filteredGroups.map((group) => (
          <View
            key={group.id}
            style={[
              styles.categoryCard,
              { backgroundColor: cardBg, borderColor: borderC },
            ]}
          >
            {/* Category Header Bar */}
            <View style={styles.categoryHeader}>
              <View style={[styles.categoryIconCircle, { backgroundColor: `${group.color}15` }]}>
                <Ionicons name={group.icon} size={18} color={group.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.categoryTitle, { color: theme.colors.text }]}>{group.title}</Text>
                <Text style={[styles.categorySub, { color: theme.colors.textSecondary }]}>
                  {group.shortDesc}
                </Text>
              </View>
              <View style={[styles.groupCountBadge, { backgroundColor: `${group.color}14` }]}>
                <Text style={[styles.groupCountText, { color: group.color }]}>
                  {group.items.length} {group.items.length === 1 ? 'timer' : 'timers'}
                </Text>
              </View>
            </View>

            <View style={[styles.categoryDivider, { backgroundColor: borderC }]} />

            {/* Visual Photoperiod Ratio for Light */}
            {group.id === 'light' && (
              <View
                style={[
                  styles.photoperiodCard,
                  {
                    backgroundColor: theme.dark ? 'rgba(255, 179, 0, 0.08)' : '#FFF9E6',
                    borderColor: theme.dark ? 'rgba(255, 179, 0, 0.25)' : '#FFE082',
                  },
                ]}
              >
                <View style={styles.photoperiodHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="sunny" size={15} color="#FFB300" />
                    <Text style={[styles.photoperiodTitle, { color: theme.colors.text }]}>
                      24h Photoperiod Ratio
                    </Text>
                  </View>
                  <View style={[styles.photoperiodBadge, { backgroundColor: `${group.color}20` }]}>
                    <Text style={[styles.photoperiodBadgeText, { color: group.color }]}>
                      Total: {fmtSec((timings.LPP_OT ?? 43200) + (timings.LLP_DI ?? 43200))}
                    </Text>
                  </View>
                </View>

                {/* Split Progress Track */}
                <View style={styles.photoperiodTrack}>
                  <View
                    style={[
                      styles.photoperiodDaySegment,
                      {
                        flex: Math.max(1, timings.LPP_OT ?? 43200),
                        backgroundColor: '#FFB300',
                      },
                    ]}
                  />
                  <View
                    style={[
                      styles.photoperiodNightSegment,
                      {
                        flex: Math.max(1, timings.LLP_DI ?? 43200),
                        backgroundColor: theme.dark ? '#3949AB' : '#5C6BC0',
                      },
                    ]}
                  />
                </View>

                {/* Photoperiod Legend Labels */}
                <View style={styles.photoperiodLegendRow}>
                  <View style={styles.photoperiodLegendItem}>
                    <View style={[styles.legendDot, { backgroundColor: '#FFB300' }]} />
                    <Text style={[styles.legendLabelText, { color: theme.colors.textSecondary }]}>
                      Day / ON:{' '}
                      <Text style={[styles.legendValText, { color: theme.colors.text }]}>
                        {fmtSec(timings.LPP_OT ?? 43200)}
                      </Text>{' '}
                      ({Math.round(((timings.LPP_OT ?? 43200) / Math.max(1, (timings.LPP_OT ?? 43200) + (timings.LLP_DI ?? 43200))) * 100)}%)
                    </Text>
                  </View>

                  <View style={styles.photoperiodLegendItem}>
                    <View style={[styles.legendDot, { backgroundColor: theme.dark ? '#3949AB' : '#5C6BC0' }]} />
                    <Text style={[styles.legendLabelText, { color: theme.colors.textSecondary }]}>
                      Night / Rest:{' '}
                      <Text style={[styles.legendValText, { color: theme.colors.text }]}>
                        {fmtSec(timings.LLP_DI ?? 43200)}
                      </Text>{' '}
                      ({Math.round(((timings.LLP_DI ?? 43200) / Math.max(1, (timings.LPP_OT ?? 43200) + (timings.LLP_DI ?? 43200))) * 100)}%)
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {/* Individual Timing Tiles */}
            <View style={styles.tilesContainer}>
              {group.items.map((item) => {
                const val = timings[item.key] ?? item.def;
                const isLight = item.key === 'LPP_OT' || item.key === 'LLP_DI' || item.key === 'LPP_DI';
                const isQuickSmall = item.key.includes('OT') && !isLight;
                const stepDelta = isLight ? 1800 : (isQuickSmall ? 5 : 60);

                return (
                  <View
                    key={item.key}
                    style={[
                      styles.timingTile,
                      {
                        borderColor: borderC,
                        backgroundColor: theme.dark ? 'rgba(255,255,255,0.02)' : '#FAFAFA',
                      },
                    ]}
                  >
                    {/* Top Row: Code Badge & Full Edit Button */}
                    <View style={styles.tileTopRow}>
                      <View style={[styles.tileCodeBadge, { backgroundColor: `${group.color}14` }]}>
                        <Text style={[styles.tileCodeText, { color: group.color }]}>{item.shortLabel}</Text>
                      </View>

                      <TouchableOpacity
                        style={[styles.tileTapToEdit, { backgroundColor: `${group.color}10`, borderColor: `${group.color}25` }]}
                        onPress={() =>
                          setActivePickerField({
                            ...item,
                            groupTitle: group.title,
                            icon: group.icon,
                            color: group.color,
                          })
                        }
                        activeOpacity={0.65}
                      >
                        <Ionicons name="time-outline" size={13} color={group.color} />
                        <Text style={[styles.tileTapText, { color: group.color }]}>Set Time</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Middle: Title & Description */}
                    <Text style={[styles.tileTitle, { color: theme.colors.text }]} numberOfLines={1}>
                      {item.label}
                    </Text>
                    <Text style={[styles.tileDesc, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                      {item.desc}
                    </Text>

                    {/* Bottom Row: Human-friendly Duration Pill + Stepper controls */}
                    <View style={styles.tileBottomRow}>
                      <TouchableOpacity
                        style={[
                          styles.tileDurationPill,
                          {
                            backgroundColor: `${group.color}10`,
                            borderColor: `${group.color}30`,
                          },
                        ]}
                        onPress={() =>
                          setActivePickerField({
                            ...item,
                            groupTitle: group.title,
                            icon: group.icon,
                            color: group.color,
                          })
                        }
                        activeOpacity={0.7}
                      >
                        <Ionicons name="timer" size={16} color={group.color} />
                        <View>
                          <Text style={[styles.tileDurationText, { color: group.color }]}>
                            {fmtSec(val)}
                          </Text>
                          <Text style={[styles.tileSecondsRaw, { color: theme.colors.textSecondary }]}>
                            {val}s total
                          </Text>
                        </View>
                      </TouchableOpacity>

                      {/* Tactile Micro Stepper Buttons */}
                      <View style={styles.miniStepperGroup}>
                        <TouchableOpacity
                          style={[
                            styles.miniStepBtn,
                            {
                              borderColor: `${group.color}35`,
                              backgroundColor: theme.colors.surface || '#FFFFFF',
                            },
                          ]}
                          onPress={() => handleQuickStep(item.key, -stepDelta)}
                          activeOpacity={0.6}
                        >
                          <Ionicons name="remove" size={16} color={group.color} />
                        </TouchableOpacity>

                        <View style={styles.stepDeltaBadge}>
                          <Text style={[styles.stepDeltaText, { color: theme.colors.textSecondary }]}>
                            {stepDelta >= 60 ? `${stepDelta / 60}m` : `${stepDelta}s`}
                          </Text>
                        </View>

                        <TouchableOpacity
                          style={[
                            styles.miniStepBtn,
                            {
                              borderColor: `${group.color}35`,
                              backgroundColor: theme.colors.surface || '#FFFFFF',
                            },
                          ]}
                          onPress={() => handleQuickStep(item.key, stepDelta)}
                          activeOpacity={0.6}
                        >
                          <Ionicons name="add" size={16} color={group.color} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        ))}

        {/* Offline Warning Notice if disconnected */}
        {!canPublish && (
          <View
            style={[
              styles.offlineNoticeCard,
              {
                backgroundColor: theme.dark ? 'rgba(244, 67, 54, 0.12)' : '#FFEBEE',
                borderColor: theme.dark ? 'rgba(244, 67, 54, 0.3)' : '#FFCDD2',
              },
            ]}
          >
            <Ionicons name="cloud-offline-outline" size={20} color="#D32F2F" />
            <Text
              style={[
                styles.offlineNoticeText,
                { color: theme.dark ? '#FF8A80' : '#C62828' },
              ]}
            >
              Device is currently offline. You can test and adjust values locally; publish will activate once connection restores.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Floating Modern Save & Publish Bar */}
      <View
        style={[
          styles.stickyBottomBar,
          {
            backgroundColor: theme.colors.surface || '#FFFFFF',
            borderTopColor: borderC,
          },
        ]}
      >
        <TouchableOpacity
          style={[
            styles.saveBtn,
            !canPublish && styles.saveBtnDisabled,
            { opacity: isSaving ? 0.7 : !canPublish ? 0.65 : 1 },
          ]}
          onPress={handleSaveAndPublish}
          disabled={!canPublish || isSaving}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={
              !canPublish
                ? ['#9E9E9E', '#757575']
                : hasChanges
                ? ['#2E7D32', '#1B5E20']
                : ['#388E3C', '#2E7D32']
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.saveBtnGradient}
          >
            {isSaving ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                <Ionicons
                  name={!canPublish ? 'lock-closed-outline' : hasChanges ? 'cloud-upload' : 'cloud-done-outline'}
                  size={20}
                  color="#FFFFFF"
                />
                <Text style={styles.saveBtnText}>
                  {!canPublish
                    ? (!isConnected ? 'Offline — No MQTT Connection' : 'Device Offline')
                    : hasChanges
                    ? 'Save & Publish Changes'
                    : 'Publish Timings to Device'}
                </Text>
                {hasChanges && canPublish && (
                  <View style={styles.unsavedDotBadge}>
                    <Text style={styles.unsavedDotText}>Ready</Text>
                  </View>
                )}
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* Custom Attractive Feedback Modal */}
      <CustomFeedbackModal
        visible={feedbackModal.visible}
        type={feedbackModal.type}
        title={feedbackModal.title}
        message={feedbackModal.message}
        onClose={() => setFeedbackModal((prev) => ({ ...prev, visible: false }))}
        theme={theme}
      />

      {/* Custom Confirmation Modal for Factory Reset */}
      <CustomConfirmModal
        visible={confirmResetVisible}
        title="Reset All Timings?"
        message={`Are you sure you want to restore all ${totalParameters} timing parameters back to their factory default duty cycles?`}
        onConfirm={() => {
          setConfirmResetVisible(false);
          setTimings({ ...DEFAULT_TIMINGS });
          setHasChanges(true);
        }}
        onCancel={() => setConfirmResetVisible(false)}
        theme={theme}
      />

      {/* Interactive Time Picker Modal */}
      {activePickerField && (
        <CenteredTimePickerModal
          visible={!!activePickerField}
          value={timings[activePickerField.key] ?? activePickerField.def}
          field={activePickerField}
          onClose={() => setActivePickerField(null)}
          onSelect={(val) => handleTimingChange(activePickerField.key, val)}
          theme={theme}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingHorizontal: 16 },

  /* Hero Card */
  heroCard: {
    borderRadius: 22,
    padding: 18,
    marginBottom: 14,
    elevation: 5,
    shadowColor: '#1B5E20',
    shadowOpacity: 0.35,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  heroStatusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.25)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    alignSelf: 'flex-start',
    marginBottom: 6,
  },
  heroStatusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  heroStatusText: {
    color: '#E8F5E9',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  heroSub: {
    color: '#C8E6C9',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  heroResetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  heroResetText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },

  heroMetricsBar: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  heroMetricItem: {
    flex: 1,
    alignItems: 'center',
  },
  heroMetricVal: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  heroMetricLabel: {
    color: '#E8F5E9',
    fontSize: 9,
    marginTop: 1,
    fontWeight: '600',
    opacity: 0.85,
  },
  heroMetricDivider: {
    width: 1,
    height: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },

  /* Filter Pills */
  filterScroll: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 14,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  filterPillActive: {
    backgroundColor: '#2E7D32',
    borderColor: '#2E7D32',
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#757575',
  },
  filterPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  /* Category Card */
  categoryCard: {
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 14,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  categoryIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryTitle: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  categorySub: {
    fontSize: 11,
    marginTop: 1,
  },
  groupCountBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  groupCountText: {
    fontSize: 10,
    fontWeight: '700',
  },
  categoryDivider: {
    height: StyleSheet.hairlineWidth,
  },

  /* Photoperiod Visualizer (Light Card) */
  photoperiodCard: {
    marginHorizontal: 12,
    marginTop: 12,
    marginBottom: 6,
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
  },
  photoperiodHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  photoperiodTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  photoperiodBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  photoperiodBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  photoperiodTrack: {
    height: 10,
    borderRadius: 5,
    flexDirection: 'row',
    overflow: 'hidden',
    marginBottom: 10,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  photoperiodDaySegment: {
    height: '100%',
  },
  photoperiodNightSegment: {
    height: '100%',
  },
  photoperiodLegendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  photoperiodLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabelText: {
    fontSize: 11,
    fontWeight: '500',
  },
  legendValText: {
    fontWeight: '700',
  },

  /* Tiles Grid */
  tilesContainer: {
    padding: 12,
    gap: 10,
  },
  timingTile: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
  tileTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  tileCodeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  tileCodeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  tileTapToEdit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  tileTapText: {
    fontSize: 11,
    fontWeight: '700',
  },
  tileTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  tileDesc: {
    fontSize: 11,
    marginTop: 2,
    marginBottom: 10,
  },
  tileBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  tileDurationPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  tileDurationText: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  tileSecondsRaw: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 1,
  },
  miniStepperGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  miniStepBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
  },
  stepDeltaBadge: {
    paddingHorizontal: 4,
    alignItems: 'center',
    minWidth: 26,
  },
  stepDeltaText: {
    fontSize: 10,
    fontWeight: '700',
  },

  /* Offline Notice */
  offlineNoticeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 8,
    marginBottom: 14,
  },
  offlineNoticeText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '500',
  },

  /* Sticky Bottom Save Bar */
  stickyBottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 24 : 14,
    borderTopWidth: 1,
    elevation: 10,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: -3 },
    shadowRadius: 8,
  },
  saveBtn: {
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 3,
    shadowColor: '#2E7D32',
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 6,
  },
  saveBtnDisabled: {
    elevation: 0,
    shadowOpacity: 0,
  },
  saveBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  unsavedDotBadge: {
    backgroundColor: '#FFA000',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  unsavedDotText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },

  /* Centered Modal Backdrop */
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },

  /* Custom Feedback Modal */
  feedbackCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1.5,
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 18,
  },
  feedbackIconOuter: {
    marginBottom: 16,
  },
  feedbackIconGlow: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  feedbackIconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedbackTitle: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 8,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  feedbackMessage: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
    paddingHorizontal: 6,
    fontWeight: '500',
  },
  feedbackBtn: {
    width: '100%',
    borderRadius: 14,
    overflow: 'hidden',
  },
  feedbackBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 13,
  },
  feedbackBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },

  /* Confirm Buttons */
  confirmBtnRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  confirmCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmCancelText: {
    fontSize: 14,
    fontWeight: '600',
  },
  confirmActionBtn: {
    flex: 1.3,
    borderRadius: 12,
    overflow: 'hidden',
  },
  confirmActionGradient: {
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmActionText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },

  /* Centered Time Picker Card */
  centeredModalCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  modalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  modalIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  modalCodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  modalCodeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  modalCodeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  modalSubtitle: {
    fontSize: 11,
  },
  closeIconBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.05)',
  },

  digitalDisplayCard: {
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
  },
  digitalTimeText: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 1,
    fontVariant: ['tabular-nums'],
  },
  digitalSubText: {
    fontSize: 11,
    marginTop: 3,
    fontWeight: '500',
  },

  steppersContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  stepperCol: {
    flex: 1,
    alignItems: 'center',
  },
  stepperColLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  stepperBtn: {
    width: 44,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValueBox: {
    marginVertical: 4,
    paddingVertical: 6,
    paddingHorizontal: 8,
    minWidth: 44,
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
  },
  stepperValueText: {
    fontSize: 17,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  stepperDivider: {
    fontSize: 18,
    fontWeight: '800',
    marginTop: 18,
    paddingHorizontal: 2,
  },

  presetSectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 8,
  },
  presetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 18,
  },
  presetChip: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  presetChipText: {
    fontSize: 11,
    fontWeight: '600',
  },

  modalActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelText: {
    fontSize: 14,
    fontWeight: '600',
  },
  modalApplyBtn: {
    flex: 1.6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
  },
  modalApplyText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
