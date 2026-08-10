// components/DeviceStatusSummary.jsx
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { getDisplayStatus } from '../src/utils/deviceStatusParser';

// ✅ NO import of useMqtt here - receive props instead
export const DeviceStatusSummary = ({ 
  onPress, 
  deviceStatusFlags, 
  hasReceivedData, 
  connectionState 
}) => {
  const status = getDisplayStatus(deviceStatusFlags);

  const statusItems = [
    { key: 'tankLow', label: 'Tank Low', icon: 'water-outline' },
    { key: 'tankHigh', label: 'Tank High', icon: 'water-outline' },
    { key: 'waterPump', label: 'Water Pump', icon: 'sync-outline' },
    { key: 'nutrientPump', label: 'Nutrient Pump', icon: 'leaf-outline' },
    { key: 'inletValve', label: 'Inlet Valve', icon: 'arrow-down-outline' },
    { key: 'outletValve', label: 'Outlet Valve', icon: 'arrow-up-outline' },
    { key: 'mode', label: 'Mode', icon: 'settings-outline' },
    { key: 'dimmingLevel', label: 'Dimming', icon: 'sunny-outline' },
  ];

  const getStatusColor = (value) => {
    if (value === '_ _') return '#999';
    if (value === 'ON' || value === 'YES' || value === 'OPEN' || value === 'AUTO') return '#4CAF50';
    if (value === 'OFF' || value === 'NO' || value === 'CLOSED' || value === 'MANUAL') return '#F44336';
    return '#FF9800';
  };

  const isOffline =
    !hasReceivedData ||
    connectionState === 'offline' ||
    connectionState === 'disconnected' ||
    connectionState === 'idle';

  return (
    <TouchableOpacity 
      style={styles.container} 
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.header}>
        <Text style={styles.title}>📊 Device Status</Text>
        {isOffline && (
          <Text style={styles.offlineText}>🔴 Offline</Text>
        )}
      </View>

      <View style={styles.grid}>
        {statusItems.map(item => {
          const value = status[item.key];
          const color = getStatusColor(value);
          
          return (
            <View key={item.key} style={styles.item}>
              <Ionicons name={item.icon} size={16} color={color} />
              <Text style={styles.itemLabel}>{item.label}</Text>
              <Text style={[styles.itemValue, { color }]}>
                {value}
              </Text>
            </View>
          );
        })}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
  },
  offlineText: {
    fontSize: 12,
    color: '#F44336',
    fontWeight: '600',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  item: {
    width: '23%',
    alignItems: 'center',
    marginBottom: 8,
  },
  itemLabel: {
    fontSize: 9,
    color: '#888',
    marginTop: 2,
    textAlign: 'center',
  },
  itemValue: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
    textAlign: 'center',
  },
});