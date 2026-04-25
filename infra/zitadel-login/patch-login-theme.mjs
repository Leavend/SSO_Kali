import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  AUTH_SHELL,
  renderCssVariables,
} from "../../packages/dev-sso-parent-ui/auth-shell.mjs";

const root = process.argv[2];
const marker = "/* Dev-SSO Theme Overrides */";
const themeOverrides = buildThemeOverrides();

if (!root) {
  throw new Error(
    "Expected the extracted login bundle path as the first argument.",
  );
}

let changedFiles = 0;
walk(root);
console.log(`Patched login bundle theme in ${changedFiles} file(s).`);

function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const location = join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(location);
      continue;
    }
    if (entry.isFile() && location.endsWith(".css")) {
      patchFile(location);
    }
  }
}

function patchFile(location) {
  const original = readFileSync(location, "utf8");
  if (original.includes(marker)) {
    return;
  }
  writeFileSync(location, `${original}\n${marker}\n${themeOverrides}\n`);
  changedFiles += 1;
}

function buildThemeOverrides() {
  return [
    buildThemeTokens(),
    buildRootSurface(),
    buildCardLayout(),
    buildTypography(),
    buildFields(),
    buildButtons(),
    buildUtilityArea(),
    buildFooter(),
    buildResponsiveRules(),
  ].join("\n\n");
}

function buildThemeTokens() {
  return `
${renderCssVariables("html", AUTH_SHELL.tokens.light)}
html {
  --devsso-surface-strong: var(--devsso-bg);
  --devsso-input: var(--devsso-surface);
  --devsso-link: var(--devsso-primary);
  --devsso-ring: color-mix(in srgb, var(--devsso-primary) 26%, transparent);
  --devsso-font: ${AUTH_SHELL.typography.fontFamily};
  color-scheme: light;
}

${renderCssVariables("html.dark", AUTH_SHELL.tokens.dark)}
html.dark {
  --devsso-surface-strong: var(--devsso-surface);
  --devsso-input: var(--devsso-bg);
  --devsso-link: var(--devsso-primary);
  --devsso-ring: color-mix(in srgb, var(--devsso-primary) 30%, transparent);
  color-scheme: dark;
}`.trim();
}

function buildRootSurface() {
  return `
html,
body {
  background: var(--devsso-bg) !important;
  color: var(--devsso-text) !important;
  font-family: var(--devsso-font) !important;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  transition: background-color 0.25s ease, color 0.25s ease;
}

*, *::before, *::after {
  font-family: var(--devsso-font) !important;
}

body div[class*="min-h-screen"][class*="bg-background-light-600"],
body div[class*="min-h-screen"][class*="bg-background-dark-600"],
body div[class*="min-h-screen"] {
  background: var(--devsso-bg) !important;
  color: var(--devsso-text) !important;
}`.trim();
}

function buildCardLayout() {
  return `
body div[class*="max-w-[440px]"] {
  width: min(100%, 420px) !important;
  max-width: min(420px, calc(100vw - 32px)) !important;
  padding-inline: 0 !important;
}

body div[class*="max-w-[440px]"] > div[class*="bg-background-light-500"][class*="rounded-lg"],
body div[class*="max-w-[440px]"] > div[class*="rounded-lg"][class*="shadow"],
body div[class*="max-w-[440px]"] > div:first-child {
  border-radius: 16px !important;
  border: 1px solid color-mix(in srgb, var(--devsso-border) 76%, transparent) !important;
  background: var(--devsso-surface) !important;
  box-shadow: 0 18px 48px var(--devsso-shadow) !important;
  padding: 32px !important;
  transition: background-color 0.25s ease, box-shadow 0.25s ease;
}

body div[class*="max-w-[440px]"] img[alt="logo"] {
  width: min(100%, 162px) !important;
  height: auto !important;
  margin-bottom: 10px !important;
}`.trim();
}

function buildTypography() {
  return `
body div[class*="max-w-[440px]"] h1 {
  color: var(--devsso-text) !important;
  font-family: var(--devsso-font) !important;
  font-size: 28px !important;
  font-weight: 800 !important;
  letter-spacing: 0 !important;
  line-height: 1.18 !important;
  margin: 8px auto 0 !important;
  text-align: center !important;
}

body div[class*="max-w-[440px]"] p.ztdl-p {
  max-width: 320px !important;
  margin: 8px auto 24px !important;
  color: var(--devsso-text-secondary) !important;
  font-family: var(--devsso-font) !important;
  font-size: 15px !important;
  font-weight: 400 !important;
  line-height: 1.6 !important;
  text-align: center !important;
}

body label {
  color: var(--devsso-text) !important;
  font-family: var(--devsso-font) !important;
  font-size: 14px !important;
  font-weight: 700 !important;
}

body a {
  font-family: var(--devsso-font) !important;
}`.trim();
}

function buildFields() {
  return `
body input[data-testid="username-text-input"],
body input[type="password"],
body input[type="email"],
body input[type="text"] {
  min-height: 44px !important;
  box-sizing: border-box !important;
  font-family: var(--devsso-font) !important;
  font-size: 15px !important;
  padding: 0 14px !important;
  border-radius: 8px !important;
  border: 1px solid var(--devsso-border) !important;
  background: transparent !important;
  color: var(--devsso-text) !important;
  box-shadow: none !important;
  transition: border-color 0.16s ease, box-shadow 0.16s ease, background-color 0.16s ease;
}

body input[data-testid="username-text-input"]::placeholder,
body input[type="password"]::placeholder,
body input[type="email"]::placeholder,
body input[type="text"]::placeholder {
  color: var(--devsso-text-secondary) !important;
  opacity: 0.5 !important;
}

body input[data-testid="username-text-input"]:focus,
body input[type="password"]:focus,
body input[type="email"]:focus,
body input[type="text"]:focus,
body input[data-testid="username-text-input"]:focus-visible,
body input[type="password"]:focus-visible,
body input[type="email"]:focus-visible,
body input[type="text"]:focus-visible {
  outline: none !important;
  border-color: var(--devsso-border-focus) !important;
  box-shadow: 0 0 0 3px var(--devsso-ring) !important;
}

body input[aria-invalid="true"] {
  border-color: #ef4444 !important;
}
body input[aria-invalid="true"]:focus-visible {
  outline: none !important;
  border-color: #ef4444 !important;
  box-shadow: 0 0 0 1px #ef4444 !important;
}`.trim();
}

function buildButtons() {
  return `
body button[class*="border-button-light-border"],
body button[data-testid="submit-button"],
body button[data-devsso-action="submit"],
body button[data-testid="back-button"],
body button[data-devsso-action="back"],
body button[data-testid="password-button"],
body button[data-testid="deny-button"],
body button[data-testid="idp-button"],
body button[class*="rounded-full"][class*="flex"][class*="items-center"] {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  min-height: 44px !important;
  box-sizing: border-box !important;
  border-radius: 8px !important;
  font-family: var(--devsso-font) !important;
  font-weight: 800 !important;
  font-size: 15px !important;
  cursor: pointer;
  transition: color 0.16s ease, background-color 0.16s ease, border-color 0.16s ease, transform 0.16s ease;
}

body button[data-testid="submit-button"],
body button[data-devsso-action="submit"] {
  min-width: 120px !important;
  padding: 0 20px !important;
  border: none !important;
  box-shadow: none !important;
}
body button[data-testid="submit-button"]:not(:disabled),
body button[data-devsso-action="submit"]:not(:disabled) {
  background: var(--devsso-primary-soft) !important;
  color: var(--devsso-primary) !important;
}
body button[data-testid="submit-button"]:not(:disabled):hover,
body button[data-devsso-action="submit"]:not(:disabled):hover {
  background: var(--devsso-primary) !important;
  color: var(--devsso-primary-contrast) !important;
  transform: translateY(-1px);
}
body button[data-testid="submit-button"]:not(:disabled):focus-visible,
body button[data-devsso-action="submit"]:not(:disabled):focus-visible {
  outline: none !important;
  box-shadow: 0 0 0 2px var(--devsso-primary), 0 0 0 4px var(--devsso-ring) !important;
}
body button[data-testid="submit-button"]:disabled,
body button[data-devsso-action="submit"]:disabled {
  background: var(--devsso-primary-soft) !important;
  color: var(--devsso-primary) !important;
  opacity: 0.48 !important;
  cursor: not-allowed;
}
body button[data-testid="submit-button"] *,
body button[data-devsso-action="submit"] *,
body button[data-testid="back-button"] *,
body button[data-devsso-action="back"] * {
  color: inherit !important;
}

body button[data-testid="back-button"],
body button[data-devsso-action="back"] {
  min-width: 100px !important;
  padding: 0 20px !important;
  border: 1px solid var(--devsso-border) !important;
  background: transparent !important;
  color: var(--devsso-primary) !important;
}
body button[data-testid="back-button"]:hover,
body button[data-devsso-action="back"]:hover {
  background: var(--devsso-primary-soft) !important;
  border-color: var(--devsso-primary) !important;
  color: var(--devsso-primary-hover) !important;
}
body button[data-testid="back-button"]:focus-visible,
body button[data-devsso-action="back"]:focus-visible {
  outline: none !important;
  box-shadow: 0 0 0 2px var(--devsso-primary), 0 0 0 4px var(--devsso-ring) !important;
}

body button[data-testid="register-button"],
body button[data-testid="reset-button"],
body button[data-testid="resend-button"] {
  padding: 6px 2px !important;
  border: none !important;
  background: transparent !important;
  color: var(--devsso-link) !important;
  font-family: var(--devsso-font) !important;
  font-size: 15px !important;
  font-weight: 700 !important;
  cursor: pointer;
  transition: color 0.2s ease;
}
body button[data-testid="register-button"]:hover,
body button[data-testid="reset-button"]:hover,
body button[data-testid="resend-button"]:hover {
  color: var(--devsso-primary-hover) !important;
}

body button[data-testid="password-button"] {
  width: 100% !important;
  padding: 0 16px !important;
  border: 1px solid var(--devsso-border) !important;
  background: transparent !important;
  color: var(--devsso-text) !important;
}
body button[data-testid="password-button"]:hover {
  background: var(--devsso-primary-soft) !important;
  border-color: var(--devsso-primary) !important;
}

body button[data-testid="deny-button"] {
  min-width: 100px !important;
  padding: 0 20px !important;
  border: 1px solid rgba(239, 68, 68, 0.3) !important;
  background: transparent !important;
  color: #ef4444 !important;
}
body button[data-testid="deny-button"]:hover {
  background: rgba(239, 68, 68, 0.08) !important;
  border-color: #ef4444 !important;
}

body button[data-testid="idp-button"] {
  border: 1px solid var(--devsso-border) !important;
  background: var(--devsso-surface-strong) !important;
  padding: 0 16px !important;
  color: var(--devsso-text) !important;
}
body button[data-testid="idp-button"]:hover {
  background: var(--devsso-primary-soft) !important;
  border-color: var(--devsso-primary) !important;
}

body a[class*="text-primary"] {
  color: var(--devsso-link) !important;
  font-weight: 600 !important;
}
body a[class*="text-primary"]:hover {
  color: var(--devsso-primary-hover) !important;
}

body div[class*="max-w-[440px]"] div[class*="flex"][class*="justify-between"],
body div[class*="max-w-[440px]"] div[class*="flex"][class*="items-center"][class*="justify-end"],
body div[class*="max-w-[440px]"] form div[class*="flex"][class*="w-full"]:has(> button[data-testid]) {
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  gap: 14px !important;
  margin-top: 22px !important;
}`.trim();
}

function buildUtilityArea() {
  return `
body [id^="headlessui-listbox-button-"],
body [id^="headlessui-listbox-options-"],
body [role="listbox"] {
  display: none !important;
}
body div.w-32:has([id^="headlessui-listbox-button-"]) {
  display: none !important;
}

body div[class*="flex"][class*="space-x-1"][class*="p-1"]:has(> button.w-8) {
  display: none !important;
}
body div[class*="space-x-1"][class*="p-1"] > button.w-8.h-8 {
  display: none !important;
}
body [data-devsso-native-theme-hidden="true"],
body button[aria-label*="dark" i]:not(#devsso-theme-toggle),
body button[aria-label*="light" i]:not(#devsso-theme-toggle) {
  display: none !important;
}

#devsso-theme-toggle {
  position: fixed !important;
  bottom: 58px !important;
  right: 20px !important;
  z-index: 50 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  width: 40px !important;
  height: 40px !important;
  border-radius: 8px !important;
  border: 1px solid var(--devsso-border) !important;
  background: var(--devsso-surface) !important;
  color: var(--devsso-text-secondary) !important;
  cursor: pointer !important;
  transition: all 0.2s ease !important;
  padding: 0 !important;
  margin: 0 !important;
  outline: none !important;
  box-shadow: none !important;
  -webkit-appearance: none !important;
  appearance: none !important;
}

#devsso-theme-toggle:hover {
  background: var(--devsso-surface-hover) !important;
  color: var(--devsso-text) !important;
}

#devsso-theme-toggle:focus-visible {
  box-shadow: 0 0 0 2px var(--devsso-primary), 0 0 0 4px var(--devsso-ring) !important;
}

#devsso-theme-toggle svg {
  width: 16px !important;
  height: 16px !important;
  flex-shrink: 0 !important;
}`.trim();
}

function buildFooter() {
  return `
/* Footer — real HTML, identical to the Vue parent AuthFooter contract */
#devsso-footer {
  position: fixed !important;
  bottom: 0 !important;
  left: 0 !important;
  right: 0 !important;
  z-index: 10 !important;
  display: flex !important;
  flex-wrap: wrap !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 8px 14px !important;
  padding: 16px !important;
  font-family: var(--devsso-font) !important;
  font-size: 12px !important;
  font-weight: 400 !important;
  color: color-mix(in srgb, var(--devsso-text-secondary) 78%, transparent) !important;
  line-height: 1.5 !important;
  letter-spacing: 0 !important;
  pointer-events: auto !important;
}

#devsso-footer a {
  color: var(--devsso-primary) !important;
  font-weight: 700 !important;
  text-decoration: none !important;
  transition: color 0.15s ease !important;
  font-size: inherit !important;
}

#devsso-footer a:hover {
  color: var(--devsso-primary-hover) !important;
}`.trim();
}

function buildResponsiveRules() {
  return `
@media (max-width: 640px) {
  body div[class*="max-w-[440px]"] > div[class*="bg-background-light-500"][class*="rounded-lg"],
  body div[class*="max-w-[440px]"] > div[class*="rounded-lg"][class*="shadow"],
  body div[class*="max-w-[440px]"] > div:first-child {
    padding: 24px 20px !important;
    border-radius: 14px !important;
  }

  body div[class*="max-w-[440px]"] h1 {
    font-size: 1.375rem !important;
  }

  #devsso-theme-toggle {
    bottom: 72px !important;
    right: 16px !important;
    width: 36px !important;
    height: 36px !important;
  }
}

/* Smooth all transitions */
* {
  transition-property: background-color, border-color, color, box-shadow;
  transition-duration: 0s;
}
body, body div, body button, body input, body a {
  transition-duration: 0.2s;
  transition-timing-function: ease;
}`.trim();
}
