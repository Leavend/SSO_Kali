import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const scriptPath = path.resolve(process.cwd(), "../../tools/frontend-security/check-broker-boundary.mjs");
const tempRoots: string[] = [];

describe("broker boundary scan", () => {
  afterEach(async () => {
    await Promise.all(tempRoots.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
  });

  it("allows broker-only integration urls", async () => {
    const dir = await fixtureDir("allowed");

    await writeSource(dir, "src/lib/config.ts", "export const authorizeUrl = 'https://dev-sso.timeh.my.id/authorize';\n");

    const result = await runScan(dir);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Broker boundary OK");
  });

  it("rejects direct zitadel issuer urls in application config", async () => {
    const dir = await fixtureDir("blocked");

    await writeSource(dir, "src/lib/config.ts", "export const issuer = 'https://id.dev-sso.timeh.my.id/oauth/v2/authorize';\n");

    const result = await runScan(dir);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("direct-zitadel-host");
  });
});

async function fixtureDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), `app-a-broker-boundary-${prefix}-`));

  tempRoots.push(dir);

  return dir;
}

async function writeSource(root: string, relativePath: string, content: string): Promise<void> {
  const file = path.join(root, relativePath);

  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content, "utf8");
}

function runScan(root: string): { exitCode: number; stderr: string; stdout: string } {
  const result = spawnSync("node", [scriptPath, root], {
    encoding: "utf8",
  });

  return {
    exitCode: result.status ?? 1,
    stderr: result.stderr,
    stdout: result.stdout,
  };
}
