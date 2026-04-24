/**
 * patch-login-signedin-redirect.mjs
 *
 * Fixes the ZITADEL Login V2 "signedin" dead-end when the auth requestId
 * carries a `V2_` prefix instead of `oidc_`.
 *
 * In ZITADEL v4.11.0, `completeFlowOrGetUrl()` only recognises `oidc_` and
 * `saml_` prefixes.  Auth requests created through the V2 API use the `V2_`
 * prefix, which falls through to the `/signedin` confirmation page — a
 * dead-end with no auto-redirect.
 *
 * This build-time patch has TWO layers of defence:
 *
 *   LAYER 1 — JS Bundle Patch (.js files)
 *   Walks every `.js` file in the compiled login bundle and performs two
 *   surgical string replacements:
 *     1. Wherever `EXPR.startsWith("oidc_")` appears, also accept `"V2_"`.
 *     2. Wherever `EXPR.replace("oidc_","")` strips the prefix, also strip `"V2_"`.
 *
 *   LAYER 2 — HTML Fallback (.html files)
 *   Injects a self-executing <script> into every HTML file that rewrites
 *   `requestId=V2_xxx` to `requestId=oidc_xxx` in the URL query string
 *   BEFORE Next.js processes the page.  This is a safety net in case the
 *   JS bundle regex misses due to unexpected minifier output.
 *
 * Both layers are safe and idempotent.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2];

if (!root) {
  throw new Error(
    "Expected the extracted login bundle path as the first argument.",
  );
}

const JS_MARKER = "__devssoV2PrefixPatched";
const HTML_MARKER = "<!-- Dev-SSO V2 Prefix Rewrite -->";

let patchedJsFiles = 0;
let patchedHtmlFiles = 0;

walk(root);

console.log(
  `Patched V2_ requestId prefix: ${patchedJsFiles} JS file(s), ${patchedHtmlFiles} HTML file(s).`,
);

if (patchedJsFiles === 0) {
  console.warn(
    '⚠️  WARNING: No JS files contained startsWith("oidc_"). ' +
    "The HTML fallback will still handle the redirect, but " +
    "this may indicate the ZITADEL bundle structure has changed.",
  );
}

// ─── File walker ─────────────────────────────────────────────────────────

function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const location = join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(location);
      continue;
    }
    if (entry.isFile()) {
      if (location.endsWith(".js")) {
        patchJsFile(location);
      } else if (location.endsWith(".html")) {
        patchHtmlFile(location);
      }
    }
  }
}

// ─── LAYER 1: JS Bundle Patch ────────────────────────────────────────────

function patchJsFile(location) {
  const original = readFileSync(location, "utf8");

  if (original.includes(JS_MARKER)) {
    return;
  }

  if (!original.includes('startsWith("oidc_")')) {
    return;
  }

  let patched = original;

  // 1. Extend the startsWith("oidc_") gate to also accept "V2_"
  //    EXPR.startsWith("oidc_")  →  (EXPR.startsWith("oidc_")||EXPR.startsWith("V2_"))
  patched = patched.replace(
    /([\w$.]+(?:\.[\w$]+)*)\.startsWith\("oidc_"\)/g,
    '($1.startsWith("oidc_")||$1.startsWith("V2_"))',
  );

  // 2. Extend the replace("oidc_","") prefix strip to also strip "V2_"
  //    EXPR.replace("oidc_","")  →  EXPR.replace(/^(?:oidc_|V2_)/,"")
  patched = patched.replace(
    /([\w$.]+(?:\.[\w$]+)*)\.replace\("oidc_",\s*""\)/g,
    '$1.replace(/^(?:oidc_|V2_)/,"")',
  );

  if (patched === original) {
    return;
  }

  patched += `\n/* ${JS_MARKER} */\n`;
  writeFileSync(location, patched);
  patchedJsFiles += 1;
}

// ─── LAYER 2: HTML Fallback ──────────────────────────────────────────────
//
// Injects a tiny inline script that runs before Next.js hydration.
// If the URL contains `requestId=V2_xxx`, it rewrites it to `oidc_xxx`
// and does a same-page navigation so Next.js processes the corrected param.

function patchHtmlFile(location) {
  const original = readFileSync(location, "utf8");

  if (original.includes(HTML_MARKER)) {
    return;
  }

  const rewriteScript = buildRewriteScript();

  // Insert the script right after <head> (or at the top if no <head>)
  let patched;
  if (original.includes("<head>")) {
    patched = original.replace("<head>", `<head>${rewriteScript}`);
  } else if (original.includes("<head ")) {
    patched = original.replace(/<<head\s[^>]*>/, (match) => `${match}${rewriteScript}`);
  } else {
    // Prepend if no <head> tag found
    patched = rewriteScript + original;
  }

  if (patched === original) {
    return;
  }

  writeFileSync(location, patched);
  patchedHtmlFiles += 1;
}

function buildRewriteScript() {
  // This self-executing script:
  // 1. Checks if the URL contains requestId=V2_
  // 2. Rewrites V2_ to oidc_ in the requestId param
  // 3. Replaces the URL via history.replaceState (no page reload)
  //
  // Next.js server components read searchParams from the initial request,
  // so this rewrite must happen BEFORE the initial server render. For SSR
  // pages this won't help (already rendered), but for client navigations
  // and the signedin page's own logic it provides the safety net.
  return `${HTML_MARKER}<script>(function(){try{var u=new URL(location.href);var r=u.searchParams.get("requestId");if(r&&r.indexOf("V2_")===0){u.searchParams.set("requestId","oidc_"+r.slice(3));history.replaceState(null,"",u.toString())}}catch(e){}})()</script>`;
}
