import { test } from "node:test";
import assert from "node:assert/strict";
import { nextSteps, statusFor } from "../status.ts";

test("an asset's status follows what's open on it", () => {
  assert.equal(statusFor({ retired: false, lossOpen: false, faults: [] }), "IN_SERVICE");
  assert.equal(statusFor({ retired: false, lossOpen: false, faults: [{ doNotUse: false, status: "REPORTED" }] }), "FAULTY");
  assert.equal(statusFor({ retired: false, lossOpen: false, faults: [{ doNotUse: false, status: "IN_REPAIR" }] }), "IN_REPAIR");
  assert.equal(
    statusFor({ retired: false, lossOpen: false, faults: [{ doNotUse: false, status: "IN_REPAIR" }, { doNotUse: true, status: "REPORTED" }] }),
    "OUT_OF_SERVICE",
  );
  assert.equal(statusFor({ retired: false, lossOpen: true, faults: [{ doNotUse: true, status: "REPORTED" }] }), "LOST");
  assert.equal(statusFor({ retired: true, lossOpen: true, faults: [] }), "RETIRED");
});

test("fault steps only go forward", () => {
  assert.deepEqual(nextSteps("REPORTED"), ["ACKNOWLEDGED", "IN_REPAIR", "FIXED", "RETIRED"]);
  assert.deepEqual(nextSteps("IN_REPAIR"), ["FIXED", "RETIRED"]);
  assert.deepEqual(nextSteps("FIXED"), []);
});
