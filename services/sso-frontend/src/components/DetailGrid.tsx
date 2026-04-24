import type { ReactNode } from "react";

export type DetailItem = {
  label: string;
  value: ReactNode;
};

type DetailGridProps = {
  items: DetailItem[];
};

export default function DetailGrid({ items }: DetailGridProps) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label} className="rounded-lg bg-card-hover px-3 py-3">
          <dt className="text-[10px] font-medium uppercase tracking-wider text-muted">
            {item.label}
          </dt>
          <dd className="mt-1 text-sm text-ink">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
