import { expect, test } from "@playwright/test";
import {
  formatLiveEngagementSatelliteLabel,
  isIntGenerationComplete,
  isIntGenerationInProgress,
  shouldShowOnLiveEngagement,
  validateOperationalSync,
} from "../src/lib/operationalSync";

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
