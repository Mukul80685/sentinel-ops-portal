import { expect, test, type Page } from "@playwright/test";

/** Demo recovery profile — test fixture only, not shown in UI */
const VALID = {
  userId: "SSACC@ENTITYA",
  serviceNumber: "IC80685A",
  securityAnswer: "army public school",
  accountEmail: "operator@ssacc.demo",
} as const;

const NEW_PASSWORD = "RecoveryTest99!";

async function openRecoveryDialog(page: Page) {
  await page.goto("/auth", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Access Terminal" })).toBeVisible();
  await page.getByTestId("forgot-password-trigger").click();
  await expect(page.getByTestId("password-recovery-dialog")).toBeVisible({ timeout: 10_000 });
}

async function recoveryDialog(page: Page) {
  return page.getByTestId("password-recovery-dialog");
}

async function fillIdentity(page: Page, userId: string, serviceNumber: string) {
  const dialog = await recoveryDialog(page);
  await dialog.locator('input[name="recovery-user-id"]').fill(userId);
  await dialog.locator('input[name="recovery-service-number"]').fill(serviceNumber);
}

async function continueIdentity(page: Page) {
  const dialog = await recoveryDialog(page);
  await dialog.getByRole("button", { name: "Continue" }).click();
}

test.describe("Forgot Password recovery", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.removeItem("ssacc_password_overrides");
      localStorage.removeItem("ssacc_password_resets");
      localStorage.removeItem("ssacc_mock_session");
    });
  });

  test("fields are empty with no credential hints on open", async ({ page }) => {
    await openRecoveryDialog(page);
    const dialog = await recoveryDialog(page);

    await expect(dialog.locator('input[name="recovery-user-id"]')).toHaveValue("");
    await expect(dialog.locator('input[name="recovery-service-number"]')).toHaveValue("");

    await expect(dialog.getByText(/Demo:/i)).toHaveCount(0);
    await expect(dialog.getByText(/SSACC@ENTITY/i)).toHaveCount(0);
    await expect(dialog.getByText(/IC80685/i)).toHaveCount(0);
  });

  test("wrong User ID fails with generic error", async ({ page }) => {
    await openRecoveryDialog(page);
    await fillIdentity(page, "SSACC@NOTVALID", VALID.serviceNumber);
    await continueIdentity(page);

    await expect(page.getByText("Invalid credentials.")).toBeVisible();
    await expect(page.getByText("Security Question")).toHaveCount(0);
  });

  test("wrong Service Number fails with generic error", async ({ page }) => {
    await openRecoveryDialog(page);
    await fillIdentity(page, VALID.userId, "IC99999Z");
    await continueIdentity(page);

    await expect(page.getByText("Invalid credentials.")).toBeVisible();
    await expect(page.getByText("Security Question")).toHaveCount(0);
  });

  test("correct User ID and Service Number proceeds to security question", async ({ page }) => {
    await openRecoveryDialog(page);
    await fillIdentity(page, VALID.userId, VALID.serviceNumber);
    await continueIdentity(page);

    await expect(page.getByText("Security Question")).toBeVisible();
    await expect(page.getByText("What is your first school?")).toBeVisible();
    await expect(page.getByText(VALID.userId)).toHaveCount(0);
  });

  test("password mismatch fails before reset", async ({ page }) => {
    await openRecoveryDialog(page);
    await fillIdentity(page, VALID.userId, VALID.serviceNumber);
    await continueIdentity(page);

    const dialog = page.getByTestId("password-recovery-dialog");
    await dialog.locator('input[name="recovery-security-answer"]').fill(VALID.securityAnswer);
    await dialog.getByRole("button", { name: "Verify" }).click();

    await dialog.locator('input[autocomplete="new-password"]').first().fill("AlphaPass1!");
    await dialog.locator('input[autocomplete="new-password"]').nth(1).fill("BetaPass2!");
    await dialog.getByRole("button", { name: "Reset Password" }).click();

    await expect(page.getByText("Passwords do not match.")).toBeVisible();
  });

  test("successful password change allows login with new password", async ({ page }) => {
    await openRecoveryDialog(page);
    await fillIdentity(page, VALID.userId, VALID.serviceNumber);
    await continueIdentity(page);

    const dialog = page.getByTestId("password-recovery-dialog");
    await dialog.locator('input[name="recovery-security-answer"]').fill(VALID.securityAnswer);
    await dialog.getByRole("button", { name: "Verify" }).click();

    await dialog.locator('input[autocomplete="new-password"]').first().fill(NEW_PASSWORD);
    await dialog.locator('input[autocomplete="new-password"]').nth(1).fill(NEW_PASSWORD);
    await dialog.getByRole("button", { name: "Reset Password" }).click();

    await expect(page.getByRole("heading", { name: "Password Successfully Reset" })).toBeVisible({
      timeout: 10_000,
    });
    await dialog.getByRole("button", { name: "Return to Login" }).click();
    await expect(dialog).toBeHidden();

    await page.locator('input[type="email"]').fill(VALID.accountEmail);
    await page.locator('form input[type="password"]').fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Authenticate" }).click();

    await expect(page).not.toHaveURL(/\/auth$/, { timeout: 15_000 });
  });
});
