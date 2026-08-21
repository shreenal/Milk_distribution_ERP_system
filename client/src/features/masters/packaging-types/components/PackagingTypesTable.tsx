import { Edit, Trash2 } from "lucide-react";

import { Button } from "@/shared/components/ui/button";

import {
  MasterTable,
  MasterTableRow,
  MasterTableCell,
  MasterTableActions,
} from "../../shared/components";

import type { PackagingType } from "../types/packaging-types.types";

interface PackagingTypesTableProps {
  packagingTypes: PackagingType[];
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
}

export function PackagingTypesTable({
  packagingTypes,
  onEdit,
  onDelete,
}: PackagingTypesTableProps) {
  return (
    <MasterTable
      headers={[
        { label: "Name" },
        {
          label: "Actions",
          align: "center",
          className: "w-[140px]",
        },
      ]}
      empty={packagingTypes.length === 0}
      emptyMessage="No packaging types found"
    >
      {packagingTypes.map((packagingType) => (
        <MasterTableRow key={packagingType.id}>
          <MasterTableCell className="font-medium">
            {packagingType.name}
          </MasterTableCell>

          <MasterTableActions>
            <Button
              variant="ghost"
              size="icon-sm"
              title="Edit packaging type"
              onClick={() =>
                onEdit(packagingType.id)
              }
            >
              <Edit className="size-4" />
            </Button>

            <Button
              variant="ghost"
              size="icon-sm"
              title="Delete packaging type"
              onClick={() =>
                onDelete(packagingType.id)
              }
            >
              <Trash2 className="size-4" />
            </Button>
          </MasterTableActions>
        </MasterTableRow>
      ))}
    </MasterTable>
  );
}