import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const fixture = join(tmpdir(), "zitadel-locale-alias-");
const root = mkdtempSync(fixture);
const bundleFile = join(root, "3072.js");
const enChunkFile = join(root, "41662.js");

const source =
  'exports.modules={41662:(a,b,c)=>{var d={"./en.json":[93072,41662],"./de.json":[93073,41662],"./fr.json":[93074,41662]};function e(a){return c(d[a][0])}e.keys=()=>Object.keys(d),a.exports=e}};';
const enChunkSource =
  '"use strict";exports.id=41662,exports.ids=[41662],exports.modules={93072:a=>{a.exports=JSON.parse(\'{"common":{"title":"Login with Zitadel"},"loginname":{"title":"Welcome back!"}}\')}};';

writeFileSync(bundleFile, source);
writeFileSync(enChunkFile, enChunkSource);

execFileSync("node", [
  "/Users/leavend/Desktop/Project_SSO/infra/zitadel-login/patch-login-locale-alias.mjs",
  root,
]);

const patched = readFileSync(bundleFile, "utf8");
const idChunkFile = join(root, "44444.js");
const idChunk = existsSync(idChunkFile) ? readFileSync(idChunkFile, "utf8") : "";

rmSync(root, { recursive: true, force: true });

if (!patched.includes('"./id.json"')) {
  throw new Error("Expected Indonesian locale map entry to be injected.");
}

if (!patched.includes("devsso-id-locale-injected")) {
  throw new Error("Expected Indonesian locale marker to be injected.");
}

if (!idChunk.includes("Masuk dengan Zitadel")) {
  throw new Error("Expected generated Indonesian locale chunk to use the copy patch marker.");
}

console.log("Validated login locale alias patch.");
