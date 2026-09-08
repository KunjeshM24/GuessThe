import assert from "node:assert/strict";
import test from "node:test";

import { packSlugForHost } from "./host.ts";

/**
 * Hostname -> pack mapping (GamePlan.md Section 4). Pure, so it can be checked
 * without a domain, DNS or a running server — which matters, because none of
 * those exist yet.
 */

test("a pack subdomain resolves to its pack", () => {
  assert.equal(packSlugForHost("trees.example.com"), "trees");
  assert.equal(packSlugForHost("objects.example.com"), "objects");
});

test("the bare domain and www are the hub, not a pack", () => {
  assert.equal(packSlugForHost("example.com"), null);
  assert.equal(packSlugForHost("www.example.com"), null);
  assert.equal(packSlugForHost("dailydex.co.uk"), null);
});

test("localhost works the same way, which is how this is testable now", () => {
  assert.equal(packSlugForHost("localhost:3000"), null);
  assert.equal(packSlugForHost("trees.localhost:3000"), "trees");
  assert.equal(packSlugForHost("objects.localhost"), "objects");
});

test("ports, casing and a trailing dot do not change the answer", () => {
  assert.equal(packSlugForHost("TREES.Example.COM:443"), "trees");
  assert.equal(packSlugForHost("trees.example.com."), "trees");
});

test("a deploy preview URL is the hub", () => {
  // Vercel preview hosts are one long label plus vercel.app.
  assert.equal(packSlugForHost("daily-dex-git-main-kunj.vercel.app"), null);
});

test("an unknown subdomain falls through to the hub rather than 404ing", () => {
  assert.equal(packSlugForHost("insects.example.com"), null);
  assert.equal(packSlugForHost("api.example.com"), null);
  assert.equal(packSlugForHost("mail.example.com"), null);
});

test("a missing or malformed host is handled", () => {
  assert.equal(packSlugForHost(null), null);
  assert.equal(packSlugForHost(""), null);
  assert.equal(packSlugForHost("trees"), null);
  // A slug-looking label with no parent domain is not a subdomain.
  assert.equal(packSlugForHost("objects"), null);
});

test("a pack name inside a longer label is not a match", () => {
  assert.equal(packSlugForHost("treestuff.example.com"), null);
  assert.equal(packSlugForHost("my-trees.example.com"), null);
  // Only the first label counts, so a pack name deeper in the host is ignored.
  assert.equal(packSlugForHost("www.trees.example.com"), null);
});
