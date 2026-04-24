import Link from "next/link";

export interface QuickLinkItem {
  readonly href: string;
  readonly label: string;
  readonly icon: string;
}

interface QuickLinksProps {
  readonly items: readonly QuickLinkItem[];
}

export default function QuickLinks({ items }: QuickLinksProps) {
  return (
    <div className="mt-6 rounded-xl border border-line bg-card p-4 sm:mt-8 sm:p-6">
      <h2 className="text-base font-semibold sm:text-lg">Quick Links</h2>
      <div className="mt-3 grid gap-2 sm:mt-4 sm:gap-3 md:grid-cols-3">
        {items.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="flex items-center gap-3 rounded-lg bg-card-hover px-3 py-2.5 text-sm text-muted transition-all duration-200 hover:translate-x-1 hover:text-ink focus-visible:ring-2 focus-visible:ring-accent sm:px-4 sm:py-3"
          >
            <span className="text-base" aria-hidden="true">{link.icon}</span>
            {link.label} →
          </Link>
        ))}
      </div>
    </div>
  );
}
