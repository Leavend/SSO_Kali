import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2];
const languageListMarker = "/* Dev-SSO Language Focus */";
const supportedLocalesPattern =
  /\[\{name:"English",code:"en"\},\{name:"Deutsch",code:"de"\},\{name:"Italiano",code:"it"\},\{name:"Espa\\xf1ol",code:"es"\},\{name:"Fran\\xe7ais",code:"fr"\},\{name:"Nederlands",code:"nl"\},\{name:"Polski",code:"pl"\},\{name:"简体中文",code:"zh"\},\{name:"Русский",code:"ru"\},\{name:"T\\xfcrk\\xe7e",code:"tr"\},\{name:"日本語",code:"ja"\},\{name:"Українська",code:"uk"\},\{name:"العربية",code:"ar"\}\]/g;
const focusedLanguages =
  '[{name:"Bahasa Indonesia",code:"id"},{name:"English",code:"en"}]';

if (!root) {
  throw new Error("Expected the extracted login bundle path as the first argument.");
}

let changedFiles = 0;
let matchedLanguageList = false;

walk(root);
assertLanguageListPatch();
console.log(`Patched login bundle language focus in ${changedFiles} file(s).`);

function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const location = join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(location);
      continue;
    }
    if (entry.isFile() && location.endsWith(".js")) {
      patchFile(location);
    }
  }
}

function patchFile(location) {
  const original = readFileSync(location, "utf8");
  if (!supportedLocalesPattern.test(original)) {
    supportedLocalesPattern.lastIndex = 0;
    return;
  }

  supportedLocalesPattern.lastIndex = 0;
  const patchedSource = original.replace(
    supportedLocalesPattern,
    `${focusedLanguages}${languageListMarker}`,
  );
  matchedLanguageList = true;
  writeFileSync(location, patchedSource);
  changedFiles += 1;
}

function assertLanguageListPatch() {
  if (!matchedLanguageList) {
    throw new Error("Could not find the supported language list in the login bundle.");
  }
}
