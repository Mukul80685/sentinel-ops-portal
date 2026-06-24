import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const MOCK_SESSION = {
  email: "e2e@test.local",
  userId: "mock-e2e",
  createdAt: Date.now(),
};

const DRILL_DOWN_SOURCE = join(
  process.cwd(),
  "src/components/intel/IntelSatelliteDrillDown.tsx",
);

function productiveRows(page: Page) {
  return page
    .locator("div.panel")
    .filter({ hasText: "C1 · Productive Frequencies" })
    .locator("table tbody tr.cursor-pointer");
}

function isBenignConsoleError(text: string): boolean {
  return (
    text.includes("Failed to load resource") ||
    text.includes("net::ERR_") ||
    text.includes("favicon")
  );
}

async function installMockSession(page: Page) {
  await page.addInitScript((session) => {
    localStorage.setItem("ssacc_mock_session", JSON.stringify(session));
  }, MOCK_SESSION);
}

async function mockSupabaseApi(page: Page) {
  const units = ["A", "B", "C", "D", "E", "F", "G", "H"].map((code) => ({
    id: `mock-unit-${code.toLowerCase()}`,
    code,
    name: `Unit ${code}`,
    description: "",
  }));

  await page.route("**/rest/v1/**", (route) => {
    const url = route.request().url();
    if (url.includes("/units")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(units),
      });
    }
    if (url.includes("equipment")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          { id: "eq-1", serviceability: "Operational", category: { name: "Antenna" } },
        ]),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });
}

async function openFrequencyDrillDown(page: Page) {
  await page.goto("/intel/alpha");
  await page.locator('[role="row"]').nth(1).click();
  await expect(page.getByText("Click or right-click any frequency row for actions")).toBeVisible();
}

/** Confirm inline action dialog before execution. */
async function confirmAction(page: Page) {
  const dlg = page.getByRole("alertdialog").filter({ hasText: "Confirm Action" });
  await expect(dlg).toBeVisible();
  await dlg.getByRole("button", { name: "Confirm" }).click();
  await expect(dlg).toBeHidden();
}

/** Normal click with trial — fails if dialog/table intercepts pointer events. */
async function clickMenuItem(page: Page, rowIndex: number, label: string) {
  await productiveRows(page).nth(rowIndex).click();
  const menu = page.locator("[data-freq-action-menu]");
  await expect(menu).toBeVisible();

  const item = menu.locator("button").filter({ hasText: label });
  await expect(item).toBeVisible();
  await expect(item).toBeEnabled();
  await item.click({ trial: true });
  await item.click();
  await confirmAction(page);
  await expect(menu).toBeHidden();
}

test.describe("INT Frequency Action Menu regression", () => {
  test("FreqActionMenu does not use createPortal(document.body)", () => {
    const source = readFileSync(DRILL_DOWN_SOURCE, "utf8");
    expect(source).not.toContain("createPortal");
    expect(source).not.toMatch(/document\.body/);
    expect(source).toContain("data-freq-action-menu");
  });

  test("menu items are clickable and produce expected action outcomes", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => consoleErrors.push(`PageError: ${err.message}`));

    await installMockSession(page);
    await mockSupabaseApi(page);
    await openFrequencyDrillDown(page);

    // 1–4: Important
    await clickMenuItem(page, 0, "Add to Important Frequencies");
    await expect(
      productiveRows(page).nth(0).locator('button[title*="Important — added from INT repository"]'),
    ).toBeVisible();

    // 5–6: Technical analysis
    await clickMenuItem(page, 1, "Request Detailed Technical Analysis");
    const techRow = productiveRows(page).nth(1);
    await expect(techRow.getByText("⚙")).toBeVisible();
    await expect(techRow.locator("td").first().locator("span.font-bold")).toHaveClass(/1a237e/);

    // Toggle off technical analysis
    await clickMenuItem(page, 1, "Remove Technical Analysis");
    await expect(techRow.getByText("⚙")).toHaveCount(0);
    await clickMenuItem(page, 1, "Request Detailed Technical Analysis");
    await expect(techRow.getByText("⚙")).toBeVisible();

    // 7–9: Allocate (select eligible unit)
    await clickMenuItem(page, 2, "Allocate to Unit");
    const allocDialog = page.getByRole("dialog").filter({ hasText: /Allocate To Unit/i });
    await expect(allocDialog).toBeVisible();
    const unitBtn = allocDialog.locator("ul button").first();
    await expect(unitBtn).toBeVisible({ timeout: 10_000 });
    await unitBtn.click({ trial: true });
    await unitBtn.click();
    await expect(allocDialog).toBeHidden({ timeout: 10_000 });
    await expect(page.getByText("Click or right-click any frequency row for actions")).toBeVisible();
    await expect(productiveRows(page).nth(2).getByText("📡")).toBeVisible({ timeout: 15_000 });

    // 10–12: Discard
    const discardRow = productiveRows(page).nth(3);
    const freqId = ((await discardRow.locator("td").first().innerText()).split("\n")[0] ?? "").trim();
    expect(freqId.length).toBeGreaterThan(0);
    const rowCountBefore = await productiveRows(page).count();

    await clickMenuItem(page, 3, "Discard");

    await expect(productiveRows(page)).toHaveCount(rowCountBefore - 1);
    await expect(productiveRows(page).filter({ hasText: freqId })).toHaveCount(0);

    const stored = await page.evaluate(() => {
      try {
        return JSON.parse(localStorage.getItem("ssacc_intel_discarded_refs") || "[]") as {
          frequencyId: string;
        }[];
      } catch {
        return [];
      }
    });
    expect(stored.some((r) => r.frequencyId === freqId)).toBe(true);

    await page.goto("/discarded", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("90-Day Retention Archive")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator(".mono").filter({ hasText: freqId }).first()).toBeVisible({
      timeout: 10_000,
    });

    // Restore discarded frequency — must return to productive table with prior state intact
    await page.getByRole("button", { name: new RegExp(`Restore ${freqId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) }).click();
    const restoreDlg = page.getByRole("alertdialog").filter({ hasText: "Confirm Restore" });
    await expect(restoreDlg).toBeVisible();
    await restoreDlg.getByRole("button", { name: "Confirm" }).click();
    await expect(restoreDlg).toBeHidden();
    await expect(page.locator(".mono").filter({ hasText: freqId })).toHaveCount(0);

    await page.goto("/intel/alpha");
    await page.locator('[role="row"]').nth(1).click();
    await expect(productiveRows(page).filter({ hasText: freqId })).toHaveCount(1, { timeout: 10_000 });

    const unexpected = consoleErrors.filter((e) => !isBenignConsoleError(e));
    expect(unexpected, `Unexpected console errors: ${unexpected.join("; ")}`).toEqual([]);
  });
});
