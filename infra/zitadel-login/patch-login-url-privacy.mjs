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
if(typeof window==="undefined"||window.__devssoUrlPrivacyInjected)return;
window.__devssoUrlPrivacyInjected=true;
var KEYS=${JSON.stringify(sensitiveKeys)};
function isLoginPath(){return /(^|\\/)ui\\/v2\\/login(\\/|$)|\\/(accounts|idp|login|otp|passkey|password|signedin|verify)(\\/|$)/.test(location.pathname);}
function redact(){try{if(!isLoginPath()||!location.search)return;var u=new URL(location.href),changed=false;KEYS.forEach(function(key){if(u.searchParams.has(key)){u.searchParams.delete(key);changed=true;}});if(changed)history.replaceState(history.state||null,document.title,u.pathname+u.search+u.hash);}catch(error){}}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",function(){setTimeout(redact,0);},{once:true});else setTimeout(redact,0);
setTimeout(redact,600);
})();`;
}
