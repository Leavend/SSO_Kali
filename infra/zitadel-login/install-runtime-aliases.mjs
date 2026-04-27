import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.env.ZITADEL_LOGIN_NODE_MODULES ?? "/app/apps/login/node_modules";

const aliases = {
  "winston-cd8887eea177c285": "winston",
  "@opentelemetry/api-2543c6b61b192f2f": "@opentelemetry/api",
  "@opentelemetry/api-logs-ddbc86adb7c4b704": "@opentelemetry/api-logs",
  "@opentelemetry/auto-instrumentations-node-5edd96ff209c33a1": "@opentelemetry/auto-instrumentations-node",
  "@opentelemetry/resource-detector-container-90d7faa3484d2bd3": "@opentelemetry/resource-detector-container",
  "@opentelemetry/resource-detector-gcp-7f9561848b4f3d01": "@opentelemetry/resource-detector-gcp",
  "@opentelemetry/resources-4c98cd4e90a115c6": "@opentelemetry/resources",
  "@opentelemetry/sdk-node-65f68d2bba539441": "@opentelemetry/sdk-node",
};

for (const [alias, target] of Object.entries(aliases)) {
  const dir = join(root, ...alias.split("/"));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.js"), `module.exports = require(${JSON.stringify(target)});\n`);
  writeFileSync(join(dir, "package.json"), `${JSON.stringify({ name: alias, main: "index.js", private: true }, null, 2)}\n`);
}
