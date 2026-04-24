import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const rootDir = new URL("../../", import.meta.url);
const contractFile = new URL("./login-experience-contract.json", import.meta.url);
const packageFile = new URL("../../services/sso-frontend/package.json", import.meta.url);
const require = createRequire(packageFile);
const { chromium } = require("playwright");

const locales = ["id", "en"];
const contract = JSON.parse(readFileSync(contractFile, "utf8"));
const outputDir = createOutputDirectory();

const results = await runAudit();
const summaryFile = join(outputDir, "summary.json");

writeFileSync(summaryFile, JSON.stringify(results, null, 2));
console.log(JSON.stringify({ outputDir, summaryFile, results }, null, 2));

async function runAudit() {
  const browser = await chromium.launch({ headless: true });
  try {
    const results = [];
    for (const locale of locales) {
      results.push(await inspectLocale(browser, locale));
    }
    return results;
  } finally {
    await browser.close();
  }
}

async function inspectLocale(browser, locale) {
  const page = await browser.newPage();
  const payload = createPayload(locale);
  page.on("console", (msg) => pushConsoleError(payload.consoleErrors, msg));
  page.on("pageerror", (error) => payload.pageErrors.push(String(error.message || error)));
  try {
    await applyLocaleCookie(page, locale);
    await page.goto("https://dev-sso.timeh.my.id/auth/login", navOptions());
    await page.waitForURL(/id\.dev-sso\.timeh\.my\.id\/ui\/v2\/login\//, navOptions());
    await page.waitForLoadState("networkidle");
    await collectPagePayload(page, payload);
    assertContract(locale, payload);
    return payload;
  } finally {
    await page.close();
  }
}

async function applyLocaleCookie(page, locale) {
  await page.context().addCookies([
    {
      name: "NEXT_LOCALE",
      value: locale,
      domain: "id.dev-sso.timeh.my.id",
      path: "/",
      secure: true,
      sameSite: "Lax",
    },
  ]);
}

function navOptions() {
  return { waitUntil: "domcontentloaded", timeout: 120000 };
}

async function collectPagePayload(page, payload) {
  const trigger = page.getByRole("button", { name: /Bahasa Indonesia|English/i }).last();
  await trigger.click();
  await page.waitForTimeout(400);

  payload.title = await page.title();
  payload.heading = await textFor(page, "heading");
  payload.description = await textFor(page, "description");
  payload.label = await textFor(page, "label");
  payload.register = await textFor(page, "register");
  payload.back = await textFor(page, "back");
  payload.submit = await textFor(page, "submit");
  payload.languages = await visibleLanguages(page);
  payload.footer = await page.locator("#devsso-footer").innerText().then((text) => text.replace(/\s+/g, " ").trim());
  payload.visibleThemeToggleCount = await visibleThemeToggleCount(page);
  await page.screenshot({ path: payload.screenshot, fullPage: true });
}

async function textFor(page, key) {
  const selectors = selectorMap()[key];
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.count()) {
      const value = (await locator.innerText()).trim();
      if (value) {
        return value;
      }
    }
  }
  return "";
}

function selectorMap() {
  return {
    heading: ["h1", "main h1", "form h1"],
    description: ["p", "main p"],
    label: ["label", "main label"],
    register: ["text=Daftar Sekarang", "text=Register Now"],
    back: ["button:has-text(\"Kembali\")", "button:has-text(\"Back\")"],
    submit: ["button:has-text(\"Lanjutkan\")", "button:has-text(\"Continue\")"],
  };
}

async function visibleLanguages(page) {
  const text = await page.locator("body").innerText();
  return knownLanguages().filter((label) => text.includes(label));
}

async function visibleThemeToggleCount(page) {
  return await page.evaluate(() => {
    return [...document.querySelectorAll("button")].filter((button) => {
      const rect = button.getBoundingClientRect();
      const style = getComputedStyle(button);
      const isVisible = rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
      const label = `${button.id} ${button.getAttribute("aria-label") || ""} ${button.getAttribute("title") || ""}`;
      return isVisible && /devsso-theme-toggle|theme|dark|light/i.test(label);
    }).length;
  });
}

function knownLanguages() {
  return [
    "Bahasa Indonesia",
    "English",
    "Deutsch",
    "Italiano",
    "Español",
    "Français",
    "Nederlands",
    "Polski",
    "简体中文",
    "Русский",
    "Türkçe",
    "日本語",
    "Українська",
    "العربية",
  ];
}

function pushConsoleError(target, message) {
  if (message.type() === "error") {
    target.push(message.text());
  }
}

function assertContract(locale, payload) {
  const expected = contract[locale];
  assertEqual(`${locale}.title`, payload.title, expected.title);
  assertEqual(`${locale}.heading`, payload.heading, expected.heading);
  assertEqual(`${locale}.description`, payload.description, expected.description);
  assertEqual(`${locale}.label`, payload.label, expected.label);
  assertEqual(`${locale}.register`, payload.register, expected.register);
  assertEqual(`${locale}.back`, payload.back, expected.back);
  assertEqual(`${locale}.submit`, payload.submit, expected.submit);
  assertArray(`${locale}.languages`, payload.languages, expected.languages);
  assertEqual(`${locale}.footer`, payload.footer, "© 2026 Dev-SSO . Terms . Privacy . Docs");
  assertEqual(`${locale}.visibleThemeToggleCount`, payload.visibleThemeToggleCount, 1);
  assertArray(`${locale}.consoleErrors`, payload.consoleErrors, []);
  assertArray(`${locale}.pageErrors`, payload.pageErrors, []);
}

function assertEqual(label, actual, expected) {
  if (actual !== expected) {
    throw new Error(`${label} mismatch: expected "${expected}" but got "${actual}"`);
  }
}

function assertArray(label, actual, expected) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} mismatch: expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
  }
}

function createOutputDirectory() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outputDir = join(rootDir.pathname, "test-results", `hosted-login-smoke-${stamp}`);
  mkdirSync(outputDir, { recursive: true });
  return outputDir;
}

function screenshotPath(locale) {
  return join(outputDir, `login-${locale}.png`);
}

function createPayload(locale) {
  return {
    locale,
    title: "",
    heading: "",
    description: "",
    label: "",
    register: "",
    back: "",
    submit: "",
    languages: [],
    footer: "",
    visibleThemeToggleCount: 0,
    consoleErrors: [],
    pageErrors: [],
    screenshot: screenshotPath(locale),
  };
}
