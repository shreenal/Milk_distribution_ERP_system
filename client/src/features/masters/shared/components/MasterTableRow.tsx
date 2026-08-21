import { ReactNode } from "react";

interface MasterTableRowProps {
  children: ReactNode;
  className?: string;
}

export function MasterTableRow({
  children,
  className,
}: MasterTableRowProps) {
  return (
    <tr
      className={`border-b last:border-b-0 hover:bg-muted/50 ${className ?? ""}`}
    >
      {children}
    </tr>
  );
}