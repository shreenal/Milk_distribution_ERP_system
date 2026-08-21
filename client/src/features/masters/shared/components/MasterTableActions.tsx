import type { ReactNode } from "react";

interface MasterTableActionsProps {
  children: ReactNode;
  className?: string;
}

export function MasterTableActions({
  children,
  className,
}: MasterTableActionsProps) {
  return (
    <td
      className={`px-4 py-3 text-center ${className ?? ""}`}
    >
      <div className="flex item-center justify-center gap-2">
        {children}
      </div>
    </td>
  );
}