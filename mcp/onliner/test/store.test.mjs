import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { JsonStateStore } from "../src/store.mjs";

test("persists approvals and the first publish attempt", async (context) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "onliner-state-test-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const now = new Date("2026-08-30T12:00:00.000Z");
  const store = new JsonStateStore(directory, () => now);

  await store.saveApproval("approval-1", { title: "Test" }, "digest");
  const approval = await store.getApproval("approval-1");
  assert.equal(approval.expired, false);
  assert.equal(approval.listing.title, "Test");

  await store.saveAttempt("approval-1", { status: "результат неизвестен", phase: "before_submit" });
  await store.saveAttempt("approval-1", { status: "опубликовано", listing_id: "123" });
  const attempt = await store.getAttempt("approval-1");
  assert.equal(attempt.phase, "before_submit");
  assert.equal(attempt.status, "опубликовано");
  assert.equal(attempt.listing_id, "123");
  assert.equal(await store.claimPublish("approval-1"), true);
  assert.equal(await store.claimPublish("approval-1"), false);
});

test("marks an approval expired after 24 hours", async (context) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "onliner-expiry-test-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  let now = new Date("2026-08-30T12:00:00.000Z");
  const store = new JsonStateStore(directory, () => now);
  await store.saveApproval("approval-2", { title: "Test" }, "digest");
  now = new Date("2026-08-31T12:00:01.000Z");
  assert.equal((await store.getApproval("approval-2")).expired, true);
});
