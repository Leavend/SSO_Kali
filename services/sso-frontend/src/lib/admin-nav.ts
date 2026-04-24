export type AdminNavItem = {
  href: string;
  label: string;
  icon: string;
};

export const adminNavItems: AdminNavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "◎" },
  { href: "/users", label: "Users", icon: "◉" },
  { href: "/sessions", label: "Sessions", icon: "⊛" },
  { href: "/apps", label: "Apps", icon: "⊞" },
];

export function isActiveAdminPath(pathname: string, href: string): boolean {
  if (href === "/dashboard") {
    return pathname === "/dashboard";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}
