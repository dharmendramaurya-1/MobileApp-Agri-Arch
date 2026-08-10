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

import { useAlerts } from '../src/context/AlertContext';

const { width, height } = Dimensions.get('window');

export const AlertList = ({ onClose }) => {
  const { alerts, markAsRead, clearAlerts, markAllAsRead } = useAlerts();
  const [swipedId, setSwipedId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [showClearAll, setShowClearAll] = useState(false);

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

  // ✅ Filter alerts - only from data topic responses
  const dataAlerts = alerts.filter(alert => 
    alert.type === 'device' || 
    alert.type === 'pump' || 
    alert.type === 'valve' ||
    alert.type === 'tank' ||
    alert.type === 'sensor' ||
    alert.type === 'mode' ||
    alert.type === 'system'
  );

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
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return new Date(timestamp).toLocaleDateString();
  };

  const getFullTime = (timestamp) => {
    return new Date(timestamp).toLocaleString();
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
          if (gestureState.dx < 0 && gestureState.dx > -150) {
            pan.x.setValue(gestureState.dx);
          }
        },
        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.dx < -80) {
            Animated.spring(pan, {
              toValue: { x: -120, y: 0 },
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

    const toggleExpand = () => {
      setExpandedId(expandedId === alert.id ? null : alert.id);
    };

    const isExpanded = expandedId === alert.id;
    const isUnread = !alert.read;

    return (
      <View style={styles.swipeContainer}>
        <Animated.View
          style={[
            styles.alertItemWrapper,
            {
              transform: [{ translateX: pan.x }],
              backgroundColor: isUnread ? getSeverityBg(alert.severity) : colors.surface,
              borderLeftColor: isUnread ? getSeverityColor(alert.severity) : colors.border,
              borderLeftWidth: 4,
              opacity: isUnread ? 1 : 0.6,
            },
          ]}
          {...panResponder.panHandlers}
        >
          <TouchableOpacity
            style={styles.alertContent}
            onPress={() => {
              if (isUnread) markAsRead(alert.id);
              toggleExpand();
            }}
            activeOpacity={0.7}
          >
            <View style={styles.alertHeader}>
              <View style={[styles.alertIconContainer, { 
                backgroundColor: getSeverityColor(alert.severity) + '20' 
              }]}>
                <Ionicons
                  name={getSeverityIcon(alert.severity)}
                  size={20}
                  color={getSeverityColor(alert.severity)}
                />
              </View>
              <Text style={[styles.alertTitle, { color: colors.text }]}>
                {alert.title}
              </Text>
              {isUnread && (
                <View style={styles.unreadDot} />
              )}
            </View>
            <Text 
              style={[styles.alertMessage, { color: colors.textSecondary }]}
              numberOfLines={isExpanded ? undefined : 2}
            >
              {alert.message}
            </Text>
            <View style={styles.alertFooter}>
              <Text style={[styles.alertTime, { color: colors.textSecondary }]}>
                {getTimeDisplay(alert.timestamp)}
              </Text>
              {isExpanded && (
                <Text style={[styles.alertFullTime, { color: colors.textSecondary }]}>
                  {getFullTime(alert.timestamp)}
                </Text>
              )}
              <TouchableOpacity onPress={toggleExpand} style={styles.expandButton}>
                <Ionicons 
                  name={isExpanded ? "chevron-up" : "chevron-down"} 
                  size={18} 
                  color={colors.textSecondary} 
                />
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Animated.View>

        {/* Delete button that appears on swipe */}
        {isSwiped && (
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={handleDeleteSwipe}
          >
            <Ionicons name="trash-outline" size={24} color="#FFF" />
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
    paddingTop: height * 0.1, // ✅ 10% margin from top
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 4,
    marginRight: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    flex: 1,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  actionText: {
    fontSize: 12,
    fontWeight: '600',
  },
  statsBar: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 20,
    justifyContent: 'space-around',
    marginHorizontal: 16,
    marginVertical: 12,
    borderRadius: 12,
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
    fontSize: 20,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 10,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statDivider: {
    width: 1,
    backgroundColor: '#e5e7eb',
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 16,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  swipeContainer: {
    marginBottom: 10,
    position: 'relative',
  },
  alertItemWrapper: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  alertContent: {
    padding: 16,
  },
  alertHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  alertIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  alertTitle: {
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#3b82f6',
    marginLeft: 8,
  },
  alertMessage: {
    fontSize: 14,
    marginLeft: 48,
    marginBottom: 8,
    lineHeight: 20,
  },
  alertFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginLeft: 48,
  },
  alertTime: {
    fontSize: 11,
    color: '#6b7280',
  },
  alertFullTime: {
    fontSize: 10,
    color: '#6b7280',
    marginLeft: 8,
  },
  expandButton: {
    padding: 4,
  },
  deleteButton: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 100,
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
    flexDirection: 'row',
    gap: 8,
  },
  deleteButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 80,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '600',
    marginTop: 16,
    color: '#6b7280',
  },
  emptySubtext: {
    fontSize: 14,
    marginTop: 8,
    color: '#6b7280',
    textAlign: 'center',
  },
  bottomSpacer: {
    height: 20,
  },
});