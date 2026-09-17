import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  FORMAT,
  CHUNK_SIZE,
  hashBlob,
  compareSnapshots,
  summarize,
  validateSnapshot,
  csvReport,
} from "../src/core.js";
const file = (path, content) => ({
  path,
  size: Buffer.byteLength(content),
  hash: createHash("sha256").update(content).digest("hex"),
});
const snapshot = (files) => ({ format: FORMAT, name: "test", files });
test("detects same-size content changes, missing files, additions and moves", () => {
  const a = snapshot([
    file("same", "abc"),
    file("changed", "abc"),
    file("gone", "old"),
    file("old/name", "move"),
  ]);
  const b = snapshot([
    file("same", "abc"),
    file("changed", "xyz"),
    file("new", "new"),
    file("new/name", "move"),
  ]);
  const rows = compareSnapshots(a, b);
  assert.deepEqual(summarize(rows), {
    same: 1,
    changed: 1,
    added: 1,
    removed: 1,
    moved: 1,
    unreadable: 0,
  });
  assert.equal(rows.find((r) => r.status === "moved").previousPath, "old/name");
});
test("does not guess moves when duplicate contents are ambiguous", () => {
  const rows = compareSnapshots(
    snapshot([file("a", "copy"), file("b", "copy")]),
    snapshot([file("c", "copy")]),
  );
  assert.equal(summarize(rows).moved, 0);
  assert.equal(summarize(rows).removed, 2);
});
test("ignores timestamps and treats paths as case sensitive", () => {
  const rows = compareSnapshots(
    snapshot([file("Readme", "abc")]),
    snapshot([file("README", "abc")]),
  );
  assert.equal(rows[0].status, "moved");
});
test("read errors can never become verified matches or exported valid snapshots", () => {
  const broken = { path: "broken", size: 4, error: "read failed" };
  const rows = compareSnapshots(snapshot([broken]), snapshot([broken]));
  assert.equal(rows[0].status, "unreadable");
  assert.throws(() => validateSnapshot(snapshot([broken])));
});
test("snapshot validator rejects duplicate, unsafe, missing and malformed data", () => {
  assert.deepEqual(
    validateSnapshot(snapshot([file("safe/name", "")])),
    snapshot([file("safe/name", "")]),
  );
  for (const path of [
    "../secret",
    "/root",
    "a//b",
    "a/./b",
    "a\\b",
    "C:/a",
    "a\0b",
  ])
    assert.throws(() => validateSnapshot(snapshot([file(path, "x")])));
  assert.throws(() =>
    validateSnapshot(snapshot([file("a", "1"), file("a", "2")])),
  );
  assert.throws(() =>
    validateSnapshot(snapshot([{ path: "a", size: -1, hash: "a".repeat(64) }])),
  );
  assert.throws(() =>
    validateSnapshot(snapshot([{ path: "a", size: 1, hash: "not a hash" }])),
  );
  assert.throws(() =>
    validateSnapshot(
      snapshot([{ path: "a", size: 1, hash: ["a".repeat(64)] }]),
    ),
  );
  assert.throws(() =>
    validateSnapshot({ format: "other", name: "x", files: [] }),
  );
});
test("chunked SHA-256 matches the platform implementation across chunk boundaries", async () => {
  const contents = new Uint8Array(CHUNK_SIZE * 2 + 513);
  for (let i = 0; i < contents.length; i++) contents[i] = (i * 17 + 71) % 256;
  let observed = 0;
  const hash = await hashBlob(new Blob([contents]), {
    onBytes: (n) => (observed += n),
  });
  assert.equal(hash, createHash("sha256").update(contents).digest("hex"));
  assert.equal(observed, contents.length);
  assert.equal(
    await hashBlob(new Blob([])),
    createHash("sha256").update("").digest("hex"),
  );
});
test("cancel stops hashing and returns no partial digest", async () => {
  const controller = new AbortController();
  let calls = 0;
  await assert.rejects(
    hashBlob(new Blob([new Uint8Array(CHUNK_SIZE + 1)]), {
      signal: controller.signal,
      onBytes: () => {
        calls++;
        controller.abort();
      },
    }),
    { name: "AbortError" },
  );
  assert.equal(calls, 1);
});
test("CSV handles commas, quotes and spreadsheet formulas safely", () => {
  const rows = compareSnapshots(
    snapshot([]),
    snapshot([
      file("=1+1", "x"),
      file("  @SUM(A1)", "y"),
      file('a,"b.txt', "z"),
    ]),
  );
  const csv = csvReport(rows);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.ok(csv.includes('"\'=1+1"'));
  assert.ok(csv.includes('"\'  @SUM(A1)"'));
  assert.ok(csv.includes('"a,""b.txt"'));
});
test("export/import roundtrip retains comparisons including Unicode paths", () => {
  const a = snapshot([
    file("旅行/写真.txt", "こんにちは"),
    file("emoji/🌱.txt", "green"),
  ]);
  const b = validateSnapshot(JSON.parse(JSON.stringify(a)));
  assert.equal(summarize(compareSnapshots(a, b)).same, 2);
});
