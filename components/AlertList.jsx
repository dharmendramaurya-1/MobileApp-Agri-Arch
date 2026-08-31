// components/AlertList.jsx
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
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

import { useAlerts } from '../src/context/AlertContext';

const { width, height } = Dimensions.get('window');

export const AlertList = ({ onClose }) => {
  const { alerts, markAsRead, clearAlerts, markAllAsRead } = useAlerts();
  const [swipedId, setSwipedId] = useState(null);
  const [flickerAnim] = useState(new Animated.Value(1));

  const colors = {
    background: '#f5f7fa',
    surface: '#ffffff',
    text: '#1a1a2e',
    textSecondary: '#6b7280',
    border: '#e5e7eb',
    primary: '#4CAF50',
    error: '#ef4444',
    warning: '#f59e0b',
    success: '#10b981',
    info: '#3b82f6',
  };

  // Show ALL alerts
  const dataAlerts = alerts;

  // Debug logs
  console.log('🔔 AlertList - Total alerts:', alerts.length);
  if (alerts.length > 0) {
    console.log('🔔 AlertList - First alert:', alerts[0]);
  }

  // ── Flicker animation for dimming > 100% ──
  const startFlicker = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(flickerAnim, {
          toValue: 0.3,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(flickerAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(flickerAnim, {
          toValue: 0.5,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(flickerAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ])
    ).start();
  };

  // Check for dimming > 100 in alerts
  useEffect(() => {
    const hasDimmingOver100 = dataAlerts.some(alert => 
      alert.title && alert.title.includes('Dimming') && 
      alert.title.includes('100') && 
      !alert.read
    );
    
    if (hasDimmingOver100) {
      startFlicker();
    }
  }, [dataAlerts]);

  const getSeverityIcon = (severity) => {
    switch (severity) {
      case 'error': return 'alert-circle';
      case 'warning': return 'warning';
      case 'success': return 'checkmark-circle';
      default: return 'information-circle';
    }
  };

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'error': return colors.error;
      case 'warning': return colors.warning;
      case 'success': return colors.success;
      default: return colors.info;
    }
  };

  const getSeverityBg = (severity) => {
    switch (severity) {
      case 'error': return '#fef2f2';
      case 'warning': return '#fffbeb';
      case 'success': return '#ecfdf5';
      default: return '#eff6ff';
    }
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

  const handleDelete = (id) => {
    Alert.alert(
      'Delete Alert',
      'Are you sure you want to delete this alert?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            markAsRead(id);
            setSwipedId(null);
          }
        }
      ]
    );
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

  // ── Swipeable Alert Item ──────────────────────────────────────────────
  const SwipeableAlertItem = ({ alert }) => {
    const pan = useRef(new Animated.ValueXY()).current;
    const [isSwiped, setIsSwiped] = useState(false);

    const panResponder = useRef(
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) => {
          return Math.abs(gestureState.dx) > 10;
        },
        onPanResponderMove: (_, gestureState) => {
          if (gestureState.dx < 0 && gestureState.dx > -120) {
            pan.x.setValue(gestureState.dx);
          }
        },
        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.dx < -60) {
            Animated.spring(pan, {
              toValue: { x: -90, y: 0 },
              useNativeDriver: false,
              friction: 5,
            }).start();
            setIsSwiped(true);
            setSwipedId(alert.id);
          } else {
            Animated.spring(pan, {
              toValue: { x: 0, y: 0 },
              useNativeDriver: false,
              friction: 5,
            }).start();
            setIsSwiped(false);
            setSwipedId(null);
          }
        },
      })
    ).current;

    const handleDeleteSwipe = () => {
      handleDelete(alert.id);
    };

    const isUnread = !alert.read;
    
    // Check if this is a dimming alert > 100%
    const isDimmingOver100 = alert.title && 
      alert.title.includes('Dimming') && 
      alert.title.includes('100');

    return (
      <View style={styles.swipeContainer}>
        <Animated.View
          style={[
            styles.alertItemWrapper,
            {
              transform: [{ translateX: pan.x }],
              backgroundColor: isUnread ? getSeverityBg(alert.severity) : colors.surface,
              borderLeftColor: isUnread ? getSeverityColor(alert.severity) : colors.border,
              borderLeftWidth: 3,
              opacity: isDimmingOver100 ? flickerAnim : (isUnread ? 1 : 0.6),
            },
          ]}
          {...panResponder.panHandlers}
        >
          <TouchableOpacity
            style={styles.alertContent}
            onPress={() => {
              if (isUnread) markAsRead(alert.id);
            }}
            activeOpacity={0.7}
          >
            <View style={styles.alertHeader}>
              <View style={[styles.alertIconContainer, { 
                backgroundColor: getSeverityColor(alert.severity) + '20',
                width: 28,
                height: 28,
                borderRadius: 14,
              }]}>
                <Ionicons
                  name={getSeverityIcon(alert.severity)}
                  size={16}
                  color={getSeverityColor(alert.severity)}
                />
              </View>
              <Text style={[styles.alertTitle, { color: colors.text }]} numberOfLines={1}>
                {alert.title}
              </Text>
              {isUnread && (
                <View style={styles.unreadDot} />
              )}
            </View>
            <Text 
              style={[styles.alertMessage, { color: colors.textSecondary }]}
              numberOfLines={1}
            >
              {alert.message}
            </Text>
            <View style={styles.alertFooter}>
              <Text style={[styles.alertTime, { color: colors.textSecondary }]}>
                {getTimeDisplay(alert.timestamp)}
              </Text>
              {isDimmingOver100 && (
                <Text style={[styles.flickerWarning, { color: colors.error }]}>
                  ⚡ Flickering!
                </Text>
              )}
            </View>
          </TouchableOpacity>
        </Animated.View>

        {/* Delete button that appears on swipe */}
        {isSwiped && (
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={handleDeleteSwipe}
          >
            <Ionicons name="trash-outline" size={20} color="#FFF" />
            <Text style={styles.deleteButtonText}>Delete</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      
      {/* ── Header ── */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={onClose} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>
          🔔 Alerts
        </Text>
        <View style={styles.headerActions}>
          {dataAlerts.filter(a => !a.read).length > 0 && (
            <TouchableOpacity onPress={markAllAsRead} style={styles.actionButton}>
              <Text style={[styles.actionText, { color: colors.primary }]}>
                Read All
              </Text>
            </TouchableOpacity>
          )}
          {dataAlerts.length > 0 && (
            <TouchableOpacity onPress={handleClearAll} style={styles.actionButton}>
              <Text style={[styles.actionText, { color: colors.error }]}>
                Clear
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Stats ── */}
      <View style={[styles.statsBar, { backgroundColor: colors.surface }]}>
        <View style={styles.statItem}>
          <Text style={[styles.statNumber, { color: colors.text }]}>
            {dataAlerts.length}
          </Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
            Total
          </Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statNumber, { color: colors.info }]}>
            {dataAlerts.filter(a => !a.read).length}
          </Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
            Unread
          </Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statNumber, { color: colors.error }]}>
            {dataAlerts.filter(a => a.severity === 'error').length}
          </Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
            Errors
          </Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statNumber, { color: colors.warning }]}>
            {dataAlerts.filter(a => a.severity === 'warning').length}
          </Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
            Warnings
          </Text>
        </View>
      </View>

      {/* ── Alert List ── */}
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {dataAlerts.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="notifications-off" size={64} color="#ccc" />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              No alerts yet
            </Text>
            <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
              All clear! Your system is running smoothly.
            </Text>
          </View>
        ) : (
          dataAlerts.map((alert) => (
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
    paddingTop: height * 0.08, // Reduced from 0.1
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12, // Reduced
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 4,
    marginRight: 10,
  },
  title: {
    fontSize: 20, // Reduced
    fontWeight: '700',
    flex: 1,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  actionText: {
    fontSize: 11, // Reduced
    fontWeight: '600',
  },
  statsBar: {
    flexDirection: 'row',
    paddingVertical: 8, // Reduced
    paddingHorizontal: 16,
    justifyContent: 'space-around',
    marginHorizontal: 12,
    marginVertical: 8,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 16, // Reduced
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 9, // Reduced
    marginTop: 1,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statDivider: {
    width: 1,
    backgroundColor: '#e5e7eb',
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 12,
  },
  scrollContent: {
    paddingBottom: 16,
  },
  swipeContainer: {
    marginBottom: 6, // Reduced
    position: 'relative',
  },
  alertItemWrapper: {
    borderRadius: 8, // Reduced
    overflow: 'hidden',
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  alertContent: {
    padding: 10, // Reduced from 16
  },
  alertHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 3, // Reduced
  },
  alertIconContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  alertTitle: {
    fontSize: 13, // Reduced
    fontWeight: '600',
    flex: 1,
  },
  unreadDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#3b82f6',
    marginLeft: 6,
  },
  alertMessage: {
    fontSize: 12, // Reduced
    marginLeft: 36, // Reduced
    marginBottom: 4, // Reduced
    lineHeight: 16,
  },
  alertFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginLeft: 36, // Reduced
  },
  alertTime: {
    fontSize: 10, // Reduced
    color: '#6b7280',
  },
  flickerWarning: {
    fontSize: 10,
    fontWeight: '600',
  },
  deleteButton: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 80, // Reduced
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
    flexDirection: 'row',
    gap: 4,
  },
  deleteButtonText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 12,
    color: '#6b7280',
  },
  emptySubtext: {
    fontSize: 12,
    marginTop: 6,
    color: '#6b7280',
    textAlign: 'center',
  },
  bottomSpacer: {
    height: 16,
  },
});