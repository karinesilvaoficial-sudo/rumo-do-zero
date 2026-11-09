import { describe, expect, it } from "vitest";
import { resolvePeriod, todayIn } from "./period";
import { safeNext } from "./safe-redirect";

describe("period", () => {
  it("uses São Paulo business date near midnight UTC", () => {
    // 02:30 UTC de 1º/dez = 23:30 de 30/nov em São Paulo
    const now = new Date("2026-12-01T02:30:00Z");
    expect(todayIn("America/Sao_Paulo", now)).toBe("2026-11-30");
    expect(resolvePeriod("mes", undefined, undefined, "America/Sao_Paulo", now)).toMatchObject({ from: "2026-11-01", to: "2026-11-30" });
  });
  it("previous month across year", () => {
    const now = new Date("2027-01-15T12:00:00Z");
    expect(resolvePeriod("mes-anterior", undefined, undefined, "America/Sao_Paulo", now)).toMatchObject({ from: "2026-12-01", to: "2026-12-31" });
    expect(resolvePeriod("3m", undefined, undefined, "America/Sao_Paulo", now)).toMatchObject({ from: "2026-11-01", to: "2027-01-31" });
  });
  it("rejects invalid custom", () => {
    expect(resolvePeriod("custom", "2026-12-31", "2026-01-01").key).toBe("mes");
  });
});

describe("safeNext", () => {
  it("blocks open redirects", () => {
    expect(safeNext("https://evil.com")).toBe("/app");
    expect(safeNext("//evil.com/x")).toBe("/app");
    expect(safeNext("/\\evil.com")).toBe("/app");
    expect(safeNext("/app/metas?x=1")).toBe("/app/metas?x=1");
  });
});
