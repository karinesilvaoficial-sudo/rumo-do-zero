import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("página pública", () => {
  test("proposta, planos e preços anuais = 10 mensalidades", async ({ page }) => {
    const res = await page.goto("/");
    expect(res?.headers()["content-security-policy"]).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Cada número mostra");
    const planos = page.locator("#planos");
    for (const [name, month, year] of [["Pro", "R$ 19,90", "R$ 199,00"], ["Max", "R$ 49,90", "R$ 499,00"], ["Ilimitado", "R$ 149,90", "R$ 1.499,00"]]) {
      const card = planos.locator("article", { has: page.getByRole("heading", { name, exact: true }) });
      await expect(card).toContainText(month);
      await expect(card).toContainText(`${year} por ano`);
    }
    await expect(planos.locator("article", { has: page.getByRole("heading", { name: "Ilimitado", exact: true }) })).toContainText("IA, voz, membros e arquivos seguem os limites");
    await expect(planos.locator("article")).toHaveCount(4);
  });

  test("sem rolagem horizontal nas larguras de referência", async ({ page }) => {
    for (const width of [360, 390, 768, 1280, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `largura ${width}`).toBeLessThanOrEqual(0);
      await page.screenshot({ path: `test-results/landing-${width}.png`, fullPage: false });
    }
  });

  test("acessibilidade (axe WCAG 2.2 A/AA) sem violações graves", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(500);
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).exclude("canvas").analyze();
    const serious = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });

  test("hidratação funciona sob CSP (FAQ interativo)", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => { if (m.type() === "error" && /Content Security Policy|Refused/.test(m.text())) errors.push(m.text()); });
    await page.goto("/#perguntas");
    const first = page.locator(".faq details").first();
    await first.locator("summary").click();
    await expect(first).toHaveAttribute("open", "");
    expect(errors).toEqual([]);
  });
});

test.describe("3D e movimento", () => {
  test("cena 3D carrega sob demanda depois do conteúdo", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Começar grátis" })).toBeVisible();
    await expect(page.locator(".hero-stage canvas")).toHaveCount(1, { timeout: 20_000 });
  });

  test("movimento reduzido preserva a página", async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--rumo-dur-scene").trim())).toMatch(/^0m?s$/);
    await ctx.close();
  });
});
