import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import SecureAdminSignInScreen from "@/components/SecureAdminSignInScreen";

describe("SecureAdminSignInScreen", () => {
  it("renders the hosted-login entry experience", () => {
    const html = renderToStaticMarkup(<SecureAdminSignInScreen />);

    expect(html).toContain("Masuk ke Panel Admin");
    expect(html).toContain("Lanjut ke Login");
    expect(html).toContain("href=\"/auth/login\"");
    expect(html).toContain("<a");
    expect(html).toContain("Login Resmi");
    expect(html).toContain("Password hanya dimasukkan di halaman login resmi");
  });
});
