// src/utils/sensorIconMapper.js
import {
  AirQualityIcon,
  Co2Icon,
  EcIcon,
  HumidityIcon,
  LightIcon,
  ORPIcon,
  PhIcon,
  PressureIcon,
  SalinityIcon,
  SoilMoistureIcon,
  TemperatureIcon,
  WaterFlowIcon,
  WaterLeakIcon,
  WaterLevelIcon,
} from '../components/SvgIcons';

export const getSensorIcon = (sensorKey) => {
  const iconMap = {
    // ─── TEMPERATURE ───
    'ambient-temperature': TemperatureIcon,
    'water-temperature': TemperatureIcon,
    
    // ─── HUMIDITY ───
    'ambient-humidity': HumidityIcon,
    
    // ─── pH ───
    'ph-level': PhIcon,
    'phValue': PhIcon,
    
    // ─── EC / TDS ───
    'ec-value': EcIcon,
    'ecValue': EcIcon,
    'tds-value': EcIcon,
    
    // ─── CO₂ ───
    'co2': Co2Icon,
    'co2Level': Co2Icon,
    
    // ─── WATER ───
    'water-level': WaterLevelIcon,
    'waterLevel': WaterLevelIcon,
    'water-flow': WaterFlowIcon,
    
    // ─── LIGHT ───
    'light-level': LightIcon,
    'lightLevel': LightIcon,
    
    // ─── PRESSURE ───
    'pressure': PressureIcon,
    
    // ─── SALINITY ───
    'salinity': SalinityIcon,
    
    // ─── ORP ───
    'orp': ORPIcon,
    'orpValue': ORPIcon,
    
    // ─── WATER LEAK ───
    'water-leak': WaterLeakIcon,
    
    // ─── SOIL MOISTURE ───
    'soil-moisture': SoilMoistureIcon,
    
    // ─── AIR QUALITY ───
    'air-quality': AirQualityIcon,
  };
  return iconMap[sensorKey] || TemperatureIcon;
};

export const getSensorColor = (sensorKey) => {
  const colorMap = {
    // Temperature
    'ambient-temperature': '#FF5722',
    'water-temperature': '#03A9F4',
    
    // Humidity
    'ambient-humidity': '#2196F3',
    
    // pH
    'ph-level': '#4CAF50',
    'phValue': '#4CAF50',
    
    // EC/TDS
    'ec-value': '#00BCD4',
    'ecValue': '#00BCD4',
    'tds-value': '#009688',
    
    // CO₂
    'co2': '#9C27B0',
    'co2Level': '#9C27B0',
    
    // Water
    'water-level': '#2E7D32',
    'waterLevel': '#2E7D32',
    'water-flow': '#00695C',
    
    // Light
    'light-level': '#FFC107',
    'lightLevel': '#FFC107',
    
    // Pressure
    'pressure': '#607D8B',
    
    // Salinity
    'salinity': '#00796B',
    
    // ORP
    'orp': '#673AB7',
    'orpValue': '#673AB7',
    
    // Water Leak
    'water-leak': '#F44336',
    
    // Soil Moisture
    'soil-moisture': '#8D6E63',
    
    // Air Quality
    'air-quality': '#795548',
  };
  return colorMap[sensorKey] || '#4CAF50';
};