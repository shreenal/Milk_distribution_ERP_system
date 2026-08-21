import { Edit, Trash2 } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";

import type { ProductGroup } from "../types/product-groups.types";

import {
  MasterTable,
  MasterTableRow,
  MasterTableCell,
  MasterTableActions,
} from "../../shared/components";

interface ProductGroupsTableProps {
  productGroups: ProductGroup[];
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
}

export function ProductGroupsTable({
  productGroups,
  onEdit,
  onDelete,
}: ProductGroupsTableProps) {
  return (
    <MasterTable
      headers={[
        { label: "Name" },
        { label: "Category" },
        {
          label: "Actions",
          align: "center",
          className: "w-[140px]",
        },
      ]}
      empty={productGroups.length === 0}
      emptyMessage="No product groups found"
    >
      {productGroups.map((productGroup) => (
        <MasterTableRow key={productGroup.id}>
          <MasterTableCell className="font-medium">
            {productGroup.name}
          </MasterTableCell>

          <MasterTableCell>
            <Badge variant="secondary">
              {productGroup.category}
            </Badge>
          </MasterTableCell>

          <MasterTableActions>
            <Button
              variant="ghost"
              size="icon-sm"
              title="Edit product group"
              onClick={() => onEdit(productGroup.id)}
            >
              <Edit className="size-4" />
            </Button>

            <Button
              variant="ghost"
              size="icon-sm"
              title="Delete product group"
              onClick={() => onDelete(productGroup.id)}
            >
              <Trash2 className="size-4" />
            </Button>
          </MasterTableActions>
        </MasterTableRow>
      ))}
    </MasterTable>
  );
}