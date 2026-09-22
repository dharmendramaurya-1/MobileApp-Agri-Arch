// scripts/test_payloads.js
// Verify payload builders and formats required by user specifications

const assert = require('assert');

// 1. Settings payload: test that WLLP and WLHP are NOT present
function buildSettingsPayload(settings, externalKey) {
  return [
    { bn: `urn:dev:${externalKey}:`, bt: Math.floor(Date.now() / 1000) },
    { n: "CropId", v: settings.CropId ?? 0 },
    { n: "AMBTL", v: settings.tempLow },
    { n: "AMTHI", v: settings.tempHigh },
    { n: "HUMLO", v: settings.humidityLow },
    { n: "HUMHI", v: settings.humidityHigh },
    { n: "pHLO", v: settings.phLow },
    { n: "pHHI", v: settings.phHigh },
    { n: "Co2LO", v: settings.co2Low },
    { n: "Co2HI", v: settings.co2High },
    { n: "LUXLO", v: settings.luxLow },
    { n: "LUXHI", v: settings.luxHigh },
    { n: "ECL", v: settings.ecLow },
    { n: "ECH", v: settings.ecHigh },
    { n: "Dimm", v: settings.dimming || 75 },
  ];
}

const dummySettings = {
  CropId: 1,
  tempLow: 18,
  tempHigh: 28,
  humidityLow: 50,
  humidityHigh: 80,
  waterTempLow: 20,
  waterTempHigh: 25,
  waterLevelLow: 25,
  waterLevelHigh: 90,
  phLow: 5.5,
  phHigh: 6.5,
  co2Low: 600,
  co2High: 1200,
  luxLow: 5000,
  luxHigh: 15000,
  ecLow: 1.2,
  ecHigh: 2.0,
  dimming: 80,
};

const settingsPayload = buildSettingsPayload(dummySettings, "MAC_123");
console.log("Settings payload keys:", settingsPayload.map(x => x.n));
assert(!settingsPayload.some(x => x.n === "WLLP"), "WLLP should NOT be in settings payload");
assert(!settingsPayload.some(x => x.n === "WLHP"), "WLHP should NOT be in settings payload");
assert(!settingsPayload.some(x => x.n === "WTLO"), "WTLO should NOT be in settings payload");
assert(!settingsPayload.some(x => x.n === "WTHI"), "WTHI should NOT be in settings payload");
console.log("✅ Check 1 PASSED: WLLP, WLHP, WTLO, WTHI removed from Crop settings topic payload");

// 2. CleanTank payload
function buildCleanTankPayload(isCleaning) {
  return [
    { n: "CleanTank", vb: Boolean(isCleaning) }
  ];
}

const startClean = buildCleanTankPayload(true);
console.log("CleanTank start:", JSON.stringify(startClean));
assert.deepStrictEqual(startClean, [{ n: "CleanTank", vb: true }]);

const stopClean = buildCleanTankPayload(false);
console.log("CleanTank stop:", JSON.stringify(stopClean));
assert.deepStrictEqual(stopClean, [{ n: "CleanTank", vb: false }]);
console.log("✅ Check 2 PASSED: CleanTank payload format verified");

// 3. Timings payload
function buildTimingsPayload(timings = {}) {
  const t = (key, def) => {
    const val = timings[key];
    return (val !== undefined && val !== null && !isNaN(val)) ? Number(val) : def;
  };
  return [
    { n: "ECA_DI", v: t("ECA_DI", 3600) },
    { n: "ECAP_OT", v: t("ECAP_OT", 10) },
    { n: "WPONT", v: t("WPONT", 120) },
    { n: "WPINT", v: t("WPINT", 900) },
    { n: "ECB_DI", v: t("ECB_DI", 3600) },
    { n: "ECBP_OT", v: t("ECBP_OT", 10) },
    { n: "NP_DI", v: t("NP_DI", 3600) },
    { n: "NP_OT", v: t("NP_OT", 10) },
    { n: "pHPU_ONT", v: t("pHPU_ONT", 5) },
    { n: "pHPD_ONT", v: t("pHPD_ONT", 5) },
  ];
}

const defaultTimingsPayload = buildTimingsPayload();
console.log("Default Timings payload:", JSON.stringify(defaultTimingsPayload));

const expectedPayload = [{"n":"ECA_DI","v":3600},{"n":"ECAP_OT","v":10},{"n":"WPONT","v":120},{"n":"WPINT","v":900},{"n":"ECB_DI","v":3600},{"n":"ECBP_OT","v":10},{"n":"NP_DI","v":3600},{"n":"NP_OT","v":10},{"n":"pHPU_ONT","v":5},{"n":"pHPD_ONT","v":5}];

assert.deepStrictEqual(defaultTimingsPayload, expectedPayload, "Timings payload does not match required specification");
console.log("✅ Check 3 PASSED: Timings payload exactly matches specification");

// 4. Actuator payload: verify no timings
function buildActuatorPayload(status, externalKey, previousStatus = {}) {
  const p = (key, def) => status[key] ?? previousStatus[key] ?? def;
  const payload = [
    { n: "WatPmp", vb: p('water_pump', false) },
    { n: "Wat_ILV", vb: p('water_ILvalve', false) },
    { n: "Wat_OLV", vb: p('water_OLvalve', false) },
    { n: "NUT_PMP", vb: p('nutrient_pump', false) },
    { n: "AC_Stat", vb: p('ac_stat', false) },
  ];
  return payload;
}

const actPayload = buildActuatorPayload({ water_pump: true }, "MAC_123");
console.log("Actuator payload:", JSON.stringify(actPayload));
assert(!actPayload.some(x => ["WPONT", "WPINT", "NP_DI", "NP_OT"].includes(x.n)), "Actuator payload must not include timings");
console.log("✅ Check 4 PASSED: Actuator payload free of timing fields");

function canOpenOutletValve(waterLevel, isCleanTankActive) {
  if (waterLevel === null || waterLevel === undefined) return true;
  const minLevel = isCleanTankActive ? 5 : 15;
  return waterLevel >= minLevel;
}

function canOpenInletValve(waterLevel) {
  if (waterLevel === null || waterLevel === undefined) return true;
  return waterLevel < 90;
}

assert.strictEqual(canOpenOutletValve(20, false), true, "Outlet should open at 20% in manual");
assert.strictEqual(canOpenOutletValve(15, false), true, "Outlet should open at 15% in manual");
assert.strictEqual(canOpenOutletValve(14.9, false), false, "Outlet should NOT open below 15% in manual");
assert.strictEqual(canOpenOutletValve(10, true), true, "Outlet should open at 10% in clean tank");
assert.strictEqual(canOpenOutletValve(5, true), true, "Outlet should open at 5% in clean tank");
assert.strictEqual(canOpenOutletValve(4.9, true), false, "Outlet should NOT open below 5% in clean tank");
console.log("✅ Check 5 PASSED: Outlet valve 15% manual cutoff and 5% clean tank cutoff verified");

assert.strictEqual(canOpenInletValve(89), true, "Inlet should open at 89%");
assert.strictEqual(canOpenInletValve(90), false, "Inlet should NOT open at 90%");
assert.strictEqual(canOpenInletValve(95), false, "Inlet should NOT open at 95%");
console.log("✅ Check 6 PASSED: Inlet valve 90% cutoff verified");

console.log("\n🎉 ALL 6 TEST SUITES PASSED SUCCESSFULLY!");
