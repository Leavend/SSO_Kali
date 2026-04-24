"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { adminNavItems, isActiveAdminPath } from "@/lib/admin-nav";

type Variant = "desktop" | "mobile";

type AdminNavLinksProps = {
  variant: Variant;
};

export default function AdminNavLinks({ variant }: AdminNavLinksProps) {
  const pathname = usePathname();

  return (
    <>
      {adminNavItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={linkClassName(variant, isActiveAdminPath(pathname, item.href))}
          aria-current={isActiveAdminPath(pathname, item.href) ? "page" : undefined}
        >
          <span className="text-base" aria-hidden="true">{item.icon}</span>
          {item.label}
        </Link>
      ))}
    </>
  );
}

function linkClassName(variant: Variant, active: boolean): string {
  return variant === "mobile" ? mobileLinkClassName(active) : desktopLinkClassName(active);
}

function mobileLinkClassName(active: boolean): string {
  const palette = active
    ? "border-accent/40 bg-accent-soft text-accent font-semibold"
    : "border-line bg-card text-muted hover:bg-card-hover hover:text-ink";

  return `inline-flex items-center gap-2 whitespace-nowrap rounded-full border px-3 py-2 text-xs font-medium transition-all duration-200 ${palette}`;
}

function desktopLinkClassName(active: boolean): string {
  const palette = active
    ? "bg-accent-soft text-ink ring-1 ring-accent/30 font-semibold"
    : "text-muted hover:bg-card-hover hover:text-ink";

  return `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-200 ${palette}`;
}
