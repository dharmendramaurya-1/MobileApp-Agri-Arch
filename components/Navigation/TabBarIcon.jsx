// components/TabBarIcon.jsx
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../context/ThemContext";

export function TabBarIcon({ 
  name, 
  color, 
  size = 24, 
  style,
  badge,
  ...props 
}) {
  const { theme } = useTheme();
  
  const iconColor = color || theme.colors.text;
  
  return (
    <View style={styles.container}>
      <Ionicons 
        name={name} 
        size={size} 
        color={iconColor} 
        style={style}
        {...props} 
      />
      {badge && badge > 0 && (
        <View style={[styles.badge, { backgroundColor: theme.colors.error }]}>
          <Text style={styles.badgeText}>
            {badge > 99 ? '99+' : badge}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -8,
    right: -12,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '700',
  },
});// components/TabBarIcon.jsx

export function TabBarIcon({ 
  name, 
  color, 
  size = 24, 
  style,
  badge,
  ...props 
}) {
  const { theme } = useTheme();
  
  const iconColor = color || theme.colors.text;
  
  return (
    <View style={styles.container}>
      <Ionicons 
        name={name} 
        size={size} 
        color={iconColor} 
        style={style}
        {...props} 
      />
      {badge && badge > 0 && (
        <View style={[styles.badge, { backgroundColor: theme.colors.error }]}>
          <Text style={styles.badgeText}>
            {badge > 99 ? '99+' : badge}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -8,
    right: -12,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '700',
  },
});