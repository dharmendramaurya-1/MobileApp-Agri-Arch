// app/(main)/clean-tank.jsx — High-Aesthetic Interactive Clean Tank Experience
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { InletValveIcon, OutletValveIcon, WaterPumpIcon } from '../../components/SvgIcons';
import { useMqtt } from '../../src/context/MqttContext';
import { useScroll, useScrollReset } from '../../src/context/ScrollContext';
import { CLEAN_TANK_PHASES, useTankSafety } from '../../src/context/TankSafetyContext';
import { useTheme } from '../../src/context/ThemContext';

const { width } = Dimensions.get('window');

// ── Properly Centered Confirmation & Control Modal ──
function CenteredCleanTankModal({
  visible,
  isStopping,
  onClose,
  onConfirm,
  isProcessing,
  theme,
}) {
  const cardBg = theme.colors.surface || '#FFFFFF';
  const borderC = theme.colors.border || '#E0E0E0';
  const primaryColor = isStopping ? '#D32F2F' : '#2E7D32';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.centeredModalCard, { backgroundColor: cardBg, borderColor: borderC }]}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <View style={[styles.modalIconCircle, { backgroundColor: `${primaryColor}18` }]}>
              <Ionicons
                name={isStopping ? 'stop-circle-outline' : 'sparkles-outline'}
                size={24}
                color={primaryColor}
              />
            </View>
            <TouchableOpacity
              onPress={onClose}
              disabled={isProcessing}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={styles.modalCloseBtn}
            >
              <Ionicons name="close" size={20} color={theme.colors.textSecondary || '#757575'} />
            </TouchableOpacity>
          </View>

          {/* Title & Subtitle */}
          <Text style={[styles.modalTitle, { color: theme.colors.text }]}>
            {isStopping ? 'Stop Clean Tank Cycle?' : 'Start Auto Clean Cycle'}
          </Text>
          <Text style={[styles.modalSubtitle, { color: theme.colors.textSecondary }]}>
            {isStopping
              ? 'Halting the automated cycle will close all valves and maintain current water levels safely.'
              : 'The automated cycle will perform a 5-stage drain, safety flush, and replenishment routine.'}
          </Text>

          {/* Process Breakdown Chips / Points */}
          {!isStopping ? (
            <View style={styles.modalStepsBox}>
              <View style={styles.modalStepRow}>
                <View style={[styles.modalStepCheck, { backgroundColor: '#4CAF5015' }]}>
                  <Ionicons name="checkmark" size={13} color="#2E7D32" />
                </View>
                <Text style={[styles.modalStepText, { color: theme.colors.text }]}>
                  <Text style={{ fontWeight: '700' }}>Pump Protection:</Text> Water pump turns OFF immediately
                </Text>
              </View>

              <View style={styles.modalStepRow}>
                <View style={[styles.modalStepCheck, { backgroundColor: '#4CAF5015' }]}>
                  <Ionicons name="checkmark" size={13} color="#2E7D32" />
                </View>
                <Text style={[styles.modalStepText, { color: theme.colors.text }]}>
                  <Text style={{ fontWeight: '700' }}>Deep Drain:</Text> Outlet valve opens until level drops below{' '}
                  <Text style={{ color: '#D32F2F', fontWeight: '800' }}>5%</Text>
                </Text>
              </View>

              <View style={styles.modalStepRow}>
                <View style={[styles.modalStepCheck, { backgroundColor: '#4CAF5015' }]}>
                  <Ionicons name="checkmark" size={13} color="#2E7D32" />
                </View>
                <Text style={[styles.modalStepText, { color: theme.colors.text }]}>
                  <Text style={{ fontWeight: '700' }}>Fresh Inflow:</Text> Inlet valve opens with 3-min inflow monitor
                </Text>
              </View>

              <View style={styles.modalStepRow}>
                <View style={[styles.modalStepCheck, { backgroundColor: '#4CAF5015' }]}>
                  <Ionicons name="checkmark" size={13} color="#2E7D32" />
                </View>
                <Text style={[styles.modalStepText, { color: theme.colors.text }]}>
                  <Text style={{ fontWeight: '700' }}>Auto Resume:</Text> Water pump restarts once level exceeds{' '}
                  <Text style={{ color: '#2E7D32', fontWeight: '800' }}>15%</Text>
                </Text>
              </View>
            </View>
          ) : (
            <View style={[styles.modalWarningBox, { backgroundColor: '#FFEBEE', borderColor: '#FFCDD2' }]}>
              <Ionicons name="warning-outline" size={18} color="#D32F2F" />
              <Text style={styles.modalWarningText}>
                Inlet and outlet valves will close immediately to prevent overflow or accidental dry-run.
              </Text>
            </View>
          )}

          {/* Action Buttons */}
          <View style={styles.modalActionsRow}>
            <TouchableOpacity
              style={[styles.modalCancelBtn, { borderColor: borderC }]}
              onPress={onClose}
              disabled={isProcessing}
              activeOpacity={0.7}
            >
              <Text style={[styles.modalCancelText, { color: theme.colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modalConfirmBtn, { backgroundColor: primaryColor }]}
              onPress={onConfirm}
              disabled={isProcessing}
              activeOpacity={0.8}
            >
              {isProcessing ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <>
                  <Ionicons
                    name={isStopping ? 'stop' : 'play'}
                    size={16}
                    color="#FFFFFF"
                  />
                  <Text style={styles.modalConfirmText}>
                    {isStopping ? 'Stop Cycle' : 'Confirm & Start'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default function CleanTankScreen() {
  const { theme } = useTheme();
  const { headerHeight } = useScroll();
  const scrollRef = React.useRef(null);
  useScrollReset(scrollRef);

  const {
    selectedExternalKey,
    externalKey,
    getSelectedDeviceName,
  } = useMqtt();

  const {
    cleanTankActive,
    cleanTankPhase,
    safetyAlert,
    clearSafetyAlert,
    inflowSecondsRemaining,
    currentLevel,
    isPumpOn,
    isInletOpen,
    isOutletOpen,
    startCleanTank,
    stopCleanTank,
  } = useTankSafety();

  const selectedDeviceName = getSelectedDeviceName();
  const [isProcessing, setIsProcessing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);

  const levelVal = currentLevel !== null && currentLevel !== undefined ? Math.round(currentLevel) : null;

  const handleOpenModal = () => {
    setModalVisible(true);
  };

  const handleConfirmAction = async () => {
    setIsProcessing(true);
    try {
      if (cleanTankActive) {
        await stopCleanTank();
      } else {
        await startCleanTank();
      }
    } finally {
      setIsProcessing(false);
      setModalVisible(false);
    }
  };

  const cardBg = theme.colors.card || theme.colors.surface || '#FFFFFF';
  const borderC = theme.colors.border || '#E8E8E8';

  // 5 Process Steps metadata
  const STEPS = [
    {
      num: 1,
      title: 'Halt Pump',
      sub: 'Prevent dry run damage',
      icon: 'power',
      badge: 'Step 1',
    },
    {
      num: 2,
      title: 'Drain Tank',
      sub: 'Outlet valve open till < 5%',
      icon: 'water-outline',
      badge: 'Cutoff 5%',
    },
    {
      num: 3,
      title: 'Refill Reservoir',
      sub: 'Inlet open till 90% full',
      icon: 'arrow-down-circle-outline',
      badge: 'Target 90%',
    },
    {
      num: 4,
      title: 'Inflow Protection',
      sub: 'Require +3% rise in 3 min',
      icon: 'shield-checkmark-outline',
      badge: 'Fail-safe',
    },
    {
      num: 5,
      title: 'Resume Circulation',
      sub: 'Pump starts when level > 15%',
      icon: 'refresh-circle-outline',
      badge: 'Safe > 15%',
    },
  ];

  const getStepStatus = (num) => {
    if (!cleanTankActive) {
      if (cleanTankPhase === CLEAN_TANK_PHASES.COMPLETED) return 'completed';
      return 'idle';
    }
    if (num === 1) return 'completed';
    if (num === 2) {
      if (cleanTankPhase === CLEAN_TANK_PHASES.DRAINING) return 'active';
      return 'completed';
    }
    if (num === 3 || num === 4) {
      if (cleanTankPhase === CLEAN_TANK_PHASES.REFILLING) return 'active';
      if ([CLEAN_TANK_PHASES.PUMP_RESUMED, CLEAN_TANK_PHASES.COMPLETED].includes(cleanTankPhase)) return 'completed';
      return 'idle';
    }
    if (num === 5) {
      if (cleanTankPhase === CLEAN_TANK_PHASES.PUMP_RESUMED) return 'active';
      if (cleanTankPhase === CLEAN_TANK_PHASES.COMPLETED) return 'completed';
      return 'idle';
    }
    return 'idle';
  };

  const getPhaseDisplay = () => {
    if (!cleanTankActive) {
      if (cleanTankPhase === CLEAN_TANK_PHASES.COMPLETED) {
        return { label: 'CYCLE FINISHED', color: '#4CAF50', bg: '#4CAF5015' };
      }
      return { label: 'STANDBY READY', color: '#2E7D32', bg: '#2E7D3215' };
    }
    if (cleanTankPhase === CLEAN_TANK_PHASES.DRAINING) {
      return { label: 'DRAINING TANK (< 5%)', color: '#FF9800', bg: '#FF980018' };
    }
    if (cleanTankPhase === CLEAN_TANK_PHASES.REFILLING) {
      return { label: 'REFILLING RESERVOIR', color: '#00BCD4', bg: '#00BCD418' };
    }
    if (cleanTankPhase === CLEAN_TANK_PHASES.PUMP_RESUMED) {
      return { label: 'PUMP RESTORED (> 15%)', color: '#4CAF50', bg: '#4CAF5018' };
    }
    return { label: 'CYCLE IN PROGRESS', color: '#FF9800', bg: '#FF980018' };
  };

  const phaseMeta = getPhaseDisplay();

  // Water level tone
  const getLevelColor = () => {
    if (levelVal === null) return '#9E9E9E';
    if (levelVal < 5) return '#D32F2F';
    if (levelVal < 15) return '#FF9800';
    if (levelVal >= 90) return '#00BCD4';
    return '#2E7D32';
  };

  const levelColor = getLevelColor();

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.scrollContent, { paddingTop: headerHeight + 8 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Interactive Clean Tank Banner */}
        <LinearGradient
          colors={
            cleanTankActive
              ? ['#1565C0', '#0D47A1']
              : theme.dark
                ? ['#1B5E20', '#0D3813']
                : ['#2E7D32', '#1B5E20']
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroCard}
        >
          <View style={styles.heroTopRow}>
            <View style={{ flex: 1 }}>
              <View style={styles.heroTagRow}>
                <View style={[styles.heroLiveDot, { backgroundColor: cleanTankActive ? '#FFCA28' : '#69F0AE' }]} />
                <Text style={styles.heroTagText}>
                  {cleanTankActive ? 'AUTO CLEAN IN PROGRESS' : 'RESERVOIR HYGIENE SYSTEM'}
                </Text>
              </View>
              <Text style={styles.heroTitle}>Clean Tank Engine</Text>
              <Text style={styles.heroSub}>
                {selectedDeviceName ? `${selectedDeviceName} • ` : ''}5-Stage Managed Cycle
              </Text>
            </View>

            {/* Live State Badge in Hero */}
            <View style={[styles.heroPhaseBadge, { backgroundColor: 'rgba(0,0,0,0.22)' }]}>
              <Text style={styles.heroPhaseText}>{phaseMeta.label}</Text>
            </View>
          </View>

          {/* Quick Metrics Glance */}
          <View style={styles.heroMetricsBar}>
            <View style={styles.heroMetricCol}>
              <Text style={styles.heroMetricVal}>{levelVal !== null ? `${levelVal}%` : '--'}</Text>
              <Text style={styles.heroMetricLbl}>Current Level</Text>
            </View>
            <View style={styles.heroMetricDivider} />
            <View style={styles.heroMetricCol}>
              <Text style={styles.heroMetricVal}>{isPumpOn ? 'RUNNING' : 'OFF'}</Text>
              <Text style={styles.heroMetricLbl}>Water Pump</Text>
            </View>
            <View style={styles.heroMetricDivider} />
            <View style={styles.heroMetricCol}>
              <Text style={styles.heroMetricVal}>{isInletOpen ? 'OPEN' : 'SHUT'}</Text>
              <Text style={styles.heroMetricLbl}>Inlet Valve</Text>
            </View>
            <View style={styles.heroMetricDivider} />
            <View style={styles.heroMetricCol}>
              <Text style={styles.heroMetricVal}>{isOutletOpen ? 'DRAIN' : 'SHUT'}</Text>
              <Text style={styles.heroMetricLbl}>Outlet Valve</Text>
            </View>
          </View>
        </LinearGradient>

        {/* Safety Alert (if triggered) */}
        {safetyAlert && (
          <View style={styles.alertBanner}>
            <Ionicons name="alert-circle" size={20} color="#D32F2F" />
            <View style={{ flex: 1 }}>
              <Text style={styles.alertTitle}>Safety Protection Triggered</Text>
              <Text style={styles.alertText}>{safetyAlert}</Text>
            </View>
            <TouchableOpacity onPress={clearSafetyAlert} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={18} color="#D32F2F" />
            </TouchableOpacity>
          </View>
        )}

        {/* Fluid Tank Visualizer Card */}
        <View style={[styles.tankCard, { backgroundColor: cardBg, borderColor: borderC }]}>
          <View style={styles.tankCardHeader}>
            <View>
              <Text style={[styles.tankCardTitle, { color: theme.colors.text }]}>Reservoir Water Level</Text>
              <Text style={[styles.tankCardSub, { color: theme.colors.textSecondary }]}>
                Real-time ultrasonic depth sensor
              </Text>
            </View>
            <View style={[styles.levelBigBadge, { backgroundColor: `${levelColor}15` }]}>
              <Text style={[styles.levelBigText, { color: levelColor }]}>
                {levelVal !== null ? `${levelVal}%` : '--'}
              </Text>
            </View>
          </View>

          {/* Realistic Fluid Gauge Bar with Threshold Indicators */}
          <View style={styles.fluidTrackWrapper}>
            <View style={[styles.fluidTrack, { backgroundColor: theme.colors.background }]}>
              <LinearGradient
                colors={
                  levelVal !== null && levelVal < 15
                    ? ['#EF5350', '#C62828']
                    : levelVal !== null && levelVal >= 90
                      ? ['#26C6DA', '#00838F']
                      : ['#66BB6A', '#2E7D32']
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[
                  styles.fluidFill,
                  { width: `${Math.min(100, Math.max(0, levelVal ?? 0))}%` },
                ]}
              />

              {/* Threshold Marker Pins */}
              <View style={[styles.markerPin, { left: '5%' }]}>
                <View style={[styles.markerLine, { backgroundColor: '#D32F2F' }]} />
              </View>
              <View style={[styles.markerPin, { left: '15%' }]}>
                <View style={[styles.markerLine, { backgroundColor: '#FF9800' }]} />
              </View>
              <View style={[styles.markerPin, { left: '90%' }]}>
                <View style={[styles.markerLine, { backgroundColor: '#00BCD4' }]} />
              </View>
            </View>

            {/* Threshold Labels Below */}
            <View style={styles.markerLabelsRow}>
              <View style={styles.markerLabelItem}>
                <View style={[styles.markerDot, { backgroundColor: '#D32F2F' }]} />
                <Text style={[styles.markerText, { color: theme.colors.textSecondary }]}>5% Drain Cutoff</Text>
              </View>
              <View style={styles.markerLabelItem}>
                <View style={[styles.markerDot, { backgroundColor: '#FF9800' }]} />
                <Text style={[styles.markerText, { color: theme.colors.textSecondary }]}>15% Safe Threshold</Text>
              </View>
              <View style={styles.markerLabelItem}>
                <View style={[styles.markerDot, { backgroundColor: '#00BCD4' }]} />
                <Text style={[styles.markerText, { color: theme.colors.textSecondary }]}>90% Full Cutoff</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Inflow Active Countdown Card (when Inlet is actively filling) */}
        {isInletOpen && (
          <LinearGradient
            colors={['#0288D115', '#00BCD410']}
            style={[styles.inflowTimerCard, { borderColor: '#0288D130' }]}
          >
            <View style={styles.inflowIconWrap}>
              <Ionicons name="timer" size={20} color="#0288D1" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.inflowTitle}>Inflow Protection Active</Text>
              <Text style={[styles.inflowSub, { color: theme.colors.textSecondary }]}>
                Monitoring +3% level rise every 3 minutes
              </Text>
            </View>
            <View style={styles.inflowClockBadge}>
              <Text style={styles.inflowClockText}>
                {String(Math.floor(inflowSecondsRemaining / 60)).padStart(2, '0')}:
                {String(inflowSecondsRemaining % 60).padStart(2, '0')}
              </Text>
            </View>
          </LinearGradient>
        )}

        {/* Live Actuators Interactive Cards */}
        <View style={styles.actuatorsSection}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Actuator State</Text>
          <View style={styles.actuatorsGrid}>
            {/* Water Pump Card */}
            <View
              style={[
                styles.actuatorBox,
                {
                  backgroundColor: cardBg,
                  borderColor: isPumpOn ? '#2196F3' : borderC,
                },
              ]}
            >
              <View
                style={[
                  styles.actuatorIconCircle,
                  { backgroundColor: isPumpOn ? '#2196F315' : 'rgba(0,0,0,0.04)' },
                ]}
              >
                <WaterPumpIcon active={isPumpOn} size={22} color={isPumpOn ? '#2196F3' : '#9E9E9E'} />
              </View>
              <Text style={[styles.actuatorName, { color: theme.colors.text }]}>Water Pump</Text>
              <View
                style={[
                  styles.actuatorStatusPill,
                  { backgroundColor: isPumpOn ? '#2196F3' : 'rgba(0,0,0,0.06)' },
                ]}
              >
                <Text style={[styles.actuatorStatusText, { color: isPumpOn ? '#FFFFFF' : '#757575' }]}>
                  {isPumpOn ? 'RUNNING' : 'STOPPED'}
                </Text>
              </View>
            </View>

            {/* Inlet Valve Card */}
            <View
              style={[
                styles.actuatorBox,
                {
                  backgroundColor: cardBg,
                  borderColor: isInletOpen ? '#00BCD4' : borderC,
                },
              ]}
            >
              <View
                style={[
                  styles.actuatorIconCircle,
                  { backgroundColor: isInletOpen ? '#00BCD415' : 'rgba(0,0,0,0.04)' },
                ]}
              >
                <InletValveIcon active={isInletOpen} size={22} color={isInletOpen ? '#00BCD4' : '#9E9E9E'} />
              </View>
              <Text style={[styles.actuatorName, { color: theme.colors.text }]}>Inlet Valve</Text>
              <View
                style={[
                  styles.actuatorStatusPill,
                  { backgroundColor: isInletOpen ? '#00BCD4' : 'rgba(0,0,0,0.06)' },
                ]}
              >
                <Text style={[styles.actuatorStatusText, { color: isInletOpen ? '#FFFFFF' : '#757575' }]}>
                  {isInletOpen ? 'FILLING' : 'CLOSED'}
                </Text>
              </View>
            </View>

            {/* Outlet Valve Card */}
            <View
              style={[
                styles.actuatorBox,
                {
                  backgroundColor: cardBg,
                  borderColor: isOutletOpen ? '#FF9800' : borderC,
                },
              ]}
            >
              <View
                style={[
                  styles.actuatorIconCircle,
                  { backgroundColor: isOutletOpen ? '#FF980015' : 'rgba(0,0,0,0.04)' },
                ]}
              >
                <OutletValveIcon active={isOutletOpen} size={22} color={isOutletOpen ? '#FF9800' : '#9E9E9E'} />
              </View>
              <Text style={[styles.actuatorName, { color: theme.colors.text }]}>Outlet Valve</Text>
              <View
                style={[
                  styles.actuatorStatusPill,
                  { backgroundColor: isOutletOpen ? '#FF9800' : 'rgba(0,0,0,0.06)' },
                ]}
              >
                <Text style={[styles.actuatorStatusText, { color: isOutletOpen ? '#FFFFFF' : '#757575' }]}>
                  {isOutletOpen ? 'DRAINING' : 'CLOSED'}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Primary Action Button */}
        <TouchableOpacity
          style={[
            styles.actionButton,
            { backgroundColor: cleanTankActive ? '#D32F2F' : '#2E7D32' },
          ]}
          onPress={handleOpenModal}
          disabled={isProcessing}
          activeOpacity={0.85}
        >
          {isProcessing ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <>
              <Ionicons
                name={cleanTankActive ? 'stop-circle-outline' : 'play-circle-outline'}
                size={22}
                color="#FFFFFF"
              />
              <Text style={styles.actionButtonText}>
                {cleanTankActive ? 'Stop Clean Tank Cycle' : 'Start Auto Clean Cycle'}
              </Text>
            </>
          )}
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Centered Confirmation Modal */}
      <CenteredCleanTankModal
        visible={modalVisible}
        isStopping={cleanTankActive}
        onClose={() => setModalVisible(false)}
        onConfirm={handleConfirmAction}
        isProcessing={isProcessing}
        theme={theme}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 40 },

  /* Hero Banner */
  heroCard: {
    borderRadius: 20,
    padding: 18,
    marginBottom: 14,
    elevation: 4,
    shadowColor: '#1B5E20',
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
  },
  heroTagText: {
    color: '#E8F5E9',
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
  heroPhaseBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  heroPhaseText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  heroMetricsBar: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
  },
  heroMetricCol: {
    flex: 1,
    alignItems: 'center',
  },
  heroMetricVal: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  heroMetricLbl: {
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

  /* Alert Banner */
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFEBEE',
    borderColor: '#FFCDD2',
    borderWidth: 1,
    padding: 12,
    borderRadius: 14,
    marginBottom: 14,
    gap: 10,
  },
  alertTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#D32F2F',
  },
  alertText: {
    fontSize: 11,
    color: '#C62828',
    marginTop: 2,
  },

  /* Tank Card */
  tankCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    marginBottom: 14,
  },
  tankCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  tankCardTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  tankCardSub: {
    fontSize: 11,
    marginTop: 1,
  },
  levelBigBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 10,
  },
  levelBigText: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
  },

  fluidTrackWrapper: {
    marginTop: 4,
  },
  fluidTrack: {
    height: 18,
    borderRadius: 9,
    overflow: 'hidden',
    position: 'relative',
  },
  fluidFill: {
    height: '100%',
    borderRadius: 9,
  },
  markerPin: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
  },
  markerLine: {
    width: 2,
    height: '100%',
    borderRadius: 1,
  },
  markerLabelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  markerLabelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  markerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  markerText: {
    fontSize: 10,
    fontWeight: '600',
  },

  /* Inflow Timer Card */
  inflowTimerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 14,
    gap: 12,
  },
  inflowIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#0288D118',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inflowTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0288D1',
  },
  inflowSub: {
    fontSize: 11,
    marginTop: 1,
  },
  inflowClockBadge: {
    backgroundColor: '#0288D1',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  inflowClockText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },

  /* Actuator Section */
  actuatorsSection: {
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 10,
  },
  actuatorsGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  actuatorBox: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRadius: 14,
    borderWidth: 1.5,
    gap: 6,
  },
  actuatorIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actuatorName: {
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  actuatorStatusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  actuatorStatusText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.3,
  },

  /* Timeline Card */
  timelineCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  timelineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  timelineTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  timelineSub: {
    fontSize: 11,
    marginTop: 1,
  },
  phaseIndicatorPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  phaseIndicatorText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
  },

  stepList: {
    gap: 10,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  stepIndicatorCol: {
    alignItems: 'center',
    width: 26,
  },
  stepCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  stepNumText: {
    fontSize: 10,
    fontWeight: '800',
  },
  verticalConnector: {
    width: 2,
    height: 38,
    marginTop: 2,
    zIndex: 1,
  },
  stepContentCard: {
    flex: 1,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  stepContentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  stepContentTitle: {
    fontSize: 12,
    fontWeight: '700',
  },
  stepBadgeChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  stepBadgeText: {
    fontSize: 9,
    fontWeight: '700',
  },
  stepContentSub: {
    fontSize: 11,
  },

  /* Primary Action Button */
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
    borderRadius: 14,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 6,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
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
    marginBottom: 12,
  },
  modalIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 16,
  },
  modalStepsBox: {
    gap: 8,
    marginBottom: 18,
  },
  modalStepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  modalStepCheck: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  modalStepText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
  },
  modalWarningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 18,
  },
  modalWarningText: {
    flex: 1,
    fontSize: 12,
    color: '#D32F2F',
    fontWeight: '500',
    lineHeight: 16,
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
  modalConfirmBtn: {
    flex: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
  },
  modalConfirmText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
