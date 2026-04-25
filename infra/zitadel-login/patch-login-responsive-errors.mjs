import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2];
const marker = "/* Dev-SSO Responsive Error States */";

if (!root) {
  throw new Error("Expected the extracted login bundle path as the first argument.");
}

let changedFiles = 0;
walk(root);
console.log(`Patched hosted login responsive errors in ${changedFiles} file(s).`);

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
body div[class*="py-4"]:has(div[class*="border-yellow"]),
body div[class*="py-4"]:has([role="alert"]),
body div[class*="max-w-[440px]"] div[class*="border-yellow"] {
  width: 100% !important;
  max-width: 100% !important;
  box-sizing: border-box !important;
}

body div[class*="border-yellow"],
body [role="alert"] {
  align-items: flex-start !important;
  justify-content: flex-start !important;
  gap: 8px !important;
  min-height: 48px !important;
  padding: 12px 14px !important;
  border-radius: 8px !important;
  line-height: 1.45 !important;
  text-align: left !important;
  overflow-wrap: anywhere !important;
}

body div[class*="border-yellow"] span,
body [role="alert"] span {
  min-width: 0 !important;
  color: inherit !important;
  white-space: normal !important;
}

@media (max-width: 420px) {
  body {
    padding-bottom: 92px !important;
  }
  body div[class*="max-w-[440px]"] {
    width: calc(100vw - 24px) !important;
  }
  body div[class*="max-w-[440px]"] > div:first-child {
    padding: 22px 18px !important;
  }
  body div[class*="max-w-[440px]"] form div[class*="flex"][class*="w-full"] {
    flex-wrap: wrap !important;
    gap: 12px !important;
  }
  body button[data-testid="submit-button"],
  body button[data-testid="back-button"],
  body button[data-devsso-action="submit"],
  body button[data-devsso-action="back"] {
    flex: 1 1 132px !important;
    min-width: 132px !important;
  }
  #devsso-theme-float {
    width: min(calc(100vw - 24px), 100%) !important;
  }
  #devsso-theme-float #devsso-theme-toggle {
    margin-inline-end: 0 !important;
  }
  #devsso-footer {
    padding: 10px 12px 14px !important;
  }
}`.trim();
}
