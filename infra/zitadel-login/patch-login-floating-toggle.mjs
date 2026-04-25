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
#${AUTH_SHELL.theme.toggleHostId} {
  position: fixed !important;
  top: 16px !important;
  right: 16px !important;
  z-index: 24 !important;
  display: block !important;
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
  #${AUTH_SHELL.theme.toggleHostId} {
    top: 12px !important;
    right: 12px !important;
  }
}`.trim();
}
