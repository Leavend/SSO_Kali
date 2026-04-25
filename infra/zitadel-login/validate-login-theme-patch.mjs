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
  assertIncludes(patched, "--devsso-primary: #2563eb;");
  assertIncludes(patched, "--devsso-primary-soft: #eaf1fd;");
  assertIncludes(patched, "--devsso-font: Inter, ui-sans-serif");
  assertIncludes(patched, 'button[data-testid="submit-button"]');
  assertIncludes(patched, 'button[data-testid="submit-button"] *');
  assertIncludes(patched, 'button[data-testid="back-button"] *');
  assertIncludes(patched, 'body button[data-testid="back-button"]');
  assertIncludes(patched, "color: var(--devsso-primary) !important;");
  assertIncludes(patched, 'data-devsso-native-theme-hidden="true"');
  assertIncludes(patched, "#devsso-theme-toggle");
  assertIncludes(patched, "#devsso-footer");
  assertIncludes(patched, "#devsso-footer a");
  assertIncludes(patched, "font-weight: 700 !important;");
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
