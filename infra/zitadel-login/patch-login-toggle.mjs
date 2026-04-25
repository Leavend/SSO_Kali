/**
 * patch-login-toggle.mjs
 * Injects the Dev-SSO theme toggle button (sun/moon) into the ZITADEL login
 * pages by appending a self-executing <script> block to EVERY .html file in
 * the Next.js build output. The injected script:
 * 1. Creates one parent Dev-SSO toggle button at bottom-right
 * 2. Removes/hides ZITADEL's native two-button light/dark switch
 * 3. Toggles the `dark` class and `data-theme` attribute on <html>
 * 4. Injects the parent Dev-SSO footer from the shared UI contract
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AUTH_SHELL, renderFooterHtml, themeIconSvg } from "../../packages/dev-sso-parent-ui/auth-shell.mjs";

const root = process.argv[2];
const marker = "<!-- Dev-SSO Toggle -->";

if (!root) {
  throw new Error("Expected the extracted login bundle path as the first argument.");
}

const toggleScript = buildToggleScript();

let changedFiles = 0;
walk(root);
console.log(`Patched toggle into ${changedFiles} file(s).`);

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
  // Look for the ZITADEL login's main layout render that contains the
  // theme toggle area (the div with the sun/moon buttons).
  // We inject our toggle initialization AFTER the existing code.
  if (original.includes("__devssoToggleInjected")) {
    return; // Already patched
  }
  if (!shouldPatch(location, original)) {
    return;
  }
  const patched = original + "\n" + toggleScript;
  writeFileSync(location, patched);
  changedFiles += 1;
}

function shouldPatch(location, original) {
  if (original.includes("headlessui-listbox-button")) {
    return true;
  }
  return location.includes("/static/chunks/app/(login)/");
}

function buildToggleScript() {
  const runtimeConfig = {
    attr: AUTH_SHELL.theme.attribute,
    copyMap: {
      "Login dengan Dev-SSO": "Masuk",
      "Masuk dengan Dev-SSO": "Masuk",
      "Masuk ke Dev-SSO": "Masuk",
      "Login with Dev-SSO": "Sign in",
      "Sign in to Dev-SSO": "Sign in",
    },
    darkClass: AUTH_SHELL.theme.darkClass,
    defaultTheme: AUTH_SHELL.theme.defaultTheme,
    footerHtml: renderFooterHtml(),
    footerId: AUTH_SHELL.footer.id,
    lightLabel: AUTH_SHELL.theme.lightLabel,
    darkLabel: AUTH_SHELL.theme.darkLabel,
    moonSvg: themeIconSvg("light"),
    sunSvg: themeIconSvg("dark"),
    toggleHostClass: AUTH_SHELL.theme.toggleHostClass,
    toggleHostId: AUTH_SHELL.theme.toggleHostId,
    toggleId: AUTH_SHELL.theme.toggleId,
  };

  return `;(function(){
var VERSION="20260425-bottom-right-v1";
if(typeof window==="undefined")return;
if(window.__devssoToggleVersion===VERSION)return;
window.__devssoToggleInjected=true;
window.__devssoToggleVersion=VERSION;

var CONFIG=${JSON.stringify(runtimeConfig)};
var btn=null;
var observer=null;

function getTheme(){
  if(document.documentElement.classList.contains(CONFIG.darkClass))return "dark";
  return document.documentElement.getAttribute(CONFIG.attr)==="dark"?"dark":CONFIG.defaultTheme;
}

function applyTheme(t){
  t=t==="dark"?"dark":"light";
  document.documentElement.classList.toggle(CONFIG.darkClass,t==="dark");
  document.documentElement.setAttribute(CONFIG.attr,t);
  updateIcon(t);
}

function updateIcon(t){
  if(!btn)return;
  btn.innerHTML=t==="dark"?CONFIG.sunSvg:CONFIG.moonSvg;
  btn.setAttribute("aria-label",t==="dark"?CONFIG.lightLabel:CONFIG.darkLabel);
}

function upsertFooter(){
  var existing=document.getElementById(CONFIG.footerId);
  if(existing){
    existing.outerHTML=CONFIG.footerHtml;
    return;
  }
  var host=document.createElement("div");
  host.innerHTML=CONFIG.footerHtml;
  if(host.firstElementChild)document.body.appendChild(host.firstElementChild);
}

function upsertToggle(){
  var host=resolveToggleHost();
  btn=document.getElementById(CONFIG.toggleId);
  if(!btn){
    btn=document.createElement("button");
    btn.type="button";
    btn.id=CONFIG.toggleId;
  }
  if(btn.parentElement!==host)host.appendChild(btn);
  btn.className="theme-toggle";
  btn.setAttribute("data-devsso-parent-ui","theme-toggle");
  btn.onclick=function(){
    var current=getTheme();
    applyTheme(current==="dark"?"light":"dark");
  };
  applyTheme(getTheme());
}

function resolveToggleHost(){
  var host=document.getElementById(CONFIG.toggleHostId);
  var shell=findShell();
  if(!host){
    host=document.createElement("div");
    host.id=CONFIG.toggleHostId;
  }
  host.className=CONFIG.toggleHostClass;
  host.setAttribute("data-devsso-parent-ui","theme-toggle-host");
  if(host.parentElement!==shell)shell.appendChild(host);
  return host;
}

function findShell(){
  return document.querySelector('body div[class*="min-h-screen"]')||document.body;
}

function normalizeCopy(){
  var map=CONFIG.copyMap||{};
  if(map[document.title])document.title=map[document.title];
  Array.prototype.slice.call(document.querySelectorAll("h1")).forEach(function(node){
    var text=(node.textContent||"").replace(/\\s+/g," ").trim();
    if(map[text])node.textContent=map[text];
  });
}

function normalizeButtons(){
  Array.prototype.slice.call(document.querySelectorAll("button")).forEach(function(button){
    if(button.id===CONFIG.toggleId)return;
    var text=(button.textContent||"").replace(/\\s+/g," ").trim();
    if(/^(Kembali|Back)$/.test(text)){
      button.setAttribute("data-devsso-action","back");
    }
    if(/^(Lanjutkan|Continue)$/.test(text)){
      button.setAttribute("data-devsso-action","submit");
    }
  });
}

function hideNativeThemeSwitches(){
  var buttons=Array.prototype.slice.call(document.querySelectorAll("button"));
  buttons.forEach(function(button){
    if(button.id===CONFIG.toggleId)return;
    var label=(button.getAttribute("aria-label")||button.getAttribute("title")||"").toLowerCase();
    var className=String(button.className||"").toLowerCase();
    var text=(button.textContent||"").replace(/\\s+/g,"").toLowerCase();
    var hasThemeLabel=/dark|light|theme|tema|mode|appearance/.test(label);
    var svgOnly=!!button.querySelector("svg")&&text.length===0;
    var parent=button.parentElement;
    var siblingButtons=parent?parent.querySelectorAll("button").length:0;
    var rect=button.getBoundingClientRect();
    var nearBottomRight=rect.right>window.innerWidth-280&&rect.bottom>window.innerHeight-280;
    var classLooksNative=/w-8|h-8|space-x-1|rounded-full/.test(className);

    if(hasThemeLabel||(svgOnly&&siblingButtons>1&&nearBottomRight)||classLooksNative&&siblingButtons>1&&nearBottomRight){
      var target=siblingButtons>1&&parent&&!parent.contains(btn)?parent:button;
      target.setAttribute("data-devsso-native-theme-hidden","true");
      target.style.setProperty("display","none","important");
    }
  });
}

function startObserver(){
  if(observer||!document.body||typeof MutationObserver==="undefined")return;
  observer=new MutationObserver(function(){
    ensureParentChrome();
    normalizeCopy();
    normalizeButtons();
    hideNativeThemeSwitches();
  });
  observer.observe(document.body,{childList:true,subtree:true});
}

function ensureParentChrome(){
  if(!document.getElementById(CONFIG.footerId))upsertFooter();
  var shell=findShell();
  var host=document.getElementById(CONFIG.toggleHostId);
  var toggle=document.getElementById(CONFIG.toggleId);
  if(!host||!toggle||host.parentElement!==shell)upsertToggle();
}

function createParentChrome(){
  upsertFooter();
  upsertToggle();
  normalizeCopy();
  normalizeButtons();
  hideNativeThemeSwitches();
  startObserver();
  window.setTimeout(normalizeCopy,100);
  window.setTimeout(normalizeCopy,600);
  window.setTimeout(normalizeButtons,100);
  window.setTimeout(normalizeButtons,600);
  window.setTimeout(hideNativeThemeSwitches,100);
  window.setTimeout(hideNativeThemeSwitches,600);
  window.setTimeout(ensureParentChrome,100);
  window.setTimeout(ensureParentChrome,600);
  window.setTimeout(ensureParentChrome,1500);
}

if(document.readyState==="loading"){
  document.addEventListener("DOMContentLoaded",createParentChrome);
}else{
  createParentChrome();
}
})();`;
}
