import { Edit, Trash2 } from "lucide-react";

import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";

import {
  MasterTable,
  MasterTableRow,
  MasterTableCell,
  MasterTableActions,
} from "../../shared/components";

import type { ExpenseType } from "../types/expense-types.types";

interface ExpenseTypesTableProps {
  expenseTypes: ExpenseType[];
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
  isDeleting?: boolean;
}

export function ExpenseTypesTable({
  expenseTypes,
  onEdit,
  onDelete,
  isDeleting = false,
}: ExpenseTypesTableProps) {
  return (
    <MasterTable
      headers={[
        {
          label: "Name",
          align: "left",
        },
        {
          label: "Status",
          align: "center",
        },
        {
          label: "Actions",
          align: "center",
        },
      ]}
      empty={expenseTypes.length === 0}
      emptyMessage="No expense types found"
    >
      {expenseTypes.map((expenseType) => (
        <MasterTableRow key={expenseType.id}>
          <MasterTableCell className="font-medium">
            {expenseType.name}
          </MasterTableCell>

          <MasterTableCell align="center">
            <Badge
              variant={
                expenseType.is_active
                  ? "default"
                  : "secondary"
              }
            >
              {expenseType.is_active
                ? "Active"
                : "Inactive"}
            </Badge>
          </MasterTableCell>

          <MasterTableActions>
            <Button
              variant="ghost"
              size="icon-sm"
              title="Edit expense type"
              onClick={() => onEdit(expenseType.id)}
            >
              <Edit className="size-4" />
            </Button>

            <Button
              variant="ghost"
              size="icon-sm"
              title="Delete expense type"
              onClick={() => onDelete(expenseType.id)}
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