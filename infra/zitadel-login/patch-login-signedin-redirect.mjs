import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, sep } from "node:path";

const root = process.argv[2];
const marker = "/* __devssoAuthFlowPatched */";
const loginRouteSuffix = ["server", "app", "login", "route.js"].join(sep);

if (!root) {
  throw new Error("Expected the extracted login bundle path as the first argument.");
}

let routePatched = 0;
let debugPatched = 0;

walk(root);

console.log(
  `Patched hosted login auth flow in ${routePatched} route file(s); stripped debug logs in ${debugPatched} file(s).`,
);

if (routePatched === 0) {
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

  let patched = original;
  patched = patched.replace(
    /authRequestId:([\w$.]+)\.replace\("oidc_",\s*""\)/g,
    'authRequestId:$1.replace(/^(?:oidc_|V2_)/,"")',
  );
  patched = patched.replace(
    /return ([\w$.]+)\.startsWith\("oidc_"\)\?/g,
    'return ($1.startsWith("oidc_")||$1.startsWith("V2_"))?',
  );

  assertRoutePatch(patched, location);

  writeFileSync(location, `${patched}\n${marker}\n`);
  routePatched += 1;
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
