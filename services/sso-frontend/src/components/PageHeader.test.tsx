import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import PageHeader from "@/components/PageHeader";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: string;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

describe("PageHeader", () => {
  it("renders title, subtitle, and breadcrumb trail", () => {
    const html = renderToStaticMarkup(
      <PageHeader
        title="Users"
        subtitle="3 registered users"
        breadcrumbs={[
          { label: "Admin Panel", href: "/dashboard" },
          { label: "Users" },
        ]}
      />,
    );

    expect(html).toContain("Users");
    expect(html).toContain("3 registered users");
    expect(html).toContain('href="/dashboard"');
    expect(html).toContain(">Admin Panel<");
  });

  it("renders actions when provided", () => {
    const html = renderToStaticMarkup(
      <PageHeader
        title="Sessions"
        subtitle="1 active session"
        actions={<button type="button">Refresh Data</button>}
      />,
    );

    expect(html).toContain("Refresh Data");
  });
});
