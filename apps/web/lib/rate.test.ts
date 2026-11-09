import { describe, expect, it } from "vitest";
import { percentToFraction } from "./rate";

describe("percentToFraction", () => {
  it("converts", () => {
    expect(percentToFraction("2,99")).toBe("0.0299");
    expect(percentToFraction("12.5%")).toBe("0.125");
    expect(percentToFraction("0,000001")).toBe("0.00000001");
    expect(percentToFraction("0")).toBe("0");
  });
  it("unknown stays null, invalid undefined", () => {
    expect(percentToFraction("")).toBeNull();
    expect(percentToFraction(undefined)).toBeNull();
    expect(percentToFraction("abc")).toBeUndefined();
    expect(percentToFraction("100")).toBeUndefined();
  });
});
