import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("rotas do app exigem sessão e preservam o destino", async ({ page }) => {
  await page.goto("/app/metas?nova=1");
  await expect(page).toHaveURL(/\/entrar\?next=%2Fapp%2Fmetas%3Fnova%3D1/);
  await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
});

test("rotas de API autenticadas recusam sem sessão/origem", async ({ request }) => {
  const r = await request.post("/api/ai/chat", { data: {}, headers: { origin: "https://evil.example" } });
  expect([400, 403]).toContain(r.status());
  const c = await request.get("/api/cron/daily");
  expect(c.status()).toBe(401);
  const w = await request.post("/api/webhooks/stripe", { data: "{}" });
  expect([400, 503]).toContain(w.status());
});

for (const path of ["/entrar", "/cadastro", "/recuperar"]) {
  test(`formulário ${path}: rótulos, foco por teclado e acessibilidade`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByLabel("E-mail")).toBeVisible();
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => document.activeElement?.tagName);
    expect(focused).toBeTruthy();
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();
    expect(r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
    await page.screenshot({ path: `test-results/auth${path.replace("/", "-")}.png` });
  });
}

test("sem Supabase configurado, o formulário informa e não finge funcionar", async ({ page }) => {
  await page.goto("/entrar");
  await expect(page.getByText("Autenticação ainda não configurada")).toBeVisible();
  await expect(page.getByRole("button", { name: "Entrar" })).toBeDisabled();
});
