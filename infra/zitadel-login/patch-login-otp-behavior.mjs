import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2];
const marker = "/* Dev-SSO OTP Behavior */";
const codeLength = 6;
const messages = Object.freeze({
  "Code is required": "Kode wajib diisi.",
  "Could not verify OTP code": "Kode verifikasi tidak valid. Periksa kode lalu coba lagi.",
  "Could not verify code": "Kode verifikasi tidak valid. Periksa kode lalu coba lagi.",
  "Could not verify TOTP code": "Kode verifikasi tidak valid. Periksa kode lalu coba lagi.",
  "Invalid code": "Kode verifikasi tidak valid. Periksa kode lalu coba lagi.",
  "Invalid OTP code": "Kode verifikasi tidak valid. Periksa kode lalu coba lagi.",
  "The code is invalid": "Kode verifikasi tidak valid. Periksa kode lalu coba lagi.",
  "This field is required": "Kolom ini wajib diisi.",
});
const runtime = `${marker}
;(function(){
if(typeof window==="undefined"||window.__devssoOtpBehaviorInjected)return;
window.__devssoOtpBehaviorInjected=true;
var CONFIG=${JSON.stringify({ codeLength, messages })};
var state={lastCode:"",timer:null};

function isOtpPage(){
  return /\\/otp\\//.test(location.pathname)||/Verifikasi 2 Langkah|Verify 2-Factor/i.test(document.body.textContent||"");
}

function visible(el){
  var r=el.getBoundingClientRect();var s=getComputedStyle(el);
  return r.width>0&&r.height>0&&s.display!=="none"&&s.visibility!=="hidden";
}

function codeInputs(){
  return Array.prototype.slice.call(document.querySelectorAll("input")).filter(function(input){
    var label=(input.labels&&input.labels[0]?input.labels[0].textContent:"")||"";
    var name=[input.name,input.id,input.autocomplete,input.inputMode,label].join(" ");
    return visible(input)&&/code|otp|totp|kode|numeric/i.test(name);
  });
}

function normalizeCode(value){
  return String(value||"").replace(/\\D/g,"").slice(0,CONFIG.codeLength);
}

function submitButton(form){
  var buttons=Array.prototype.slice.call((form||document).querySelectorAll("button"));
  return buttons.find(function(button){
    var text=(button.textContent||"").replace(/\\s+/g," ").trim();
    return visible(button)&&!button.disabled&&/^(Lanjutkan|Continue)$/.test(text);
  });
}

function submitCode(input, code, remaining){
  var form=input.form||input.closest("form");var button=submitButton(form);
  if(!button&&remaining>0){setTimeout(function(){submitCode(input,code,remaining-1);},120);return;}
  if(!button||state.lastCode===code)return;
  state.lastCode=code;button.click();
}

function scheduleSubmit(input){
  var code=normalizeCode(input.value);
  if(code.length!==CONFIG.codeLength||state.lastCode===code)return;
  clearTimeout(state.timer);
  state.timer=setTimeout(function(){submitCode(input,code,5);},180);
}

function bindInput(input){
  if(input.dataset.devssoOtpBound==="true")return;
  input.dataset.devssoOtpBound="true";
  input.addEventListener("input",function(){scheduleSubmit(input);});
  input.addEventListener("paste",function(){setTimeout(function(){scheduleSubmit(input);},0);});
}

function translate(value){
  var text=String(value||"").replace(/\\s+/g," ").trim();
  return CONFIG.messages[text]||CONFIG.messages[Object.keys(CONFIG.messages).find(function(key){return text.includes(key);})]||"";
}

function translateErrors(){
  Array.prototype.slice.call(document.querySelectorAll('[role="alert"],[aria-live],p,span,div')).forEach(function(node){
    if(node.children.length>1)return;
    var next=translate(node.textContent);
    if(next)node.textContent=next;
  });
}

function syncOtp(){
  translateErrors();
  if(!isOtpPage())return;
  codeInputs().forEach(bindInput);
}

function startObserver(){
  if(!document.body||typeof MutationObserver==="undefined")return;
  new MutationObserver(syncOtp).observe(document.body,{childList:true,subtree:true,characterData:true});
}

function boot(){
  syncOtp();startObserver();setTimeout(syncOtp,300);setTimeout(syncOtp,1000);
}

if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);
else boot();
})();`;

if (!root) {
  throw new Error("Expected the extracted login bundle path as the first argument.");
}

let changedFiles = 0;
walk(root);
console.log(`Patched OTP behavior into ${changedFiles} file(s).`);

function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const location = join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(location);
      continue;
    }
    if (entry.isFile() && location.endsWith(".js")) patchFile(location);
  }
}

function patchFile(location) {
  const original = readFileSync(location, "utf8");
  if (original.includes("__devssoOtpBehaviorInjected")) return;
  if (!original.includes("headlessui-listbox-button")) return;
  writeFileSync(location, `${original}\n${runtime}`);
  changedFiles += 1;
}
