import assert from "node:assert/strict";
import test from "node:test";

import { _reset, rateLimit } from "./rate-limit.ts";

test("allows up to the limit, then blocks", () => {
  _reset();
  assert.ok(rateLimit("a", 2, 1000));
  assert.ok(rateLimit("a", 2, 1000));
  assert.equal(rateLimit("a", 2, 1000), false);
});

test("keys are independent", () => {
  _reset();
  assert.ok(rateLimit("a", 1, 1000));
  assert.equal(rateLimit("a", 1, 1000), false);
  assert.ok(rateLimit("b", 1, 1000));
});

test("window expiry resets the counter", async () => {
  _reset();
  assert.ok(rateLimit("a", 1, 10));
  assert.equal(rateLimit("a", 1, 10), false);
  await new Promise((r) => setTimeout(r, 15));
  assert.ok(rateLimit("a", 1, 10));
});
