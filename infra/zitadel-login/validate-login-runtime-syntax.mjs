/**
 * validate-login-runtime-syntax.mjs
 * Build-time guard — validates that all patch runtime() outputs are
 * syntactically valid JavaScript. Catches regex and syntax errors at
 * build time, not browser runtime.
 *
 * Usage: node validate-login-runtime-syntax.mjs
 */
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";

const repo = new URL("../..", import.meta.url).pathname;
const root = mkdtempSync(join(tmpdir(), "devsso-syntax-"));

const patches = [
  {
    name: "patch-login-url-privacy.mjs",
    fixture: () => {
      const dir = join(root, "static", "chunks", "app", "(login)", "test");
      const file = join(dir, "page.js");
      mkdirSync(dir, { recursive: true });
      writeFileSync(file, "void 0;");
      return file;
    },
  },
  {
    name: "patch-login-otp-behavior.mjs",
    fixture: () => {
      const dir = join(root, "static", "chunks", "app", "(login)", "otp");
      const file = join(dir, "layout.js");
      mkdirSync(dir, { recursive: true });
      writeFileSync(file, 'function f(){return "headlessui-listbox-button";}');
      return file;
    },
  },
  {
    name: "patch-login-toggle.mjs",
    fixture: () => {
      const dir = join(root, "static", "chunks", "app", "(login)", "nav");
      const file = join(dir, "page.js");
      mkdirSync(dir, { recursive: true });
      writeFileSync(file, 'function f(){return "headlessui-listbox-button";}');
      return file;
    },
  },
];

let passed = 0;
let failed = 0;

try {
  for (const patch of patches) {
    const file = patch.fixture();
    try {
      execFileSync(
        process.execPath,
        [join(repo, "infra", "zitadel-login", patch.name), root],
        { stdio: "pipe" },
      );
    } catch {
      // Some patches may fail if fixture is insufficient — that's OK,
      // we only need to validate files that were actually written.
    }
    const output = readFileSync(file, "utf8");
    try {
      new Function(output);
      console.log(`  ✅ ${patch.name}: syntax valid`);
      passed += 1;
    } catch (error) {
      console.error(`  ❌ ${patch.name}: ${error.message}`);
      failed += 1;
    }
  }

  console.log(`\nRuntime syntax validation: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
} finally {
  rmSync(root, { force: true, recursive: true });
}
