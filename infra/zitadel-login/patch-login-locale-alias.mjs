import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";

const root = process.argv[2];
const MARKER = "/* devsso-id-locale-injected */";
const ID_CHUNK_ID = 44444;

if (!root) {
  throw new Error("Expected the extracted login bundle path as the first argument.");
}

// Collect all locale maps across all files before patching
const patches = [];

walk(root);
applyPatches();
assertPatched();

function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const location = join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(location);
      continue;
    }
    if (entry.isFile() && location.endsWith(".js")) {
      scanFile(location);
    }
  }
}

function scanFile(location) {
  const source = readFileSync(location, "utf8");
  if (source.includes(MARKER)) return;

  // Find ALL locale map occurrences: {"./en.json":[MODID,CHUNKID],...}
  // Each file may contain one or more webpack context modules with locale maps
  const enPattern = /"\.\/en\.json":\[(\d+),(\d+)\]/g;
  let match;
  while ((match = enPattern.exec(source)) !== null) {
    // Verify this is in a locale map context (not just any JSON reference)
    const contextStart = source.lastIndexOf("{", match.index);
    const nearbyLocales = source.slice(contextStart, contextStart + 500);
    if (!nearbyLocales.includes('"./de.json"') || !nearbyLocales.includes('"./fr.json"')) {
      continue; // Not a locale map
    }

    const enModuleId = parseInt(match[1], 10);
    const enChunkId = parseInt(match[2], 10);
    const idModuleId = enModuleId + 100000;

    patches.push({
      location,
      enModuleId,
      enChunkId,
      idModuleId,
      enEntry: `"./en.json":[${enModuleId},${enChunkId}]`,
    });
  }
}

function applyPatches() {
  if (patches.length === 0) return;

  // Group patches by file
  const byFile = {};
  for (const p of patches) {
    byFile[p.location] = byFile[p.location] || [];
    byFile[p.location].push(p);
  }

  // Apply patches to each file
  for (const [location, filePatches] of Object.entries(byFile)) {
    let source = readFileSync(location, "utf8");
    for (const p of filePatches) {
      if (source.includes('"./id.json"')) continue; // Already patched (different context in same file)
      const idEntry = `"./id.json":[${p.idModuleId},${ID_CHUNK_ID}]`;
      source = source.replace(p.enEntry, `${p.enEntry},${idEntry}${MARKER}`);
    }
    writeFileSync(location, source);
  }

  // Collect all unique en chunk sources we need to clone
  const enChunks = new Map(); // chunkId -> {moduleId, idModuleId}
  for (const p of patches) {
    if (!enChunks.has(p.enChunkId)) {
      enChunks.set(p.enChunkId, { enModuleId: p.enModuleId, idModuleId: p.idModuleId });
    }
  }

  // Create the unified id.json chunk
  // This chunk needs to export ALL the module IDs that different context modules expect
  const chunkDir = dirname(patches[0].location);
  const idChunkPath = join(chunkDir, `${ID_CHUNK_ID}.js`);

  // The locale-alias runs BEFORE the copy patch.
  // The en.json chunk has the ORIGINAL ZITADEL titles (e.g. "Login with Zitadel" / "Welcome back!").
  // We set the common.title to a value that localeMarkers.id recognizes.
  const EN_TITLE_MARKERS = ["Login with Zitadel", "Welcome back!"];
  const ID_TITLE_MARKER = "Login dengan Zitadel"; // Must match localeMarkers.id

  // Build a chunk that exports all needed module IDs with the same JSON content
  // First, get the JSON content from one of the en chunks
  let jsonContent = null;
  for (const [chunkId, info] of enChunks) {
    const enChunkPath = join(chunkDir, `${chunkId}.js`);
    try {
      const enSource = readFileSync(enChunkPath, "utf8");
      // Extract the JSON.parse content
      const jsonMatch = enSource.match(/a\.exports=JSON\.parse\('(.+?)'\)/);
      if (jsonMatch) {
        jsonContent = jsonMatch[1];
        break;
      }
    } catch (e) {
      console.warn(`  Warning: Could not read ${enChunkPath}:`, e.message);
    }
  }

  if (!jsonContent) {
    throw new Error("Could not extract JSON content from any en.json chunk");
  }

  // Apply Indonesian locale marker to the JSON content
  let idJsonContent = jsonContent;
  for (const marker of EN_TITLE_MARKERS) {
    // Escape for JSON string context
    idJsonContent = idJsonContent.split(marker).join(ID_TITLE_MARKER);
  }

  // Build module exports for all needed module IDs.
  // IMPORTANT: Use a SINGLE JSON.parse call with a shared variable.
  // The copy patch (patch-login-copy.mjs) uses `source.indexOf("a.exports=JSON.parse('")` 
  // and `source.lastIndexOf("')")` to find the JSON literal. Multiple JSON.parse calls 
  // in the same file would confuse that parser.
  const moduleIds = [...enChunks.values()].map(e => e.idModuleId);
  const firstId = moduleIds[0];
  const moduleExports = moduleIds.map((id, i) => {
    if (i === 0) {
      // First module: define the parsed JSON content
      return `${id}:a=>{a.exports=JSON.parse('${idJsonContent}')}`;
    }
    // Subsequent modules: reference the first module's export
    // We use a.__idLocaleCache pattern to share the parsed result
    return `${id}:(a,b,c)=>{a.exports=c(${firstId})}`;
  });

  const idChunkSource = `"use strict";exports.id=${ID_CHUNK_ID},exports.ids=[${ID_CHUNK_ID}],exports.modules={${moduleExports.join(",")}};`;

  writeFileSync(idChunkPath, idChunkSource);
  console.log(`  Created ${idChunkPath} with ${moduleExports.length} module export(s), marker: "${ID_TITLE_MARKER}"`);
  console.log(`  Module IDs: ${moduleIds.join(", ")}`);
}

function assertPatched() {
  if (patches.length === 0) {
    throw new Error(
      "Could not find any locale webpack context module in the login bundle. " +
      "The module map structure may have changed in this ZITADEL version."
    );
  }
  console.log(`Patched login locale alias — ${patches.length} locale map(s) found across ${new Set(patches.map(p => p.location)).size} file(s).`);
}
