import { describe, expect, it } from "vitest";
import { centsToSpeech, formatBRL, parseBRLInput, parseCents, sumCents } from "./money.ts";
import { PLANS } from "./plans.ts";
import { creditsFor } from "./ai.ts";

describe("money", () => {
  it("parses and formats without float", () => {
    expect(formatBRL(parseCents("123456789"))).toBe("R$ 1.234.567,89");
    expect(formatBRL(-5n)).toBe("−R$ 0,05");
    expect(formatBRL("75000", { signed: true })).toBe("+R$ 750,00");
    expect(parseCents("9007199254740993")).toBe(9007199254740993n); // > 2^53 sem perda
    expect(() => parseCents(0.1 + 0.2)).toThrow("cents_unsafe_number");
    expect(() => parseCents("1.5")).toThrow();
  });
  it("parses pt-BR input", () => {
    expect(parseBRLInput("1.234,56")).toBe(123456n);
    expect(parseBRLInput("R$ 10")).toBe(1000n);
    expect(parseBRLInput("0,1")).toBe(10n);
    expect(parseBRLInput("12,345")).toBeNull();
    expect(parseBRLInput("abc")).toBeNull();
  });
  it("sums exactly (0.1 + 0.2 problem)", () => {
    expect(sumCents(["10", "20"])).toBe(30n);
    expect(sumCents(["3333", "3333", "3334"])).toBe(10000n);
  });
  it("speaks money", () => {
    expect(centsToSpeech(123456n)).toBe("1.234 reais e 56 centavos");
    expect(centsToSpeech(100n)).toBe("1 real");
    expect(centsToSpeech(5n)).toBe("5 centavos");
  });
});

describe("plans", () => {
  it("annual = 10 monthly and exactly four plans", () => {
    expect(PLANS.map((p) => p.code)).toEqual(["free", "pro", "max", "unlimited"]);
    for (const p of PLANS) expect(p.annual_cents).toBe(p.monthly_cents * 10);
    expect(PLANS.find((p) => p.code === "unlimited")?.ai_credits_month).toBe(500);
  });
  it("credits", () => {
    expect(creditsFor(3000, 800)).toBe(1);
    expect(creditsFor(9000, 800)).toBe(3);
    expect(creditsFor(100, 2500)).toBe(3);
  });
});
