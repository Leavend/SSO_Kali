import type { ReactNode } from "react";
import Link from "next/link";

export type BreadcrumbItem = {
  label: string;
  href?: string;
};

type PageHeaderProps = {
  title: string;
  subtitle: string;
  breadcrumbs?: BreadcrumbItem[];
  actions?: ReactNode;
};

export default function PageHeader(props: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
      <div className="min-w-0">
        <Breadcrumbs items={props.breadcrumbs ?? []} />
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink">
          {props.title}
        </h1>
        <p className="mt-1 text-sm text-muted">{props.subtitle}</p>
      </div>
      {props.actions ? <div className="shrink-0">{props.actions}</div> : null}
    </div>
  );
}

type BreadcrumbsProps = {
  items: BreadcrumbItem[];
};

function Breadcrumbs({ items }: BreadcrumbsProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-muted">
      {items.map((item, index) => (
        <BreadcrumbPart
          key={`${item.label}-${index}`}
          item={item}
          isLast={index === items.length - 1}
        />
      ))}
    </nav>
  );
}

type BreadcrumbPartProps = {
  item: BreadcrumbItem;
  isLast: boolean;
};

function BreadcrumbPart({ item, isLast }: BreadcrumbPartProps) {
  return (
    <>
      {item.href && !isLast ? <BreadcrumbLink item={item} /> : <BreadcrumbLabel item={item} isLast={isLast} />}
      {isLast ? null : <span aria-hidden="true">/</span>}
    </>
  );
}

type BreadcrumbTextProps = {
  item: BreadcrumbItem;
};

function BreadcrumbLink({ item }: BreadcrumbTextProps) {
  return (
    <Link href={item.href ?? "/"} className="transition-colors hover:text-ink">
      {item.label}
    </Link>
  );
}

type BreadcrumbLabelProps = {
  item: BreadcrumbItem;
  isLast: boolean;
};

function BreadcrumbLabel({ item, isLast }: BreadcrumbLabelProps) {
  return (
    <span className={isLast ? "font-medium text-ink" : undefined}>
      {item.label}
    </span>
  );
}
