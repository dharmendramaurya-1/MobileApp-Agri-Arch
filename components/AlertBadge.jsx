// components/AlertBadge.jsx
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAlerts } from '../src/context/AlertContext';

export const AlertBadge = ({ onPress }) => {
  const { alertCount } = useAlerts();
  const scaleAnim = React.useRef(new Animated.Value(1)).current;

  React.useEffect(() => {
    if (alertCount > 0) {
      Animated.sequence([
        Animated.spring(scaleAnim, {
          toValue: 1.3,
          useNativeDriver: true,
          friction: 3,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          useNativeDriver: true,
          friction: 3,
        }),
      ]).start();
    }
  }, [alertCount]);

  return (
    <TouchableOpacity 
      onPress={onPress} 
      style={styles.container} 
      activeOpacity={0.7}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 6 }}
    >
      <View style={styles.iconContainer}>
        <Ionicons 
          name={alertCount > 0 ? "notifications" : "notifications-outline"} 
          size={22} 
          color={alertCount > 0 ? "#FF6B35" : "#FFFFFF"} 
        />
        {alertCount > 0 && (
          <Animated.View style={[styles.badge, { transform: [{ scale: scaleAnim }] }]}>
            <Text style={styles.badgeText}>
              {alertCount > 99 ? '99+' : alertCount}
            </Text>
          </Animated.View>
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 6,
    marginRight: 2,
  },
  iconContainer: {
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -5,
    right: -6,
    backgroundColor: '#FF6B35',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
  },
});