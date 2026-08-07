// components/AlertBadge.jsx
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// ✅ CORRECT - Context from src/context/
import { useAlerts } from '../src/context/AlertContext';

export const AlertBadge = ({ onPress }) => {
  const { unreadCount } = useAlerts();

  if (unreadCount === 0) {
    return (
      <TouchableOpacity onPress={onPress} style={styles.container}>
        <Ionicons name="notifications-outline" size={24} color="#666" />
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity onPress={onPress} style={styles.container}>
      <Ionicons name="notifications" size={24} color="#FF5722" />
      <View style={styles.badge}>
        <Text style={styles.badgeText}>
          {unreadCount > 99 ? '99+' : unreadCount}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    padding: 4,
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -4,
    backgroundColor: '#F44336',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '700',
  },
});