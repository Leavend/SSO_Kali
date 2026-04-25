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
  --devsso-theme-rail-width: min(calc(100% - 32px), 448px);
  --devsso-theme-rail-offset: clamp(12px, 4vw, 20px);
  --devsso-theme-flow-gap: clamp(12px, 2vh, 18px);
}

#${AUTH_SHELL.theme.toggleHostId} {
  position: relative !important;
  inset: auto !important;
  z-index: 24 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: flex-end !important;
  flex: 0 0 auto !important;
  align-self: center !important;
  width: var(--devsso-theme-rail-width) !important;
  min-height: 40px !important;
  margin: var(--devsso-theme-flow-gap) auto 0 !important;
  pointer-events: none !important;
}

#${AUTH_SHELL.theme.toggleHostId} #${AUTH_SHELL.theme.toggleId} {
  position: relative !important;
  inset: auto !important;
  margin-inline-end: var(--devsso-theme-rail-offset) !important;
  pointer-events: auto !important;
  transform: none !important;
  box-shadow: 0 14px 36px color-mix(in srgb, var(--devsso-shadow) 72%, transparent) !important;
}

@media (max-width: 640px) {
  body div[class*="min-h-screen"] {
    --devsso-theme-rail-offset: 0px;
    --devsso-theme-flow-gap: 14px;
  }

  #${AUTH_SHELL.theme.toggleHostId} #${AUTH_SHELL.theme.toggleId} {
    margin-inline-end: 0 !important;
  }
}`.trim();
}
