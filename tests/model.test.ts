import { test } from "node:test";
import assert from "node:assert/strict";
import { diagnose, usdcAmount } from "../lib/model";

test("a ready attestation alone is not delivery", () => {
  assert.equal(
    diagnose({
      source: "confirmed",
      attestation: "ready",
      received: false,
      expired: false,
    }).outcome,
    "ready-to-receive",
  );
});
test("confirmed destination receipt wins over an old attestation expiry", () => {
  assert.equal(
    diagnose({
      source: "confirmed",
      attestation: "ready",
      received: true,
      expired: true,
    }).outcome,
    "completed",
  );
});
test("unavailable destination evidence stays unknown", () => {
  assert.equal(
    diagnose({
      source: "confirmed",
      attestation: "ready",
      received: null,
      expired: false,
    }).outcome,
    "unknown",
  );
});
test("a reverted source cannot be reported delivered", () => {
  assert.equal(
    diagnose({
      source: "failed",
      attestation: "ready",
      received: true,
      expired: false,
    }).outcome,
    "source-failed",
  );
});
test("amount formatting preserves six decimals and values above JS integer precision", () => {
  assert.equal(
    usdcAmount("9007199254740993123456"),
    "9,007,199,254,740,993.123456",
  );
  assert.equal(usdcAmount("1"), "0.000001");
  assert.equal(usdcAmount("0"), "0");
  assert.equal(usdcAmount(null), "Unknown");
});
