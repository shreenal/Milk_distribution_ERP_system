import { Edit, Trash2 } from "lucide-react";

import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";

import {
  MasterTable,
  MasterTableRow,
  MasterTableCell,
  MasterTableActions,
} from "../../shared/components";

import type { Bank } from "../types/banks.types";

interface BanksTableProps {
  banks: Bank[];
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
  isDeleting?: boolean;
}

export function BanksTable({
  banks,
  onEdit,
  onDelete,
  isDeleting = false,
}: BanksTableProps) {
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
      empty={banks.length === 0}
      emptyMessage="No banks found"
    >
      {banks.map((bank) => (
        <MasterTableRow key={bank.id}>
          <MasterTableCell className="font-medium">
            {bank.name}
          </MasterTableCell>

          <MasterTableCell align="center">
            <Badge
              variant={
                bank.is_active
                  ? "default"
                  : "secondary"
              }
            >
              {bank.is_active
                ? "Active"
                : "Inactive"}
            </Badge>
          </MasterTableCell>

          <MasterTableActions>
            <Button
              variant="ghost"
              size="icon-sm"
              title="Edit bank"
              onClick={() => onEdit(bank.id)}
            >
              <Edit className="size-4" />
            </Button>

            <Button
              variant="ghost"
              size="icon-sm"
              title="Delete bank"
              onClick={() => onDelete(bank.id)}
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