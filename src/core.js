import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

export const FORMAT = "twinfold/v1";
export const CHUNK_SIZE = 4 * 1024 * 1024;
export function validPath(path) {
  return (
    typeof path === "string" &&
    path.length > 0 &&
    !path.includes("\\") &&
    !path.includes("\0") &&
    !path.includes(":") &&
    path.split("/").every((p) => p && p !== "." && p !== "..")
  );
}
export function validateSnapshot(value) {
  if (
    !value ||
    value.format !== FORMAT ||
    typeof value.name !== "string" ||
    !Array.isArray(value.files) ||
    value.files.length > 100000
  )
    throw new Error("Invalid Twinfold snapshot.");
  const seen = new Set();
  for (const item of value.files) {
    if (
      !item ||
      !validPath(item.path) ||
      seen.has(item.path) ||
      !Number.isSafeInteger(item.size) ||
      item.size < 0 ||
      typeof item.hash !== "string" ||
      !/^[a-f0-9]{64}$/.test(item.hash)
    )
      throw new Error("Invalid or duplicate file entry in snapshot.");
    seen.add(item.path);
  }
  return {
    format: FORMAT,
    name: value.name.slice(0, 200),
    files: value.files.map(({ path, size, hash }) => ({ path, size, hash })),
  };
}
export async function hashBlob(blob, { signal, onBytes = () => {} } = {}) {
  const hash = sha256.create();
  for (let start = 0; start < blob.size; start += CHUNK_SIZE) {
    signal?.throwIfAborted();
    const bytes = new Uint8Array(
      await blob.slice(start, start + CHUNK_SIZE).arrayBuffer(),
    );
    signal?.throwIfAborted();
    hash.update(bytes);
    onBytes(bytes.length);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  signal?.throwIfAborted();
  return bytesToHex(hash.digest());
}
export function compareSnapshots(left, right) {
  const old = new Map(left.files.map((f) => [f.path, f]));
  const next = new Map(right.files.map((f) => [f.path, f]));
  const rows = [],
    removed = [],
    added = [];
  for (const [path, a] of old) {
    const b = next.get(path);
    if (!b) removed.push(a);
    else
      rows.push({
        status:
          a.error || b.error
            ? "unreadable"
            : a.hash === b.hash && a.size === b.size
              ? "same"
              : "changed",
        path,
        left: a,
        right: b,
      });
  }
  for (const [path, b] of next) if (!old.has(path)) added.push(b);
  const group = (files) => {
    const out = new Map();
    for (const f of files)
      if (!f.error && f.hash) {
        const key = `${f.size}:${f.hash}`;
        if (!out.has(key)) out.set(key, []);
        out.get(key).push(f);
      }
    return out;
  };
  const from = group(removed),
    to = group(added),
    paired = new Set();
  for (const [key, a] of from) {
    const b = to.get(key);
    // Duplicate contents do not prove which specific file moved.
    if (a.length === 1 && b?.length === 1) {
      rows.push({
        status: "moved",
        path: b[0].path,
        previousPath: a[0].path,
        left: a[0],
        right: b[0],
      });
      paired.add(a[0]);
      paired.add(b[0]);
    }
  }
  for (const a of removed)
    if (!paired.has(a))
      rows.push({
        status: a.error ? "unreadable" : "removed",
        path: a.path,
        left: a,
      });
  for (const b of added)
    if (!paired.has(b))
      rows.push({
        status: b.error ? "unreadable" : "added",
        path: b.path,
        right: b,
      });
  const order = ["unreadable", "removed", "changed", "added", "moved", "same"];
  return rows.sort(
    (a, b) =>
      order.indexOf(a.status) - order.indexOf(b.status) ||
      a.path.localeCompare(b.path),
  );
}
export function summarize(rows) {
  return rows.reduce(
    (counts, row) => {
      counts[row.status]++;
      return counts;
    },
    { same: 0, changed: 0, added: 0, removed: 0, moved: 0, unreadable: 0 },
  );
}
export function csvReport(rows) {
  // Prefix spreadsheet formula markers, including markers after whitespace.
  const cell = (value) =>
    '"' +
    String(value ?? "")
      .replace(/^(\s*[=+@\-\t\r])/, "'$1")
      .replaceAll('"', '""') +
    '"';
  return (
    "\uFEFF" +
    [
      [
        "status",
        "path",
        "previous_path",
        "left_bytes",
        "right_bytes",
        "left_sha256",
        "right_sha256",
      ],
      ...rows.map((r) => [
        r.status,
        r.path,
        r.previousPath,
        r.left?.size,
        r.right?.size,
        r.left?.hash,
        r.right?.hash,
      ]),
    ]
      .map((row) => row.map(cell).join(","))
      .join("\r\n")
  );
}
