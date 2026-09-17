import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { assemble, verifyArtifact } from "../scripts/assemble.mjs";
test("HTML assembly preserves dollar replacement tokens and validates the final CSP", () => {
  const js = 'const tokens = ["$&", "$$", "$`", "$\'"];',
    css = "body { color: black; }";
  const hash = createHash("sha256").update(js).digest("base64");
  const policy = `default-src 'none'; script-src 'sha256-${hash}'`;
  const html = assemble("<!--POLICY--><!--STYLE--><!--SCRIPT-->", {
    js,
    css,
    policy,
    notice: "MIT $&",
  });
  assert.ok(html.includes(js));
  assert.doesNotThrow(() => verifyArtifact(html, js, css));
  assert.throws(() => verifyArtifact(html.replace(js, js + ";"), js, css));
});
