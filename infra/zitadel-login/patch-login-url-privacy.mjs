import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, sep } from "node:path";

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

// Pre-compiled regex — .source is injected into the runtime template literal.
// This avoids fragile multi-layer escaping (source → template → file → browser).
const LOGIN_PATH_RE = /(^|\/)ui\/v2\/login(\/|$)|\/(accounts|idp|login|otp|passkey|password|signedin|verify)(\/|$)/;
const SIGNEDIN_PATH_RE = /(^|\/)signedin(\/|$)/;

if (!root) {
  throw new Error("Expected the extracted login bundle path as the first argument.");
}

const loginPageChunks = collectLoginPageChunks(root);
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
  if (!location.endsWith(".js")) {
    return false;
  }

  if (!location.includes(`${sep}static${sep}chunks${sep}`)) {
    return false;
  }

  if (location.includes(`${sep}static${sep}chunks${sep}app${sep}`)) {
    return location.includes(`${sep}(login)${sep}`);
  }

  return loginPageChunks.has(basename(location));
}

function collectLoginPageChunks(directory) {
  const location = join(directory, "server", "app", "(login)", "page_client-reference-manifest.js");
  try {
    return extractChunkNames(readFileSync(location, "utf8"));
  } catch (error) {
    return new Set();
  }
}

function extractChunkNames(contents) {
  const chunks = new Set();
  const chunkPath = /\/ui\/v2\/login\/_next\/static\/chunks\/([^"]+?\.js)"/g;
  for (const match of contents.matchAll(chunkPath)) {
    chunks.add(match[1]);
  }
  return chunks;
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
if(typeof window==="undefined"||window.__devssoUrlPrivacyVersion==="20260426-flow-context-v2")return;
window.__devssoUrlPrivacyInjected=true;
window.__devssoUrlPrivacyVersion="20260426-flow-context-v2";
var KEYS=${JSON.stringify(sensitiveKeys)};
var CONTEXT_KEY="devssoLoginContext";
var RECOVERY_KEY="devssoSignedinRecovery";
var TTL=15*60*1000;
var replaceState=history.replaceState.bind(history);
function isLoginPath(){return /${LOGIN_PATH_RE.source}/.test(location.pathname);}
function isSignedInPath(){return /${SIGNEDIN_PATH_RE.source}/.test(location.pathname);}
function fresh(value){return value&&Date.now()-Number(value.savedAt||0)<TTL;}
function readContext(){try{var value=JSON.parse(sessionStorage.getItem(CONTEXT_KEY)||"null");return fresh(value)?value:null;}catch(error){return null;}}
function writeContext(value){try{sessionStorage.setItem(CONTEXT_KEY,JSON.stringify(value));}catch(error){}}
function hasRequestId(){var ctx=readContext();return !!(ctx&&ctx.params&&ctx.params.requestId);}
function captureUrl(u){var params={};KEYS.forEach(function(key){if(u.searchParams.has(key))params[key]=u.searchParams.get(key);});if(Object.keys(params).length)writeContext({params:params,path:u.pathname,savedAt:Date.now()});}
function capture(){try{if(!isLoginPath()||!location.search)return;captureUrl(new URL(location.href));}catch(error){}}
function strip(u){var changed=false;KEYS.forEach(function(key){if(key==="loginName"&&!hasRequestId())return;if(!u.searchParams.has(key))return;u.searchParams.delete(key);changed=true;});return changed;}
function redact(){try{if(!isLoginPath()||!location.search)return;capture();var u=new URL(location.href);if(!strip(u))return;replaceState(history.state||null,document.title,u.pathname+u.search+u.hash);}catch(error){}}
function pulse(){capture();(isSignedInPath()?[1200,3000,6000,10000]:[1800,3000,6000,10000]).forEach(function(delay){setTimeout(redact,delay);});}
function contextParams(){var context=readContext();if(!context||!context.params||!context.params.requestId)return null;var params=new URLSearchParams();Object.entries(context.params).forEach(function(entry){if(entry[1])params.set(entry[0],entry[1]);});return params;}
function restoreForSubmit(){try{if(!isLoginPath()||location.search)return;var params=contextParams();if(params)replaceState(history.state||null,document.title,location.pathname+"?"+params+location.hash);}catch(error){}}
function recoverSignedIn(){try{if(!isSignedInPath())return;var params=contextParams();if(!params)return;var requestId=params.get("requestId")||"";if(sessionStorage.getItem(RECOVERY_KEY)===requestId)return;var target=new URLSearchParams({requestId:requestId});if(params.get("organization"))target.set("organization",params.get("organization"));sessionStorage.setItem(RECOVERY_KEY,requestId);location.replace("/login?"+target.toString());}catch(error){}}
function wrap(name){var original=history[name].bind(history);history[name]=function(){var args=Array.prototype.slice.call(arguments);try{if(args.length>2)captureUrl(new URL(String(args[2]),location.href));}catch(error){}var result=original.apply(history,args);pulse();return result;};}
if(!window.__devssoUrlPrivacyWrapped){window.__devssoUrlPrivacyWrapped=true;wrap("pushState");wrap("replaceState");addEventListener("popstate",pulse);addEventListener("hashchange",pulse);}
document.addEventListener("submit",restoreForSubmit,true);
document.addEventListener("click",function(event){var button=event.target&&event.target.closest&&event.target.closest("button");if(button&&!button.disabled&&/(Lanjutkan|Continue|Masuk|Sign in|Verifikasi|Verify)/i.test(button.textContent||""))restoreForSubmit();},true);
function afterHydration(fn){if(typeof requestIdleCallback!=="undefined"){requestIdleCallback(fn,{timeout:3000});}else{setTimeout(fn,2000);}}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",function(){afterHydration(pulse);},{once:true});else afterHydration(pulse);
setTimeout(recoverSignedIn,1600);
})();`;
}
