import { Edit, Trash2 } from "lucide-react";

import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";

import {
  MasterTable,
  MasterTableRow,
  MasterTableCell,
  MasterTableActions,
} from "../../shared/components";

import type { Dairy } from "../types/dairies.types";

interface DairiesTableProps {
  dairies: Dairy[];
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
  isDeleting?: boolean;
}

export function DairiesTable({
  dairies,
  onEdit,
  onDelete,
  isDeleting = false,
}: DairiesTableProps) {
  return (
    <MasterTable
      headers={[
        {
          label: "Name",
        },
        {
          label: "City",
        },
        {
          label: "Status",
          align: "center",
        },
        {
          label: "Actions",
          align: "center",
          className: "w-[140px]",
        },
      ]}
      empty={dairies.length === 0}
      emptyMessage="No dairies found"
    >
      {dairies.map((dairy) => (
        <MasterTableRow key={dairy.id}>
          <MasterTableCell className="font-medium">
            {dairy.name}
          </MasterTableCell>

          <MasterTableCell>
            {dairy.city ?? "—"}
          </MasterTableCell>

          <MasterTableCell align="center">
            <Badge
              variant={
                dairy.is_active
                  ? "default"
                  : "secondary"
              }
            >
              {dairy.is_active
                ? "Active"
                : "Inactive"}
            </Badge>
          </MasterTableCell>

          <MasterTableActions>
            <Button
              variant="ghost"
              size="icon-sm"
              title="Edit dairy"
              onClick={() => onEdit(dairy.id)}
            >
              <Edit className="size-4" />
            </Button>

            <Button
              variant="ghost"
              size="icon-sm"
              title="Delete dairy"
              onClick={() => onDelete(dairy.id)}
              disabled={isDeleting}
            >
              <Trash2 className="size-4" />
            </Button>
          </MasterTableActions>
        </MasterTableRow>
      ))}
    </MasterTable>
  );
}