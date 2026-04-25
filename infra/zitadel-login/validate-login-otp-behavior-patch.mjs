import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const workspace = mkdtempSync(join(tmpdir(), "zitadel-otp-"));
const fixture = join(workspace, "layout.js");

try {
  writeFileSync(fixture, "const marker='headlessui-listbox-button';");
  execFileSync("node", [join(currentDir, "patch-login-otp-behavior.mjs"), workspace]);
  const patched = readFileSync(fixture, "utf8");
  assertIncludes(patched, "__devssoOtpBehaviorInjected");
  assertIncludes(patched, "CONFIG.codeLength");
  assertIncludes(patched, "button.click()");
  assertIncludes(patched, "Kode verifikasi tidak valid");
  assertIncludes(patched, "Could not verify OTP code");
  assertIncludes(patched, "node.children.length>0");
  console.log("login OTP behavior patch validation passed");
} finally {
  rmSync(workspace, { force: true, recursive: true });
}

function assertIncludes(source, value) {
  if (!source.includes(value)) {
    throw new Error(`Missing expected OTP behavior marker: ${value}`);
  }
}
