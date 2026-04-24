import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const packageFile = new URL("../../services/sso-frontend/package.json", import.meta.url);
const require = createRequire(packageFile);
const { chromium } = require("playwright");

const outputDir = createOutputDirectory();
const summaryPath = join(outputDir, "summary.json");
const result = await runAudit();

writeFileSync(summaryPath, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ outputDir, summaryPath, result }, null, 2));

async function runAudit() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const payload = createPayload();
  page.on("console", (msg) => captureConsoleError(payload.consoleErrors, msg));
  page.on("pageerror", (err) => payload.pageErrors.push(String(err.message || err)));

  try {
    await page.goto("https://dev-sso.timeh.my.id/auth/login", navOptions());
    await page.waitForURL(/id\.dev-sso\.timeh\.my\.id\/ui\/v2\/login\//, navOptions());
    await page.waitForLoadState("networkidle");

    payload.initial = await readSnapshot(page);
    payload.screenshotInitial = join(outputDir, "language-initial-id.png");
    await page.screenshot({ path: payload.screenshotInitial, fullPage: true });
    await selectLanguage(page, "English", "Sign in to Dev-SSO");
    payload.english = await readSnapshot(page);
    payload.screenshotEnglish = join(outputDir, "language-en.png");
    await page.screenshot({ path: payload.screenshotEnglish, fullPage: true });
    await selectLanguage(page, "Bahasa Indonesia", "Masuk ke Dev-SSO");
    payload.indonesian = await readSnapshot(page);
    payload.screenshotIndonesian = join(outputDir, "language-id.png");
    await page.screenshot({ path: payload.screenshotIndonesian, fullPage: true });

    assertPayload(payload);
    return payload;
  } finally {
    await browser.close();
  }
}

async function selectLanguage(page, label, expectedTitle) {
  await languageButton(page).click();
  await page.locator('[role="option"]', { hasText: label }).click();
  await page.waitForFunction((title) => document.title === title, expectedTitle, {
    timeout: 120000,
  });
  await page.waitForTimeout(600);
}

function languageButton(page) {
  return page.locator('[id^="headlessui-listbox-button-"]').first();
}

async function readSnapshot(page) {
  return await page.evaluate(() => {
    const title = document.title;
    const heading = document.querySelector("h1")?.textContent?.trim() || "";
    const description = document.querySelector("p.ztdl-p")?.textContent?.trim() || "";
    const label = document.querySelector("label span")?.textContent?.trim() || "";
    const currentLanguage =
      document.querySelector('[id^="headlessui-listbox-button-"]')?.textContent?.replace(/\s+/g, " ").trim() ||
      "";

    return { title, heading, description, label, currentLanguage };
  });
}

function assertPayload(payload) {
  assertEmpty("consoleErrors", payload.consoleErrors);
  assertEmpty("pageErrors", payload.pageErrors);
  assertValue("initial.title", payload.initial.title, "Masuk ke Dev-SSO");
  assertValue("english.title", payload.english.title, "Sign in to Dev-SSO");
  assertValue("english.heading", payload.english.heading, "Sign in to Dev-SSO");
  assertValue("english.description", payload.english.description, "Use your account to sign in securely.");
  assertValue("english.label", payload.english.label, "Email or username");
  assertIncludes("english.currentLanguage", payload.english.currentLanguage, "English");
  assertValue("indonesian.title", payload.indonesian.title, "Masuk ke Dev-SSO");
  assertValue("indonesian.heading", payload.indonesian.heading, "Masuk ke Dev-SSO");
  assertValue(
    "indonesian.description",
    payload.indonesian.description,
    "Gunakan akun Anda untuk masuk dengan aman.",
  );
  assertValue("indonesian.label", payload.indonesian.label, "Email atau username");
  assertIncludes("indonesian.currentLanguage", payload.indonesian.currentLanguage, "Bahasa Indonesia");
}

function assertValue(label, actual, expected) {
  if (actual !== expected) {
    throw new Error(`${label} mismatch: expected "${expected}" but got "${actual}"`);
  }
}

function assertIncludes(label, actual, expected) {
  if (!actual.includes(expected)) {
    throw new Error(`${label} must include "${expected}" but got "${actual}"`);
  }
}

function assertEmpty(label, values) {
  if (values.length > 0) {
    throw new Error(`${label} must be empty: ${JSON.stringify(values)}`);
  }
}

function captureConsoleError(target, message) {
  if (message.type() === "error") {
    target.push(message.text());
  }
}

function createPayload() {
  return {
    initial: null,
    english: null,
    indonesian: null,
    consoleErrors: [],
    pageErrors: [],
    screenshotInitial: "",
    screenshotEnglish: "",
    screenshotIndonesian: "",
  };
}

function createOutputDirectory() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const output = join(
    new URL("../../test-results/", import.meta.url).pathname,
    `hosted-login-language-toggle-${stamp}`,
  );
  mkdirSync(output, { recursive: true });
  return output;
}

function navOptions() {
  return { waitUntil: "domcontentloaded", timeout: 120000 };
}
