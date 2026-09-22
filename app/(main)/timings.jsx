// app/(main)/timings.jsx — High-Aesthetic Interactive System Timings
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Alert,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../src/context/ThemContext';
import { useMqtt, DEFAULT_TIMINGS } from '../../src/context/MqttContext';
import { useScroll, useScrollReset } from '../../src/context/ScrollContext';

const { width } = Dimensions.get('window');

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

// ── Centered, Interactive Time Picker Modal with Steppers & Quick Presets ──
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

  // Common Presets based on field type
  const isPulse = field?.key?.includes('OT');
  const presets = isPulse
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
              <View>
                <Text style={[styles.modalTitle, { color: theme.colors.text }]} numberOfLines={1}>
                  {field?.label || 'Set Duration'}
                </Text>
                <View style={styles.modalCodeRow}>
                  <View style={[styles.modalCodeBadge, { backgroundColor: `${color}18` }]}>
                    <Text style={[styles.modalCodeText, { color }]}>{field?.shortLabel}</Text>
                  </View>
                  <Text style={[styles.modalSubtitle, { color: theme.colors.textSecondary }]}>
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
            colors={theme.dark ? ['#1B5E2020', '#1B5E2010'] : ['#E8F5E9', '#F1F8E9']}
            style={[styles.digitalDisplayCard, { borderColor: `${color}30` }]}
          >
            <Text style={[styles.digitalTimeText, { color }]}>
              {String(hours).padStart(2, '0')} : {String(minutes).padStart(2, '0')} : {String(seconds).padStart(2, '0')}
            </Text>
            <Text style={[styles.digitalSubText, { color: theme.colors.textSecondary }]}>
              {fmtSec(totalSec)} ({totalSec} seconds total)
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

// ── Timing Categories ──
const TIMING_GROUPS = [
  {
    id: 'water',
    title: 'Water Circulation',
    shortDesc: 'Pump pulse & cycle',
    icon: 'water',
    color: '#2196F3',
    gradient: ['#2196F315', '#0288D105'],
    items: [
      { key: 'WPONT', label: 'Water Pump ON Time', shortLabel: 'WPONT', def: 120, unit: 's', desc: 'Active pumping duration' },
      { key: 'WPINT', label: 'Water Pump Interval', shortLabel: 'WPINT', def: 900, unit: 's', desc: 'Rest duration between cycles' },
    ],
  },
  {
    id: 'nutrient',
    title: 'Nutrient Pump',
    shortDesc: 'Main nutrient feed',
    icon: 'leaf',
    color: '#4CAF50',
    gradient: ['#4CAF5015', '#2E7D3205'],
    items: [
      { key: 'NP_OT', label: 'Nutrient Pump ON Time', shortLabel: 'NP_OT', def: 10, unit: 's', desc: 'Nutrient pump active burst' },
      { key: 'NP_DI', label: 'Nutrient Pump Interval', shortLabel: 'NP_DI', def: 3600, unit: 's', desc: 'Interval between feedings' },
    ],
  },
  {
    id: 'ec',
    title: 'EC Fertigation (A & B)',
    shortDesc: 'Concentrate dosing',
    icon: 'flask',
    color: '#00BCD4',
    gradient: ['#00BCD415', '#0097A705'],
    items: [
      { key: 'ECAP_OT', label: 'EC-A Pump ON Time', shortLabel: 'ECAP_OT', def: 10, unit: 's', desc: 'Part-A dosing burst' },
      { key: 'ECA_DI', label: 'EC-A Dosing Interval', shortLabel: 'ECA_DI', def: 3600, unit: 's', desc: 'Part-A cycle frequency' },
      { key: 'ECBP_OT', label: 'EC-B Pump ON Time', shortLabel: 'ECBP_OT', def: 10, unit: 's', desc: 'Part-B dosing burst' },
      { key: 'ECB_DI', label: 'EC-B Dosing Interval', shortLabel: 'ECB_DI', def: 3600, unit: 's', desc: 'Part-B cycle frequency' },
    ],
  },
  {
    id: 'ph',
    title: 'pH Balancing',
    shortDesc: 'pH Up & Down pulses',
    icon: 'speedometer',
    color: '#FF9800',
    gradient: ['#FF980015', '#F57C0005'],
    items: [
      { key: 'pHPU_ONT', label: 'pH Up Pump ON Time', shortLabel: 'pHPU_ONT', def: 5, unit: 's', desc: 'pH Up micro-dose' },
      { key: 'pHPD_ONT', label: 'pH Down Pump ON Time', shortLabel: 'pHPD_ONT', def: 5, unit: 's', desc: 'pH Down micro-dose' },
    ],
  },
];

export default function TimingsScreen() {
  const { theme } = useTheme();
  const { headerHeight } = useScroll();
  const scrollRef = React.useRef(null);
  useScrollReset(scrollRef);

  const {
    selectedExternalKey,
    externalKey,
    getSelectedDeviceName,
    getSelectedDeviceTimings,
    publishTimings,
  } = useMqtt();

  const deviceKey = selectedExternalKey || externalKey;
  const selectedDeviceName = getSelectedDeviceName();
  const currentDeviceTimings = getSelectedDeviceTimings();

  const [timings, setTimings] = useState(() => ({
    ...DEFAULT_TIMINGS,
    ...currentDeviceTimings,
  }));

  const [selectedFilter, setSelectedFilter] = useState('all');
  const [activePickerField, setActivePickerField] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (currentDeviceTimings) {
      setTimings((prev) => ({
        ...prev,
        ...currentDeviceTimings,
      }));
    }
  }, [currentDeviceTimings]);

  const handleTimingChange = useCallback((key, value) => {
    setTimings((prev) => {
      const next = { ...prev, [key]: Number(value) };
      setHasChanges(true);
      return next;
    });
  }, []);

  // Quick inline stepper directly on the card
  const handleQuickStep = (key, delta) => {
    setTimings((prev) => {
      const current = prev[key] ?? DEFAULT_TIMINGS[key] ?? 10;
      const next = Math.max(1, current + delta);
      setHasChanges(true);
      return { ...prev, [key]: next };
    });
  };

  const handleSaveAndPublish = async () => {
    if (!deviceKey) {
      Alert.alert('Error', 'No device selected.');
      return;
    }

    setIsSaving(true);
    try {
      const success = await publishTimings(deviceKey, timings);
      if (success) {
        setHasChanges(false);
        Alert.alert('✅ Saved', 'All 10 system timings published to device successfully!');
      } else {
        Alert.alert('Error', 'Failed to publish timings to device.');
      }
    } catch (err) {
      console.error('Error saving timings:', err);
      Alert.alert('Error', 'An error occurred while publishing.');
    } finally {
      setIsSaving(false);
    }
  };

  const resetToDefaults = () => {
    Alert.alert(
      'Reset Timings',
      'Reset all 10 timings to factory defaults?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset All',
          style: 'destructive',
          onPress: () => {
            setTimings({ ...DEFAULT_TIMINGS });
            setHasChanges(true);
          },
        },
      ]
    );
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
        contentContainerStyle={[styles.scrollContent, { paddingTop: headerHeight + 8 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Interactive Card */}
        <LinearGradient
          colors={theme.dark ? ['#1B5E20', '#0D3813'] : ['#2E7D32', '#1B5E20']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroCard}
        >
          <View style={styles.heroTopRow}>
            <View style={{ flex: 1 }}>
              <View style={styles.heroTagRow}>
                <View style={styles.heroLiveDot} />
                <Text style={styles.heroTagText}>FIRMWARE TIMING ENGINE</Text>
              </View>
              <Text style={styles.heroTitle}>System Duty Cycles</Text>
              <Text style={styles.heroSub}>
                {selectedDeviceName ? `${selectedDeviceName} • ` : ''}10 Parameters Active
              </Text>
            </View>

            <TouchableOpacity
              style={styles.heroResetBtn}
              onPress={resetToDefaults}
              activeOpacity={0.7}
            >
              <Ionicons name="refresh" size={14} color="#FFFFFF" />
              <Text style={styles.heroResetText}>Reset</Text>
            </TouchableOpacity>
          </View>

          {/* Quick Metrics Bar inside Hero */}
          <View style={styles.heroMetricsBar}>
            <View style={styles.heroMetricItem}>
              <Text style={styles.heroMetricVal}>{fmtSec(timings.WPONT)}</Text>
              <Text style={styles.heroMetricLabel}>Pump ON</Text>
            </View>
            <View style={styles.heroMetricDivider} />
            <View style={styles.heroMetricItem}>
              <Text style={styles.heroMetricVal}>{fmtSec(timings.WPINT)}</Text>
              <Text style={styles.heroMetricLabel}>Interval</Text>
            </View>
            <View style={styles.heroMetricDivider} />
            <View style={styles.heroMetricItem}>
              <Text style={styles.heroMetricVal}>{fmtSec(timings.NP_OT)}</Text>
              <Text style={styles.heroMetricLabel}>Nutrient ON</Text>
            </View>
            <View style={styles.heroMetricDivider} />
            <View style={styles.heroMetricItem}>
              <Text style={styles.heroMetricVal}>{fmtSec(timings.pHPU_ONT)}</Text>
              <Text style={styles.heroMetricLabel}>pH Pulse</Text>
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
            <Text style={[styles.filterPillText, selectedFilter === 'all' && styles.filterPillTextActive]}>
              All (10)
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
                  style={{ marginRight: 4 }}
                />
                <Text style={[styles.filterPillText, isActive && { color: '#FFFFFF', fontWeight: '700' }]}>
                  {g.title.split(' ')[0]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Grouped Timing Cards with Micro-Interactions */}
        {filteredGroups.map((group) => (
          <View
            key={group.id}
            style={[styles.categoryCard, { backgroundColor: cardBg, borderColor: borderC }]}
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
            </View>

            <View style={[styles.categoryDivider, { backgroundColor: borderC }]} />

            {/* Individual Timing Tiles */}
            <View style={styles.tilesContainer}>
              {group.items.map((item) => {
                const val = timings[item.key] ?? item.def;
                const isQuickSmall = item.key.includes('OT');
                const stepDelta = isQuickSmall ? 5 : 60;

                return (
                  <View
                    key={item.key}
                    style={[styles.timingTile, { borderColor: borderC, backgroundColor: theme.colors.background }]}
                  >
                    {/* Top Row: Code Badge & Full Edit Button */}
                    <View style={styles.tileTopRow}>
                      <View style={[styles.tileCodeBadge, { backgroundColor: `${group.color}14` }]}>
                        <Text style={[styles.tileCodeText, { color: group.color }]}>{item.shortLabel}</Text>
                      </View>

                      <TouchableOpacity
                        style={[styles.tileTapToEdit, { backgroundColor: `${group.color}10` }]}
                        onPress={() =>
                          setActivePickerField({
                            ...item,
                            groupTitle: group.title,
                            icon: group.icon,
                            color: group.color,
                          })
                        }
                        activeOpacity={0.6}
                      >
                        <Ionicons name="options-outline" size={13} color={group.color} />
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

                    {/* Bottom Row: Big Formatted Value + Direct Steppers */}
                    <View style={styles.tileBottomRow}>
                      <TouchableOpacity
                        style={{ flex: 1 }}
                        onPress={() =>
                          setActivePickerField({
                            ...item,
                            groupTitle: group.title,
                            icon: group.icon,
                            color: group.color,
                          })
                        }
                      >
                        <Text style={[styles.tileDurationText, { color: group.color }]}>
                          {fmtSec(val)}
                        </Text>
                        <Text style={[styles.tileSecondsRaw, { color: theme.colors.textSecondary }]}>
                          {val}s
                        </Text>
                      </TouchableOpacity>

                      {/* Micro Steppers right on card */}
                      <View style={styles.miniStepperGroup}>
                        <TouchableOpacity
                          style={[styles.miniStepBtn, { borderColor: borderC }]}
                          onPress={() => handleQuickStep(item.key, -stepDelta)}
                          activeOpacity={0.6}
                        >
                          <Ionicons name="remove" size={14} color={theme.colors.text} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.miniStepBtn, { borderColor: borderC }]}
                          onPress={() => handleQuickStep(item.key, stepDelta)}
                          activeOpacity={0.6}
                        >
                          <Ionicons name="add" size={14} color={theme.colors.text} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        ))}

        {/* Floating / Sticky-style Save Button */}
        <View style={styles.saveSection}>
          <TouchableOpacity
            style={[
              styles.saveBtn,
              hasChanges && styles.saveBtnHighlighted,
              { opacity: isSaving ? 0.7 : 1 },
            ]}
            onPress={handleSaveAndPublish}
            disabled={isSaving}
            activeOpacity={0.8}
          >
            {isSaving ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                <Ionicons name="cloud-upload" size={18} color="#FFFFFF" />
                <Text style={styles.saveBtnText}>
                  {hasChanges ? 'Save Changes to Device' : 'Publish Timings to Device'}
                </Text>
                {hasChanges && (
                  <View style={styles.unsavedDotBadge}>
                    <Text style={styles.unsavedDotText}>1</Text>
                  </View>
                )}
              </>
            )}
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Centered Modal */}
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
  scrollContent: { paddingHorizontal: 16, paddingBottom: 40 },

  /* Hero Card */
  heroCard: {
    borderRadius: 20,
    padding: 18,
    marginBottom: 14,
    elevation: 4,
    shadowColor: '#2E7D32',
    shadowOpacity: 0.35,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  heroTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  heroLiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#69F0AE',
  },
  heroTagText: {
    color: '#A5D6A7',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  heroSub: {
    color: '#E8F5E9',
    fontSize: 12,
    opacity: 0.85,
    marginTop: 2,
  },
  heroResetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  heroResetText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },

  heroMetricsBar: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
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
    color: '#C8E6C9',
    fontSize: 9,
    marginTop: 1,
    fontWeight: '600',
  },
  heroMetricDivider: {
    width: 1,
    height: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
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
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 14,
    overflow: 'hidden',
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  categoryIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  categorySub: {
    fontSize: 11,
    marginTop: 1,
  },
  categoryDivider: {
    height: StyleSheet.hairlineWidth,
  },

  /* Tiles Grid */
  tilesContainer: {
    padding: 12,
    gap: 10,
  },
  timingTile: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
  },
  tileTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  tileCodeBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  tileCodeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  tileTapToEdit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  tileTapText: {
    fontSize: 11,
    fontWeight: '700',
  },
  tileTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  tileDesc: {
    fontSize: 11,
    marginTop: 1,
    marginBottom: 8,
  },
  tileBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tileDurationText: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  tileSecondsRaw: {
    fontSize: 10,
    fontWeight: '500',
  },
  miniStepperGroup: {
    flexDirection: 'row',
    gap: 6,
  },
  miniStepBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Save Action */
  saveSection: {
    marginTop: 8,
  },
  saveBtn: {
    backgroundColor: '#2E7D32',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
    borderRadius: 14,
    elevation: 3,
    shadowColor: '#2E7D32',
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 6,
  },
  saveBtnHighlighted: {
    backgroundColor: '#1B5E20',
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  unsavedDotBadge: {
    backgroundColor: '#FF9800',
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unsavedDotText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },

  /* Centered Modal Styles */
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
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

  /* Steppers */
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

  /* Presets */
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

  /* Actions */
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
