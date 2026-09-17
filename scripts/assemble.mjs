import { createHash } from "node:crypto";
import { Script } from "node:vm";
export function assemble(template, { js, css, policy, notice }) {
  const replacements = {
    "<!--POLICY-->": `<meta http-equiv="Content-Security-Policy" content="${policy}">`,
    "<!--STYLE-->": `<style>${css}</style>`,
    "<!--SCRIPT-->": `<!-- ${notice} -->\n<script>${js}</script>`,
  };
  for (const [marker, content] of Object.entries(replacements)) {
    if (template.split(marker).length !== 2)
      throw new Error(`Expected one ${marker} marker.`);
    // A callback is essential: replacement strings interpret $&, $`, $' and $$.
    template = template.replace(marker, () => content);
  }
  return template;
}
export function verifyArtifact(html, js, css) {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  if (scripts.length !== 1 || scripts[0][1] !== js)
    throw new Error("Bundled script changed during HTML assembly.");
  if (html.match(/<style>([\s\S]*?)<\/style>/)?.[1] !== css)
    throw new Error("Styles changed during HTML assembly.");
  const hash = createHash("sha256")
    .update(js.replace(/\r\n?/g, "\n"))
    .digest("base64");
  if (!html.includes(`script-src 'sha256-${hash}'`))
    throw new Error(
      "Script CSP hash does not match the browser-normalized artifact.",
    );
  new Script(js);
}
