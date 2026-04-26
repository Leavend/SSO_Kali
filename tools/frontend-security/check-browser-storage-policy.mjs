#!/usr/bin/env node

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const BLOCKED_MATCHERS = [
  {
    name: "localstorage-write",
    pattern: /\blocalStorage\.setItem\s*\(/,
  },
  {
    name: "sessionstorage-write",
    pattern: /\bsessionStorage\.setItem\s*\(/,
  },
  {
    name: "document-cookie-write",
    pattern: /\bdocument\.cookie\s*=/,
  },
];

const ALLOWED_FILES = [
  /\.env(?:\.example)?$/,
  /eslint\.config\.(?:js|mjs|cjs)$/,
  /next\.config\.(?:js|mjs|ts)$/,
  /package\.json$/,
  /\.(?:ts|tsx|js|jsx|mjs|cjs)$/,
];

const IGNORED_DIRS = new Set([
  ".codex-temp",
  ".git",
  ".next",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "test-results",
]);

const IGNORED_FILES = [/\.test\./, /\.spec\./];

function main() {
  const root = path.resolve(process.argv[2] ?? process.cwd());
  const violations = scanTree(root);

  if (violations.length === 0) {
    process.stdout.write(`Browser storage policy OK: ${root}\n`);
    return;
  }

  process.stderr.write(formatViolations(root, violations));
  process.exitCode = 1;
}

function scanTree(root) {
  return walk(root).flatMap((file) => scanFile(root, file));
}

function walk(entry) {
  if (shouldIgnoreDir(entry)) {
    return [];
  }

  if (statSync(entry).isDirectory()) {
    return readdirSync(entry).flatMap((name) => walk(path.join(entry, name)));
  }

  return shouldScanFile(entry) ? [entry] : [];
}

function shouldIgnoreDir(entry) {
  if (!statSync(entry).isDirectory()) {
    return false;
  }

  const dirname = path.basename(entry);

  return IGNORED_DIRS.has(dirname) || dirname.startsWith("node_modules.");
}

function shouldScanFile(file) {
  return ALLOWED_FILES.some((rule) => rule.test(file)) && !IGNORED_FILES.some((rule) => rule.test(file));
}

function scanFile(root, file) {
  const content = readFileSync(file, "utf8");

  return BLOCKED_MATCHERS.flatMap((matcher) => matchViolation(root, file, content, matcher));
}

function matchViolation(root, file, content, matcher) {
  const hit = content.match(matcher.pattern);

  if (!hit || hit.index === undefined) {
    return [];
  }

  return [{
    file: path.relative(root, file),
    line: lineNumber(content, hit.index),
    rule: matcher.name,
    snippet: hit[0],
  }];
}

function lineNumber(content, index) {
  return content.slice(0, index).split("\n").length;
}

function formatViolations(root, violations) {
  const header = `Browser storage policy violation(s) in ${root}\n`;
  const lines = violations.map(formatViolation).join("\n");

  return `${header}${lines}\n`;
}

function formatViolation(violation) {
  return `- ${violation.file}:${violation.line} [${violation.rule}] ${violation.snippet}`;
}

main();
