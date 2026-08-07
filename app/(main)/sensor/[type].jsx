// app/(main)/sensor/[type].jsx
import { useLocalSearchParams } from "expo-router";
import { SENSORS } from "../../../src/config/sensorConfigs";
import SensorDetailScreen from "./SensorDetailScreen";

export default function SensorDetail() {
  const { type } = useLocalSearchParams();
  
  // ✅ Find the sensor config
  const config = SENSORS.find((s) => s.key === type);
  
  // ✅ Debug log to check what's in the config
  console.log("📡 Sensor Detail - Type:", type);
  console.log("📡 Sensor Config:", {
    name: config?.name,
    dataKey: config?.dataKey,
    _apiName: config?._apiName,
    hasApiName: config?._apiName !== undefined,
  });
  
  // ✅ Also log all available sensors to verify
  console.log("📡 All sensor keys:", SENSORS.map(s => s.key));
  console.log("📡 All sensor apiNames:", SENSORS.map(s => s._apiName));
  
  if (!config) {
    console.log("❌ Sensor not found for type:", type);
    return null;
  }
  
  return <SensorDetailScreen config={config} />;
}