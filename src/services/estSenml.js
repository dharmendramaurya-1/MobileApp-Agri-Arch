// src/services/testSenml.js
import { getWeeklySensorData, searchSenML } from "./senmlService";

export const testSenMLSearch = async () => {
  console.log("🧪 Testing SenML Search...");
  
  // Use the timestamp from your example (in nanoseconds)
  const timestampNs = 1785627775000000000;
  const timestampMs = timestampNs / 1000000;
  
  console.log(`   Timestamp (ns): ${timestampNs}`);
  console.log(`   Timestamp (ms): ${timestampMs}`);
  console.log(`   Date: ${new Date(timestampMs).toLocaleString()}`);
  
  // Test 1: Search with specific timestamp
  console.log("\n📋 Test 1: Search with specific timestamp");
  const result1 = await searchSenML({
    from: timestampMs,
    to: timestampMs + 1000,
    limit: 20,
    offset: 0,
  });
  
  console.log("   Success:", result1.success);
  console.log("   Total:", result1.total);
  console.log("   Messages:", result1.messages.length);
  
  if (result1.messages.length > 0) {
    console.log("   First message:", JSON.stringify(result1.messages[0], null, 2));
  }
  
  // Test 2: Get weekly data for temperature
  console.log("\n📋 Test 2: Get weekly data for temperature");
  const result2 = await getWeeklySensorData("ambientTemperature", 1);
  console.log("   Success:", result2.success);
  console.log("   Data points:", result2.data.length);
  if (result2.data.length > 0) {
    console.log("   First data point:", JSON.stringify(result2.data[0], null, 2));
  }
  
  return { result1, result2 };
};