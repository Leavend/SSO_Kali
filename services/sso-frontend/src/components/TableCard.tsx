import type { ReactNode } from "react";

type TableCardProps = {
  children: ReactNode;
};

export default function TableCard({ children }: TableCardProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-card">
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}
