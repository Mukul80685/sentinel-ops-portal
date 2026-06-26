import { test, expect } from "@playwright/test";

const MOCK_SESSION = { email: "e2e@test.local", userId: "mock-e2e", createdAt: Date.now() };

test("visibility deep link from INT", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.addInitScript((session) => {
    localStorage.setItem("ssacc_mock_session", JSON.stringify(session));
  }, MOCK_SESSION);

  await page.route("**/rest/v1/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));

  await page.goto("/visibility?unit=alpha&satellite=ChinaSat%206B&region=china");
  await expect(page.getByText("ChinaSat 6B", { exact: false })).toBeVisible({ timeout: 10000 });
  expect(errors).toEqual([]);
});
