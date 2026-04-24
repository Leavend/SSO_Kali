import Link from "next/link";

type RefreshLinkProps = {
  readonly href: string;
  readonly label: string;
};

export default function RefreshLink({ href, label }: RefreshLinkProps) {
  return (
    <Link
      href={href}
      className="inline-flex rounded-md bg-accent-soft px-3 py-2 text-xs font-medium text-accent transition-colors hover:bg-accent hover:text-white"
    >
      {label}
    </Link>
  );
}
