#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

export function parseSetCookieHeader(header) {
  const [nameValue, ...attributeParts] = splitHeader(header);
  const [name, ...valueParts] = nameValue.split("=");
  const value = valueParts.join("=");

  if (!name || valueParts.length === 0) {
    throw new Error("Invalid Set-Cookie header.");
  }

  const attributes = Object.fromEntries(
    attributeParts.map((part) => parseAttribute(part)),
  );

  return {
    attributes,
    name,
    raw: header,
    value,
  };
}

export function validateHostCookieCompliance(cookie, options = {}) {
  const allowSameSite = options.allowSameSite ?? ["lax", "strict"];
  const issues = [];

  if (!cookie.name.startsWith("__Host-")) {
    issues.push("cookie name must start with __Host-");
  }

  if (options.expectedName && cookie.name !== options.expectedName) {
    issues.push(`cookie name must be ${options.expectedName}`);
  }

  if (!hasBooleanAttribute(cookie, "secure")) {
    issues.push("Secure attribute is required");
  }

  if (options.requireHttpOnly !== false && !hasBooleanAttribute(cookie, "httponly")) {
    issues.push("HttpOnly attribute is required");
  }

  if (attributeValue(cookie, "path") !== "/") {
    issues.push("Path must be /");
  }

  if (attributeValue(cookie, "domain") !== null) {
    issues.push("Domain attribute must be omitted");
  }

  const sameSite = attributeValue(cookie, "samesite");

  if (sameSite === null || !allowSameSite.includes(sameSite.toLowerCase())) {
    issues.push(`SameSite must be one of: ${allowSameSite.join(", ")}`);
  }

  if (options.expectExpired === true && !isExpired(cookie)) {
    issues.push("Cookie must be expired via Max-Age=0 or past Expires");
  }

  return issues;
}

export async function assertHostCookieFromUrl(options) {
  const response = await fetch(options.url, {
    headers: options.headers ?? {},
    method: options.method ?? "GET",
    redirect: "manual",
  });
  const setCookies = readSetCookies(response.headers);
  const header = setCookies.find((item) => item.startsWith(`${options.cookieName}=`));

  if (header === undefined) {
    throw new Error(`Cookie ${options.cookieName} was not found.`);
  }

  const parsed = parseSetCookieHeader(header);
  const issues = validateHostCookieCompliance(parsed, {
    allowSameSite: options.allowSameSite,
    expectExpired: options.expectExpired,
    expectedName: options.cookieName,
    requireHttpOnly: options.requireHttpOnly,
  });

  if (issues.length > 0) {
    throw new Error(issues.join("; "));
  }

  return {
    cookie: parsed,
    status: response.status,
    url: options.url,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await assertHostCookieFromUrl(options);

  if (options.reportFile) {
    writeReport(options.reportFile, result);
  }

  process.stdout.write(
    `[assert-host-cookie-header] OK ${result.cookie.name} ${options.method ?? "GET"} ${options.url}\n`,
  );
}

function parseArgs(argv) {
  const options = {
    allowSameSite: ["lax", "strict"],
    headers: {},
    requireHttpOnly: true,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const value = argv[index + 1];

    if (token === "--url") {
      options.url = requiredValue(token, value);
      index += 1;
      continue;
    }

    if (token === "--cookie-name") {
      options.cookieName = requiredValue(token, value);
      index += 1;
      continue;
    }

    if (token === "--method") {
      options.method = requiredValue(token, value).toUpperCase();
      index += 1;
      continue;
    }

    if (token === "--header") {
      const header = requiredValue(token, value);
      const [name, ...rest] = header.split(":");
      options.headers[name.trim()] = rest.join(":").trim();
      index += 1;
      continue;
    }

    if (token === "--allow-samesite") {
      options.allowSameSite = requiredValue(token, value)
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);
      index += 1;
      continue;
    }

    if (token === "--expect-expired") {
      options.expectExpired = true;
      continue;
    }

    if (token === "--allow-no-httponly") {
      options.requireHttpOnly = false;
      continue;
    }

    if (token === "--report-file") {
      options.reportFile = requiredValue(token, value);
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${token}`);
  }

  if (!options.url || !options.cookieName) {
    throw new Error("--url and --cookie-name are required.");
  }

  return options;
}

function requiredValue(flag, value) {
  if (!value) {
    throw new Error(`Missing value for ${flag}`);
  }

  return value;
}

function splitHeader(header) {
  return header
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function parseAttribute(part) {
  const [name, ...valueParts] = part.split("=");

  if (valueParts.length === 0) {
    return [name.toLowerCase(), true];
  }

  return [name.toLowerCase(), valueParts.join("=")];
}

function hasBooleanAttribute(cookie, name) {
  return cookie.attributes[name] === true;
}

function attributeValue(cookie, name) {
  const value = cookie.attributes[name];

  return typeof value === "string" ? value : null;
}

function isExpired(cookie) {
  const maxAge = attributeValue(cookie, "max-age");

  if (maxAge === "0") {
    return true;
  }

  const expires = attributeValue(cookie, "expires");

  if (expires === null) {
    return false;
  }

  return Number.isNaN(Date.parse(expires)) ? false : Date.parse(expires) <= Date.now();
}

function readSetCookies(headers) {
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }

  const header = headers.get("set-cookie");

  return header ? [header] : [];
}

function writeReport(reportFile, result) {
  const file = path.resolve(reportFile);

  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(result, null, 2), "utf8");
}

if (isCliEntry()) {
  main().catch((error) => {
    process.stderr.write(`[assert-host-cookie-header][ERROR] ${error.message}\n`);
    process.exitCode = 1;
  });
}

function isCliEntry() {
  return process.argv[1] !== undefined
    && import.meta.url === pathToFileURL(process.argv[1]).href;
}
