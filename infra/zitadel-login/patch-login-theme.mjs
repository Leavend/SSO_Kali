import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2];
const marker = "/* Dev-SSO Theme Overrides */";
const themeOverrides = buildThemeOverrides();

if (!root) {
  throw new Error("Expected the extracted login bundle path as the first argument.");
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
  // Self-hosted @font-face — Google Fonts CDN unreachable from container
  const fontFace = `@font-face {
  font-family: 'Space Grotesk';
  font-style: normal;
  font-weight: 300 700;
  font-display: swap;
  src: url('/ui/v2/login/fonts/V8mDoQDjQSkFtoMM3T6r8E7mDbNyDNs1.woff2') format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}\n`;
  writeFileSync(location, `${fontFace}${original}\n${marker}\n${themeOverrides}\n`);
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
html {
  --devsso-bg: #f9fafb;
  --devsso-surface: #ffffff;
  --devsso-surface-strong: #f9fafb;
  --devsso-surface-hover: #f3f4f6;
  --devsso-input: #ffffff;
  --devsso-text: #111827;
  --devsso-text-secondary: #6b7280;
  --devsso-border: rgba(0, 0, 0, 0.08);
  --devsso-border-focus: #2563eb;
  --devsso-primary: #2563eb;
  --devsso-primary-hover: #1d4ed8;
  --devsso-primary-soft: rgba(37, 99, 235, 0.08);
  --devsso-link: #2563eb;
  --devsso-ring: rgba(37, 99, 235, 0.25);
  --devsso-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
  --devsso-font: "Space Grotesk", system-ui, -apple-system, sans-serif;
  color-scheme: light;
}

html.dark {
  --devsso-bg: #111827;
  --devsso-surface: #1f2937;
  --devsso-surface-strong: #1f2937;
  --devsso-surface-hover: #374151;
  --devsso-input: #111827;
  --devsso-text: #f3f4f6;
  --devsso-text-secondary: #9ca3af;
  --devsso-border: rgba(255, 255, 255, 0.10);
  --devsso-border-focus: #60a5fa;
  --devsso-primary: #60a5fa;
  --devsso-primary-hover: #93c5fd;
  --devsso-primary-soft: rgba(96, 165, 250, 0.12);
  --devsso-link: #60a5fa;
  --devsso-ring: rgba(96, 165, 250, 0.30);
  --devsso-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.3);
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

/* Force Space Grotesk on ALL elements — override Tailwind font-sans */
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
  padding-inline: 16px;
}

body div[class*="max-w-[440px]"] > div[class*="bg-background-light-500"][class*="rounded-lg"],
body div[class*="max-w-[440px]"] > div[class*="rounded-lg"][class*="shadow"],
body div[class*="max-w-[440px]"] > div:first-child {
  border-radius: 16px !important;
  border: none !important;
  background: var(--devsso-surface) !important;
  box-shadow: var(--devsso-shadow) !important;
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
  font-size: 1.5rem !important;
  font-weight: 700 !important;
  letter-spacing: -0.025em !important;
  margin: 12px auto 10px !important;
  text-align: center !important;
}

body div[class*="max-w-[440px]"] p.ztdl-p {
  max-width: 34ch !important;
  margin: 0 auto 24px !important;
  color: var(--devsso-text-secondary) !important;
  font-family: var(--devsso-font) !important;
  font-size: 0.875rem !important;
  font-weight: 400 !important;
  line-height: 1.5 !important;
  text-align: center !important;
}

body label {
  color: var(--devsso-text) !important;
  font-family: var(--devsso-font) !important;
  font-size: 0.875rem !important;
  font-weight: 500 !important;
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
  height: 42px !important;
  box-sizing: border-box !important;
  font-family: var(--devsso-font) !important;
  font-size: 0.875rem !important;
  padding: 0 14px !important;
  border-radius: 8px !important;
  border: 1px solid var(--devsso-border) !important;
  background: transparent !important;
  color: var(--devsso-text) !important;
  box-shadow: none !important;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
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
  box-shadow: 0 0 0 1px var(--devsso-border-focus) !important;
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
/* Base structural reset for all form buttons */
body button[class*="border-button-light-border"],
body button[data-testid="submit-button"],
body button[data-testid="back-button"],
body button[data-testid="password-button"],
body button[data-testid="deny-button"],
body button[data-testid="idp-button"],
body button[class*="rounded-full"][class*="flex"][class*="items-center"] {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  height: 42px !important;
  box-sizing: border-box !important;
  border-radius: 8px !important;
  font-family: var(--devsso-font) !important;
  font-weight: 600 !important;
  font-size: 0.875rem !important;
  cursor: pointer;
  transition: all 0.2s ease;
}

/* Submit / Lanjutkan — matches SSO accent-soft style */
body button[data-testid="submit-button"] {
  min-width: 120px !important;
  padding: 0 20px !important;
  border: none !important;
  box-shadow: none !important;
}
body button[data-testid="submit-button"]:not(:disabled) {
  background: var(--devsso-primary-soft) !important;
  color: var(--devsso-primary) !important;
}
body button[data-testid="submit-button"]:not(:disabled):hover {
  background: rgba(37, 99, 235, 0.18) !important;
}
html.dark body button[data-testid="submit-button"]:not(:disabled):hover {
  background: rgba(96, 165, 250, 0.22) !important;
}
body button[data-testid="submit-button"]:not(:disabled):focus-visible {
  outline: none !important;
  box-shadow: 0 0 0 2px var(--devsso-primary), 0 0 0 4px var(--devsso-ring) !important;
}
body button[data-testid="submit-button"]:disabled {
  background: var(--devsso-primary-soft) !important;
  color: var(--devsso-text-secondary) !important;
  opacity: 0.4 !important;
  cursor: not-allowed;
}

/* Back / Kembali — ghost/outline style */
body button[data-testid="back-button"] {
  min-width: 100px !important;
  padding: 0 20px !important;
  border: 1px solid var(--devsso-border) !important;
  background: transparent !important;
  color: var(--devsso-text) !important;
}
body button[data-testid="back-button"]:hover {
  background: var(--devsso-primary-soft) !important;
  border-color: var(--devsso-primary) !important;
  color: var(--devsso-primary) !important;
}
body button[data-testid="back-button"]:focus-visible {
  outline: none !important;
  box-shadow: 0 0 0 2px var(--devsso-primary), 0 0 0 4px var(--devsso-ring) !important;
}

/* Text link buttons — register, reset, resend */
body button[data-testid="register-button"],
body button[data-testid="reset-button"],
body button[data-testid="resend-button"] {
  padding: 6px 2px !important;
  border: none !important;
  background: transparent !important;
  color: var(--devsso-link) !important;
  font-family: var(--devsso-font) !important;
  font-size: 0.875rem !important;
  font-weight: 600 !important;
  cursor: pointer;
  transition: color 0.2s ease;
}
body button[data-testid="register-button"]:hover,
body button[data-testid="reset-button"]:hover,
body button[data-testid="resend-button"]:hover {
  color: var(--devsso-primary-hover) !important;
}

/* Password button (alternative method) */
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

/* Deny button */
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

/* IDP / Social buttons */
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

/* Link styling */
body a[class*="text-primary"] {
  color: var(--devsso-link) !important;
  font-weight: 600 !important;
}
body a[class*="text-primary"]:hover {
  color: var(--devsso-primary-hover) !important;
}

/* Button container alignment */
body div[class*="max-w-[440px]"] div[class*="flex"][class*="justify-between"],
body div[class*="max-w-[440px]"] div[class*="flex"][class*="items-center"][class*="justify-end"],
body div[class*="max-w-[440px]"] form div[class*="flex"][class*="w-full"]:has(> button[data-testid]) {
  display: flex !important;
  align-items: center !important;
  justify-content: flex-end !important;
  gap: 12px !important;
  margin-top: 8px !important;
}`.trim();
}

function buildUtilityArea() {
  return `
/* Hide the language picker */
body [id^="headlessui-listbox-button-"],
body [id^="headlessui-listbox-options-"],
body [role="listbox"] {
  display: none !important;
}
body div.w-32:has([id^="headlessui-listbox-button-"]) {
  display: none !important;
}

/* Hide ZITADEL's built-in light/dark theme toggle pill selector —
   we use our own #devsso-theme-toggle instead.
   Source: apps/login/src/components/theme-switch.tsx
   Structure: div.flex.space-x-1.p-1 > button.w-8.h-8 (×2)
   The roundness class varies (rounded-full, rounded-lg, etc.) so we
   match on the structural flex+space-x-1+p-1 wrapper only. */
body div[class*="flex"][class*="space-x-1"][class*="p-1"]:has(> button.w-8) {
  display: none !important;
}
/* Fallback: hide any w-8 h-8 sun/moon buttons that survive the :has check */
body div[class*="space-x-1"][class*="p-1"] > button.w-8.h-8 {
  display: none !important;
}

/* Dev-SSO injected theme toggle — pixel-identical to ThemeToggle.tsx */
#devsso-theme-toggle {
  position: fixed !important;
  bottom: 56px !important;
  right: 20px !important;
  z-index: 50 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  width: 36px !important;
  height: 36px !important;
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
/* Footer — real HTML, identical to SignInForm.tsx */
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
  gap: 0 16px !important;
  padding: 16px !important;
  font-family: var(--devsso-font) !important;
  font-size: 11px !important;
  font-weight: 400 !important;
  color: var(--devsso-text-secondary) !important;
  opacity: 0.6 !important;
  letter-spacing: 0.02em !important;
  pointer-events: auto !important;
}

#devsso-footer a {
  color: inherit !important;
  text-decoration: none !important;
  transition: color 0.15s ease !important;
  font-size: inherit !important;
}

#devsso-footer a:hover {
  color: var(--devsso-text-secondary) !important;
  opacity: 1 !important;
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
