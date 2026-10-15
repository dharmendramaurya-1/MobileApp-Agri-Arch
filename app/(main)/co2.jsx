// app/(main)/co2.jsx
// Forward standalone /co2 route to dynamic sensor detail screen
import { Redirect } from "expo-router";

export default function CO2Route() {
  return <Redirect href="/(main)/sensor/co2" />;
}