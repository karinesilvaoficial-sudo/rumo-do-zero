import { describe, expect, it } from "vitest";
import { addInterval, prepaidPeriod, priceFor, priceMap, refundAction } from "./core";

describe("billing core", () => {
  it("prepaid extends from the later of now and current end (no lost days, no overlap)", () => {
    const now = new Date("2026-11-09T12:00:00Z");
    const end = new Date("2026-11-20T00:00:00Z");
    expect(prepaidPeriod(now, end, "month")).toEqual({ starts_at: end, ends_at: new Date("2026-12-20T00:00:00Z") });
    expect(prepaidPeriod(now, new Date("2026-10-01T00:00:00Z"), "year").starts_at).toEqual(now);
    expect(prepaidPeriod(now, null, "year").ends_at).toEqual(new Date("2027-11-09T12:00:00Z"));
  });
  it("month arithmetic clamps short months", () => {
    expect(addInterval(new Date("2027-01-31T10:00:00Z"), "month")).toEqual(new Date("2027-02-28T10:00:00Z"));
    expect(addInterval(new Date("2028-02-29T00:00:00Z"), "year")).toEqual(new Date("2029-02-28T00:00:00Z"));
  });
  it("prices resolved only on server from env", () => {
    const env = { STRIPE_PRICE_PRO_MONTH: "price_a", STRIPE_PRICE_MAX_YEAR: "price_b" };
    expect(priceFor(env, "pro", "month")).toBe("price_a");
    expect(priceFor(env, "unlimited", "year")).toBeNull();
    expect(priceMap(env).get("price_b")).toEqual({ plan: "max", interval: "year" });
    expect(priceMap(env).get("price_x")).toBeUndefined();
  });
  it("refund policy", () => {
    expect(refundAction(1990, 1990, false)).toBe("revoke");
    expect(refundAction(500, 1990, false)).toBe("keep");
    expect(refundAction(0, 1990, true)).toBe("revoke");
  });
});
