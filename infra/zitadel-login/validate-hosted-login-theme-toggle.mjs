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

    const toggle = devssoToggle(page);

    await toggle.click();
    await page.waitForTimeout(400);
    payload.afterFirstClick = await readThemeSnapshot(page);

    await toggle.click();
    await page.waitForTimeout(400);
    payload.afterSecondClick = await readThemeSnapshot(page);

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
    const toggleHost = document.getElementById("devsso-theme-float");
    const footer = document.getElementById("devsso-footer");
    const card = document.querySelector('body div[class*="max-w-[440px]"] > div:first-child');
    const visibleThemeToggleCount = [...document.querySelectorAll("button")].filter((button) => {
      const rect = button.getBoundingClientRect();
      const style = getComputedStyle(button);
      const isVisible = rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
      const label = `${button.id} ${button.getAttribute("aria-label") || ""} ${button.getAttribute("title") || ""}`;
      return isVisible && /devsso-theme-toggle|theme|dark|light/i.test(label);
    }).length;
    const toggleRect = toggle?.getBoundingClientRect();
    const footerRect = footer?.getBoundingClientRect();
    const cardRect = card?.getBoundingClientRect();

    return {
      htmlClass: html.className,
      dataTheme: html.getAttribute("data-theme") || "",
      hasDarkClass: html.classList.contains("dark"),
      wrapperBackgroundImage: wrapper ? getComputedStyle(wrapper).backgroundImage : null,
      wrapperColor: wrapper ? getComputedStyle(wrapper).color : null,
      titleSize: title ? getComputedStyle(title).fontSize : null,
      titleText: title ? title.textContent.trim() : "",
      footerText: footer ? footer.innerText.replace(/\s+/g, " ").trim() : "",
      togglePresent: !!toggle,
      toggleHostPresent: !!toggleHost,
      toggleHostPosition: toggleHost ? getComputedStyle(toggleHost).position : null,
      toggleWidth: toggle ? getComputedStyle(toggle).width : null,
      toggleHeight: toggle ? getComputedStyle(toggle).height : null,
      toggleDisplay: toggle ? getComputedStyle(toggle).display : null,
      toggleOverlapsFooter: overlaps(toggleRect, footerRect),
      toggleOverlapsCard: overlaps(toggleRect, cardRect),
      visibleThemeToggleCount,
    };
  });
}

function overlaps(a, b) {
  if (!a || !b) {
    return false;
  }

  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function assertSnapshots(payload) {
  assertEmpty("consoleErrors", payload.consoleErrors);
  assertEmpty("pageErrors", payload.pageErrors);
  assertValue("light.dataTheme", payload.light.dataTheme, "light");
  assertValue("dark.dataTheme", payload.dark.dataTheme, "dark");
  assertIncludes("dark.htmlClass", payload.dark.htmlClass, "dark");
  assertNotEqual("wrapper color light/dark", payload.light.wrapperColor, payload.dark.wrapperColor);
  assertValue("light.togglePresent", payload.light.togglePresent, true);
  assertValue("dark.togglePresent", payload.dark.togglePresent, true);
  assertValue("light.toggleHostPresent", payload.light.toggleHostPresent, true);
  assertValue("dark.toggleHostPresent", payload.dark.toggleHostPresent, true);
  assertValue("light.toggleHostPosition", payload.light.toggleHostPosition, "fixed");
  assertValue("dark.toggleHostPosition", payload.dark.toggleHostPosition, "fixed");
  assertValue("light.toggleDisplay", payload.light.toggleDisplay, "flex");
  assertValue("dark.toggleDisplay", payload.dark.toggleDisplay, "flex");
  assertValue("light.visibleThemeToggleCount", payload.light.visibleThemeToggleCount, 1);
  assertValue("dark.visibleThemeToggleCount", payload.dark.visibleThemeToggleCount, 1);
  assertValue("light.footerText", payload.light.footerText, "© 2026 Dev-SSO . Terms . Privacy . Docs");
  assertValue("dark.footerText", payload.dark.footerText, "© 2026 Dev-SSO . Terms . Privacy . Docs");
  assertValue("light.toggleOverlapsFooter", payload.light.toggleOverlapsFooter, false);
  assertValue("dark.toggleOverlapsFooter", payload.dark.toggleOverlapsFooter, false);
  assertValue("light.toggleOverlapsCard", payload.light.toggleOverlapsCard, false);
  assertValue("dark.toggleOverlapsCard", payload.dark.toggleOverlapsCard, false);
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
