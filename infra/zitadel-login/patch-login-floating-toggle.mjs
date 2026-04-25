import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AUTH_SHELL } from "../../packages/dev-sso-parent-ui/auth-shell.mjs";

const root = process.argv[2];
const marker = "/* Dev-SSO Floating Toggle */";

if (!root) {
  throw new Error("Expected the extracted login bundle path as the first argument.");
}

let changedFiles = 0;
walk(root);
console.log(`Patched hosted login floating toggle in ${changedFiles} file(s).`);

function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const location = join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(location);
    } else if (entry.isFile() && location.endsWith(".css")) {
      patchFile(location);
    }
  }
}

function patchFile(location) {
  const original = readFileSync(location, "utf8");
  if (original.includes(marker)) {
    return;
  }
  writeFileSync(location, `${original}\n${marker}\n${css()}\n`);
  changedFiles += 1;
}

function css() {
  return `
body div[class*="min-h-screen"] {
  --devsso-theme-edge-bottom: max(72px, calc(env(safe-area-inset-bottom, 0px) + 72px));
  --devsso-theme-edge-right: max(16px, calc(env(safe-area-inset-right, 0px) + 20px));
}

#${AUTH_SHELL.theme.toggleHostId} {
  position: fixed !important;
  right: var(--devsso-theme-edge-right) !important;
  bottom: var(--devsso-theme-edge-bottom) !important;
  top: auto !important;
  z-index: 40 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: flex-end !important;
  width: auto !important;
  height: auto !important;
  pointer-events: none !important;
}

#${AUTH_SHELL.theme.toggleHostId} #${AUTH_SHELL.theme.toggleId} {
  position: relative !important;
  inset: auto !important;
  pointer-events: auto !important;
  transform: none !important;
  box-shadow: 0 14px 36px color-mix(in srgb, var(--devsso-shadow) 72%, transparent) !important;
}

@media (max-width: 640px) {
  body div[class*="min-h-screen"] {
    --devsso-theme-edge-bottom: max(84px, calc(env(safe-area-inset-bottom, 0px) + 84px));
    --devsso-theme-edge-right: max(12px, calc(env(safe-area-inset-right, 0px) + 12px));
  }
}`.trim();
}
