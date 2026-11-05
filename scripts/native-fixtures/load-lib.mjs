// Loads the web app's TypeScript modules (lib/*.ts) as plain JavaScript, without changing them:
// Node 22 strips the type annotations, relative imports get a .mjs suffix, and a few module-private
// constants of lib/pixel.ts are re-exported so the native app can share the same data.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const ROOT = new URL("../../", import.meta.url);

/** extra exports appended to a module (names that exist in the file but are not exported) */
const EXTRA_EXPORTS = {
  pixel: ["C", "HEAD", "TORSO_SIT", "BODY_STAND", "FLOW_STARS", "FLOW_STAR_MS", "rng", "mix", "hash"],
};

export function transpile(name) {
  const src = readFileSync(new URL(`lib/${name}.ts`, ROOT), "utf8");
  let js = stripTypeScriptTypes(src, { mode: "strip" });
  js = js.replace(/from\s+"\.\/([\w-]+)"/g, 'from "./$1.mjs"');
  const extra = EXTRA_EXPORTS[name];
  if (extra) js += `\nexport { ${extra.join(", ")} };\n`;
  return js;
}

/** writes the modules to a temp dir and imports them; returns { modules, dir, cleanup } */
export async function loadLib(names) {
  const dir = mkdtempSync(join(tmpdir(), "tc-native-fixtures-"));
  for (const n of names) writeFileSync(join(dir, `${n}.mjs`), transpile(n));
  const modules = {};
  for (const n of names) modules[n] = await import(pathToFileURL(join(dir, `${n}.mjs`)).href);
  return { modules, dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
