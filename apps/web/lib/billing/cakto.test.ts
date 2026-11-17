import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { caktoOffers, handleCaktoEvent, offerFor, signCallback, verifyCaktoDelivery, verifyCallback } from "./cakto";
import type { BillingStore } from "./events";

const SECRET = "whsec-test-0123456789";
const USER = "3f2a9c1e-7b4d-4a8e-9f01-2c6d5b8a4e37";
const offers = caktoOffers({ CAKTO_OFFER_PRO_MONTH: "offPRO1", CAKTO_OFFER_MAX_MONTH: "offMAX1", CAKTO_OFFER_PRO_YEAR: "bad id!" });

function memStore() {
  const periods: { user_id: string; plan_code: string; source_ref: string; payment_ref: string | null; starts_at: Date; ends_at: Date; revoked?: string }[] = [];
  const notes: string[] = [];
  const store = {
    async insertAccessPeriod(r) { if (periods.some((p) => p.source_ref === r.source_ref)) return false; periods.push({ ...r }); return true; },
    async latestAccessEnd() { const live = periods.filter((p) => !p.revoked).map((p) => p.ends_at.getTime()); return live.length ? new Date(Math.max(...live)) : null; },
    async revokeByPayment(ref, reason) { let n = 0; for (const p of periods) if (p.payment_ref === ref && !p.revoked) { p.revoked = reason; n++; } return n; },
    async notify(_u, _k, _t, _b, dedupe) { notes.push(dedupe); },
  } as Partial<BillingStore> as BillingStore;
  return { store, periods, notes };
}

const order = (over: Record<string, unknown> = {}) => ({ id: "ord-1", status: "paid", offer: { id: "offPRO1" }, amount: 19.9, currency: "BRL", paymentMethod: "pix", callback: signCallback(SECRET, USER, "pro", "month", "nonce123"), ...over });

describe("cakto callback token", () => {
  it("round-trips and only uses the accepted charset", () => {
    const t = signCallback(SECRET, USER, "max", "year", "abcDEF_-9");
    expect(t).toMatch(/^[A-Za-z0-9._~-]+$/);
    expect(t.length).toBeLessThanOrEqual(255);
    expect(verifyCallback(SECRET, t)).toEqual({ userId: USER, plan: "max", interval: "year" });
  });
  it("rejects tampering and other secrets", () => {
    const t = signCallback(SECRET, USER, "pro", "month", "nonce123");
    expect(verifyCallback(SECRET, t.replace(".pm.", ".um."))).toBeNull();
    expect(verifyCallback("other-secret", t)).toBeNull();
    expect(verifyCallback(SECRET, undefined)).toBeNull();
  });
});

describe("cakto delivery verification", () => {
  const raw = JSON.stringify({ secret: SECRET, event: "purchase_approved", data: {} });
  const sig = (ts: string, body = raw, s = SECRET) => `v1=${createHmac("sha256", s).update(`${ts}.`).update(body).digest("hex")}`;
  it("accepts a valid header signature within tolerance", () => {
    expect(verifyCaktoDelivery(SECRET, raw, { timestamp: "1000", signature: sig("1000") }, 1100)).toBe(true);
  });
  it("rejects stale, forged or altered deliveries", () => {
    expect(verifyCaktoDelivery(SECRET, raw, { timestamp: "1000", signature: sig("1000") }, 2000)).toBe(false);
    expect(verifyCaktoDelivery(SECRET, raw, { timestamp: "1000", signature: sig("1000", raw, "x") }, 1000)).toBe(false);
    expect(verifyCaktoDelivery(SECRET, raw + " ", { timestamp: "1000", signature: sig("1000") }, 1000)).toBe(false);
  });
  it("falls back to the body secret when headers are absent", () => {
    expect(verifyCaktoDelivery(SECRET, raw, { timestamp: null, signature: null })).toBe(true);
    expect(verifyCaktoDelivery(SECRET, raw.replace(SECRET, "nope"), { timestamp: null, signature: null })).toBe(false);
    expect(verifyCaktoDelivery(SECRET, "not json", { timestamp: null, signature: null })).toBe(false);
  });
});

describe("cakto events", () => {
  const now = new Date("2026-11-17T12:00:00Z");
  it("maps only valid offer ids", () => {
    expect(offerFor(offers, "pro", "month")).toBe("offPRO1");
    expect(offerFor(offers, "pro", "year")).toBeNull();
  });
  it("purchase_approved grants one month once (duplicates are ignored)", async () => {
    const m = memStore();
    const deps = { store: m.store, secret: SECRET, offers, now };
    expect(await handleCaktoEvent({ event: "purchase_approved", data: order() }, deps)).toEqual([{ result: "processed" }]);
    expect(await handleCaktoEvent({ event: "purchase_approved", data: [order()] }, deps)).toEqual([{ result: "duplicate" }]);
    expect(m.periods).toHaveLength(1);
    expect(m.periods[0]).toMatchObject({ user_id: USER, plan_code: "pro", source_ref: "cakto:ord-1" });
    expect(m.periods[0]!.ends_at.toISOString()).toBe("2026-12-17T12:00:00.000Z");
  });
  it("stacks a second paid month after the current one", async () => {
    const m = memStore();
    const deps = { store: m.store, secret: SECRET, offers, now };
    await handleCaktoEvent({ event: "purchase_approved", data: order() }, deps);
    await handleCaktoEvent({ event: "purchase_approved", data: order({ id: "ord-2" }) }, deps);
    expect(m.periods[1]!.starts_at.toISOString()).toBe("2026-12-17T12:00:00.000Z");
  });
  it("rejects missing/forged callback, other offers and unpaid orders", async () => {
    const m = memStore();
    const deps = { store: m.store, secret: SECRET, offers, now };
    expect((await handleCaktoEvent({ event: "purchase_approved", data: order({ callback: null }) }, deps))[0]!.result).toBe("rejected");
    expect((await handleCaktoEvent({ event: "purchase_approved", data: order({ offer: { id: "offMAX1" } }) }, deps))[0]!.result).toBe("rejected");
    expect((await handleCaktoEvent({ event: "purchase_approved", data: order({ offer: { id: "unknown" } }) }, deps))[0]!.result).toBe("rejected");
    expect((await handleCaktoEvent({ event: "purchase_approved", data: order({ status: "waiting_payment" }) }, deps))[0]!.result).toBe("ignored");
    expect(m.periods).toHaveLength(0);
  });
  it("refund and chargeback revoke the period tied to the order", async () => {
    const m = memStore();
    const deps = { store: m.store, secret: SECRET, offers, now };
    await handleCaktoEvent({ event: "purchase_approved", data: order() }, deps);
    await handleCaktoEvent({ event: "refund", data: order({ status: "refunded" }) }, deps);
    expect(m.periods[0]!.revoked).toBe("refund");
    await handleCaktoEvent({ event: "purchase_approved", data: order({ id: "ord-9" }) }, deps);
    await handleCaktoEvent({ event: "chargeback", data: order({ id: "ord-9", status: "MED" }) }, deps);
    expect(m.periods[1]!.revoked).toBe("dispute");
  });
});
