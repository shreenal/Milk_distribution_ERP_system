import type { ReactNode } from "react";

export type MasterTableColumn = {
  label: ReactNode;
  align?: "left" | "center" | "right";
  className?: string;
};

interface MasterTableProps {
  headers: MasterTableColumn[];
  children: ReactNode;
  empty?: boolean;
  emptyMessage?: string;
}

const alignmentClasses = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};

export function MasterTable({
  headers,
  children,
  empty = false,
  emptyMessage = "No records found.",
}: MasterTableProps) {
  return (
    <div className="overflow-hidden rounded-xl border bg-background">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted">
              {headers.map((header, index) => {
                const align = header.align ?? "left";

                return (
                  <th
                    key={index}
                    className={`px-4 py-3 font-medium ${alignmentClasses[align]}`}
                  >
                    {header.label}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {empty ? (
              <tr>
                <td
                  colSpan={headers.length}
                  className="px-4 py-10 text-center text-muted-foreground"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              children
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}