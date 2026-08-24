// app/(main)/sensor/[type].jsx
import { useLocalSearchParams } from "expo-router";
import { getSensorByKey } from "../../../src/config/sensorConfigs";
import SensorDetailScreen from "./SensorDetailScreen";

export default function SensorDetail() {
  const { type } = useLocalSearchParams();
  
  const config = getSensorByKey(type);
  
  if (!config) return null;
  
  return <SensorDetailScreen sensorKey={type} />;
}