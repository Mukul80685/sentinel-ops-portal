import { expect, test } from "@playwright/test";
import {
  validateIntelSnapshot,
  validateIntelSnapshotSelfContainment,
} from "../src/lib/moduleSnapshots/intelSnapshot";
import { computeSnapshotChecksum } from "../src/lib/moduleSnapshots/utils";
import { SNAPSHOT_FORMAT_VERSION } from "../src/lib/moduleSnapshots/types";

const MOCK_EMAIL = "operator@ssacc.demo";
const MOCK_PASSWORD = "SnapshotTest99!";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/auth", { waitUntil: "networkidle" });
  await page.locator('input[type="email"]').fill(MOCK_EMAIL);
  await page.locator('input[type="password"]').fill(MOCK_PASSWORD);
  await page.getByRole("button", { name: "Authenticate" }).click();
  await expect(page).toHaveURL("/", { timeout: 15_000 });
}

function buildValidIntelSnapshot() {
  const exportedAt = "2026-07-09T14:35:12.000Z";
  const storage = {
    "ssacc_intel_cell_edits": "{}",
    "ssacc_intel_freq_actions": "{}",
    "ssacc_intel_important_refs": "[]",
    "ssacc_intel_discarded_refs": "[]",
    "ssacc_intel_analysis_queue": "[]",
    "ssacc_intel_allocations": "[]",
    "ssacc_intel_integrity_overrides": "{}",
    "ssacc_intel_hidden_units": "[]",
    "intel-scan-overrides-alpha": "[]",
  };
  const operational = {
    units: [{ id: "op-unit-alpha", code: "GATE-A", name: "GATE Alpha", description: null, slot: "alpha" }],
    satellites: [{ id: "sat-1", name: "Test Sat", orbital_position: 100 }],
    engagements: [
      {
        id: "eng-1",
        unit_id: "op-unit-alpha",
        satellite_id: "sat-1",
        status: "Completed",
        observation_start: "2026-07-01",
        updated_at: "2026-07-01",
        antenna_id: null,
        demodulator_id: null,
        processing_server_id: null,
        remarks: "POL:KU-HH",
        satellites: { name: "Test Sat" },
      },
    ],
    intelRows: [
      {
        id: "op-intel-eng-1-0",
        unit_id: "op-unit-alpha",
        satellite_id: "sat-1",
        band: "KU-HH",
        summary: "Test",
        analysis_report: null,
        observation_date: "2026-07-01",
        updated_at: "2026-07-01",
      },
    ],
  };
  const checksum = computeSnapshotChecksum({
    module: "intel",
    schema: "intel-repository-v1",
    exported_at: exportedAt,
    storage,
    operational,
  });

  return {
    snapshot_version: SNAPSHOT_FORMAT_VERSION,
    module: "intel",
    module_title: "Intelligence Repository",
    schema: "intel-repository-v1",
    exported_at: exportedAt,
    storage,
    operational,
    checksum,
  };
}

test.describe("Intelligence Repository snapshots", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(
      ({ email, password }) => {
        localStorage.setItem(
          "ssacc_password_overrides",
          JSON.stringify({ [email.toLowerCase()]: password }),
        );
      },
      { email: MOCK_EMAIL, password: MOCK_PASSWORD },
    );
  });

  test("validates snapshot integrity and rejects corrupted packages", () => {
    const snapshot = buildValidIntelSnapshot();
    expect(validateIntelSnapshot(snapshot).ok).toBe(true);
    expect(validateIntelSnapshotSelfContainment(snapshot)).toBeNull();

    const corrupted = { ...snapshot, checksum: "00000000" };
    const result = validateIntelSnapshot(corrupted);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("integrity");
    }

    const wrongModule = { ...snapshot, module: "priority" };
    expect(validateIntelSnapshot(wrongModule).ok).toBe(false);
  });

  test("intel module exposes snapshot-based Data Management UI", async ({ page }) => {
    await login(page);
    await page.goto("/administrator?module=intel", { waitUntil: "networkidle" });

    await page.getByRole("button", { name: /data management/i }).click();
    await expect(page.getByRole("button", { name: /export snapshot/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /restore snapshot/i })).toBeVisible();
    await expect(
      page.getByText(/point-in-time snapshot backup for intelligence repository/i),
    ).toBeVisible();
    await expect(page.getByText(/complete module snapshot/i)).toBeVisible();
  });
});
