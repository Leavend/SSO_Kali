import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const workspace = mkdtempSync(join(tmpdir(), "zitadel-theme-"));
const fixture = join(workspace, "main.css");

try {
  writeFileSync(fixture, "body{margin:0}");
  execFileSync("node", [
    "/Users/leavend/Desktop/Project_SSO/infra/zitadel-login/patch-login-theme.mjs",
    workspace,
  ]);
  const patched = readFileSync(fixture, "utf8");
  assertIncludes(patched, "Dev-SSO Theme Overrides");
  assertIncludes(patched, "html.dark");
  assertIncludes(patched, '--devsso-primary: #4f46e5;');
  assertIncludes(patched, '--devsso-accent: #14b8a6;');
  assertIncludes(patched, 'button[data-testid="submit-button"]');
  assertIncludes(patched, 'button.w-8.h-8');
  assertIncludes(patched, 'div[class*="max-w-[440px]"] > div');
  assertIncludes(patched, '@media (max-width: 640px)');
  console.log("login theme patch validation passed");
} finally {
  rmSync(workspace, { force: true, recursive: true });
}

function assertIncludes(source, value) {
  if (!source.includes(value)) {
    throw new Error(`Missing expected theme selector: ${value}`);
  }
}
