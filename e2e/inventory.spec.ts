import { expect, test } from "@playwright/test";

const MOCK_EMAIL = "operator@ssacc.demo";
const MOCK_PASSWORD = "InventoryTest99!";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/auth", { waitUntil: "networkidle" });
  await page.locator('input[type="email"]').fill(MOCK_EMAIL);
  await page.locator('input[type="password"]').fill(MOCK_PASSWORD);
  await page.getByRole("button", { name: "Authenticate" }).click();
  await expect(page).toHaveURL("/", { timeout: 15_000 });
}

test.describe("Resource Inventory", () => {
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

  test("inventory page loads and shows unit grid", async ({ page }) => {
    await login(page);
    await page.goto("/inventory", { waitUntil: "networkidle" });

    await expect(page.getByRole("heading", { name: "Resource Inventory" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("Unit A")).toBeVisible();
    await expect(page.getByText("Unit H")).toBeVisible();
  });
});
