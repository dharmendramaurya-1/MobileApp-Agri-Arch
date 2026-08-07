// components/AlertList.jsx
import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import {
    Alert,
    Animated,
    Dimensions,
    PanResponder,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

// ✅ CORRECT - Context from src/context/
import { useAlerts } from '../src/context/AlertContext';

const { width, height } = Dimensions.get('window');

export const AlertList = ({ onClose }) => {
  const { alerts, markAsRead, clearAlerts, markAllAsRead } = useAlerts();
  const [swipedId, setSwipedId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  // ✅ Use default colors instead of theme context to avoid dependency
  const colors = {
    background: '#f5f5f5',
    surface: '#ffffff',
    text: '#333333',
    textSecondary: '#666666',
    border: '#e0e0e0',
    primary: '#4CAF50',
  };
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
      case 'error': return '#F44336';
      case 'warning': return '#FF9800';
      case 'success': return '#4CAF50';
      default: return '#2196F3';
    }
  };

  const getSeverityBg = (severity) => {
    switch (severity) {
      case 'error': return '#FFEBEE';
      case 'warning': return '#FFF3E0';
      case 'success': return '#E8F5E9';
      default: return '#E3F2FD';
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
          return Math.abs(gestureState.dx) > 20;
        },
        onPanResponderMove: (_, gestureState) => {
          if (gestureState.dx < 0 && gestureState.dx > -150) {
            pan.x.setValue(gestureState.dx);
          }
        },
        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.dx < -80) {
            Animated.spring(pan, {
              toValue: { x: -100, y: 0 },
              useNativeDriver: false,
            }).start();
            setIsSwiped(true);
            setSwipedId(alert.id);
          } else {
            Animated.spring(pan, {
              toValue: { x: 0, y: 0 },
              useNativeDriver: false,
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

    return (
      <View style={styles.swipeContainer}>
        <Animated.View
          style={[
            styles.alertItemWrapper,
            {
              transform: [{ translateX: pan.x }],
              backgroundColor: alert.read ? colors.surface : getSeverityBg(alert.severity),
              borderLeftColor: getSeverityColor(alert.severity),
              opacity: alert.read ? 0.7 : 1,
            },
          ]}
          {...panResponder.panHandlers}
        >
          <TouchableOpacity
            style={styles.alertContent}
            onPress={() => {
              if (!alert.read) markAsRead(alert.id);
              toggleExpand();
            }}
            activeOpacity={0.7}
          >
            <View style={styles.alertHeader}>
              <View style={styles.alertIconContainer}>
                <Ionicons
                  name={getSeverityIcon(alert.severity)}
                  size={20}
                  color={getSeverityColor(alert.severity)}
                />
              </View>
              <Text style={[styles.alertTitle, { color: colors.text }]}>
                {alert.title}
              </Text>
              {!alert.read && (
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
              <View style={styles.alertActions}>
                {isExpanded && (
                  <TouchableOpacity onPress={() => handleDelete(alert.id)} style={styles.deleteSmall}>
                    <Ionicons name="trash-outline" size={16} color="#F44336" />
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={toggleExpand} style={styles.expandButton}>
                  <Ionicons 
                    name={isExpanded ? "chevron-up" : "chevron-down"} 
                    size={16} 
                    color={colors.textSecondary} 
                  />
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        </Animated.View>

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
      {/* ── Header ── */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={onClose} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>
          🔔 Alerts
        </Text>
        <View style={styles.headerActions}>
          {alerts.filter(a => !a.read).length > 0 && (
            <TouchableOpacity onPress={markAllAsRead} style={styles.actionButton}>
              <Text style={[styles.actionText, { color: colors.primary }]}>
                Read All
              </Text>
            </TouchableOpacity>
          )}
          {alerts.length > 0 && (
            <TouchableOpacity onPress={handleClearAll} style={styles.actionButton}>
              <Text style={[styles.actionText, { color: '#F44336' }]}>
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
            {alerts.length}
          </Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
            Total
          </Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statNumber, { color: '#2196F3' }]}>
            {alerts.filter(a => !a.read).length}
          </Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
            Unread
          </Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statNumber, { color: '#F44336' }]}>
            {alerts.filter(a => a.severity === 'error').length}
          </Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
            Errors
          </Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statNumber, { color: '#FF9800' }]}>
            {alerts.filter(a => a.severity === 'warning').length}
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
        {alerts.length === 0 ? (
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
          alerts.map((alert) => (
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 4,
    marginRight: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    flex: 1,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  actionText: {
    fontSize: 12,
    fontWeight: '600',
  },
  statsBar: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 16,
    justifyContent: 'space-around',
    marginBottom: 4,
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 18,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 10,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    backgroundColor: '#e0e0e0',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 20,
  },
  swipeContainer: {
    marginBottom: 8,
    position: 'relative',
  },
  alertItemWrapper: {
    borderRadius: 10,
    borderLeftWidth: 4,
    overflow: 'hidden',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  alertContent: {
    padding: 14,
  },
  alertHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  alertIconContainer: {
    marginRight: 8,
  },
  alertTitle: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2196F3',
    marginLeft: 8,
  },
  alertMessage: {
    fontSize: 13,
    marginLeft: 28,
    marginBottom: 6,
    lineHeight: 18,
  },
  alertFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginLeft: 28,
    flexWrap: 'wrap',
  },
  alertTime: {
    fontSize: 11,
    opacity: 0.6,
  },
  alertFullTime: {
    fontSize: 10,
    opacity: 0.5,
    marginLeft: 8,
  },
  alertActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  deleteSmall: {
    padding: 4,
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
    backgroundColor: '#F44336',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
    flexDirection: 'row',
    gap: 6,
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
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  bottomSpacer: {
    height: 20,
  },
});