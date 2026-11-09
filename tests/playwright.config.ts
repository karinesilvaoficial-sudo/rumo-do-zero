import { defineConfig, devices } from "@playwright/test";

/**
 * Jornadas de navegador. Sem projeto Supabase configurado, cobre: página pública, autenticação (formulários),
 * proteção de rotas, CSP, acessibilidade, responsividade, fallback sem WebGL e movimento reduzido.
 * Com SUPABASE configurado (E2E_SUPABASE=1), ver e2e/journey.spec.ts.
 */
const PORT = Number(process.env.E2E_PORT ?? 3200);
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 2,
  reporter: [["list"], ["json", { outputFile: "test-results/results.json" }]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "off", launchOptions: { args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] } },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `pnpm --dir ../apps/web start -p ${PORT}`,
    url: `http://localhost:${PORT}/termos`,
    reuseExistingServer: true,
    timeout: 60_000,
    env: { NODE_ENV: "production", APP_ENV: "test", NEXT_PUBLIC_APP_URL: `http://localhost:${PORT}` },
  },
});
