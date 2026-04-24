import { readFileSync, writeFileSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

const script = "/Users/leavend/Desktop/Project_SSO/infra/zitadel-login/patch-login-language.mjs";
const fixture = `
const locales=[{name:"English",code:"en"},{name:"Deutsch",code:"de"},{name:"Italiano",code:"it"},{name:"Espa\\xf1ol",code:"es"},{name:"Fran\\xe7ais",code:"fr"},{name:"Nederlands",code:"nl"},{name:"Polski",code:"pl"},{name:"简体中文",code:"zh"},{name:"Русский",code:"ru"},{name:"T\\xfcrk\\xe7e",code:"tr"},{name:"日本語",code:"ja"},{name:"Українська",code:"uk"},{name:"العربية",code:"ar"}];
`.trim();

const directory = mkdtempSync(join(tmpdir(), "dev-sso-language-patch-"));
const file = join(directory, "bundle.js");

writeFileSync(file, fixture);
execFileSync("node", [script, directory], { stdio: "inherit" });

const patched = readFileSync(file, "utf8");
assertIncludes(patched, 'name:"Bahasa Indonesia",code:"id"');
assertIncludes(patched, 'name:"English",code:"en"');
assertExcludes(patched, 'name:"Deutsch",code:"de"');
assertExcludes(patched, 'name:"العربية",code:"ar"');
assertIncludes(patched, "/* Dev-SSO Language Focus */");

rmSync(directory, { recursive: true, force: true });
console.log("validate-login-language-patch: OK");

function assertIncludes(text, value) {
  if (!text.includes(value)) {
    throw new Error(`Expected patched bundle to include ${value}`);
  }
}

function assertExcludes(text, value) {
  if (text.includes(value)) {
    throw new Error(`Expected patched bundle to exclude ${value}`);
  }
}
