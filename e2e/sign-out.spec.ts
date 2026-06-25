import { expect, test } from "@playwright/test";

const MOCK_EMAIL = "operator@ssacc.demo";
const MOCK_PASSWORD = "SignOutTest99!";

async function loginWithMockSession(page: import("@playwright/test").Page) {
  await page.goto("/auth", { waitUntil: "networkidle" });
  await page.locator('input[type="email"]').fill(MOCK_EMAIL);
  await page.locator('input[type="password"]').fill(MOCK_PASSWORD);
  await page.getByRole("button", { name: "Authenticate" }).click();
  await expect(page).toHaveURL("/", { timeout: 15_000 });
}

test.describe("Sign Out", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(
      ({ email, password }) => {
        localStorage.setItem(
          "ssacc_password_overrides",
          JSON.stringify({ [email.toLowerCase()]: password }),
        );
        localStorage.removeItem("ssacc_mock_session");
      },
      { email: MOCK_EMAIL, password: MOCK_PASSWORD },
    );
  });

  test("sign out redirects to login and blocks authenticated routes", async ({ page }) => {
    await loginWithMockSession(page);

    await page.getByRole("button", { name: "Sign Out" }).click();
    await expect(page).toHaveURL("/auth", { timeout: 10_000 });
    await expect(page.getByRole("heading", { name: "Access Terminal" })).toBeVisible();

    await page.goto("/control-center");
    await expect(page).toHaveURL("/auth", { timeout: 10_000 });

    await loginWithMockSession(page);
    await expect(page.getByText("Control Center")).toBeVisible({ timeout: 15_000 });
  });
});
