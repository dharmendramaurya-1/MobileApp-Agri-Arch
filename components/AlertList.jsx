// components/AlertList.jsx
import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  PanResponder,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAlerts } from '../src/context/AlertContext';

const { width } = Dimensions.get('window');

export const AlertList = ({ onClose }) => {
  const { alerts, alertCount, clearAlerts, removeAlertById } = useAlerts();
  const insets = useSafeAreaInsets();

  const colors = {
    background: '#f2f4f8',
    surface: '#ffffff',
    text: '#1a1a2e',
    textSecondary: '#6b7280',
    border: '#e5e7eb',
    error: '#ef4444',
    warning: '#f59e0b',
    success: '#22c55e',
    info: '#3b82f6',
  };

  const allAlerts = alerts;

  // ── Get icon based on alert title ──────────────────────────────────────
  const getAlertIcon = (title) => {
    if (title.includes('Tank')) return 'water-outline';
    if (title.includes('EC')) return 'flash-outline';
    if (title.includes('pH')) return 'flask-outline';
    if (title.includes('Light')) return 'sunny-outline';
    if (title.includes('CO₂')) return 'leaf-outline';
    if (title.includes('Temp')) return 'thermometer-outline';
    if (title.includes('Humidity')) return 'water-outline';
    if (title.includes('Fault')) return 'alert-circle-outline';
    if (title.includes('Pump')) return 'pulse-outline';
    if (title.includes('Valve')) return 'git-commit-outline';
    if (title.includes('AC')) return 'snow-outline';
    if (title.includes('Buzzer')) return 'volume-high-outline';
    if (title.includes('Mode')) return 'settings-outline';
    return 'notifications-outline';
  };

  const getAlertColor = (title) => {
    if (title.includes('LOW') || title.includes('FAULT')) return colors.error;
    if (title.includes('HIGH')) return colors.warning;
    if (title.includes('ON') || title.includes('OPEN')) return colors.success;
    if (title.includes('OFF') || title.includes('CLOSED')) return colors.textSecondary;
    if (title.includes('AUTO')) return colors.info;
    if (title.includes('MANUAL')) return colors.warning;
    return colors.info;
  };

  const getTimeDisplay = (timestamp) => {
    const diff = Date.now() - new Date(timestamp).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m`;
    if (hours < 24) return `${hours}h`;
    if (days < 7) return `${days}d`;
    return new Date(timestamp).toLocaleDateString();
  };

  const handleClearAll = () => {
    Alert.alert(
      'Clear All Alerts',
      'Are you sure you want to clear all alerts?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: clearAlerts
        }
      ]
    );
  };

  // ── Swipeable Alert Item (Auto-delete on 50% swipe) ──────────────────
  const SwipeableAlertItem = ({ alert }) => {
    const pan = useRef(new Animated.ValueXY()).current;
    const [isDeleting, setIsDeleting] = useState(false);

    const panResponder = useRef(
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gestureState) => {
          return Math.abs(gestureState.dx) > 10;
        },
        onPanResponderMove: (_, gestureState) => {
          if (gestureState.dx < 0 && gestureState.dx > -width * 0.7) {
            pan.x.setValue(gestureState.dx);
          }
        },
        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.dx < -width * 0.4) {
            Animated.spring(pan, {
              toValue: { x: -width, y: 0 },
              useNativeDriver: false,
              friction: 5,
            }).start(() => {
              removeAlertById(alert.id);
            });
            setIsDeleting(true);
          } else {
            Animated.spring(pan, {
              toValue: { x: 0, y: 0 },
              useNativeDriver: false,
              friction: 5,
            }).start();
            setIsDeleting(false);
          }
        },
      })
    ).current;

    const alertColor = getAlertColor(alert.title);
    const alertIcon = getAlertIcon(alert.title);

    if (isDeleting) return null;

    const opacity = pan.x.interpolate({
      inputRange: [-width * 0.7, 0],
      outputRange: [0.3, 1],
      extrapolate: 'clamp',
    });

    return (
      <Animated.View
        style={[
          styles.alertItemWrapper,
          {
            transform: [{ translateX: pan.x }],
            opacity: opacity,
            backgroundColor: colors.surface,
          },
        ]}
        {...panResponder.panHandlers}
      >
        <View style={styles.alertContent}>
          <View style={styles.alertRow}>
            <View style={[styles.iconWrapper, { backgroundColor: alertColor + '15' }]}>
              <Ionicons name={alertIcon} size={20} color={alertColor} />
            </View>
            <View style={styles.alertTextContainer}>
              <Text style={[styles.alertTitle, { color: colors.text }]}>
                {alert.title}
              </Text>
              {alert.message ? (
                <Text style={[styles.alertMessage, { color: colors.textSecondary }]}>
                  {alert.message}
                </Text>
              ) : null}
              <Text style={[styles.alertTime, { color: colors.textSecondary }]}>
                {getTimeDisplay(alert.timestamp)}
              </Text>
            </View>
            <View style={[styles.statusDot, { backgroundColor: alertColor }]} />
            <TouchableOpacity
              onPress={() => removeAlertById(alert.id)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.dismissBtn}
            >
              <Ionicons name="close-circle-outline" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        <Animated.View
          style={[
            styles.deleteBackground,
            {
              opacity: pan.x.interpolate({
                inputRange: [-width * 0.7, -width * 0.2, 0],
                outputRange: [1, 0.8, 0],
                extrapolate: 'clamp',
              }),
            },
          ]}
        >
          <Ionicons name="trash-outline" size={24} color="#FFF" />
        </Animated.View>
      </Animated.View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />

      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={onClose} style={styles.backButton} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.title, { color: colors.text }]}>Alerts</Text>
          {allAlerts.length > 0 && (
            <View style={styles.countBadge}>
              <Text style={styles.countText}>{allAlerts.length}</Text>
            </View>
          )}
        </View>
        {allAlerts.length > 0 ? (
          <TouchableOpacity onPress={handleClearAll} style={styles.clearButton} activeOpacity={0.7}>
            <Text style={[styles.clearText, { color: colors.error }]}>Clear</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 50 }} />
        )}
      </View>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {allAlerts.length === 0 ? (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconWrapper}>
              <Ionicons name="checkmark-circle" size={56} color="#22c55e" />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>All Clear</Text>
            <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
              No alerts at the moment
            </Text>
          </View>
        ) : (
          allAlerts.map((alert) => (
            <SwipeableAlertItem key={alert.id} alert={alert} />
          ))
        )}
        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#f2f4f8',
  },
  backButton: {
    padding: 4,
    width: 44,
    height: 44,
    justifyContent: 'center',
  },
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  countBadge: {
    backgroundColor: '#ef4444',
    borderRadius: 12,
    minWidth: 22,
    height: 22,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  countText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
  },
  clearButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  clearText: {
    fontSize: 14,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 14,
  },
  scrollContent: {
    paddingBottom: 20,
    paddingTop: 4,
  },
  alertItemWrapper: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
    marginBottom: 8,
    position: 'relative',
  },
  alertContent: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: '#ffffff',
    zIndex: 2,
  },
  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  alertTextContainer: {
    flex: 1,
  },
  alertTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  alertMessage: {
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 3,
  },
  alertTime: {
    fontSize: 11,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: 8,
  },
  dismissBtn: {
    padding: 4,
    marginLeft: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteBackground: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: '100%',
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: 20,
    borderRadius: 12,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 80,
  },
  emptyIconWrapper: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#22c55e15',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 14,
    textAlign: 'center',
  },
  bottomSpacer: {
    height: 20,
  },
});