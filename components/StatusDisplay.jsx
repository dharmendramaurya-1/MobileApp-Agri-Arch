/**
 * Status Display Component
 * Shows all 32-bit device status flags with '_ _' for null/undefined
 */

import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useMqtt } from '../context/MqttContext';
import { getDisplayStatus } from '../utils/deviceStatusParser';

export const StatusDisplay = () => {
  const { deviceStatusFlags, hasReceivedData, connectionState } = useMqtt();
  const status = getDisplayStatus(deviceStatusFlags);

  const statusItems = [
    { key: 'tankLow', label: 'Tank Low' },
    { key: 'tankHigh', label: 'Tank High' },
    { key: 'ecHigh', label: 'EC High' },
    { key: 'ecLow', label: 'EC Low' },
    { key: 'phHigh', label: 'pH High' },
    { key: 'phLow', label: 'pH Low' },
    { key: 'luxLow', label: 'Lux Low' },
    { key: 'luxHigh', label: 'Lux High' },
    { key: 'co2High', label: 'CO₂ High' },
    { key: 'co2Low', label: 'CO₂ Low' },
    { key: 'inletValve', label: 'Inlet Valve' },
    { key: 'outletValve', label: 'Outlet Valve' },
    { key: 'waterPump', label: 'Water Pump' },
    { key: 'nutrientPump', label: 'Nutrient Pump' },
    { key: 'acStatus', label: 'AC Status' },
    { key: 'rebootAck', label: 'Reboot ACK' },
    { key: 'buzzer', label: 'Buzzer' },
    { key: 'mode', label: 'Mode' },
    { key: 'dimmingLevel', label: 'Dimming Level' },
    { key: 'sensorFault', label: 'Sensor Fault' },
  ];

  const getStatusColor = (value) => {
    if (value === '_ _') return '#999';
    if (value === 'ON' || value === 'YES' || value === 'OPEN' || value === 'AUTO') return '#4CAF50';
    if (value === 'OFF' || value === 'NO' || value === 'CLOSED' || value === 'MANUAL') return '#F44336';
    if (value === 'ERROR') return '#FF5722';
    return '#2196F3';
  };

  const getStatusBg = (value) => {
    if (value === '_ _') return '#f5f5f5';
    if (value === 'ON' || value === 'YES' || value === 'OPEN' || value === 'AUTO') return '#E8F5E9';
    if (value === 'OFF' || value === 'NO' || value === 'CLOSED' || value === 'MANUAL') return '#FFEBEE';
    if (value === 'ERROR') return '#FBE9E7';
    return '#E3F2FD';
  };

  const isOffline = connectionState === 'disconnected' || connectionState === 'idle';

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>📊 Device Status</Text>
        {status.rawStatus !== '_ _' && (
          <Text style={styles.rawStatus}>Raw: {status.rawStatus}</Text>
        )}
        {isOffline && (
          <Text style={styles.offlineText}>📡 Device Offline - Showing last known status</Text>
        )}
        {!hasReceivedData && !isOffline && (
          <Text style={styles.noData}>⏳ Waiting for data...</Text>
        )}
      </View>

      <View style={styles.grid}>
        {statusItems.map(item => {
          const value = status[item.key];
          return (
            <View 
              key={item.key} 
              style={[
                styles.card,
                { backgroundColor: getStatusBg(value) },
                isOffline && styles.offlineCard
              ]}
            >
              <Text style={styles.label}>{item.label}</Text>
              <Text style={[
                styles.value,
                { color: getStatusColor(value) }
              ]}>
                {value}
              </Text>
            </View>
          );
        })}
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          {hasReceivedData ? '✅ Live data' : '⏳ Waiting for data...'}
        </Text>
        <Text style={styles.footerSub}>
          {connectionState === 'connected' ? '🟢 Online' : 
           connectionState === 'connecting' ? '🟡 Connecting...' : 
           connectionState === 'disconnected' ? '🔴 Offline' : '⚪ Idle'}
        </Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#f5f5f5',
  },
  header: {
    marginBottom: 16,
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  rawStatus: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
    fontFamily: 'monospace',
  },
  noData: {
    fontSize: 13,
    color: '#FF9800',
    marginTop: 4,
    fontStyle: 'italic',
  },
  offlineText: {
    fontSize: 14,
    color: '#F44336',
    marginTop: 4,
    fontWeight: '600',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  card: {
    width: '48%',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  offlineCard: {
    opacity: 0.7,
    borderStyle: 'dashed',
    borderColor: '#F44336',
  },
  label: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
    fontWeight: '500',
  },
  value: {
    fontSize: 16,
    fontWeight: '700',
  },
  footer: {
    marginTop: 16,
    padding: 12,
    backgroundColor: '#fff',
    borderRadius: 8,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  footerSub: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
});