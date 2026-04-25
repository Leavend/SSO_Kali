import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const repo = new URL("../..", import.meta.url).pathname;
const root = mkdtempSync(join(tmpdir(), "devsso-login-flow-"));

try {
  const route = prepareRouteFixture();
  const client = prepareClientFixture();
  const css = prepareCssFixture();

  run("patch-login-signedin-redirect.mjs");
  assertAuthFlow(route, client);

  run("patch-login-url-privacy.mjs");
  assertUrlPrivacy(readFileSync(client, "utf8"));

  run("patch-login-responsive-errors.mjs");
  assertIncludes(readFileSync(css, "utf8"), "Dev-SSO Responsive Error States");
  console.log("login auth flow patch validation passed");
} finally {
  rmSync(root, { force: true, recursive: true });
}

function prepareRouteFixture() {
  const file = join(root, "server", "app", "login", "route.js");
  mkdirSync(join(root, "server", "app", "login"), { recursive: true });
  writeFileSync(file, 'async function O(a){let c=a.requestId;return {authRequestId:c.replace("oidc_","")}}function G(e){let i={};return e.startsWith("oidc_")?O(i):e.startsWith("saml_")?P(i):null}');
  return file;
}

function prepareClientFixture() {
  const dir = join(root, "static", "chunks", "app", "(login)", "otp");
  const file = join(dir, "page.js");
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, 'function f(e,r){console.log("completeFlowOrGetUrl called with:",e,"defaultRedirectUri:",r);console.log("getNextUrl called with:",e,"defaultRedirectUri:",r);return e.requestId.startsWith("oidc_")?1:2}');
  return file;
}

function prepareCssFixture() {
  const file = join(root, "static", "chunks", "app.css");
  mkdirSync(join(root, "static", "chunks"), { recursive: true });
  writeFileSync(file, "body{display:block}");
  return file;
}

function run(script) {
  execFileSync(process.execPath, [join(repo, "infra", "zitadel-login", script), root], {
    stdio: "inherit",
  });
}

function assertAuthFlow(route, client) {
  const routeOutput = readFileSync(route, "utf8");
  const clientOutput = readFileSync(client, "utf8");
  assertIncludes(routeOutput, 'startsWith("V2_")');
  assertIncludes(routeOutput, 'replace(/^(?:oidc_|V2_)/,"")');
  assertNotIncludes(clientOutput, "completeFlowOrGetUrl called with");
  assertNotIncludes(clientOutput, 'startsWith("V2_")');
}

function assertUrlPrivacy(output) {
  assertIncludes(output, "__devssoUrlPrivacyInjected");
  assertIncludes(output, "__devssoUrlPrivacyVersion");
  assertIncludes(output, "20260426-flow-context-v2");
  assertIncludes(output, "devssoLoginContext");
  assertIncludes(output, "recoverSignedIn");
  assertIncludes(output, "restoreForSubmit");
  assertIncludes(output, "hasRequestId");
  assertIncludes(output, "afterHydration");
  assertNotIncludes(output, "cleanTarget");
  assertNotIncludes(output, "FLOW_KEYS");
  assertIncludes(output, 'wrap("pushState")');
  assertIncludes(output, 'wrap("replaceState")');
  assertIncludes(output, "6000");
}

function assertIncludes(value, expected) {
  if (!value.includes(expected)) {
    throw new Error(`Missing expected marker: ${expected}`);
  }
}

function assertNotIncludes(value, expected) {
  if (value.includes(expected)) {
    throw new Error(`Unexpected marker found: ${expected}`);
  }
}
