import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const packageFile = new URL("../../services/sso-frontend/package.json", import.meta.url);
const require = createRequire(packageFile);
const { chromium, devices } = require("playwright");

const viewports = [
  createViewport("iphone-se", devices["iPhone SE"]),
  createViewport("ipad-mini", devices["iPad Mini"]),
  createViewport("desktop", {
    viewport: { width: 1440, height: 960 },
    userAgent: devices["Desktop Chrome"].userAgent,
  }),
];

const outputDir = createOutputDirectory();
const results = await runAudit();
const summaryPath = join(outputDir, "summary.json");

writeFileSync(summaryPath, JSON.stringify(results, null, 2));
console.log(JSON.stringify({ outputDir, summaryPath, results }, null, 2));

async function runAudit() {
  const browser = await chromium.launch({ headless: true });
  try {
    const rows = [];
    for (const viewport of viewports) {
      rows.push(await inspectViewport(browser, viewport));
    }
    return rows;
  } finally {
    await browser.close();
  }
}

async function inspectViewport(browser, viewport) {
  const context = await browser.newContext(viewport.options);
  const page = await context.newPage();
  const payload = createPayload(viewport.name);
  page.on("console", (msg) => captureConsoleError(payload.consoleErrors, msg));
  page.on("pageerror", (err) => payload.pageErrors.push(String(err.message || err)));
  try {
    await applyLocaleCookie(context);
    await page.goto("https://dev-sso.timeh.my.id/auth/login", navOptions());
    await page.waitForURL(/id\.dev-sso\.timeh\.my\.id\/ui\/v2\/login\//, navOptions());
    await page.waitForLoadState("networkidle");
    await captureLayout(page, payload);
    assertViewportPayload(payload);
    return payload;
  } finally {
    await context.close();
  }
}

async function applyLocaleCookie(context) {
  await context.addCookies([
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

async function captureLayout(page, payload) {
  payload.card = await page.locator('body div[class*="max-w-[440px]"] > div').first().boundingBox();
  payload.viewport = await page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
  }));
  payload.screenshot = join(outputDir, `${payload.name}.png`);
  await page.screenshot({ path: payload.screenshot, fullPage: true });
}

function assertViewportPayload(payload) {
  assertTruthy(`${payload.name}.card`, payload.card);
  assertNoErrors(`${payload.name}.consoleErrors`, payload.consoleErrors);
  assertNoErrors(`${payload.name}.pageErrors`, payload.pageErrors);
  assertFitsViewport(payload);
}

function assertFitsViewport(payload) {
  const rightEdge = payload.card.x + payload.card.width;
  const bottomEdge = payload.card.y + payload.card.height;
  if (payload.viewport.scrollWidth > payload.viewport.width) {
    throw new Error(`${payload.name} has horizontal overflow`);
  }
  if (rightEdge > payload.viewport.width + 1) {
    throw new Error(`${payload.name} card exceeds viewport width`);
  }
  if (bottomEdge > payload.viewport.scrollHeight + 1) {
    throw new Error(`${payload.name} card exceeds document height`);
  }
}

function assertNoErrors(label, values) {
  if (values.length > 0) {
    throw new Error(`${label} must be empty: ${JSON.stringify(values)}`);
  }
}

function assertTruthy(label, value) {
  if (!value) {
    throw new Error(`${label} is missing`);
  }
}

function captureConsoleError(target, message) {
  if (message.type() === "error") {
    target.push(message.text());
  }
}

function createViewport(name, options) {
  return { name, options };
}

function createPayload(name) {
  return {
    name,
    card: null,
    viewport: null,
    consoleErrors: [],
    pageErrors: [],
    screenshot: "",
  };
}

function createOutputDirectory() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const output = join(
    new URL("../../test-results/", import.meta.url).pathname,
    `hosted-login-responsive-${stamp}`,
  );
  mkdirSync(output, { recursive: true });
  return output;
}
