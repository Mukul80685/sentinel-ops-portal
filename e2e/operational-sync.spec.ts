import { expect, test } from "@playwright/test";
import {
  computeUnitCapability,
  countServiceableChainCapacity,
} from "../src/lib/liveEngagementModel";
import {
  formatLiveEngagementSatelliteLabel,
  isIntGenerationComplete,
  isIntGenerationInProgress,
  shouldShowOnLiveEngagement,
  validateOperationalSync,
} from "../src/lib/operationalSync";

const mkEq = (
  id: string,
  unitId: string,
  category: string,
  serviceability = "Operational",
) => ({
  id,
  unit_id: unitId,
  serviceability,
  category: { name: category },
});

test.describe("Live engagement constraint model", () => {
  test("zero processors → NON_OPERATIONAL, no active satellites, 0% occupancy", () => {
    const unitId = "unit-echo";
    const equipment = [
      mkEq("a1", unitId, "Antenna"),
      mkEq("l1", unitId, "LNA/LNB"),
      mkEq("d1", unitId, "Demodulator"),
      mkEq("p1", unitId, "Processing Server", "Non-Serviceable"),
    ];
    const cap = countServiceableChainCapacity(equipment);
    expect(cap.processors).toBe(0);
    expect(cap.totalChains).toBe(0);

    const capability = computeUnitCapability(
      unitId,
      "E",
      [
        {
          id: "eng-1",
          unit_id: unitId,
          status: "In Progress",
          satellite_id: "sat-1",
          antenna_id: "a1",
          demodulator_id: "d1",
          processing_server_id: "p1",
          satellites: { name: "ChinaSat 6B" },
        },
      ],
      equipment,
      [],
    );

    expect(capability.feasibilityStatus).toBe("NON_OPERATIONAL");
    expect(capability.activeChains).toBe(0);
    expect(capability.occupancyPct).toBe(0);
    expect(capability.snapshot.activeCount).toBe(0);
  });

  test("maxActiveScans caps satellite assignments", () => {
    const unitId = "unit-alpha";
    const equipment = [
      mkEq("a1", unitId, "Antenna"),
      mkEq("a2", unitId, "Antenna"),
      mkEq("l1", unitId, "LNA/LNB"),
      mkEq("d1", unitId, "Demodulator"),
      mkEq("d2", unitId, "Demodulator"),
      mkEq("p1", unitId, "Processing Server"),
      mkEq("p2", unitId, "Processing Server"),
    ];
    const cap = countServiceableChainCapacity(equipment);
    expect(cap.totalChains).toBe(1);

    const capability = computeUnitCapability(
      unitId,
      "A",
      [
        {
          id: "e1",
          unit_id: unitId,
          status: "In Progress",
          satellite_id: "s1",
          antenna_id: "a1",
          demodulator_id: "d1",
          processing_server_id: "p1",
          satellites: { name: "ChinaSat 6B" },
        },
        {
          id: "e2",
          unit_id: unitId,
          status: "In Progress",
          satellite_id: "s2",
          antenna_id: "a2",
          demodulator_id: "d2",
          processing_server_id: "p2",
          satellites: { name: "Apstar-7" },
        },
      ],
      equipment,
      [],
    );

    expect(capability.maxPossibleScans).toBe(1);
    expect(capability.activeChains).toBe(1);
    expect(capability.occupancyPct).toBe(100);
    expect(capability.constraintViolations.some((v) => v.includes("exceed"))).toBe(true);
  });

  test("occupancy = activeChains / totalChains", () => {
    const unitId = "unit-bravo";
    const equipment = [
      mkEq("a1", unitId, "Antenna"),
      mkEq("a2", unitId, "Antenna"),
      mkEq("l1", unitId, "LNA/LNB"),
      mkEq("l2", unitId, "LNA/LNB"),
      mkEq("d1", unitId, "Demodulator"),
      mkEq("d2", unitId, "Demodulator"),
      mkEq("p1", unitId, "Processing Server"),
      mkEq("p2", unitId, "Processing Server"),
    ];

    const capability = computeUnitCapability(
      unitId,
      "B",
      [
        {
          id: "e1",
          unit_id: unitId,
          status: "In Progress",
          satellite_id: "s1",
          antenna_id: "a1",
          demodulator_id: "d1",
          processing_server_id: "p1",
          satellites: { name: "ChinaSat 6B" },
        },
      ],
      equipment,
      [],
    );

    expect(capability.totalChains).toBe(2);
    expect(capability.activeChains).toBe(1);
    expect(capability.occupancyPct).toBe(50);
  });
});

test.describe("Operational sync logic", () => {
  test("Rule 3 — auto-removes completed INT work from live engagement eligibility", () => {
    expect(isIntGenerationComplete(100, 100, 0)).toBe(true);
    expect(isIntGenerationInProgress(100, 100, 0, "In Progress")).toBe(false);
    expect(
      shouldShowOnLiveEngagement("ChinaSat 6B", "alpha", 100, 100, 0, "In Progress"),
    ).toBe(false);
  });

  test("Rule 2 — ongoing work when pending > 0", () => {
    expect(isIntGenerationInProgress(100, 80, 20, "Paused")).toBe(true);
    expect(
      shouldShowOnLiveEngagement("ChinaSat 6B", "alpha", 100, 80, 20, "Paused"),
    ).toBe(true);
  });

  test("Rule 1 — invisible satellite excluded from live engagement", () => {
    expect(
      shouldShowOnLiveEngagement("NonexistentSat XYZ", "alpha", 50, 10, 40, "In Progress"),
    ).toBe(false);
  });

  test("Rule 5 — compact satellite label formatting", () => {
    const sats = [
      { engagementId: "1", name: "Apstar-7", status: "In Progress", displayStatus: "Active" },
      { engagementId: "2", name: "Chinasat-12", status: "In Progress", displayStatus: "Active" },
      { engagementId: "3", name: "PAKSAT-1R", status: "In Progress", displayStatus: "Active" },
      { engagementId: "4", name: "Measat-3a", status: "In Progress", displayStatus: "Active" },
      { engagementId: "5", name: "Arabsat 6A", status: "In Progress", displayStatus: "Active" },
      { engagementId: "6", name: "Thaicom 8", status: "In Progress", displayStatus: "Active" },
      { engagementId: "7", name: "Yamal 601", status: "In Progress", displayStatus: "Active" },
    ];
    const fmt = formatLiveEngagementSatelliteLabel(sats, 2);
    expect(fmt.label).toBe("Apstar-7, Chinasat-12, +5");
    expect(fmt.total).toBe(7);
    expect(fmt.overflow).toBe(5);
  });

  test("Validation E — orphan engagement detected", () => {
    const issues = validateOperationalSync({
      engagements: [
        {
          id: "orphan-1",
          unit_id: "missing-unit-id",
          status: "In Progress",
          satellites: { name: "ChinaSat 6B" },
        },
      ],
      dbUnits: [],
      intelRows: [],
    });
    expect(issues.some((i) => i.code === "E")).toBe(true);
  });
});
