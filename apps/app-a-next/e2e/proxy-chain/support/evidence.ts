import type { TestInfo } from "@playwright/test";

export async function attachJsonEvidence(
  testInfo: TestInfo,
  name: string,
  payload: object,
): Promise<void> {
  await testInfo.attach(name, {
    body: Buffer.from(JSON.stringify(payload, null, 2), "utf8"),
    contentType: "application/json",
  });
}
