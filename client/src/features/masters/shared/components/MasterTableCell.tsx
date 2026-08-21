import type { ReactNode } from "react";

interface MasterTableCellProps {
  children: ReactNode;
  className?: string;
  align?: "left" | "center" | "right";
  colSpan?:number;
}

const alignmentClasses = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};

export function MasterTableCell({
  children,
  className,
  align = "left",
  colSpan,
}: MasterTableCellProps) {
  return (
    <td
      colSpan={colSpan}
      className={`px-4 py-3 ${alignmentClasses[align]} ${className ?? ""}`}
    >
      {children}
    </td>
  );
}