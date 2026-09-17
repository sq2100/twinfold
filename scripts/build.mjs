import { build } from "esbuild";
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { assemble, verifyArtifact } from "./assemble.mjs";
const result = await build({
  entryPoints: ["src/app.js"],
  bundle: true,
  write: false,
  minify: true,
  format: "iife",
  target: ["es2022"],
  legalComments: "inline",
});
const js = result.outputFiles[0].text.replaceAll("</script", "<\\/script");
const css = await readFile("src/style.css", "utf8");
const policy = `default-src 'none'; script-src 'sha256-${createHash("sha256").update(js).digest("base64")}'; style-src 'sha256-${createHash("sha256").update(css).digest("base64")}'; img-src data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`;
const notice =
  (await readFile("LICENSE", "utf8")) +
  "\n\n" +
  (await readFile("THIRD_PARTY_NOTICES.md", "utf8"));
const html = assemble(await readFile("src/index.html", "utf8"), {
  js,
  css,
  policy,
  notice,
});
verifyArtifact(html, js, css);
await mkdir("dist", { recursive: true });
await writeFile("dist/index.html", html);
await copyFile("THIRD_PARTY_NOTICES.md", "dist/THIRD_PARTY_NOTICES.md");
console.log(
  `Built dist/index.html (${Math.ceil(Buffer.byteLength(html) / 1024)} KB). No runtime network dependencies.`,
);
