import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2];
const marker = "/* __devssoTranslationFallbackPatched */";
const lookupPattern =
  /let ([\w$]+)=await (\(0,[\w$]+\.[\w$]+\)\(\{serviceConfig:[\w$]+,locale:([\w$]+),organization:[\w$]+\}\));\1&&\(([\w$]+)=\1\)/g;

if (!root) {
  throw new Error("Expected the extracted login bundle path as the first argument.");
}

let patchedFiles = 0;
walk(root);
console.log(`Patched hosted login translation fallback in ${patchedFiles} file(s).`);

if (patchedFiles === 0) {
  throw new Error("Could not find hosted login translation lookup chunks.");
}

function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const location = join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(location);
    } else if (entry.isFile() && location.endsWith(".js")) {
      patchFile(location);
    }
  }
}

function patchFile(location) {
  const original = readFileSync(location, "utf8");
  if (original.includes(marker) || !original.includes("Error fetching custom translations")) {
    return;
  }

  const patched = original.replace(lookupPattern, idLocaleFallback);
  if (patched === original) {
    return;
  }

  writeFileSync(location, `${patched}\n${marker}\n`);
  patchedFiles += 1;
}

function idLocaleFallback(match, result, call, locale, target) {
  return `let ${result}=${locale}==="id"?null:await ${call};${result}&&(${target}=${result})`;
}
