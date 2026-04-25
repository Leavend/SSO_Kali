import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const repo = new URL("../..", import.meta.url).pathname;
const root = mkdtempSync(join(tmpdir(), "devsso-floating-toggle-"));

try {
  const jsFile = prepareJsFixture();
  const cssFile = prepareCssFixture();

  run("patch-login-toggle.mjs");
  run("patch-login-floating-toggle.mjs");

  const patchedJs = readFileSync(jsFile, "utf8");
  const patchedCss = readFileSync(cssFile, "utf8");

  assertIncludes(patchedJs, "toggleHostId");
  assertIncludes(patchedJs, 'shell.appendChild(host)');
  assertIncludes(patchedJs, 'theme-toggle-host');
  assertIncludes(patchedJs, "ensureParentChrome");
  assertIncludes(patchedCss, "#devsso-theme-float");
  assertIncludes(patchedCss, "position: fixed");
  assertIncludes(patchedCss, "bottom: 58px");
  assertIncludes(patchedCss, "right: 20px");
  assertIncludes(patchedCss, "transform: none");

  console.log("login floating toggle patch validation passed");
} finally {
  rmSync(root, { recursive: true, force: true });
}

function prepareJsFixture() {
  const file = join(root, "static", "chunks", "app", "(login)", "page.js");
  mkdirSync(join(root, "static", "chunks", "app", "(login)"), { recursive: true });
  writeFileSync(file, 'const ui="headlessui-listbox-button";');
  return file;
}

function prepareCssFixture() {
  const file = join(root, "static", "css", "app.css");
  mkdirSync(join(root, "static", "css"), { recursive: true });
  writeFileSync(file, "body{display:block}");
  return file;
}

function run(script) {
  execFileSync(process.execPath, [join(repo, "infra", "zitadel-login", script), root], {
    stdio: "inherit",
  });
}

function assertIncludes(value, expected) {
  if (!value.includes(expected)) {
    throw new Error(`Missing expected marker: ${expected}`);
  }
}
