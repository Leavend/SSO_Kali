import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, sep } from "node:path";

const root = process.argv[2];
const marker = "/* Dev-SSO URL Privacy */";
const sensitiveKeys = [
  "authRequest",
  "code",
  "codeId",
  "idpIntent",
  "loginName",
  "organization",
  "prompt",
  "requestId",
  "sessionId",
  "userId",
];

if (!root) {
  throw new Error("Expected the extracted login bundle path as the first argument.");
}

let changedFiles = 0;
walk(root);
console.log(`Patched hosted login URL privacy into ${changedFiles} file(s).`);

if (changedFiles === 0) {
  throw new Error("Could not find login client chunks for URL privacy patch.");
}

function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const location = join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(location);
    } else if (entry.isFile() && isLoginClientChunk(location)) {
      patchFile(location);
    }
  }
}

function isLoginClientChunk(location) {
  return location.endsWith(".js")
    && location.includes(`${sep}static${sep}chunks${sep}app${sep}`)
    && location.includes(`${sep}(login)${sep}`);
}

function patchFile(location) {
  const original = readFileSync(location, "utf8");
  if (original.includes("__devssoUrlPrivacyInjected")) {
    return;
  }
  writeFileSync(location, `${original}\n${runtime()}`);
  changedFiles += 1;
}

function runtime() {
  return `${marker}
;(function(){
if(typeof window==="undefined"||window.__devssoUrlPrivacyVersion==="20260425-url-privacy-v1")return;
window.__devssoUrlPrivacyInjected=true;
window.__devssoUrlPrivacyVersion="20260425-url-privacy-v1";
var KEYS=${JSON.stringify(sensitiveKeys)};
var replaceState=history.replaceState.bind(history);
function isLoginPath(){return /(^|\\/)ui\\/v2\\/login(\\/|$)|\\/(accounts|idp|login|otp|passkey|password|signedin|verify)(\\/|$)/.test(location.pathname);}
function strip(u){var changed=false;KEYS.forEach(function(key){if(!u.searchParams.has(key))return;u.searchParams.delete(key);changed=true;});return changed;}
function redact(){try{if(!isLoginPath()||!location.search)return;var u=new URL(location.href);if(!strip(u))return;replaceState(history.state||null,document.title,u.pathname+u.search+u.hash);}catch(error){}}
function pulse(){[250,750,1500,3000,6000,10000].forEach(function(delay){setTimeout(redact,delay);});}
function wrap(name){var original=history[name].bind(history);history[name]=function(){var result=original.apply(history,arguments);pulse();return result;};}
if(!window.__devssoUrlPrivacyWrapped){window.__devssoUrlPrivacyWrapped=true;wrap("pushState");wrap("replaceState");addEventListener("popstate",pulse);addEventListener("hashchange",pulse);}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",pulse,{once:true});else pulse();
})();`;
}
