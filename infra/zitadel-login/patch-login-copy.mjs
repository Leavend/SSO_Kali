import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  directReplacements,
  fallbackErrorCatalog,
  fallbackLocale,
  literalReplacements,
  localeExactValueReplacements,
  localeErrorCatalog,
  localeMarkers,
  translationValueReplacements,
} from "./login-copy-catalog.mjs";
import { residualExactValueReplacements } from "./login-copy-residual.mjs";

const root = process.argv[2];

if (!root) {
  throw new Error("Expected the extracted login bundle path as the first argument.");
}

let changedFiles = 0;
let matchedRegisterCopy = false;

walk(root);
assertRegisterCopy();
console.log(`Patched login bundle copy in ${changedFiles} file(s).`);

function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const location = join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(location);
      continue;
    }
    if (entry.isFile() && location.endsWith(".js")) {
      patchFile(location);
    }
  }
}

function patchFile(location) {
  const original = readFileSync(location, "utf8");
  const translated = patchTranslationChunk(original);
  const patched = applyStringReplacements(translated);
  if (patched === original) {
    return;
  }
  matchedRegisterCopy ||= patched.includes("couldNotRegisterUser");
  writeFileSync(location, patched);
  changedFiles += 1;
}

function patchTranslationChunk(source) {
  const extracted = extractJsonLiteral(source);
  if (!extracted) {
    return source;
  }
  const messages = JSON.parse(decodeLiteral(extracted.literal));
  const locale = detectLocale(messages);
  const catalog = resolveCatalog(messages);
  const exactValueReplacements = [
    ...(localeExactValueReplacements[locale] ?? []),
    ...residualExactValueReplacements,
  ];
  const catalogChanged = applyCatalog(messages, catalog);
  const exactChanged = applyExactValueReplacements(messages, exactValueReplacements);
  const brandChanged = applyValueReplacements(messages, translationValueReplacements);
  if (!catalogChanged && !exactChanged && !brandChanged) {
    return source;
  }
  return extracted.prefix + encodeLiteral(JSON.stringify(messages)) + extracted.suffix;
}

function extractJsonLiteral(source) {
  const marker = "a.exports=JSON.parse('";
  const start = source.indexOf(marker);
  const end = source.lastIndexOf("')");
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }
  return {
    literal: source.slice(start + marker.length, end),
    prefix: source.slice(0, start + marker.length),
    suffix: source.slice(end),
  };
}

function decodeLiteral(value) {
  return Function(`"use strict";return '${value}';`)();
}

function encodeLiteral(value) {
  return JSON.stringify(value).slice(1, -1).replaceAll("'", "\\'");
}

function resolveCatalog(messages) {
  const locale = detectLocale(messages);
  const localeCatalog = localeErrorCatalog[locale] ?? {};
  return { ...fallbackErrorCatalog, ...localeCatalog };
}

function detectLocale(messages) {
  const title = messages?.common?.title ?? messages?.loginname?.title ?? "";
  for (const [locale, markers] of Object.entries(localeMarkers)) {
    if (markers.includes(title)) {
      return locale;
    }
  }
  return fallbackLocale;
}

function applyCatalog(node, catalog) {
  if (!isPlainObject(node)) {
    return false;
  }
  let changed = false;
  for (const [key, value] of Object.entries(node)) {
    if (typeof value === "string" && catalog[key]) {
      if (replaceKey(node, key, catalog[key])) {
        changed = true;
      }
      continue;
    }
    if (applyCatalog(value, catalog)) {
      changed = true;
    }
  }
  return changed;
}

function replaceKey(target, key, message) {
  if (target[key] === message) {
    return false;
  }
  target[key] = message;
  return true;
}

function applyValueReplacements(node, replacements) {
  if (Array.isArray(node)) {
    let changed = false;
    for (let index = 0; index < node.length; index += 1) {
      const value = node[index];
      if (typeof value === "string") {
        const nextValue = replaceValue(value, replacements);
        if (nextValue !== value) {
          node[index] = nextValue;
          changed = true;
        }
        continue;
      }
      if (isPlainObject(value) || Array.isArray(value)) {
        changed = applyValueReplacements(value, replacements) || changed;
      }
    }
    return changed;
  }

  if (!isPlainObject(node)) {
    return false;
  }

  let changed = false;
  for (const [key, value] of Object.entries(node)) {
    if (typeof value === "string") {
      const nextValue = replaceValue(value, replacements);
      if (nextValue !== value) {
        node[key] = nextValue;
        changed = true;
      }
      continue;
    }
    if (isPlainObject(value) || Array.isArray(value)) {
      changed = applyValueReplacements(value, replacements) || changed;
    }
  }
  return changed;
}

function applyExactValueReplacements(node, replacements) {
  if (Array.isArray(node)) {
    let changed = false;
    for (let index = 0; index < node.length; index += 1) {
      const value = node[index];
      if (typeof value === "string") {
        const nextValue = replaceExactValue(value, replacements);
        if (nextValue !== value) {
          node[index] = nextValue;
          changed = true;
        }
        continue;
      }
      if (isPlainObject(value) || Array.isArray(value)) {
        changed = applyExactValueReplacements(value, replacements) || changed;
      }
    }
    return changed;
  }

  if (!isPlainObject(node)) {
    return false;
  }

  let changed = false;
  for (const [key, value] of Object.entries(node)) {
    if (typeof value === "string") {
      const nextValue = replaceExactValue(value, replacements);
      if (nextValue !== value) {
        node[key] = nextValue;
        changed = true;
      }
      continue;
    }
    if (isPlainObject(value) || Array.isArray(value)) {
      changed = applyExactValueReplacements(value, replacements) || changed;
    }
  }
  return changed;
}

function replaceValue(value, replacements) {
  let nextValue = value;
  for (const [from, to] of replacements) {
    if (nextValue.includes(from)) {
      nextValue = nextValue.split(from).join(to);
    }
  }
  return nextValue;
}

function replaceExactValue(value, replacements) {
  for (const [from, to] of replacements) {
    if (value === from) {
      return to;
    }
  }
  return value;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function applyStringReplacements(source) {
  let patched = applyQuotedValueReplacements(source, residualExactValueReplacements);
  for (const [from, to] of literalReplacements) {
    patched = patched.split(`"${from}"`).join(`"${to}"`);
  }
  for (const [from, to] of directReplacements) {
    patched = patched.split(from).join(to);
  }
  return patched;
}

function applyQuotedValueReplacements(source, replacements) {
  let patched = source;
  for (const [from, to] of replacements) {
    patched = patched.split(JSON.stringify(from)).join(JSON.stringify(to));
  }
  return patched;
}

function assertRegisterCopy() {
  if (!matchedRegisterCopy) {
    throw new Error("The register error copy patch was not applied. Upstream bundle layout may have changed.");
  }
}
