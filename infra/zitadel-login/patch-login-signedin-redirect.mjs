import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, sep } from "node:path";

const root = process.argv[2];
const marker = "/* __devssoAuthFlowPatched */";
const loginRouteSuffix = ["server", "app", "login", "route.js"].join(sep);

if (!root) {
  throw new Error("Expected the extracted login bundle path as the first argument.");
}

let routePatched = 0;
let routeFilesSeen = 0;
let debugPatched = 0;

walk(root);

console.log(
  `Patched hosted login auth flow in ${routePatched} route file(s); stripped debug logs in ${debugPatched} file(s).`,
);

if (routePatched === 0) {
  console.warn("No legacy /login route auth-flow pattern found; keeping current ZITADEL route behavior.");
}

if (routeFilesSeen === 0) {
  throw new Error("Could not find the compiled /login route to patch V2 auth requests.");
}

function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const location = join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(location);
      continue;
    }
    if (!entry.isFile() || !location.endsWith(".js")) {
      continue;
    }
    const changed = patchDebugLogs(location);
    if (location.endsWith(loginRouteSuffix)) {
      routeFilesSeen += 1;
      patchLoginRoute(location, changed);
    }
  }
}

function patchLoginRoute(location, alreadyChanged) {
  const original = readFileSync(location, "utf8");
  if (original.includes(marker)) {
    if (alreadyChanged) {
      writeFileSync(location, original);
    }
    return;
  }

  const result = patchLegacyFlow(original);

  if (result.replacements === 0) {
    assertNoUnpatchedLegacyFlow(original, location);
    return;
  }

  assertRoutePatch(result.contents, location);

  writeFileSync(location, `${result.contents}\n${marker}\n`);
  routePatched += 1;
}

function patchLegacyFlow(contents) {
  let replacements = 0;
  const track = (value) => {
    replacements += 1;
    return value;
  };
  const withRequestId = contents.replace(
    /authRequestId:([\w$.]+)\.replace\("oidc_",\s*""\)/g,
    (_, id) => track(`authRequestId:${id}.replace(/^(?:oidc_|V2_)/,"")`),
  );
  const patched = withRequestId.replace(
    /return ([\w$.]+)\.startsWith\("oidc_"\)\?/g,
    (_, id) => track(`return (${id}.startsWith("oidc_")||${id}.startsWith("V2_"))?`),
  );
  return { contents: patched, replacements };
}

function assertNoUnpatchedLegacyFlow(contents, location) {
  const hasLegacyFlow = contents.includes('replace("oidc_"')
    || contents.includes('startsWith("oidc_")');

  if (hasLegacyFlow) {
    throw new Error(`Found legacy OIDC-only auth flow in ${location}, but no patch was applied.`);
  }
}

function patchDebugLogs(location) {
  const original = readFileSync(location, "utf8");
  let patched = original;

  patched = patched.replace(
    /console\.log\("completeFlowOrGetUrl[^)]*\)/g,
    "void 0",
  );
  patched = patched.replace(
    /console\.log\("getNextUrl[^)]*\)/g,
    "void 0",
  );

  if (patched === original) {
    return false;
  }

  writeFileSync(location, patched);
  debugPatched += 1;
  return true;
}

function assertRoutePatch(contents, location) {
  if (!contents.includes('startsWith("V2_")')) {
    throw new Error(`Missing V2 auth request gate in ${location}.`);
  }
  if (!contents.includes('replace(/^(?:oidc_|V2_)/,"")')) {
    throw new Error(`Missing V2 auth request prefix strip in ${location}.`);
  }
}
