import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";

const PROJECT_ROOT = join(import.meta.dirname, "..");
const PATCH_SCRIPT = join(PROJECT_ROOT, "infra/zitadel-login/patch-login-locale-alias.mjs");
const COPY_SCRIPT = join(PROJECT_ROOT, "infra/zitadel-login/patch-login-copy.mjs");
const CATALOG_PATH = join(PROJECT_ROOT, "infra/zitadel-login/login-copy-catalog.mjs");

const FIXTURE_DIR = join(import.meta.dirname, ".fixtures-locale-test");
const CHUNK_DIR = join(FIXTURE_DIR, ".next/server/chunks");

// --- Test Fixtures ---

function createEnChunk(chunkId, moduleId, jsonContent) {
  const escaped = JSON.stringify(JSON.stringify(jsonContent))
    .slice(1, -1)
    .replaceAll("'", "\\'");
  return `"use strict";exports.id=${chunkId},exports.ids=[${chunkId}],exports.modules={${moduleId}:a=>{a.exports=JSON.parse('${escaped}')}};`;
}

const DEFAULT_EN_JSON = {
  common: { back: "Back", title: "Login with Zitadel" },
  loginname: {
    title: "Welcome back!",
    description: "Enter your login data.",
    submit: "Continue",
    register: "Register new user",
    errors: { internalError: "Internal error." },
  },
  zitadel: { errors: { errorOccured: "An error occurred." } },
  password: {
    verify: { errors: { failedPrecondition: "Precondition failed." } },
    change: { errors: { unknownError: "Unknown error." } },
  },
  idp: { errors: { unknownError: "Unknown error." }, title: "Sign in with SSO" },
};

function setupFixtures(opts = {}) {
  const { twoContexts = false } = opts;
  mkdirSync(CHUNK_DIR, { recursive: true });

  // en.json chunk for context 1 (module 46987)
  writeFileSync(
    join(CHUNK_DIR, "9802.js"),
    createEnChunk(9802, 59802, DEFAULT_EN_JSON),
  );

  // Locale loader chunk (context 46987)
  const localeMap1 = [
    '"./ar.json":[17930,7930]',
    '"./de.json":[81326,1326]',
    '"./en.json":[59802,9802]',
    '"./es.json":[66631,6631]',
    '"./fr.json":[99375,9375]',
  ].join(",");
  writeFileSync(
    join(CHUNK_DIR, "6326.js"),
    `"use strict";exports.id=6326,exports.ids=[6326],exports.modules={46987:(a,b,c)=>{var d={${localeMap1}};}};`,
  );

  if (twoContexts) {
    // Second en.json chunk for context 2 (module 41662)
    writeFileSync(
      join(CHUNK_DIR, "4213.js"),
      createEnChunk(4213, 4213, DEFAULT_EN_JSON),
    );

    const localeMap2 = [
      '"./ar.json":[52933,2933]',
      '"./de.json":[51977,1977]',
      '"./en.json":[4213,4213]',
      '"./es.json":[73530,3530]',
      '"./fr.json":[27554,5173]',
    ].join(",");
    writeFileSync(
      join(CHUNK_DIR, "3072.js"),
      `"use strict";exports.id=3072,exports.ids=[3072],exports.modules={41662:(a,b,c)=>{var d={${localeMap2}};}};`,
    );
  }
}

function teardown() {
  if (existsSync(FIXTURE_DIR)) {
    rmSync(FIXTURE_DIR, { recursive: true, force: true });
  }
}

function runPatch() {
  return execSync(`${process.execPath} ${PATCH_SCRIPT} ${join(FIXTURE_DIR, ".next")}`, {
    encoding: "utf8",
    timeout: 10000,
  });
}

// --- Tests ---

describe("patch-login-locale-alias", () => {
  beforeEach(() => teardown());
  afterEach(() => teardown());

  describe("Single webpack context", () => {
    it("creates id.json chunk file", () => {
      setupFixtures();
      runPatch();
      assert.ok(existsSync(join(CHUNK_DIR, "44444.js")), "id.json chunk should exist");
    });

    it("registers id.json in the webpack module map", () => {
      setupFixtures();
      runPatch();
      const src = readFileSync(join(CHUNK_DIR, "6326.js"), "utf8");
      assert.ok(src.includes('"./id.json"'), "Should contain id.json entry");
      assert.ok(src.includes("[159802,44444]"), "Should map to correct module/chunk IDs");
    });

    it("sets Indonesian locale marker in the cloned chunk", () => {
      setupFixtures();
      runPatch();
      const src = readFileSync(join(CHUNK_DIR, "44444.js"), "utf8");
      assert.ok(
        src.includes("Login dengan Zitadel"),
        "Should contain Indonesian title marker",
      );
      assert.ok(
        !src.includes("Login with Zitadel"),
        "Should NOT contain English title",
      );
      assert.ok(
        !src.includes("Welcome back!"),
        "Should NOT contain English welcome",
      );
    });

    it("uses correct module and chunk IDs", () => {
      setupFixtures();
      runPatch();
      const src = readFileSync(join(CHUNK_DIR, "44444.js"), "utf8");
      assert.ok(src.includes("exports.id=44444"), "Chunk ID should be 44444");
      assert.ok(src.includes("exports.ids=[44444]"), "Chunk IDs array should be [44444]");
      assert.ok(src.includes("159802:a=>"), "Module ID should be 159802 (59802 + 100000)");
    });

    it("contains exactly one JSON.parse call", () => {
      setupFixtures();
      runPatch();
      const src = readFileSync(join(CHUNK_DIR, "44444.js"), "utf8");
      const matches = src.match(/JSON\.parse/g);
      assert.equal(matches?.length, 1, "Should have exactly 1 JSON.parse call");
    });

    it("preserves all original en.json keys in the clone", () => {
      setupFixtures();
      runPatch();
      const src = readFileSync(join(CHUNK_DIR, "44444.js"), "utf8");
      const m = src.match(/JSON\.parse\('(.+?)'\)/);
      assert.ok(m, "Should have JSON.parse content");
      const decoded = JSON.parse(Function('"use strict";return \'' + m[1] + "'")());
      assert.ok(decoded.common, "Should have common key");
      assert.ok(decoded.loginname, "Should have loginname key");
      assert.ok(decoded.zitadel, "Should have zitadel key");
      assert.ok(decoded.password, "Should have password key");
    });

    it("is idempotent — second run preserves patched files", () => {
      setupFixtures();
      runPatch();
      const chunk1 = readFileSync(join(CHUNK_DIR, "44444.js"), "utf8");
      const loader1 = readFileSync(join(CHUNK_DIR, "6326.js"), "utf8");
      // Second run throws because all files are already patched (marker detected)
      // This is expected — the patch is a one-shot build step
      assert.throws(() => runPatch(), /Could not find any locale webpack context/);
      // Files should be unchanged from the first run
      assert.equal(
        readFileSync(join(CHUNK_DIR, "44444.js"), "utf8"),
        chunk1,
        "Chunk file should be unchanged",
      );
      assert.equal(
        readFileSync(join(CHUNK_DIR, "6326.js"), "utf8"),
        loader1,
        "Loader file should be unchanged",
      );
    });
  });

  describe("Multiple webpack contexts (dual locale maps)", () => {
    it("patches both locale maps", () => {
      setupFixtures({ twoContexts: true });
      runPatch();
      const src6326 = readFileSync(join(CHUNK_DIR, "6326.js"), "utf8");
      const src3072 = readFileSync(join(CHUNK_DIR, "3072.js"), "utf8");
      assert.ok(src6326.includes('"./id.json"'), "6326.js should have id.json");
      assert.ok(src3072.includes('"./id.json"'), "3072.js should have id.json");
    });

    it("creates a single chunk with multiple module exports", () => {
      setupFixtures({ twoContexts: true });
      runPatch();
      const src = readFileSync(join(CHUNK_DIR, "44444.js"), "utf8");
      // Should have module IDs for both contexts: 104213 (4213+100000) and 159802 (59802+100000)
      assert.ok(src.includes("104213"), "Should have module 104213 (4213+100000)");
      assert.ok(src.includes("159802"), "Should have module 159802 (59802+100000)");
    });

    it("uses require() for secondary modules to avoid multiple JSON.parse", () => {
      setupFixtures({ twoContexts: true });
      runPatch();
      const src = readFileSync(join(CHUNK_DIR, "44444.js"), "utf8");
      const parseCount = (src.match(/JSON\.parse/g) || []).length;
      assert.equal(parseCount, 1, "Should have exactly 1 JSON.parse (others use require)");
    });

    it("maps each context to the same chunk ID", () => {
      setupFixtures({ twoContexts: true });
      runPatch();
      const src6326 = readFileSync(join(CHUNK_DIR, "6326.js"), "utf8");
      const src3072 = readFileSync(join(CHUNK_DIR, "3072.js"), "utf8");
      assert.ok(src6326.includes(",44444]"), "6326 should point to chunk 44444");
      assert.ok(src3072.includes(",44444]"), "3072 should point to chunk 44444");
    });
  });

  describe("Edge cases", () => {
    it("throws when no locale map is found", () => {
      mkdirSync(CHUNK_DIR, { recursive: true });
      writeFileSync(join(CHUNK_DIR, "empty.js"), '"use strict";');
      assert.throws(
        () => runPatch(),
        /Could not find any locale webpack context module/,
        "Should throw descriptive error",
      );
    });
  });
});
