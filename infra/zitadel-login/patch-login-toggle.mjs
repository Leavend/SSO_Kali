/**
 * patch-login-toggle.mjs
 * Injects the Dev-SSO theme toggle button (sun/moon) into the ZITADEL login
 * pages by appending a self-executing <script> block to EVERY .html file in
 * the Next.js build output. The injected script:
 * 1. Creates a fixed-position toggle button at bottom-right
 * 2. Reads/writes the 'sso-theme' localStorage key (same as SSO frontend)
 * 3. Toggles the `dark` class on <html> (which ZITADEL's v2 login uses)
 * 4. Uses the exact same sun/moon SVG icons as ThemeToggle.tsx
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

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
  // Only patch files that contain the theme toggle rendering logic
  if (!original.includes("headlessui-listbox-button")) {
    return;
  }
  const patched = original + "\n" + toggleScript;
  writeFileSync(location, patched);
  changedFiles += 1;
}

function buildToggleScript() {
  // This is a self-executing function that will be appended to the JS bundle.
  // It waits for DOM ready, then injects our custom toggle.
  return `;(function(){
if(typeof window==="undefined"||window.__devssoToggleInjected)return;
window.__devssoToggleInjected=true;

var STORAGE_KEY="sso-theme";

function getTheme(){
  try{var t=localStorage.getItem(STORAGE_KEY);if(t==="light"||t==="dark")return t;}catch(e){}
  return "light";
}

function applyTheme(t){
  document.documentElement.classList.toggle("dark",t==="dark");
  document.documentElement.setAttribute("data-theme",t);
  try{localStorage.setItem(STORAGE_KEY,t);}catch(e){}
  updateIcon(t);
}

var sunSVG='<svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fill-rule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clip-rule="evenodd"/></svg>';
var moonSVG='<svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"/></svg>';

var btn=null;

function updateIcon(t){
  if(!btn)return;
  btn.innerHTML=t==="dark"?sunSVG:moonSVG;
  btn.setAttribute("aria-label",t==="dark"?"Switch to light theme":"Switch to dark theme");
}

function createToggle(){
  // --- Footer (identical to SignInForm.tsx footer) ---
  if(!document.getElementById("devsso-footer")){
    var footer=document.createElement("div");
    footer.id="devsso-footer";
    footer.innerHTML='<span>\\u00A9 2026 Dev-SSO</span><span>\\u00B7</span><a href="#">Terms</a><span>\\u00B7</span><a href="#">Privacy</a><span>\\u00B7</span><a href="#">Docs</a>';
    document.body.appendChild(footer);
  }

  // --- Toggle button (identical to ThemeToggle.tsx) ---
  btn=document.createElement("button");
  btn.type="button";
  btn.id="devsso-theme-toggle";
  btn.addEventListener("click",function(){
    var current=getTheme();
    applyTheme(current==="dark"?"light":"dark");
  });
  document.body.appendChild(btn);
  applyTheme(getTheme());
}

if(document.readyState==="loading"){
  document.addEventListener("DOMContentLoaded",createToggle);
}else{
  createToggle();
}
})();`;
}
