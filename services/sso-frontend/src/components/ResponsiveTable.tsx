import type { ReactNode } from "react";
import TableCard from "@/components/TableCard";

type ResponsiveTableProps = {
  cards: ReactNode;
  table: ReactNode;
};

export default function ResponsiveTable(props: ResponsiveTableProps) {
  return (
    <>
      <div className="space-y-3 md:hidden">{props.cards}</div>
      <div className="hidden md:block">
        <TableCard>{props.table}</TableCard>
      </div>
    </>
  );
}
