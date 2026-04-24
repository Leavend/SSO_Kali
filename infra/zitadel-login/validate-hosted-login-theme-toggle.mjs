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
    await applyLocaleCookie(page);
    await page.goto("https://dev-sso.timeh.my.id/auth/login", navOptions());
    await page.waitForURL(/id\.dev-sso\.timeh\.my\.id\/ui\/v2\/login\//, navOptions());
    await page.waitForLoadState("networkidle");

    payload.before = await readThemeSnapshot(page);

    // Use our custom #devsso-theme-toggle (ZITADEL's built-in is hidden)
    const toggle = devssoToggle(page);

    // Click toggle to switch theme
    await toggle.click();
    await page.waitForTimeout(400);
    payload.afterFirstClick = await readThemeSnapshot(page);

    // Click again to switch back
    await toggle.click();
    await page.waitForTimeout(400);
    payload.afterSecondClick = await readThemeSnapshot(page);

    // Determine which snapshot is light/dark by checking data-theme
    if (payload.afterFirstClick.dataTheme === "light") {
      payload.light = payload.afterFirstClick;
      payload.dark = payload.afterSecondClick;
    } else {
      payload.dark = payload.afterFirstClick;
      payload.light = payload.afterSecondClick;
    }

    payload.screenshotLight = join(outputDir, "theme-light.png");
    payload.screenshotDark = join(outputDir, "theme-dark.png");
    // Ensure we're in light for screenshot
    if ((await readThemeSnapshot(page)).dataTheme !== "light") {
      await toggle.click();
      await page.waitForTimeout(300);
    }
    await page.screenshot({ path: payload.screenshotLight, fullPage: true });
    await toggle.click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: payload.screenshotDark, fullPage: true });

    assertSnapshots(payload);
    return payload;
  } finally {
    await browser.close();
  }
}

async function applyLocaleCookie(page) {
  await page.context().addCookies([
    {
      name: "NEXT_LOCALE",
      value: "id",
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

function devssoToggle(page) {
  return page.locator("#devsso-theme-toggle");
}

async function readThemeSnapshot(page) {
  return await page.evaluate(() => {
    const html = document.documentElement;
    const wrapper = document.querySelector('body div[class*="min-h-screen"]');
    const title = document.querySelector("h1");
    const toggle = document.getElementById("devsso-theme-toggle");

    return {
      htmlClass: html.className,
      dataTheme: html.getAttribute("data-theme") || "",
      theme: localStorage.getItem("sso-theme"),
      hasDarkClass: html.classList.contains("dark"),
      wrapperBackgroundImage: wrapper ? getComputedStyle(wrapper).backgroundImage : null,
      wrapperColor: wrapper ? getComputedStyle(wrapper).color : null,
      titleSize: title ? getComputedStyle(title).fontSize : null,
      titleText: title ? title.textContent.trim() : "",
      togglePresent: !!toggle,
      toggleWidth: toggle ? getComputedStyle(toggle).width : null,
      toggleHeight: toggle ? getComputedStyle(toggle).height : null,
      toggleDisplay: toggle ? getComputedStyle(toggle).display : null,
    };
  });
}

function assertSnapshots(payload) {
  assertEmpty("consoleErrors", payload.consoleErrors);
  assertEmpty("pageErrors", payload.pageErrors);
  assertValue("light.theme", payload.light.theme, "light");
  assertValue("dark.theme", payload.dark.theme, "dark");
  assertIncludes("dark.htmlClass", payload.dark.htmlClass, "dark");
  assertNotEqual(
    "wrapper background light/dark",
    payload.light.wrapperBackgroundImage,
    payload.dark.wrapperBackgroundImage,
  );
  // Verify our custom toggle is present and visible
  assertValue("light.togglePresent", payload.light.togglePresent, true);
  assertValue("dark.togglePresent", payload.dark.togglePresent, true);
  assertValue("light.toggleDisplay", payload.light.toggleDisplay, "flex");
  assertValue("dark.toggleDisplay", payload.dark.toggleDisplay, "flex");
  assertToggleSizing(payload.light);
  assertToggleSizing(payload.dark);
}

function assertValue(label, actual, expected) {
  if (actual !== expected) {
    throw new Error(`${label} mismatch: expected "${expected}" but got "${actual}"`);
  }
}

function assertIncludes(label, actual, expected) {
  if (!actual.includes(expected)) {
    throw new Error(`${label} must include "${expected}"`);
  }
}

function assertNotEqual(label, left, right) {
  if (left === right) {
    throw new Error(`${label} must differ`);
  }
}

function assertEmpty(label, values) {
  if (values.length > 0) {
    throw new Error(`${label} must be empty: ${JSON.stringify(values)}`);
  }
}

function assertToggleSizing(snapshot) {
  assertMinPx("toggleWidth", snapshot.toggleWidth, 30);
  assertMinPx("toggleHeight", snapshot.toggleHeight, 30);
}

function assertMinPx(label, value, expected) {
  const parsed = parseFloat(value || "0");
  if (parsed < expected) {
    throw new Error(`${label} must be at least ${expected}px but got ${value}`);
  }
}

function assertMaxPx(label, value, expected) {
  const parsed = parseFloat(value || "0");
  if (parsed > expected) {
    throw new Error(`${label} must be at most ${expected}px but got ${value}`);
  }
}

function captureConsoleError(target, message) {
  if (message.type() === "error") {
    target.push(message.text());
  }
}

function createPayload() {
  return {
    before: null,
    afterFirstClick: null,
    afterSecondClick: null,
    light: null,
    dark: null,
    consoleErrors: [],
    pageErrors: [],
    screenshotLight: "",
    screenshotDark: "",
  };
}

function createOutputDirectory() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const output = join(
    new URL("../../test-results/", import.meta.url).pathname,
    `hosted-login-theme-toggle-${stamp}`,
  );
  mkdirSync(output, { recursive: true });
  return output;
}
