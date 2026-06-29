/**
 * Validates the operational data pipeline end-to-end.
 * Run: npx tsx scripts/validateOperationalPipeline.ts
 */
import { generateOperationalDataset } from "../src/lib/operationalDataset";
import { buildLiveEngagementFleetModel } from "../src/lib/liveEngagementModel";
import { buildOperationalFleetState, buildUnitActivityFromState } from "../src/lib/operationalState";
import { TARGET_ACTIVE_SCANS } from "../src/lib/operationalConstants";
import { canUnitScanSatellite } from "../src/lib/intelIntegrity";

const ds = generateOperationalDataset();
const units = ds.units.map(({ slot: _s, ...u }) => u);

const opCount = ds.equipment.filter((e) => e.serviceability === "Operational").length;
const repairCount = ds.equipment.filter((e) => e.serviceability === "Under Repair").length;
const faultCount = ds.equipment.filter((e) => e.serviceability === "Non-Serviceable").length;
const totalEq = ds.equipment.length;

console.log("=== INVENTORY & SERVICEABILITY ===");
console.log(`Equipment total: ${totalEq}`);
console.log(`Operational: ${Math.round((opCount / totalEq) * 100)}%`);
console.log(`Under Repair: ${Math.round((repairCount / totalEq) * 100)}%`);
console.log(`Non-Serviceable: ${Math.round((faultCount / totalEq) * 100)}%`);

const fleetModel = buildLiveEngagementFleetModel({
  engagements: ds.engagements,
  equipment: ds.equipment,
  dbUnits: units,
  intelRows: ds.intelRows ?? [],
});

const fleetState = buildOperationalFleetState({
  dbUnits: units,
  equipment: ds.equipment,
  engagements: ds.engagements,
  intelRows: ds.intelRows ?? [],
});

console.log("\n=== PER-UNIT INVENTORY TOTALS ===");
for (const u of ds.units) {
  const items = ds.equipment.filter((e) => e.unit_id === u.id);
  const byCat = items.reduce<Record<string, number>>((acc, e) => {
    const n = e.category.name;
    acc[n] = (acc[n] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`${u.code}: total=${items.length}`, byCat);
}

const profiles = ds.units.map((u) => {
  const items = ds.equipment.filter((e) => e.unit_id === u.id);
  const byCat = items.reduce<Record<string, number>>((acc, e) => {
    acc[e.category.name] = (acc[e.category.name] ?? 0) + 1;
    return acc;
  }, {});
  return JSON.stringify(byCat);
});
const uniqueProfiles = new Set(profiles);
let totalActive = 0;
let unitsWithActive = 0;
let failures = 0;

if (uniqueProfiles.size !== profiles.length) {
  console.error(`FAIL: duplicate inventory profiles (${uniqueProfiles.size} unique / ${profiles.length} units)`);
  failures++;
}

console.log("\n=== LIVE ENGAGEMENT ENGINE ===");

for (const u of ds.units) {
  const cap = fleetModel.get(u.id)!;
  const target = TARGET_ACTIVE_SCANS[u.slot];
  const names = cap.snapshot.satellites.map((s) => s.name);
  const visible = names.every((n) => canUnitScanSatellite(n, u.slot));

  console.log(
    `${u.code}: target=${target} active=${cap.activeChains} chains=${cap.totalChains} sats=[${names.join(", ")}]`,
  );

  if (cap.activeChains === 0) {
    console.error(`  FAIL: zero engagement — violations: ${cap.constraintViolations.join("; ")}`);
    failures++;
  } else {
    unitsWithActive++;
  }
  if (cap.activeChains < 6) {
    console.error(`  FAIL: activeChains ${cap.activeChains} < 6 (required minimum)`);
    failures++;
  }
  if (cap.activeChains !== target) {
    console.warn(`  WARN: active ${cap.activeChains} != target ${target}`);
  }
  if (!visible && names.length > 0) {
    console.error(`  FAIL: satellite not visible for unit`);
    failures++;
  }
  totalActive += cap.activeChains;
}

console.log(`\nFleet active total: ${totalActive}`);
console.log(`Units with active engagement: ${unitsWithActive}/${ds.units.length}`);
if (unitsWithActive < Math.ceil(ds.units.length / 2)) {
  console.error("FAIL: fewer than 50% of units show active engagement");
  failures++;
}

console.log("\n=== CONTROL CENTER CONSISTENCY ===");
for (const state of fleetState.units) {
  const cc = buildUnitActivityFromState(state, ds.engagements, []);
  const leNames = state.capability.assignments.map((a) => a.name).sort().join("|");
  const ccNames = cc.activeSats.map((s) => s.satellite).sort().join("|");

  if (leNames !== ccNames) {
    console.error(`  FAIL ${state.unitCode}: Live=[${leNames}] CC=[${ccNames}]`);
    failures++;
  }

  for (const a of state.capability.assignments) {
    const ccRow = cc.activeSats.find((r) => r.satellite === a.name);
    if (!ccRow) continue;
    if (ccRow.scanned !== a.analysis.scanned || ccRow.analyzed !== a.analysis.analyzed) {
      console.error(`  FAIL ${state.unitCode}/${a.name}: metric mismatch`);
      failures++;
    }
  }
}
console.log("Control Center rows match Live Engagement assignments.");

console.log("\n=== SPLIT-BRAIN SIMULATION (must fail without fix) ===");
const fakeDbUnits = units.map((u) => ({ ...u, id: `uuid-${u.code}` }));
const splitModel = buildLiveEngagementFleetModel({
  engagements: ds.engagements,
  equipment: ds.equipment,
  dbUnits: fakeDbUnits,
  intelRows: [],
});
const splitTotal = [...splitModel.values()].reduce((s, c) => s + c.activeChains, 0);
console.log(`Mismatched unit IDs would yield ${splitTotal} active (expected 0 without unified source).`);

if (totalActive === 0 || failures > 0) {
  console.error(`\nVALIDATION FAILED (${failures} issues, totalActive=${totalActive})`);
  process.exit(1);
}

console.log("\nVALIDATION PASSED");
