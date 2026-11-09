import { chromium, expect, test } from "@playwright/test";

test("sem WebGL: composição estática acessível e todas as funções", async () => {
  const browser = await chromium.launch({ args: ["--disable-3d-apis", "--disable-webgl", "--disable-gpu"] });
  const page = await browser.newPage();
  await page.goto(`${process.env.E2E_BASE ?? "http://localhost:3200"}/`);
  await expect(page.locator(".hero-stage canvas")).toHaveCount(0);
  await expect(page.locator(".hero-stage").getByRole("img", { name: "Bússola RUMO" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Começar grátis" })).toBeVisible();
  await page.screenshot({ path: "test-results/landing-nowebgl.png" });
  await browser.close();
});
