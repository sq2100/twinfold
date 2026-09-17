import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
const port = Number(process.env.PORT || 4178);
createServer(async (req, res) => {
  if (!["/", "/index.html", "/THIRD_PARTY_NOTICES.md"].includes(req.url)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  try {
    const file =
      req.url === "/THIRD_PARTY_NOTICES.md"
        ? "THIRD_PARTY_NOTICES.md"
        : "index.html";
    res.writeHead(200, {
      "Content-Type": file.endsWith(".html")
        ? "text/html; charset=utf-8"
        : "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(await readFile(`dist/${file}`));
  } catch {
    res.writeHead(500);
    res.end("Run npm run build first.");
  }
}).listen(port, "127.0.0.1", () =>
  console.log(`Twinfold: http://127.0.0.1:${port}`),
);
