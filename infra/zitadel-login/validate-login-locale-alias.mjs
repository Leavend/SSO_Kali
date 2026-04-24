import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const fixture = join(tmpdir(), "zitadel-locale-alias-");
const root = mkdtempSync(fixture);
const bundleFile = join(root, "3072.js");

const source =
  'exports.modules={93072:(a,b,c)=>{let k=(0,i.A)(async()=>{let a=await (0,j.UL)(),b="en",g=await (0,j.b3)(),{serviceConfig:i}=(0,e.G)(g),k=await (await (0,j.b3)()).get(d.xU);if(k){let a=k.split(",")[0].split("-")[0];d.gq.map(a=>a.code).includes(a)&&(b=a)}let l=a?.get(d.WU);l&&l.value&&d.gq.map(a=>a.code).includes(l.value)&&(b=l.value);let m=g.get("x-zitadel-i18n-organization")||"",n={};try{let a=await (0,f.uy)({serviceConfig:i,locale:b,organization:m});a&&(n=a)}catch(a){console.warn("Error fetching custom translations:",a)}let o=n,p=(await c(41662)(`./${b}.json`)).default,q=(await c(41662)("./en.json")).default;return{locale:b,messages:h().all([q,p,o])}})}};';

writeFileSync(bundleFile, source);

execFileSync("node", [
  "/Users/leavend/Desktop/Project_SSO/infra/zitadel-login/patch-login-locale-alias.mjs",
  root,
]);

const patched = readFileSync(bundleFile, "utf8");

rmSync(root, { recursive: true, force: true });

if (!patched.includes('"id"===b?"en":b')) {
  throw new Error("Expected Indonesian locale alias to be injected.");
}

if (patched.includes('locale:b,organization:m')) {
  throw new Error("Expected custom translation lookup to use the safe locale alias.");
}

if (patched.includes('`./${b}.json`')) {
  throw new Error("Expected locale JSON import to use the safe locale alias.");
}

console.log("Validated login locale alias patch.");
