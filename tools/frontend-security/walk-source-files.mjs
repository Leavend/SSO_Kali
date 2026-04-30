import { readdirSync, statSync } from "node:fs";
import path from "node:path";

const DEFAULT_IGNORED_DIRS = [
  ".codex-temp",
  ".git",
  ".next",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "test-results",
];

export function walkSourceFiles(root, options) {
  return walk(root, {
    ...options,
    ignoredDirs: new Set([...DEFAULT_IGNORED_DIRS, ...(options.ignoredDirs ?? [])]),
  });
}

function walk(entry, options) {
  const stats = statSync(entry, { throwIfNoEntry: false });
  if (!stats || shouldIgnoreDir(entry, stats, options.ignoredDirs)) return [];
  if (stats.isDirectory()) {
    return readDir(entry).flatMap((name) => walk(path.join(entry, name), options));
  }
  return shouldScanFile(entry, options) ? [entry] : [];
}

function shouldIgnoreDir(entry, stats, ignoredDirs) {
  if (!stats.isDirectory()) return false;
  const dirname = path.basename(entry);
  return ignoredDirs.has(dirname) || dirname.startsWith("node_modules");
}

function shouldScanFile(file, options) {
  return options.allowedFiles.some((rule) => rule.test(file))
    && !options.ignoredFiles.some((rule) => rule.test(file));
}

function readDir(entry) {
  try {
    return readdirSync(entry);
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    throw error;
  }
}
