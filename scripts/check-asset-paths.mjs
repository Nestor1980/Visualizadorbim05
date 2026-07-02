// Fails the build if source files reference "/src/public/...".
// Vite only serves files copied from public/ at the site root (e.g. "/videos/x.mp4"),
// never from "/src/public/...". This check catches the mistake that broke prod
// (see problema_vertex.md) before it reaches a build.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT_DIRS = ["src", "index.html"];
const BAD_PATTERN = /\/src\/public\//;

let found = [];

function walk(path) {
  const stats = statSync(path);
  if (stats.isDirectory()) {
    for (const entry of readdirSync(path)) {
      walk(join(path, entry));
    }
    return;
  }
  if (!/\.(ts|js|tsx|jsx|html|css)$/.test(path)) return;
  const content = readFileSync(path, "utf8");
  if (BAD_PATTERN.test(content)) found.push(path);
}

for (const root of ROOT_DIRS) {
  walk(root);
}

if (found.length > 0) {
  console.error("Referencias invalidas a /src/public/ encontradas en:");
  for (const file of found) console.error(`  - ${file}`);
  console.error(
    "\nMove los assets a public/ y referencialos desde la raiz (ej: /videos/archivo.mp4)."
  );
  process.exit(1);
}
