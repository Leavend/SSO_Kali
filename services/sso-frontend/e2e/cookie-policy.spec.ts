import { expect, test } from "@playwright/test";

test("admin panel uses secure host-only cookies", async ({ context, page }) => {
  const response = await page.goto("/api/e2e/cookie-policy");

  expect(response?.ok()).toBe(true);

  const cookies = await context.cookies();
  const sessionCookie = cookies.find((cookie) => cookie.name === "__Host-admin-session");
  const txCookie = cookies.find((cookie) => cookie.name === "__Host-admin-tx");

  expect(sessionCookie).toMatchObject({
    httpOnly: true,
    sameSite: "Lax",
    secure: true,
  });
  expect(txCookie).toMatchObject({
    httpOnly: true,
    sameSite: "Lax",
    secure: true,
  });
  expect(sessionCookie?.domain.startsWith(".")).toBe(false);
  expect(txCookie?.domain.startsWith(".")).toBe(false);
});
